# stf

## Connections chart:
```mermaid
flowchart LR;
subgraph triproxy-app
    triproxy-app-pub(pub)
    %% 7150
    triproxy-app-dealer(dealer)
    %% 7160
    triproxy-app-pull(pull)
    %% 7170
end
triproxy-app-dealer --> triproxy-app-pub
triproxy-app-pull --> triproxy-app-dealer
subgraph triproxy-dev;
    triproxy-dev-pub(pub)
    %% 7250
    triproxy-dev-dealer(dealer)
    %% 7260
    triproxy-dev-pull(pull)
    %% 7270
end
triproxy-dev-dealer --> triproxy-dev-pub
triproxy-dev-pull --> triproxy-dev-dealer

subgraph api
    api-sub(sub)
    api-push(push)
end
api-sub -- ZMQ 7150 --> triproxy-app-pub;
api-push -- ZMQ 7170 --> triproxy-app-pull;
api-sub -- ZMQ 7250 --> triproxy-dev-pub;
api-push -- ZMQ 7270 --> triproxy-dev-pull;

subgraph processor;
    processor-app-dealer(app-dealer)
    processor-dev-dealer(dev-dealer)
end
processor-app-dealer -- ZMQ 7160 --> triproxy-app-dealer;
processor-dev-dealer -- ZMQ 7260 --> triproxy-dev-dealer;

subgraph reaper;
    reaper-push(push)
    reaper-sub(sub)
end;
reaper-push -- ZMQ 7270 --> triproxy-dev-pull
reaper-sub -- ZMQ 7150 --> triproxy-app-pub

subgraph storage;
    storage-push(push)
    storage-sub(sub)
end

storage-push -- ZMQ 7270 --> triproxy-dev-pull
storage-sub -- ZMQ 7150 --> triproxy-app-pub


subgraph websocket;
    websocket-sub(sub)
    websocket-push(push)
end

websocket-sub -- ZMQ 7150 --> triproxy-app-pub
websocket-push -- ZMQ 7170 --> triproxy-app-pull
```

## Install

```sh
$ npm i stf -g
```

## Usage

```sh
$ stf --help
```

Help output:

```
Usage: stf <command> [options]

Commands:
  api                   Start an API unit.
  app                   Start an app unit.
  auth-ldap             Start an LDAP auth unit.
  auth-mock             Start a mock auth unit that accepts any user.
  auth-oauth2           Start an OAuth 2.0 auth unit.
  auth-openid           Start an OpenID auth unit.
  auth-saml2            Start a SAML 2.0 auth unit.
  groups-engine         Start the groups engine unit.
  doctor                Diagnose potential issues with your installation.
  local [serial..]      Start a complete local development environment.
  log-mongodb           Start a MongoDB log unit.
  migrate               Migrates the database to the latest version.
  processor [name]      Start a processor unit.
  provider [serial..]   Start a provider unit.
  reaper [name]         Start a reaper unit.
  storage-plugin-apk    Start an APK storage plugin unit.
  storage-plugin-image  Start an image storage plugin unit.
  storage-s3            Start an S3 storage unit.
  storage-temp          Start a temp storage unit.
  triproxy [name]       Start a triproxy unit.
  websocket             Start a websocket unit.

Options:
  -h, --help     Show help.                                            [boolean]
  -V, --version  Show version number                                   [boolean]

```

## Available commands

* [api](#api)
* [app](#app)
* [auth-ldap](#auth-ldap)
* [auth-mock](#auth-mock)
* [auth-oauth2](#auth-oauth2)
* [auth-openid](#auth-openid)
* [auth-saml2](#auth-saml2)
* [groups-engine](#groups-engine)
* [doctor](#doctor)
* [local](#local)
* [log-mongodb](#log-mongodb)
* [migrate](#migrate)
* [processor](#processor)
* [provider](#provider)
* [reaper](#reaper)
* [storage-plugin-apk](#storage-plugin-apk)
* [storage-plugin-image](#storage-plugin-image)
* [storage-s3](#storage-s3)
* [storage-temp](#storage-temp)
* [triproxy](#triproxy)
* [websocket](#websocket)

### api

```sh
$ stf api --help
```

Help output:

```
stf api

Options:
  -h, --help                Show help.                                 [boolean]
  --connect-push, -c        App-side ZeroMQ PULL endpoint to connect to.
                                                              [array] [required]
  --connect-sub, -u         App-side ZeroMQ PUB endpoint to connect to.
                                                              [array] [required]
  --connect-push-dev, --pd  Device-side ZeroMQ PULL endpoint to connect to.
                                                              [array] [required]
  --connect-sub-dev, --sd   Device-side ZeroMQ PUB endpoint to connect to.
                                                              [array] [required]
  --port, -p                The port to bind to.        [number] [default: 7106]
  --secret, -s              The secret to use for auth JSON Web Tokens. Anyone
                            who knows this token can freely enter the system if
                            they want, so keep it safe.      [string] [required]
  --ssid, -i                The name of the session ID cookie.
                                                      [string] [default: "ssid"]
  -V, --version             Show version number                        [boolean]

Each option can be be overwritten with an environment variable by converting the
option to uppercase, replacing dashes with underscores and prefixing it with
`STF_API_` (e.g. `STF_API_PORT`).

```

### app

```sh
$ stf app --help
```

Help output:

```
stf app

Options:
  -h, --help           Show help.                                      [boolean]
  --auth-url, -a       URL to the auth unit.                 [string] [required]
  --port, -p           The port to bind to.             [number] [default: 7105]
  --secret, -s         The secret to use for auth JSON Web Tokens. Anyone who
                       knows this token can freely enter the system if they
                       want, so keep it safe.                [string] [required]
  --ssid, -i           The name of the session ID cookie.
                                                      [string] [default: "ssid"]
  --user-profile-url   URL to an external user profile page.            [string]
  --websocket-url, -w  URL to the websocket unit.            [string] [required]
  -V, --version        Show version number                             [boolean]

Each option can be be overwritten with an environment variable by converting the
option to uppercase, replacing dashes with underscores and prefixing it with
`STF_APP_` (e.g. `STF_APP_AUTH_URL`).

```

### auth-ldap

```sh
$ stf auth-ldap --help
```

Help output:

```
stf auth-ldap

Options:
  -h, --help               Show help.                                  [boolean]
  --app-url, -a            URL to the app unit.              [string] [required]
  --ldap-bind-credentials  LDAP bind credentials.                       [string]
  --ldap-bind-dn           LDAP bind DN.                                [string]
  --ldap-search-class      LDAP search objectClass.    [string] [default: "top"]
  --ldap-search-dn         LDAP search DN.                   [string] [required]
  --ldap-search-field      LDAP search field.                [string] [required]
  --ldap-search-scope      LDAP search scope.          [string] [default: "sub"]
  --ldap-search-filter     LDAP search filter.                          [string]
  --ldap-timeout, -t       LDAP timeout.                [number] [default: 1000]
  --ldap-url, -u           URL to the LDAP server (e.g. `ldap://127.0.0.1`).
                                                             [string] [required]
  --ldap-username-field    LDAP username field.
                                             [string] [required] [default: "cn"]
  --port, -p               The port to bind to.         [number] [default: 7120]
  --secret, -s             The secret to use for auth JSON Web Tokens. Anyone
                           who knows this token can freely enter the system if
                           they want, so keep it safe.       [string] [required]
  --ssid, -i               The name of the session ID cookie.
                                                      [string] [default: "ssid"]
  --support, --sl          url thats need be opened to access support
                                            [string] [default: "example.com"]
  --docsUrl, --du          url thats need be opened to acces docs
                                            [string] [default: "example.com"]
  -V, --version            Show version number                         [boolean]

Each option can be be overwritten with an environment variable by converting the
option to uppercase, replacing dashes with underscores and prefixing it with
`STF_AUTH_LDAP_` (e.g. `STF_AUTH_LDAP_SECRET`). Legacy environment variables
like LDAP_USERNAME_FIELD are still accepted, too, but consider them deprecated.

```

### auth-mock

```sh
$ stf auth-mock --help
```

Help output:

```
stf auth-mock

Options:
  -h, --help             Show help.                                    [boolean]
  --app-url, -a          URL to the app unit.                [string] [required]
  --basic-auth-password  Basic auth password (if enabled).              [string]
  --basic-auth-username  Basic auth username (if enabled).              [string]
  --port, -p             The port to bind to.           [number] [default: 7120]
  --secret, -s           The secret to use for auth JSON Web Tokens. Anyone who
                         knows this token can freely enter the system if they
                         want, so keep it safe.              [string] [required]
  --ssid, -i             The name of the session ID cookie.
                                                      [string] [default: "ssid"]
  --use-basic-auth       Whether to "secure" the login page with basic
                         authentication.                               [boolean]
  --support, --sl        url thats need be opened to access support
                                            [string] [default: "https://vk.com"]
  --docsUrl, --du        url thats need be opened to access docs
                                            [string] [default: "https://vk.com"]
  -V, --version          Show version number                           [boolean]

Each option can be be overwritten with an environment variable by converting the
option to uppercase, replacing dashes with underscores and prefixing it with
`STF_AUTH_MOCK_` (e.g. `STF_AUTH_MOCK_SECRET`). Legacy environment variables
like BASIC_AUTH_USERNAME are still accepted, too, but consider them deprecated.

```

### auth-oauth2

```sh
$ stf auth-oauth2 --help
```

Help output:

```
stf auth-oauth2

Options:
  -h, --help                 Show help.                                [boolean]
  --app-url, -a              URL to the app unit.            [string] [required]
  --oauth-authorization-url  OAuth 2.0 authorization URL.    [string] [required]
  --oauth-token-url          OAuth 2.0 token URL.            [string] [required]
  --oauth-userinfo-url       OAuth 2.0 user info URL.        [string] [required]
  --oauth-client-id          OAuth 2.0 client ID.            [string] [required]
  --oauth-client-secret      OAuth 2.0 client secret.        [string] [required]
  --oauth-callback-url       OAuth 2.0 callback URL.         [string] [required]
  --oauth-scope              Space-separated OAuth 2.0 scope.[string] [required]
  --oauth-state              Whether to enable OAuth 2.0 state token support.
                                                      [boolean] [default: false]
  --oauth-domain             Optional email domain to allow authentication for.
                                                                        [string]
  --port, -p                 The port to bind to.       [number] [default: 7120]
  --secret, -s               The secret to use for auth JSON Web Tokens. Anyone
                             who knows this token can freely enter the system if
                             they want, so keep it safe.     [string] [required]
  --ssid, -i                 The name of the session ID cookie.
                                                      [string] [default: "ssid"]
  --support, --sl            url thats need be opened to access support
                                            [string] [default: "https://vk.com"]
  --docsUrl, --du            url thats need be opened to acces docs
                                            [string] [default: "https://vk.com"]
  -V, --version              Show version number                       [boolean]

Each option can be be overwritten with an environment variable by converting the
option to uppercase, replacing dashes with underscores and prefixing it with
`STF_AUTH_OAUTH2_` (e.g. `STF_AUTH_OAUTH2_SECRET`). Legacy environment variables
like OAUTH_SCOPE are still accepted, too, but consider them deprecated.

```

### auth-openid

```sh
$ stf auth-openid --help
```

Help output:

```
stf auth-openid

Options:
  -h, --help               Show help.                                  [boolean]
  --app-url, -a            URL to the app unit.              [string] [required]
  --openid-identifier-url  OpenID identifier URL.            [string] [required]
  --port, -p               The port to bind to.         [number] [default: 7120]
  --secret, -s             The secret to use for auth JSON Web Tokens. Anyone
                           who knows this token can freely enter the system if
                           they want, so keep it safe.       [string] [required]
  --ssid, -i               The name of the session ID cookie.
                                                      [string] [default: "ssid"]
  --openid-client-id       openid-connect clientId           [string] [required]
  --openid-client-secret   openid-connect client secret      [string] [required]
  --support, --sl          url thats need be opened to access support
                                            [string] [default: "https://vk.com"]
  --docsUrl, --du          url thats need be opened to acces docs
                                            [string] [default: "https://vk.com"]
  -V, --version            Show version number                         [boolean]

Each option can be be overwritten with an environment variable by converting the
option to uppercase, replacing dashes with underscores and prefixing it with
`STF_AUTH_OPENID_` (e.g. `STF_AUTH_OPENID_SECRET`). Legacy environment variables
like OPENID_IDENTIFIER_URL are still accepted, too, but consider them
deprecated.

```

### auth-saml2

```sh
$ stf auth-saml2 --help
```

Help output:

```
stf auth-saml2

Options:
  -h, --help                          Show help.                       [boolean]
  --app-url, -a                       URL to the app unit.   [string] [required]
  --port, -p                          The port to bind to.
                                                        [number] [default: 7120]
  --saml-id-provider-entry-point-url  SAML 2.0 identity provider URL.
                                                             [string] [required]
  --saml-id-provider-issuer           SAML 2.0 identity provider issuer.
                                                             [string] [required]
  --saml-id-provider-cert-path        SAML 2.0 identity provider certificate
                                      file path.                        [string]
  --saml-id-provider-callback-url     SAML 2.0 identity provider callback URL in
                                      the form of
                                      scheme://host[:port]/auth/saml/callback.
                                                                        [string]
  --secret, -s                        The secret to use for auth JSON Web
                                      Tokens. Anyone who knows this token can
                                      freely enter the system if they want, so
                                      keep it safe.          [string] [required]
  --ssid, -i                          The name of the session ID cookie.
                                                      [string] [default: "ssid"]
  --support, --sl                     url thats need be opened to access support
                                            [string] [default: "https://vk.com"]
  --docsUrl, --du                     url thats need be opened to acces docs
                                            [string] [default: "https://vk.com"]
  -V, --version                       Show version number              [boolean]

Each option can be be overwritten with an environment variable by converting the
option to uppercase, replacing dashes with underscores and prefixing it with
`STF_AUTH_SAML2_` (e.g. `STF_AUTH_SAML2_SECRET`). Legacy environment variables
like SAML_ID_PROVIDER_ISSUER are still accepted, too, but consider them
deprecated.

```

### groups-engine

```sh
$ stf groups-engine --help
```

Help output:

```
stf groups-engine

Options:
  -h, --help                Show help.                                 [boolean]
  --connect-push, -c        App-side ZeroMQ PULL endpoint to connect to.
                                                              [array] [required]
  --connect-sub, -u         App-side ZeroMQ PUB endpoint to connect to.
                                                              [array] [required]
  --connect-push-dev, --pd  Device-side ZeroMQ PULL endpoint to connect to.
                                                              [array] [required]
  --connect-sub-dev, --sd   Device-side ZeroMQ PUB endpoint to connect to.
                                                              [array] [required]
  -V, --version             Show version number                        [boolean]

Each option can be be overwritten with an environment variable by converting the
option to uppercase, replacing dashes with underscores and prefixing it with
`STF_GROUPS_ENGINE_` .)

```

### doctor

```sh
$ stf doctor --help
```

Help output:

```
stf doctor

Options:
  -h, --help     Show help.                                            [boolean]
  -V, --version  Show version number                                   [boolean]

```

### local

```sh
$ stf local --help
```

Help output:

```
stf local [serial..]

Options:
  -h, --help                   Show help.                              [boolean]
  --adb-host                   The ADB server host.
                                                 [string] [default: "127.0.0.1"]
  --adb-port                   The ADB server port.     [number] [default: 5037]
  --allow-remote, -R           Whether to allow remote devices in STF. Highly
                               unrecommended due to almost unbelievable slowness
                               on the ADB side and duplicate device issues when
                               used locally while having a cable connected at
                               the same time.                          [boolean]
  --api-port                   The port the api unit should run at.
                                                        [number] [default: 7106]
  --app-port                   The port the app unit should run at.
                                                        [number] [default: 7105]
  --auth-options               JSON array of options to pass to the auth unit.
                                                        [string] [default: "[]"]
  --auth-port                  The port the auth unit should run at.
                                                        [number] [default: 7120]
  --auth-secret                The secret to use for auth JSON Web Tokens.
                               Anyone who knows this token can freely enter the
                               system if they want, so keep it safe.
                                             [string] [default: "kute kittykat"]
  --auth-type                  The type of auth unit to start.
       [string] [choices: "mock", "ldap", "oauth2", "saml2", "openid"] [default:
                                                                         "mock"]
  --auth-url, -a               URL to the auth unit.                    [string]
  --bind-app-dealer            The address to bind the app-side ZeroMQ DEALER
                               endpoint to.
                                      [string] [default: "tcp://127.0.0.1:7112"]
  --bind-app-pub               The address to bind the app-side ZeroMQ PUB
                               endpoint to.
                                      [string] [default: "tcp://127.0.0.1:7111"]
  --bind-app-pull              The address to bind the app-side ZeroMQ PULL
                               endpoint to.
                                      [string] [default: "tcp://127.0.0.1:7113"]
  --bind-dev-dealer            The address to bind the device-side ZeroMQ DEALER
                               endpoint to.
                                      [string] [default: "tcp://127.0.0.1:7115"]
  --bind-dev-pub               The address to bind the device-side ZeroMQ PUB
                               endpoint to.
                                      [string] [default: "tcp://127.0.0.1:7114"]
  --bind-dev-pull              The address to bind the device-side ZeroMQ PULL
                               endpoint to.
                                      [string] [default: "tcp://127.0.0.1:7116"]
  --cleanup                    Attempt to reset the device between uses by
                               uninstallingapps, resetting accounts and clearing
                               caches. Does not do a perfect job currently.
                               Negate with --no-cleanup.
                                                       [boolean] [default: true]
  --group-timeout, -t          Timeout in seconds for automatic release of
                               inactive devices.         [number] [default: 900]
  --lock-rotation              Whether to lock rotation when devices are being
                               used. Otherwise changing device orientation may
                               not always work due to sensitive sensors quickly
                               or immediately reverting it back to the physical
                               orientation.                            [boolean]
  --mute-master                Whether to mute master volume.
                        [choices: "always", "inuse", "never"] [default: "never"]
  --port, -p, --poorxy-port    The port STF should run at.
                                                        [number] [default: 7100]
  --provider                   An easily identifiable name for the UI and/or log
                               output.          [string] [default: "di-smirnov"]
  --provider-max-port          Highest port number for device workers to use.
                                                        [number] [default: 7700]
  --provider-min-port          Lowest port number for device workers to use.
                                                        [number] [default: 7400]
  --public-ip                  The IP or hostname to use in URLs.
                                                 [string] [default: "localhost"]
  --screen-reset               Go back to home screen and reset screen rotation
                               when user releases device. Negate with
                               --no-screen-reset.      [boolean] [default: true]
  --serial                     Only use devices with these serial numbers.
                                                                         [array]
  --storage-options            JSON array of options to pass to the storage
                               unit.                    [string] [default: "[]"]
  --storage-plugin-apk-port    The port the storage-plugin-apk unit should run
                               at.                      [number] [default: 7104]
  --storage-plugin-image-port  The port the storage-plugin-image unit should run
                               at.                      [number] [default: 7103]
  --storage-port               The port the storage unit should run at.
                                                        [number] [default: 7102]
  --storage-type               The type of storage unit to start.
                              [string] [choices: "temp", "s3"] [default: "temp"]
  --user-profile-url           URL to external user profile page        [string]
  --vnc-initial-size           The initial size to use for the experimental VNC
                               server.             [string] [default: "600x800"]
  --websocket-port             The port the websocket unit should run at.
                                                        [number] [default: 7110]
  -V, --version                Show version number                     [boolean]

Each option can be be overwritten with an environment variable by converting the
option to uppercase, replacing dashes with underscores and prefixing it with
`STF_LOCAL_` (e.g. `STF_LOCAL_ALLOW_REMOTE`).

```

### log-mongodb

```sh
$ stf log-mongodb --help
```

Help output:

```
stf log-mongodb

Options:
  -h, --help         Show help.                                        [boolean]
  --connect-sub, -s  App-side ZeroMQ PUB endpoint to connect to.
                                                              [array] [required]
  --priority, -p     Minimum log level.                    [number] [default: 4]
  -V, --version      Show version number                               [boolean]

Each option can be be overwritten with an environment variable by converting the
option to uppercase, replacing dashes with underscores and prefixing it with
`STF_LOG_MONGODB_` (e.g. `STF_LOG_MONGODB_PRIORITY`).

```

### migrate

```sh
$ stf migrate --help
```

Help output:

```
stf migrate

Options:
  -h, --help     Show help.                                            [boolean]
  -V, --version  Show version number                                   [boolean]

```

### processor

```sh
$ stf processor --help
```

Help output:

```
stf processor [name]

Options:
  -h, --help                Show help.                                 [boolean]
  --connect-app-dealer, -a  App-side ZeroMQ DEALER endpoint to connect to.
                                                              [array] [required]
  --connect-dev-dealer, -d  Device-side ZeroMQ DEALER endpoint to connect to.
                                                              [array] [required]
  --name                    An easily identifiable name for log output.
                                                [string] [default: "di-smirnov"]
  -V, --version             Show version number                        [boolean]

Each option can be be overwritten with an environment variable by converting the
option to uppercase, replacing dashes with underscores and prefixing it with
`STF_PROCESSOR_` (e.g. `STF_PROCESSOR_CONNECT_APP_DEALER`).

```

### provider

```sh
$ stf provider --help
```

Help output:

```
stf provider [serial..]

Options:
  -h, --help               Show help.                                  [boolean]
  --adb-host               The ADB server host.  [string] [default: "127.0.0.1"]
  --adb-port               The ADB server port.         [number] [default: 5037]
  --allow-remote, -R       Whether to allow remote devices in STF. Highly
                           unrecommended due to almost unbelievable slowness on
                           the ADB side and duplicate device issues when used
                           locally while having a cable connected at the same
                           time.                                       [boolean]
  --boot-complete-timeout  How long to wait for boot to complete during device
                           setup.                      [number] [default: 60000]
  --cleanup                Attempt to reset the device between uses by
                           uninstallingapps, resetting accounts and clearing
                           caches. Does not do a perfect job currently. Negate
                           with --no-cleanup.          [boolean] [default: true]
  --connect-push, -p       Device-side ZeroMQ PULL endpoint to connect to.
                                                              [array] [required]
  --connect-sub, -s        Device-side ZeroMQ PUB endpoint to connect to.
                                                              [array] [required]
  --connect-url-pattern    The URL pattern to use for `adb connect`.
                                 [string] [default: "${publicIp}:${publicPort}"]
  --group-timeout, -t      Timeout in seconds for automatic release of inactive
                           devices.                      [number] [default: 900]
  --heartbeat-interval     Send interval in milliseconds for heartbeat messages.
                                                       [number] [default: 10000]
  --lock-rotation          Whether to lock rotation when devices are being used.
                           Otherwise changing device orientation may not always
                           work due to sensitive sensors quickly or immediately
                           reverting it back to the physical orientation.
                                                                       [boolean]
  --max-port               Highest port number for device workers to use.
                                                        [number] [default: 7700]
  --min-port               Lowest port number for device workers to use.
                                                        [number] [default: 7400]
  --mute-master            Whether to mute master volume.
                        [choices: "always", "inuse", "never"] [default: "never"]
  --name, -n               An easily identifiable name for the UI and/or log
                           output.              [string] [default: "di-smirnov"]
  --public-ip              The IP or hostname to use in URLs.
                                            [string] [default: "192.168.88.242"]
  --screen-frame-rate      The frame rate (frames/s) to be used for screen
                           transport on the network. Float value must be > 0.0
                           otherwise the default behavior is kept
                                                          [number] [default: 20]
  --screen-jpeg-quality    The JPG quality to use for the screen.
                                                          [number] [default: 80]
  --screen-grabber         The tool to be used for screen capture. Value must be
                           either: minicap-bin (default) or minicap-apk
                                               [string] [default: "minicap-bin"]
  --screen-ping-interval   The interval at which to send ping messages to keep
                           the screen WebSocket alive. [number] [default: 30000]
  --screen-reset           Go back to home screen and reset screen rotation when
                           user releases device. Negate with --no-screen-reset.
                                                       [boolean] [default: true]
  --screen-ws-url-pattern  The URL pattern to use for the screen WebSocket.
                           [string] [default: "wss://${publicIp}:${publicPort}"]
  --storage-url, -r        The URL to the storage unit.      [string] [required]
  --vnc-initial-size       The initial size to use for the experimental VNC
                           server.                 [string] [default: "600x800"]
  -V, --version            Show version number                         [boolean]

Each option can be be overwritten with an environment variable by converting the
option to uppercase, replacing dashes with underscores and prefixing it with
`STF_PROVIDER_` (e.g. `STF_PROVIDER_NAME`).

```

### reaper

```sh
$ stf reaper --help
```

Help output:

```
stf reaper [name]

Options:
  -h, --help               Show help.                                  [boolean]
  --connect-push, -p       Device-side ZeroMQ PULL endpoint to connect to.
                                                              [array] [required]
  --connect-sub, -s        App-side ZeroMQ PUB endpoint to connect to.
                                                              [array] [required]
  --heartbeat-timeout, -t  Consider devices with heartbeat older than the
                           timeout value dead. Given in milliseconds.
                                                       [number] [default: 30000]
  --name                   An easily identifiable name for log output.
                                                [string] [default: "di-smirnov"]
  -V, --version            Show version number                         [boolean]

Each option can be be overwritten with an environment variable by converting the
option to uppercase, replacing dashes with underscores and prefixing it with
`STF_REAPER_` (e.g. `STF_REAPER_CONNECT_PUSH`).

```

### storage-plugin-apk

```sh
$ stf storage-plugin-apk --help
```

Help output:

```
stf storage-plugin-apk

Options:
  -h, --help         Show help.                                        [boolean]
  --port, -p         The port to bind to.               [number] [default: 7100]
  --storage-url, -r  URL to the storage unit.                [string] [required]
  --cache-dir        The location where to cache APK files.
          [string] [default: "/var/folders/7z/vpsprbws1tdbdp5vwxbvdv400000gp/T"]
  -V, --version      Show version number                               [boolean]

Each option can be be overwritten with an environment variable by converting the
option to uppercase, replacing dashes with underscores and prefixing it with
`STF_STORAGE_PLUGIN_APK_` (e.g. `STF_STORAGE_PLUGIN_APK_CACHE_DIR`).

```

### storage-plugin-image

```sh
$ stf storage-plugin-image --help
```

Help output:

```
stf storage-plugin-image

Options:
  -h, --help         Show help.                                        [boolean]
  --concurrency, -c  Maximum number of simultaneous transformations.    [number]
  --port, -p         The port to bind to.               [number] [default: 7100]
  --storage-url, -r  URL to the storage unit.                [string] [required]
  --cache-dir        The location where to cache images.
          [string] [default: "/var/folders/7z/vpsprbws1tdbdp5vwxbvdv400000gp/T"]
  -V, --version      Show version number                               [boolean]

Each option can be be overwritten with an environment variable by converting the
option to uppercase, replacing dashes with underscores and prefixing it with
`STF_STORAGE_PLUGIN_IMAGE_` (e.g. `STF_STORAGE_PLUGIN_IMAGE_CONCURRENCY`).

```

### storage-s3

```sh
$ stf storage-s3 --help
```

Help output:

```
stf storage-s3

Options:
  -h, --help       Show help.                                          [boolean]
  --bucket         S3 bucket name.                           [string] [required]
  --endpoint       S3 bucket endpoint.                       [string] [required]
  --max-file-size  Maximum file size to allow for uploads. Note that nginx may
                   have a separate limit, meaning you should change both.
                                                  [number] [default: 1073741824]
  --port, -p       The port to bind to.                 [number] [default: 7100]
  --profile        AWS credentials profile name.             [string] [required]
  -V, --version    Show version number                                 [boolean]

Each option can be be overwritten with an environment variable by converting the
option to uppercase, replacing dashes with underscores and prefixing it with
`STF_STORAGE_S3_` (e.g. `STF_STORAGE_S3_PROFILE`).

```

### storage-temp

```sh
$ stf storage-temp --help
```

Help output:

```
stf storage-temp

Options:
  -h, --help         Show help.                                        [boolean]
  --max-file-size    Maximum file size to allow for uploads. Note that nginx may
                     have a separate limit, meaning you should change both.
                                                  [number] [default: 1073741824]
  --port, -p         The port to bind to.               [number] [default: 7100]
  --save-dir         The location where files are saved to.
          [string] [default: "/var/folders/7z/vpsprbws1tdbdp5vwxbvdv400000gp/T"]
  --bundletool-path  The path to bundletool binary.
                            [string] [default: "/app/bundletool/bundletool.jar"]
  --ks               The name of the keystore to sign APKs built from AAB.
                                                   [string] [default: "openstf"]
  --ks-key-alias     Indicates the alias to be used in the future to refer to
                     the keystore.                   [string] [default: "mykey"]
  --ks-pass          The password of the keystore. [string] [default: "openstf"]
  --ks-key-pass      The password of the private key contained in keystore.
                                                   [string] [default: "openstf"]
  --ks-keyalg        The algorithm that is used to generate the key.
                                                       [string] [default: "RSA"]
  --ks-validity      Number of days of keystore validity.
                                                        [number] [default: "90"]
  --ks-keysize       Key size of the keystore.        [number] [default: "2048"]
  --ks-dname         Keystore Distinguished Name, contain Common Name(CN),
                     Organizational Unit (OU), Oranization(O), Locality (L),
                     State (S) and Country (C).
           [string] [default: "CN=openstf.io, OU=openstf, O=openstf, L=PaloAlto,
                                                            S=California, C=US"]
  -V, --version      Show version number                               [boolean]

Each option can be be overwritten with an environment variable by converting the
option to uppercase, replacing dashes with underscores and prefixing it with
`STF_STORAGE_TEMP_` (e.g. `STF_STORAGE_TEMP_SAVE_DIR`).

```

### triproxy

```sh
$ stf triproxy --help
```

Help output:

```
stf triproxy [name]

Options:
  -h, --help         Show help.                                        [boolean]
  --bind-dealer, -d  The address to bind the ZeroMQ DEALER endpoint to.
                                              [string] [default: "tcp://*:7112"]
  --bind-pub, -u     The address to bind the ZeroMQ PUB endpoint to.
                                              [string] [default: "tcp://*:7111"]
  --bind-pull, -p    The address to bind the ZeroMQ PULL endpoint to.
                                              [string] [default: "tcp://*:7113"]
  --name             An easily identifiable name for log output.
                                                [string] [default: "di-smirnov"]
  -V, --version      Show version number                               [boolean]

Each option can be be overwritten with an environment variable by converting the
option to uppercase, replacing dashes with underscores and prefixing it with
`STF_TRIPROXY_` (e.g. `STF_TRIPROXY_BIND_PUB`).

```

### websocket

```sh
$ stf websocket --help
```

Help output:

```
stf websocket

Options:
  -h, --help          Show help.                                       [boolean]
  --connect-push, -c  App-side ZeroMQ PULL endpoint to connect to.
                                                              [array] [required]
  --connect-sub, -u   App-side ZeroMQ PUB endpoint to connect to.
                                                              [array] [required]
  --port, -p          The port to bind to.              [number] [default: 7110]
  --secret, -s        The secret to use for auth JSON Web Tokens. Anyone who
                      knows this token can freely enter the system if they want,
                      so keep it safe.                       [string] [required]
  --ssid, -i          The name of the session ID cookie.
                                                      [string] [default: "ssid"]
  --storage-url, -r   URL to the storage unit.               [string] [required]
  -V, --version       Show version number                              [boolean]

Each option can be be overwritten with an environment variable by converting the
option to uppercase, replacing dashes with underscores and prefixing it with
`STF_WEBSOCKET_` (e.g. `STF_WEBSOCKET_STORAGE_URL`).

```

## License

MIT.
