declare module "nsyslog-parser" {
    /**
     * Represents a single structured data entry, e.g. the objects within "structuredData".
     * Each of these can have a mandatory "$id" key and then any additional properties.
     */
    export interface StructuredDataEntry {
        $id: string;
        [key: string]: string;
    }

    /**
     * Represents the CEF (Common Event Format) details that can appear on some entries.
     */
    export interface CefExtension {
        version: string; // e.g. "CEF:0"
        deviceVendor: string; // e.g. "security"
        deviceProduct: string; // e.g. "threatmanager"
        deviceVersion: string; // e.g. "1.0"
        deviceEventClassID: string; // e.g. "100"
        name: string; // e.g. "detected a \\| in message"
        severity: string; // e.g. "10"
        extension: string; // Raw extension string (e.g. "src=10.0.0.1 act=blocked...")
    }

    /**
     * Represents one syslog-like message object as found in the array.
     * Optional fields are marked with "?". Note that some fields
     * can be null or empty strings when absent or unknown.
     */
    export interface SyslogMessage {
        /** The full, unmodified original log line. */
        originalMessage: string;

        /** Priority string if present (e.g. "<189>") or empty string. */
        pri?: string; // can be "" if not present
        /** Parsed numeric value from `pri` if present, or null if missing. */
        prival?: number | null;

        /** Syslog facility as numeric value, if known. */
        facilityval?: number | null;
        /** Syslog level (severity) as numeric value, if known. */
        levelval?: number | null;
        /** Parsed facility name, if known (e.g. "auth", "local7"). */
        facility?: "kern" | "user" | "mail" | "daemon" | "auth" | "syslog" | "lpr" | "news" | "uucp" | "cron" | "authpriv" | "ftp" | "ntp" | "security" | "console" | "solaris" | "local0" | "local1" | "local2" | "local3" | "local4" | "local5" | "local6" | "local7" | string;
        /** Parsed severity/level name, if known (e.g. "crit", "notice"). */
        level?: "emerg" | "alert" | "crit" | "error" | "warn" | "notice" | "info" | "debug" | string;

        /**
         * Syslog version (used in RFC 5424). For BSD-type or unknown messages,
         * this may be absent.
         */
        version?: number;

        /**
         * A string identifying the detected syslog "type". Examples: "BSD", "RFC5424", "CEF", "UNKNOWN".
         * In practice, you may see additional or custom strings as well.
         */
        type: string;

        /**
         * Parsed timestamp in ISO8601 format, e.g. "2019-10-11T20:14:15.000Z".
         * If the parser guessed one, it will be here; otherwise it may be a fallback or empty string.
         */
        ts: string;

        /** Hostname or IP, if found. */
        host?: string;
        /** Application name/process name, if found. */
        appName?: string;
        /** Process ID (pid) if it was found in the header, e.g. "1334" in "pinger[1334]". */
        pid?: string;
        /** RFC5424 message ID if present, e.g. "ID47". */
        messageid?: string;

        /** The final extracted message portion (without the syslog header). */
        message?: string;

        /**
         * Some log lines contain "chain"—for example, in RFC5424 with multiple hostnames
         * or structured references. Often an empty array.
         */
        chain?: string[];

        /** Free-form array for any extracted fields that did not have a dedicated property. */
        fields?: any[];

        /** Syslog header portion as originally parsed (if separated). */
        header?: string;

        /**
         * StructuredData is typically an array of objects used in RFC5424 logs.
         * Each object can have `$id` plus arbitrary key-value pairs.
         */
        structuredData?: StructuredDataEntry[];

        /**
         * Only present if the message is identified as CEF (Common Event Format).
         * Holds the parsed CEF fields (deviceVendor, deviceProduct, etc.).
         */
        cef?: CefExtension;
    }
    export default function parse(line: string): SyslogMessage;
}
