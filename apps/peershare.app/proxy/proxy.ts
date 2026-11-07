/**
 * The PeerShare proxy: the Bridge of `@statewalker/httpeers-share/bridge` on
 * a loopback port, for pages that must reach local services without CORS.
 */

import { parseArgs } from "node:util";
import { createBridge, type Listening, listenLoopback } from "@statewalker/httpeers-share/bridge";

export const HUB = "https://peershare.httpeers.net";

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
    createBridge({ token: o.key, allowedOrigins: o.origins, cookieJars: o.cookieJars }),
    o.port,
  );
  const hubLink = `${HUB}/#${new URLSearchParams({ localUrl: listening.origin, t: o.key })}`;
  return { ...listening, hubLink };
}
