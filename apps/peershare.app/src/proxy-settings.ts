/**
 * Where the page finds the local proxy: its address and key, kept in this
 * browser. A pairing link (`#localUrl=…&t=…`, printed by `local/serve.mjs`
 * and the proxy) fills them in, and is then cleared from the address bar so
 * the key does not stay on screen or in the history. A link may only name a
 * proxy on this machine: the settings outlive the page, so a crafted link
 * must not be able to send every bridged request to another server.
 */

export interface ProxySettings {
  url: string;
  /** `""`: the proxy was started without `--key`. */
  key: string;
}

export const DEFAULT_PROXY: ProxySettings = { url: "http://127.0.0.1:9090", key: "" };

const KEY = "peershare:proxy";

interface Page {
  localStorage: Pick<Storage, "getItem" | "setItem">;
  location: Pick<Location, "pathname" | "search" | "hash">;
  history: Pick<History, "replaceState">;
}

export function loadProxySettings(win: Page): ProxySettings {
  const fragment = new URLSearchParams(win.location.hash.slice(1));
  const url = fragment.get("localUrl");
  if (url != null) {
    win.history.replaceState(null, "", win.location.pathname + win.location.search);
    const origin = originOf(url);
    if (origin != null && LOOPBACK.includes(new URL(origin).hostname)) {
      const linked = { url: origin, key: fragment.get("t") ?? "" };
      saveProxySettings(win, linked);
      return linked;
    }
  }
  try {
    const stored = JSON.parse(win.localStorage.getItem(KEY) ?? "null");
    if (typeof stored?.url === "string" && typeof stored?.key === "string") {
      return { url: originOf(stored.url) ?? stored.url, key: stored.key };
    }
  } catch {
    // A value this page did not write: the default.
  }
  return DEFAULT_PROXY;
}

export function saveProxySettings(win: Pick<Page, "localStorage">, s: ProxySettings): void {
  win.localStorage.setItem(KEY, JSON.stringify({ ...s, url: originOf(s.url) ?? s.url }));
}

const LOOPBACK = ["127.0.0.1", "localhost", "[::1]"];

/** `http://127.0.0.1:9090/` → `http://127.0.0.1:9090`: paths are appended to it. */
function originOf(url: string): string | null {
  try {
    const { origin } = new URL(url);
    return origin === "null" ? null : origin;
  } catch {
    return null;
  }
}

/**
 * Safari blocks a secure page's requests to `http://127.0.0.1` (mixed
 * content, with no exception for loopback), so the proxy cannot be reached
 * from it. Chromium and Firefox allow loopback.
 */
export function proxySupported(userAgent: string): boolean {
  return !/^((?!chrome|chromium|android|crios|fxios|firefox).)*safari/i.test(userAgent);
}
