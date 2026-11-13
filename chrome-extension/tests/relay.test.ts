/** The extension does the Bridge's job under the Bridge's rules. */

import { createServer, type IncomingHttpHeaders } from "node:http";
import { gzipSync } from "node:zlib";
import { BRIDGE_GUEST_HEADER, BRIDGE_TARGET_HEADER, probe } from "@statewalker/httpeers-share";
import {
  type ExtensionRelay,
  fromWireResponse,
  toWireRequest,
  viaExtension,
} from "@statewalker/peershare.share/extension";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pageAllowed, relay } from "../src/relay.js";
import { requestFromJson, requestToJson, responseFromJson, responseToJson } from "../src/wire.js";

const VERSION = "9.9.9";
let service: { origin: string; seen: IncomingHttpHeaders[]; close(): Promise<void> };

beforeAll(async () => {
  const seen: IncomingHttpHeaders[] = [];
  const server = createServer((req, res) => {
    seen.push(req.headers);
    if (req.url === "/gzip") {
      res.writeHead(200, { "content-type": "text/html", "content-encoding": "gzip" });
      return res.end(gzipSync("<p>compressed</p>"));
    }
    if (req.url === "/old") {
      res.writeHead(302, { location: "/new" });
      return res.end();
    }
    if (req.url === "/echo" && req.method === "POST") {
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => res.end(Buffer.concat(chunks)));
      return;
    }
    res.writeHead(200, { "content-type": "text/plain", "x-app": "yes" });
    res.end(`at ${req.url}`);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const address = server.address();
  if (address == null || typeof address === "string") throw new Error("no address");
  service = {
    origin: `http://127.0.0.1:${address.port}`,
    seen,
    close: () => new Promise((r) => server.close(() => r())),
  };
});
afterAll(() => service?.close());

const call = (path: string, target: string | null, init: RequestInit = {}) =>
  relay(
    new Request(`http://peershare-extension.invalid${path}`, {
      ...init,
      headers: {
        ...(target != null ? { [BRIDGE_TARGET_HEADER]: target } : {}),
        ...(init.headers as Record<string, string>),
      },
    }),
    { version: VERSION },
  );

describe("relay", () => {
  it("answers a page asking whether it is there, like the local proxy", async () => {
    const res = await call("/", null);
    expect(await res.json()).toEqual({ bridge: "peershare", via: "extension", version: VERSION });
  });

  it("relays to a local Service, marked relayed, the Bridge's headers consumed", async () => {
    const res = await call("/a?b=1", service.origin, {
      headers: { [BRIDGE_GUEST_HEADER]: "guest-1", "x-mine": "kept" },
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("at /a?b=1");
    expect(res.headers.get("x-peershare-bridge")).toBe("relayed");
    expect(res.headers.get("x-app")).toBe("yes");
    const seen = service.seen.at(-1) ?? {};
    expect(seen["x-mine"]).toBe("kept");
    expect(seen[BRIDGE_TARGET_HEADER]).toBeUndefined();
    expect(seen[BRIDGE_GUEST_HEADER]).toBeUndefined();
  });

  it("passes a body through", async () => {
    const res = await call("/echo", service.origin, { method: "POST", body: "hello" });
    expect(await res.text()).toBe("hello");
  });

  it("hands on a compressed page decoded, without its content-encoding", async () => {
    const res = await call("/gzip", service.origin, { headers: { "accept-encoding": "gzip" } });
    expect(res.headers.get("content-encoding")).toBeNull();
    expect(await res.text()).toBe("<p>compressed</p>");
  });

  it("follows a redirect: an extension sees only opaque ones", async () => {
    const res = await call("/old", service.origin);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("at /new");
  });

  it.each(["https://example.com", "http://8.8.8.8", "http://nas.local", "file:///etc/passwd"])(
    "refuses %s: only this computer and private networks",
    async (target) => {
      const res = await call("/", target);
      expect(res.status).toBe(403);
      expect(res.headers.get("x-peershare-bridge")).toBe("target-forbidden");
    },
  );

  it("says target-unreachable when nothing answers there", async () => {
    const res = await call("/", "http://127.0.0.1:1");
    expect(res.status).toBe(502);
    expect(res.headers.get("x-peershare-bridge")).toBe("target-unreachable");
  });
});

describe("pageAllowed", () => {
  it.each([
    ["https://peershare.sandclaw.ai/", true],
    ["https://peershare.sandclaw.ai/invite", true],
    ["http://localhost:8080/", true],
    ["http://127.0.0.1:5173/x", true],
    ["https://evil.example/", false],
    ["https://peershare.sandclaw.ai.evil.example/", false],
    ["http://localhost.evil.example/", false],
    [undefined, false],
  ])("%s → %s", (url, allowed) => {
    expect(pageAllowed(url)).toBe(allowed);
  });
});

/**
 * The page's side and the extension's, joined as Chrome joins them, only
 * without Chrome: page → port (structured clone) → content script → JSON
 * message → background → `relay`, and back.
 */
function extensionWithoutChrome(): ExtensionRelay {
  return {
    version: VERSION,
    async fetch(request) {
      const wire = await toWireRequest(request);
      const message = JSON.parse(JSON.stringify(requestToJson(wire)));
      const response = await relay(requestFromJson(message), { version: VERSION });
      const answer = JSON.parse(JSON.stringify(await responseToJson(response)));
      return fromWireResponse(responseFromJson(answer));
    },
  };
}

describe("the page through the extension", () => {
  it("probes a local Service as ok", async () => {
    const report = await probe(viaExtension(extensionWithoutChrome(), service.origin));
    expect(report.health).toBe("ok");
  });

  it("probes a stopped Service as service-down, not bridge-down", async () => {
    const report = await probe(viaExtension(extensionWithoutChrome(), "http://127.0.0.1:1"));
    expect(report).toMatchObject({ health: "down", cause: "service-down" });
  });

  it("probes as bridge-down when the extension does not answer", async () => {
    const gone: ExtensionRelay = {
      version: VERSION,
      fetch: () => Promise.reject(new Error("Extension context invalidated.")),
    };
    const report = await probe(viaExtension(gone, service.origin));
    expect(report).toMatchObject({ health: "down", cause: "bridge-down" });
  });

  it("serves a Guest's page, compressed by the Service, readable", async () => {
    const upstream = viaExtension(extensionWithoutChrome(), service.origin);
    const res = await upstream(new Request("http://guest.invalid/gzip"));
    expect(await res.text()).toBe("<p>compressed</p>");
  });
});
