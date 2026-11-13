/** A Service that forbids being framed, and the Sharer's opt-in to show it to Guests anyway. */

import { createServer } from "node:http";
import { createBridge, type Listening, listenLoopback } from "@statewalker/httpeers-share/bridge";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AddService, EditService, GetSharer, ProbeService } from "../src/public/commands.js";
import { sharerMountSlot } from "../src/public/extension-points.js";
import { refusesFraming, withoutFramingRules } from "../src/public/framing.js";
import { withPeerShare } from "./harness.js";

const CSP =
  "default-src 'self'; script-src 'self' https://analytics.example; frame-ancestors 'none'";

describe("refusesFraming", () => {
  it.each([
    [{ "content-security-policy": "frame-ancestors 'none'" }, true],
    [{ "content-security-policy": "default-src 'self'; frame-ancestors 'self'" }, true],
    [{ "content-security-policy": "frame-ancestors https://example.com" }, true],
    [{ "content-security-policy": "frame-ancestors *" }, false],
    [{ "content-security-policy": "default-src 'self'" }, false],
    [{ "x-frame-options": "DENY" }, true],
    [{ "x-frame-options": "SAMEORIGIN" }, true],
    [{}, false],
  ])("%o → %s", (headers, refused) => {
    expect(refusesFraming(new Headers(headers))).toBe(refused);
  });
});

describe("withoutFramingRules", () => {
  it("removes frame-ancestors and X-Frame-Options, and keeps every other rule", async () => {
    const res = withoutFramingRules(
      new Response("page", {
        status: 200,
        headers: { "content-security-policy": CSP, "x-frame-options": "DENY", "x-app": "1" },
      }),
    );
    expect(res.headers.get("content-security-policy")).toBe(
      "default-src 'self'; script-src 'self' https://analytics.example",
    );
    expect(res.headers.has("x-frame-options")).toBe(false);
    expect(res.headers.get("x-app")).toBe("1");
    expect(await res.text()).toBe("page");
  });

  it("drops a policy that held only frame-ancestors, keeps the others (several CSP headers)", () => {
    const headers = new Headers();
    headers.append("content-security-policy", "frame-ancestors 'none'");
    headers.append("content-security-policy", "object-src 'none'");
    const res = withoutFramingRules(new Response(null, { status: 204, headers }));
    expect(res.headers.get("content-security-policy")).toBe("object-src 'none'");
  });

  it("leaves an answer without framing rules untouched", () => {
    const original = new Response("x", { headers: { "content-security-policy": "img-src *" } });
    expect(withoutFramingRules(original)).toBe(original);
  });
});

const TOKEN = "peershare-framing";
let bridge: Listening;
let app: { origin: string; close(): Promise<void> };

beforeAll(async () => {
  bridge = await listenLoopback(createBridge({ token: TOKEN, allowedOrigins: ["*"] }));
  const server = createServer((_req, res) => {
    res.writeHead(200, {
      "content-type": "text/html",
      "content-security-policy": CSP,
      "x-frame-options": "DENY",
    });
    res.end("<p>no framing</p>");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const address = server.address();
  if (address == null || typeof address === "string") throw new Error("no address");
  app = {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((r) => server.close(() => r())),
  };
});
afterAll(async () => {
  await bridge?.close();
  await app?.close();
});

describe("a Service that forbids being framed", () => {
  const setUp = async () => {
    const peer = withPeerShare({ bridge: () => ({ base: bridge.origin, token: TOKEN }) });
    await peer.call(AddService, { name: "app", kind: "bridged", target: app.origin });
    let mount: ((r: Request) => Promise<Response>) | undefined;
    peer.rt.slots.observe(sharerMountSlot, (v) => {
      mount = v[0];
    })();
    const guestGets = () =>
      (mount as (r: Request) => Promise<Response>)(new Request("http://sharer/s/app/"));
    return { ...peer, guestGets };
  };

  it("is flagged by the Probe, and reaches Guests with its rules, by default", async () => {
    const { call, guestGets } = await setUp();
    await call(ProbeService, { id: "app" });
    expect((await call(GetSharer, undefined)).services[0]?.warnings).toContain("framing-refused");
    const res = await guestGets();
    expect(res.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
  });

  it("allowed by the Sharer: Guests get it without the framing rules, the rest of its CSP kept", async () => {
    const { call, guestGets } = await setUp();
    await call(EditService, {
      id: "app",
      draft: { name: "app", kind: "bridged", target: app.origin, allowFraming: true },
    });
    await call(ProbeService, { id: "app" });
    const service = (await call(GetSharer, undefined)).services[0];
    expect(service?.allowFraming).toBe(true);
    expect(service?.warnings).not.toContain("framing-refused");
    const res = await guestGets();
    expect(res.headers.get("content-security-policy")).toBe(
      "default-src 'self'; script-src 'self' https://analytics.example",
    );
    expect(res.headers.has("x-frame-options")).toBe(false);
    expect(await res.text()).toBe("<p>no framing</p>");
  });

  it("an edit that does not mention it keeps it; one that turns it off ends it", async () => {
    const { call } = await setUp();
    const draft = { name: "app", kind: "bridged", target: app.origin };
    await call(EditService, { id: "app", draft: { ...draft, allowFraming: true } });
    await call(EditService, { id: "app", draft });
    expect((await call(GetSharer, undefined)).services[0]?.allowFraming).toBe(true);
    await call(EditService, { id: "app", draft: { ...draft, allowFraming: false } });
    expect((await call(GetSharer, undefined)).services[0]?.allowFraming).toBeUndefined();
  });
});
