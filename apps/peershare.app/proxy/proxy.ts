/**
 * The PeerShare proxy: the Bridge of `@statewalker/httpeers-share/bridge` on
 * a loopback port, for pages that must reach local services without CORS.
 */

import { parseArgs } from "node:util";
import { createBridge, type Listening, listenLoopback } from "@statewalker/httpeers-share/bridge";

export const HUB = "https://peershare.sandclaw.ai";

/** The proxy's own version; each release has an entry in `CHANGELOG.txt`, next to this file. */
export const PROXY_VERSION = "0.1.2";

declare const __PEERSHARE_PROXY_COMMIT__: string | undefined;
/** The git commit it was built from (scripts/build-proxy.mjs); "dev" when run from source. */
export const PROXY_COMMIT =
  typeof __PEERSHARE_PROXY_COMMIT__ !== "undefined" ? __PEERSHARE_PROXY_COMMIT__ : "dev";

/** On every answer: which proxy this is, for the page's diagnostics. */
export const PROXY_VERSION_HEADER = "x-peershare-proxy";

/** The hub and pages served from this machine; `--origin` replaces the list. */
export const DEFAULT_ORIGINS = [HUB, "http://localhost:*", "http://127.0.0.1:*"];

export interface ProxyOptions {
  port: number;
  /** `""`: no key is asked for. */
  key: string;
  origins: string[];
  cookieJars: boolean;
}

export function parseProxyArgs(argv: string[]): ProxyOptions {
  const { values } = parseArgs({
    args: argv,
    options: {
      port: { type: "string", default: "9090" },
      key: { type: "string", default: "" },
      origin: { type: "string", multiple: true },
      "no-cookie-jars": { type: "boolean", default: false },
    },
  });
  const origins = (values.origin ?? [])
    .flatMap((o) => o.split(","))
    .map((o) => o.trim())
    .filter(Boolean);
  return {
    port: Number(values.port),
    key: values.key,
    origins: origins.length > 0 ? origins : DEFAULT_ORIGINS,
    cookieJars: !values["no-cookie-jars"],
  };
}

/** Starts the proxy; `hubLink` opens the hub already set up to use it. */
export async function startProxy(o: ProxyOptions): Promise<Listening & { hubLink: string }> {
  const listening = await listenLoopback(
    withVersion(
      withDecodedBodies(
        createBridge({ token: o.key, allowedOrigins: o.origins, cookieJars: o.cookieJars }),
      ),
    ),
    o.port,
  );
  const hubLink = `${HUB}/#${new URLSearchParams({ localUrl: listening.origin, t: o.key })}`;
  return { ...listening, hubLink };
}

type Bridge = ReturnType<typeof createBridge>;

/**
 * The Bridge reaches the Service with `fetch`, which DECODES a compressed body
 * but leaves the Service's `content-encoding` on the response, and relays both.
 * The browser then un-gzips plain text and the read fails ("Failed to fetch"),
 * for every Service that compresses. What leaves here is what was received:
 * decoded, so neither the encoding nor the encoded length applies.
 * (A fix for `@statewalker/httpeers-share`'s `createBridge`; drop it once that has it.)
 */
export function withDecodedBodies(bridge: Bridge): Bridge {
  const handler = async (request: Request): Promise<Response> => {
    const response = await bridge(request);
    if (!response.headers.has("content-encoding")) return response;
    const headers = new Headers(response.headers);
    headers.delete("content-encoding");
    headers.delete("content-length");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
  return Object.assign(handler, { sockets: bridge.sockets }) as Bridge;
}

/**
 * Every answer names the proxy, `x-peershare-proxy: 0.1.2 (abc1234)`, readable
 * by the page (added to what CORS exposes), so the hub's diagnostics say which
 * proxy it reached.
 */
export function withVersion(bridge: Bridge): Bridge {
  const handler = async (request: Request): Promise<Response> => {
    const response = await bridge(request);
    const headers = new Headers(response.headers);
    headers.set(PROXY_VERSION_HEADER, `${PROXY_VERSION} (${PROXY_COMMIT})`);
    const exposed = headers.get("access-control-expose-headers");
    if (exposed != null)
      headers.set("access-control-expose-headers", `${exposed}, ${PROXY_VERSION_HEADER}`);
    else if (headers.has("access-control-allow-origin"))
      headers.set("access-control-expose-headers", PROXY_VERSION_HEADER);
    const nullBody = [101, 204, 205, 304].includes(response.status);
    return new Response(nullBody ? null : response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
  return Object.assign(handler, { sockets: bridge.sockets }) as Bridge;
}
