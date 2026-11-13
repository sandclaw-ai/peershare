/**
 * PeerShare's diagnostics log: always on, retrievable on demand.
 *
 * Every page keeps the last few hundred things that happened to it (a join's
 * steps, the hub's answer, a refused invite, a Guest joining) with every
 * error's whole cause chain, so a "it doesn't work" can be answered from what
 * actually happened. With a `storage` (the page's localStorage), the log
 * survives reloads and is shared by the tabs of one origin, which append to
 * it in turn.
 *
 * Nothing secret goes in: no keys, tokens or whole invite links.
 */

export type LogLevel = "info" | "warn" | "error";

export interface LogEntry {
  /** Milliseconds since the epoch. */
  at: number;
  level: LogLevel;
  event: string;
  detail?: string;
}

export interface DiagnosticsLog {
  info(event: string, detail?: unknown): void;
  warn(event: string, detail?: unknown): void;
  /** `error`'s whole cause chain is kept, not only its message. */
  error(event: string, error: unknown, detail?: unknown): void;
  entries(): LogEntry[];
  /** The log as text, newest last, under a header naming the page and browser. */
  text(): string;
  clear(): void;
}

export interface LogInit {
  /** How many entries are kept; older ones are dropped. */
  capacity?: number;
  /** Where the log survives reloads; memory only without it. */
  storage?: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  /** The storage key: one per page role (`peershare.log.hub`, `peershare.log.guest`). */
  key?: string;
  /** What the header says about where the log comes from. */
  context?: () => Record<string, string>;
  now?: () => number;
}

export function createLog(init: LogInit = {}): DiagnosticsLog {
  const capacity = init.capacity ?? 400;
  const key = init.key ?? "peershare.log";
  const now = init.now ?? Date.now;
  let memory: LogEntry[] = [];

  const load = (): LogEntry[] => {
    if (init.storage == null) return memory;
    try {
      const parsed = JSON.parse(init.storage.getItem(key) ?? "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };
  const save = (entries: LogEntry[]) => {
    memory = entries;
    if (init.storage == null) return;
    try {
      init.storage.setItem(key, JSON.stringify(entries));
    } catch {
      // Storage full or refused: the log still works in memory.
    }
  };
  // Read before every append: another tab may have written since.
  const append = (entry: LogEntry) => save([...load(), entry].slice(-capacity));

  const add = (level: LogLevel, event: string, detail?: unknown) =>
    append({ at: now(), level, event, ...(detail != null ? { detail: describe(detail) } : {}) });

  return {
    info: (event, detail) => add("info", event, detail),
    warn: (event, detail) => add("warn", event, detail),
    error: (event, error, detail) =>
      add(
        "error",
        event,
        [describeError(error), detail != null ? describe(detail) : undefined]
          .filter(Boolean)
          .join(" — "),
      ),
    entries: () => load(),
    text: () => {
      const context = init.context?.() ?? {};
      const header = [
        "PeerShare diagnostics",
        `taken: ${new Date(now()).toISOString()}`,
        ...Object.entries(context).map(([k, v]) => `${k}: ${v}`),
        "",
      ];
      const lines = load().map(
        (e) =>
          `${new Date(e.at).toISOString()} ${e.level.toUpperCase().padEnd(5)} ${e.event}${
            e.detail != null ? `: ${e.detail}` : ""
          }`,
      );
      return [...header, ...(lines.length > 0 ? lines : ["(nothing logged yet)"])].join("\n");
    },
    clear: () => {
      memory = [];
      try {
        init.storage?.removeItem(key);
      } catch {}
    },
  };
}

/**
 * An error as one line, with every cause: "MemberJoinError: the hub would not
 * accept that invitation ← Error: join: invitation redemption failed (403):
 * {"error":"invitation not-found"}". A `code` (libp2p's) is kept too.
 */
export function describeError(error: unknown): string {
  const parts: string[] = [];
  const seen = new Set<unknown>();
  for (let e: unknown = error; e != null && !seen.has(e) && parts.length < 8; ) {
    seen.add(e);
    if (e instanceof Error) {
      const code = (e as { code?: unknown }).code;
      parts.push(`${e.name}: ${e.message}${code != null ? ` [${String(code)}]` : ""}`);
      e = (e as { cause?: unknown }).cause;
    } else {
      parts.push(describe(e));
      break;
    }
  }
  return parts.join(" ← ");
}

function describe(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Error) return describeError(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** A log that keeps nothing: the default where none is given. */
export const noLog: DiagnosticsLog = {
  info: () => {},
  warn: () => {},
  error: () => {},
  entries: () => [],
  text: () => "PeerShare diagnostics\n(logging is off)",
  clear: () => {},
};
