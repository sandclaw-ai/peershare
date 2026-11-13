/** M1 — the Sharer survives a reload, and "Test again" probes through the Upstream Guests use. */

import { createServer } from "node:http";
import { createBridge, type Listening, listenLoopback } from "@statewalker/httpeers-share/bridge";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AddService, GetSharer, ProbeService, ToggleService } from "../src/public/commands.js";
import { memoryStore, withPeerShare } from "./harness.js";

describe("M1 — reload", () => {
  it("a new runtime over the same store has the same Sharer, and new ids stay unique", async () => {
    const store = memoryStore();
    const first = withPeerShare({ store });
    await first.call(AddService, { name: "foo", kind: "bridged", target: "http://localhost:5173" });
    first.dispose();

    const again = withPeerShare({ store });
    expect((await again.call(GetSharer, undefined)).services.map((s) => s.id)).toEqual(["foo"]);
    expect(
      await again.call(AddService, {
        name: "foo",
        kind: "bridged",
        target: "http://localhost:3000",
      }),
    ).toEqual({
      ok: true,
      id: "foo-2",
    });
  });
});

const TOKEN = "peershare-m1";
let bridge: Listening;
let app: { origin: string; close(): Promise<void> };

beforeAll(async () => {
  bridge = await listenLoopback(
    createBridge({ token: TOKEN, allowedOrigins: ["https://tools.sandclaw.ai"] }),
  );
  const server = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/html", "set-cookie": "s=1" });
    res.end('<script type="module" src="/@vite/client"></script>');
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

describe("M1 — Test again", () => {
  it("records Health and warnings on the Service", async () => {
    const { call } = withPeerShare({ bridge: () => ({ base: bridge.origin, token: TOKEN }) });
    await call(AddService, { name: "dev", kind: "bridged", target: app.origin });

    await call(ProbeService, { id: "dev" });

    expect((await call(GetSharer, undefined)).services[0]).toMatchObject({
      health: "ok",
      // No ws-needed: Bridged Services carry live connections since M9.
      warnings: ["cookies-set"],
    });
  });

  it("down, cause bridge-down, before the Bridge is paired; disabled when paused", async () => {
    const { call } = withPeerShare();
    await call(AddService, { name: "dev", kind: "bridged", target: app.origin });

    await call(ProbeService, { id: "dev" });
    expect((await call(GetSharer, undefined)).services[0]).toMatchObject({
      health: "down",
      cause: "bridge-down",
    });

    await call(ToggleService, { id: "dev", enabled: false });
    await call(ProbeService, { id: "dev" });
    expect((await call(GetSharer, undefined)).services[0]).toMatchObject({ health: "disabled" });
  });
});

describe("M1 — Test again, with local network access refused or unanswered", () => {
  // The Bridge runs, but the browser keeps the page from it: Chromium fails that like a dead port.
  const closedBridge = () => ({ base: "http://127.0.0.1:1", token: TOKEN });

  it("bridge-down reads as permission-needed when the browser denied the Bridge's space", async () => {
    const asked: string[] = [];
    const { call } = withPeerShare({
      bridge: closedBridge,
      localNetworkPermission: async (space) => {
        asked.push(space);
        return "denied";
      },
    });
    await call(AddService, { name: "dev", kind: "bridged", target: app.origin });

    await call(ProbeService, { id: "dev" });
    expect((await call(GetSharer, undefined)).services[0]).toMatchObject({
      health: "down",
      cause: "permission-needed",
    });
    // The Bridge is on loopback: that is the permission asked about, whatever the Service's address.
    expect(asked.at(-1)).toBe("loopback");
  });

  it("bridge-down reads as permission-unanswered while the browser's question is open", async () => {
    const { call } = withPeerShare({
      bridge: closedBridge,
      localNetworkPermission: async () => "prompt",
    });
    await call(AddService, { name: "dev", kind: "bridged", target: app.origin });

    await call(ProbeService, { id: "dev" });
    expect((await call(GetSharer, undefined)).services[0]).toMatchObject({
      cause: "permission-unanswered",
    });
  });

  it("stays bridge-down with no Bridge paired: nothing was asked, the Bridge is the problem", async () => {
    const { call } = withPeerShare({ localNetworkPermission: async () => "denied" });
    await call(AddService, { name: "dev", kind: "bridged", target: app.origin });

    await call(ProbeService, { id: "dev" });
    expect((await call(GetSharer, undefined)).services[0]).toMatchObject({ cause: "bridge-down" });
  });

  it("stays bridge-down when the permission is granted, or the browser has no such check", async () => {
    for (const state of ["granted", "unsupported"] as const) {
      const { call } = withPeerShare({
        bridge: closedBridge,
        localNetworkPermission: async () => state,
      });
      await call(AddService, { name: "dev", kind: "bridged", target: app.origin });
      await call(ProbeService, { id: "dev" });
      expect((await call(GetSharer, undefined)).services[0]).toMatchObject({
        cause: "bridge-down",
      });
    }
  });

  it("a Direct Service with an internal name asks about the local space", async () => {
    const asked: string[] = [];
    const { call } = withPeerShare({
      localNetworkPermission: async (space) => {
        asked.push(space);
        return "denied";
      },
    });
    await call(AddService, { name: "nas", kind: "direct", target: "https://nas.internal:1" });

    await call(ProbeService, { id: "nas" });
    expect((await call(GetSharer, undefined)).services[0]).toMatchObject({
      cause: "permission-needed",
    });
    expect(asked.at(-1)).toBe("local");
  });

  it("a Service that answers is ok whatever the permission says", async () => {
    const { call } = withPeerShare({
      bridge: () => ({ base: bridge.origin, token: TOKEN }),
      localNetworkPermission: async () => "denied",
    });
    await call(AddService, { name: "dev", kind: "bridged", target: app.origin });

    await call(ProbeService, { id: "dev" });
    expect((await call(GetSharer, undefined)).services[0]).toMatchObject({ health: "ok" });
  });
});

describe("M1 — a new Service is tested at once", () => {
  it("add-service starts Test again in the background: Health is known without asking", async () => {
    const { call } = withPeerShare({ bridge: () => ({ base: bridge.origin, token: TOKEN }) });
    await call(AddService, { name: "dev", kind: "bridged", target: app.origin });

    await expect
      .poll(async () => (await call(GetSharer, undefined)).services[0]?.health, { timeout: 5_000 })
      .toBe("ok");
  });
});
