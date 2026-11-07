/** The proxy's address and key, kept in the browser; a pairing link fills them in. */

import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROXY,
  loadProxySettings,
  proxySupported,
  saveProxySettings,
} from "../src/proxy-settings.ts";

/** The parts of `window` the settings use. */
function page(hash = "", stored?: string) {
  const items = new Map<string, string>(stored != null ? [["peershare:proxy", stored]] : []);
  const win = {
    localStorage: {
      getItem: (k: string) => items.get(k) ?? null,
      setItem: (k: string, v: string) => void items.set(k, v),
    },
    location: { pathname: "/", search: "", hash },
    history: {
      replaceState: (_s: unknown, _t: string, url: string) => {
        win.location.hash = new URL(url, "https://x").hash;
      },
    },
  };
  return { win, items };
}

describe("proxy settings", () => {
  it("default to the proxy's own default address, with no key", () => {
    expect(loadProxySettings(page().win)).toEqual({ url: "http://127.0.0.1:9090", key: "" });
    expect(DEFAULT_PROXY).toEqual({ url: "http://127.0.0.1:9090", key: "" });
  });

  it("take an old #localUrl=…&t=… link, keep it, and clear it from the address bar", () => {
    const { win, items } = page("#localUrl=http%3A%2F%2F127.0.0.1%3A9091&t=abc");
    expect(loadProxySettings(win)).toEqual({ url: "http://127.0.0.1:9091", key: "abc" });
    expect(win.location.hash).toBe("");
    expect(JSON.parse(items.get("peershare:proxy") ?? "")).toEqual({
      url: "http://127.0.0.1:9091",
      key: "abc",
    });
  });

  it("take only a proxy on this machine from a link, so a crafted link cannot re-point it", () => {
    const { win, items } = page("#localUrl=https%3A%2F%2Fevil.example&t=x");
    expect(loadProxySettings(win)).toEqual(DEFAULT_PROXY);
    expect(items.has("peershare:proxy")).toBe(false);
    expect(win.location.hash).toBe("");
  });

  it("keep the address as an origin, so a trailing slash cannot break the socket path", () => {
    const { win } = page();
    saveProxySettings(win, { url: "http://127.0.0.1:9092/", key: "" });
    expect(loadProxySettings(win).url).toBe("http://127.0.0.1:9092");
    expect(loadProxySettings(page("#localUrl=http%3A%2F%2Flocalhost%3A9093%2F").win).url).toBe(
      "http://localhost:9093",
    );
  });

  it("are read back once saved", () => {
    const { win } = page();
    saveProxySettings(win, { url: "http://127.0.0.1:9092", key: "k" });
    expect(loadProxySettings(win)).toEqual({ url: "http://127.0.0.1:9092", key: "k" });
  });

  it("are not offered on Safari", () => {
    const safari =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
    const chrome =
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
    const firefox = "Mozilla/5.0 (X11; Linux x86_64; rv:144.0) Gecko/20100101 Firefox/144.0";
    expect(proxySupported(safari)).toBe(false);
    expect(proxySupported(chrome)).toBe(true);
    expect(proxySupported(firefox)).toBe(true);
  });
});
