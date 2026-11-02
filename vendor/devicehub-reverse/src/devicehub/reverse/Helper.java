/*
 * Device side of `adb reverse` for DeviceHub remote-connect users. Replaces the
 * vendored minirev binary.
 *
 * Runs as the shell user under app_process and serves one abstract socket that
 * the device worker reaches through the provider's adb server, wherever that
 * server runs. Every request is a new adb stream with one command line:
 *
 *   listen <port>\n   bind tcp:<port> on the device. Answers "OK\n" once the
 *                     port is really listening, or "FAIL <reason>\n". The stream
 *                     then stays open as the forward's control stream: one line
 *                     "<token>\n" per accepted connection. Its end unbinds.
 *   attach <token>\n  the stream becomes the connection with that token, both
 *                     ways, until either side closes.
 *   quit\n            exit; how a new instance takes the socket over.
 *
 * One adb stream per connection, so adb's per-stream flow control is the
 * backpressure: the I/O here is blocking, a write returns once all of it is
 * written, and a stalled connection stalls nobody else. (minirev multiplexed all
 * connections over one stream with non-blocking writes and dropped data on
 * EAGAIN.)
 *
 * The process exits when its stdin closes: the worker's `adb shell` stream ends
 * with the worker, crashed or not.
 */
package devicehub.reverse;

import android.net.LocalServerSocket;
import android.net.LocalSocket;
import android.net.LocalSocketAddress;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.Charset;
import java.security.SecureRandom;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;

public final class Helper {
    static final String VERSION = "1";
    static final String SOCKET_NAME = "devicehub-reverse";
    static final int ROOT_UID = 0;
    static final int SHELL_UID = 2000;
    /** An accepted connection the worker does not attach in time is closed */
    static final long ATTACH_TIMEOUT_MS = 30000;
    static final int BUFFER_SIZE = 256 * 1024;
    /**
     * Send buffer of an attached stream. adbd reads what this socket holds,
     * up to a packet, and sends it as one A_WRTE that must be acknowledged
     * before the next (sockets.cpp:177-236); the default buffer
     * (net.core.wmem_default, about 200 KiB) keeps those packets well short of
     * the 1 MiB adbd may send. The kernel caps it at net.core.wmem_max.
     */
    static final int STREAM_SEND_BUFFER = 2 * 1024 * 1024;
    static final int MAX_LINE = 128;
    static final Charset ASCII = Charset.forName("US-ASCII");

    static final SecureRandom random = new SecureRandom();
    /** Accepted connections waiting for their attach stream, by token */
    static final Map<String, Pending> pending = new HashMap<String, Pending>();

    static final class Pending {
        final Socket socket;
        final Forward forward;
        final long deadline;

        Pending(Socket socket, Forward forward) {
            this.socket = socket;
            this.forward = forward;
            this.deadline = System.currentTimeMillis() + ATTACH_TIMEOUT_MS;
        }
    }

    public static void main(String[] args) throws Exception {
        LocalServerSocket server = bind();
        System.out.println("ready " + VERSION);
        System.out.flush();

        daemon(new Runnable() {
            public void run() {
                try {
                    while (System.in.read() != -1) {
                        // Nothing comes this way; we only wait for the end
                    }
                } catch (IOException ignored) {
                    // Same as the end
                }
                System.exit(0);
            }
        });
        daemon(new Runnable() {
            public void run() {
                reap();
            }
        });

        while (true) {
            final LocalSocket client = server.accept();
            daemon(new Runnable() {
                public void run() {
                    serve(client);
                }
            });
        }
    }

    /**
     * Take the abstract socket, asking a previous instance to leave first: one
     * left behind by an older worker, or one whose stdin never closed.
     */
    static LocalServerSocket bind() throws Exception {
        for (int attempt = 0; ; attempt++) {
            try {
                return new LocalServerSocket(SOCKET_NAME);
            } catch (IOException e) {
                if (attempt == 50) {
                    throw e;
                }
            }
            try {
                LocalSocket previous = new LocalSocket();
                previous.connect(new LocalSocketAddress(SOCKET_NAME));
                previous.getOutputStream().write("quit\n".getBytes(ASCII));
                previous.close();
            } catch (IOException ignored) {
                // It is going away already
            }
            Thread.sleep(100);
        }
    }

    static void serve(LocalSocket client) {
        try {
            // Any app on the device can connect to an abstract socket; only adbd
            // (shell, or root under `adb root`) may drive this one
            int uid = client.getPeerCredentials().getUid();
            if (uid != SHELL_UID && uid != ROOT_UID) {
                client.close();
                return;
            }
            InputStream in = client.getInputStream();
            String line = readLine(in);
            if (line == null) {
                client.close();
            } else if (line.startsWith("listen ")) {
                listen(client, in, line.substring(7));
            } else if (line.startsWith("attach ")) {
                attach(client, in, line.substring(7));
            } else if (line.equals("quit")) {
                System.exit(0);
            } else {
                client.close();
            }
        } catch (Exception e) {
            closeQuietly(client);
        }
    }

    static void listen(final LocalSocket control, InputStream in, String spec) throws IOException {
        final OutputStream out = control.getOutputStream();
        final int port;
        try {
            port = Integer.parseInt(spec);
        } catch (NumberFormatException e) {
            out.write(("FAIL bad port: " + spec + "\n").getBytes(ASCII));
            control.close();
            return;
        }

        final ServerSocket listener = new ServerSocket();
        try {
            // As adbd's own listener: every address, so v4 and v6 loopback both
            // work and the port is taken the same way (socket_spec_listen)
            listener.setReuseAddress(true);
            listener.bind(new InetSocketAddress(port));
        } catch (IOException e) {
            closeQuietly(listener);
            out.write(("FAIL " + reason(e) + "\n").getBytes(ASCII));
            control.close();
            return;
        }
        // Only now: an app connecting as soon as `adb reverse` returns must find
        // the port open
        try {
            out.write("OK\n".getBytes(ASCII));
        } catch (IOException e) {
            closeQuietly(listener);
            throw e;
        }

        final Forward forward = new Forward(control, listener);
        daemon(new Runnable() {
            public void run() {
                forward.acceptLoop(out);
            }
        });

        // The worker never writes here again; the end of the stream is the unbind
        try {
            while (in.read() != -1) {
                // Ignore
            }
        } catch (IOException ignored) {
            // Same as the end
        }
        forward.close();
    }

    static final class Forward {
        final LocalSocket control;
        final ServerSocket listener;

        Forward(LocalSocket control, ServerSocket listener) {
            this.control = control;
            this.listener = listener;
        }

        void acceptLoop(OutputStream out) {
            byte[] bytes = new byte[16];
            try {
                while (true) {
                    Socket socket = listener.accept();
                    // The tunnel ends on the user's machine: unlike adbd we take
                    // no connections from the device's networks
                    if (!socket.getInetAddress().isLoopbackAddress()) {
                        closeQuietly(socket);
                        continue;
                    }
                    random.nextBytes(bytes);
                    String token = hex(bytes);
                    synchronized (pending) {
                        pending.put(token, new Pending(socket, this));
                    }
                    out.write((token + "\n").getBytes(ASCII));
                }
            } catch (IOException e) {
                close();
            }
        }

        void close() {
            closeQuietly(listener);
            closeQuietly(control);
            // Connections never attached go with the forward; attached ones are
            // their own streams now and stay
            synchronized (pending) {
                Iterator<Pending> it = pending.values().iterator();
                while (it.hasNext()) {
                    Pending p = it.next();
                    if (p.forward == this) {
                        closeQuietly(p.socket);
                        it.remove();
                    }
                }
            }
        }
    }

    static void attach(final LocalSocket stream, final InputStream in, String token) throws IOException {
        final Pending p;
        synchronized (pending) {
            p = pending.remove(token);
        }
        if (p == null) {
            stream.close();
            return;
        }
        final Socket socket = p.socket;
        socket.setTcpNoDelay(true);
        try {
            stream.setSendBufferSize(STREAM_SEND_BUFFER);
        } catch (IOException ignored) {
            // The default works, only slower
        }
        final OutputStream toWorker = stream.getOutputStream();

        // App -> worker. The app's end is passed on as the end of our output,
        // after everything it sent; adbd then closes the stream, which is all
        // an adb stream can do (no half-close in the protocol).
        daemon(new Runnable() {
            public void run() {
                try {
                    pump(socket.getInputStream(), toWorker);
                    stream.shutdownOutput();
                } catch (IOException e) {
                    closeQuietly(stream);
                    closeQuietly(socket);
                }
            }
        });

        // Worker -> app, on this thread. The worker's end closes everything.
        try {
            pump(in, socket.getOutputStream());
            socket.shutdownOutput();
        } catch (IOException ignored) {
            // Either side broke; both go
        }
        closeQuietly(socket);
        closeQuietly(stream);
    }

    static void pump(InputStream in, OutputStream out) throws IOException {
        byte[] buffer = new byte[BUFFER_SIZE];
        int n;
        while ((n = in.read(buffer)) != -1) {
            out.write(buffer, 0, n);
        }
    }

    /** Close accepted connections nobody attached, so a lost attach leaks nothing. */
    static void reap() {
        while (true) {
            try {
                Thread.sleep(5000);
            } catch (InterruptedException e) {
                return;
            }
            long now = System.currentTimeMillis();
            synchronized (pending) {
                Iterator<Pending> it = pending.values().iterator();
                while (it.hasNext()) {
                    Pending p = it.next();
                    if (p.deadline < now) {
                        closeQuietly(p.socket);
                        it.remove();
                    }
                }
            }
        }
    }

    static String readLine(InputStream in) throws IOException {
        StringBuilder line = new StringBuilder();
        while (line.length() < MAX_LINE) {
            int c = in.read();
            if (c == -1) {
                return null;
            }
            if (c == '\n') {
                return line.toString();
            }
            line.append((char) c);
        }
        return null;
    }

    /** The error the way the worker reports it: "cannot bind listener: <reason>" */
    static String reason(IOException e) {
        String message = e.getMessage();
        return message == null ? e.getClass().getSimpleName() : message.replace('\n', ' ');
    }

    static String hex(byte[] bytes) {
        StringBuilder s = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) {
            s.append(Character.forDigit((b >> 4) & 0xf, 16));
            s.append(Character.forDigit(b & 0xf, 16));
        }
        return s.toString();
    }

    static void daemon(Runnable runnable) {
        Thread thread = new Thread(runnable);
        thread.setDaemon(true);
        thread.start();
    }

    static void closeQuietly(LocalSocket socket) {
        // Not Closeable before API 17
        try {
            socket.close();
        } catch (Exception ignored) {
            // Nothing to do
        }
    }

    static void closeQuietly(ServerSocket socket) {
        // Not Closeable before Java 7
        try {
            socket.close();
        } catch (Exception ignored) {
            // Nothing to do
        }
    }

    static void closeQuietly(Socket socket) {
        try {
            socket.close();
        } catch (Exception ignored) {
            // Nothing to do
        }
    }
}
