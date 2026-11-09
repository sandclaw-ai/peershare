/** M3–M5 — Dirk and Claudia: two runtimes, one real mesh. */

import { createServer } from "node:http";
import type { TunnelSocket } from "@statewalker/httpeers-share";
import { createBridge, type Listening, listenLoopback } from "@statewalker/httpeers-share/bridge";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WebSocketServer } from "ws";
import {
  AddService,
  CloseSession,
  GetGuest,
  Invite,
  Join,
  ListGuests,
  ListSharedServices,
  Resume,
  RevokeGuest,
  SetName,
  StartSharing,
  StopSharing,
} from "../src/public/commands.js";
import {
  type GuestFetch,
  type GuestSocket,
  guestFetchSlot,
  guestSocketSlot,
  type PeerShareModel,
  peershareModelSlot,
} from "../src/public/extension-points.js";
import type { MeshInit } from "../src/public/mesh.js";
import { meshFor, onMesh, startRelay } from "./mesh-harness.js";

const TOKEN = "peershare-m3";
let relay: Awaited<ReturnType<typeof startRelay>>;
let bridge: Listening;
let app: { origin: string; close(): Promise<void> };
let dirk: ReturnType<typeof onMesh>;
const others: { dispose(): void }[] = [];

beforeAll(async () => {
  relay = await startRelay();
  bridge = await listenLoopback(
    createBridge({ token: TOKEN, allowedOrigins: ["https://tools.sandclaw.ai"] }),
  );
  const server = createServer((req, res) => {
    res
      .writeHead(200, { "content-type": "application/json" })
      .end(JSON.stringify({ app: "dirk", path: req.url }));
  });
  // Dirk's app has a live channel too (a dev server's hot reload, a chat).
  const wss = new WebSocketServer({ server, handleProtocols: (p) => [...p][0] ?? false });
  wss.on("connection", (socket, req) => {
    socket.send(`hello ${req.url} ${socket.protocol}`);
    socket.on("message", (data) => socket.send(`echo ${data}`));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const address = server.address();
  if (address == null || typeof address === "string") throw new Error("no address");
  app = {
    origin: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise((r) => {
        for (const c of wss.clients) c.terminate();
        server.close(() => r());
      }),
  };

  dirk = onMesh(meshFor(relay.addr), { bridge: () => ({ base: bridge.origin, token: TOKEN }) });
  await dirk.call(SetName, { name: "Dirk" });
  await dirk.call(AddService, { name: "fooService", kind: "bridged", target: app.origin });
  await dirk.call(StartSharing, undefined);
});
afterAll(async () => {
  for (const o of others) o.dispose();
  await dirk?.call(StopSharing, undefined);
  dirk?.dispose();
  await relay?.stop();
  await bridge?.close();
  await app?.close();
});

/** The Guest who joined last and is still a member. */
async function newestGuest(): Promise<string> {
  const members = (await dirk.call(ListGuests, undefined)).filter(
    (g) => g.status === "online" || g.status === "away",
  );
  return members.sort((a, b) => a.joinedAt - b.joinedAt).at(-1)?.peerId as string;
}

async function statusOf(peerId: string) {
  return (await dirk.call(ListGuests, undefined)).find((g) => g.peerId === peerId)?.status;
}

/** A Guest's browser: its own runtime and its own stores. */
function guest(mesh: MeshInit = meshFor(relay.addr)) {
  const g = onMesh(mesh);
  others.push(g);
  return g;
}

function guestFetchOf(g: ReturnType<typeof onMesh>): GuestFetch {
  let fetcher: GuestFetch | undefined;
  g.rt.slots.observe(guestFetchSlot, (v) => {
    fetcher = v[0];
  })();
  if (fetcher == null) throw new Error("no guest fetch");
  return fetcher;
}

describe("M3 — Invite and join", () => {
  it("Claudia joins with Dirk's link, sees his Services, and reaches his app through the mesh and the Bridge", async () => {
    const { url } = await dirk.call(Invite, undefined);
    const claudia = guest();

    expect(await claudia.call(Join, { link: url })).toMatchObject({
      stage: "joined",
      sharerName: "Dirk",
    });
    expect(await claudia.call(ListSharedServices, undefined)).toEqual([
      { id: "fooservice", name: "fooService", isDefault: true, paused: false },
    ]);
    const res = await guestFetchOf(claudia)("fooservice", new Request("http://service/hello?x=1"));
    expect(await res.json()).toEqual({ app: "dirk", path: "/hello?x=1" });
  });

  it("while it joins, the Guest's state says where it is: relay, direct, joining; none once in", async () => {
    const { url } = await dirk.call(Invite, undefined);
    const claudia = guest();
    let model: PeerShareModel | undefined;
    claudia.rt.slots.observe(peershareModelSlot, (v) => {
      model = v[0];
    })();
    const steps: string[] = [];
    const unsubscribe = model?.subscribe(() => {
      const step = model?.getSnapshot().guest.connecting;
      if (step != null && steps.at(-1) !== step) steps.push(step);
    });

    const joined = await claudia.call(Join, { link: url });
    unsubscribe?.();

    expect(steps).toEqual(["relay", "direct", "joining"]);
    expect(joined.connecting).toBeUndefined();
    expect(model?.getSnapshot().guest.connecting).toBeUndefined();
  });

  it("the same link a second time: invite-used", async () => {
    const { url } = await dirk.call(Invite, undefined);
    await guest().call(Join, { link: url });

    expect(await guest().call(Join, { link: url })).toMatchObject({ stage: "invite-used" });
    expect(await guest().call(GetGuest, undefined)).toMatchObject({ stage: "no-link" });
  });
});

describe("M5 — lifecycle", () => {
  it("Revoke: Claudia is in Dirk's guest list; after Revoke her next request is refused", async () => {
    const claudia = guest();
    const joined = await claudia.call(Join, { link: (await dirk.call(Invite, undefined)).url });
    expect(joined.stage).toBe("joined");
    const fetchFoo = () => guestFetchOf(claudia)("fooservice", new Request("http://service/"));
    expect((await fetchFoo()).status).toBe(200);

    const peerId = await newestGuest();
    await dirk.call(RevokeGuest, { peerId });

    expect([401, 403]).toContain((await fetchFoo()).status);
    // Dirk still sees her, as revoked.
    expect(await statusOf(peerId)).toBe("revoked");
  });

  it("Revoke: Claudia is told, within a heartbeat, without making a request; her identity is forgotten", async () => {
    const mesh = meshFor(relay.addr);
    const claudia = guest(mesh);
    await claudia.call(Join, { link: (await dirk.call(Invite, undefined)).url });
    const peerId = await newestGuest();

    await dirk.call(RevokeGuest, { peerId });

    await expect
      .poll(async () => (await claudia.call(GetGuest, undefined)).stage, { timeout: 15_000 })
      .toBe("revoked");
    expect(await claudia.call(GetGuest, undefined)).toMatchObject({ sharerName: "Dirk" });
    // Nothing to resume: the revoked identity is gone with the membership.
    expect(await mesh.guestStore.load()).toBeUndefined();
  }, 30_000);

  it("closing the tab keeps her identity: a new runtime resumes without the Invite", async () => {
    const mesh = meshFor(relay.addr);
    const tab = guest(mesh);
    await tab.call(Join, { link: (await dirk.call(Invite, undefined)).url });
    tab.dispose();

    const again = guest(mesh);
    expect(await again.call(Resume, undefined)).toMatchObject({
      stage: "joined",
      sharerName: "Dirk",
    });
    expect(await again.call(ListSharedServices, undefined)).toHaveLength(1);
  });

  it("Close session forgets her: nothing to resume, Dirk sees she left, and the link is spent", async () => {
    const mesh = meshFor(relay.addr);
    const tab = guest(mesh);
    const { url } = await dirk.call(Invite, undefined);
    const before = new Set((await dirk.call(ListGuests, undefined)).map((g) => g.peerId));
    await tab.call(Join, { link: url });
    const peerId = (await dirk.call(ListGuests, undefined)).find(
      (g) => !before.has(g.peerId),
    )?.peerId;
    expect(peerId).toBeDefined();

    expect(await tab.call(CloseSession, undefined)).toEqual({ stage: "no-link" });
    expect(await statusOf(peerId as string)).toBe("left");
    expect(await tab.call(Resume, undefined)).toEqual({ stage: "no-link" });
    expect(await tab.call(Join, { link: url })).toMatchObject({ stage: "invite-used" });
  });
});

describe("M5 — Dirk stops, and comes back after a reload", () => {
  it("Claudia sees machine-offline, then is back in with no new Invite", async () => {
    const dirkMesh = meshFor(relay.addr);
    const pairing = () => ({ base: bridge.origin, token: TOKEN });
    const store = (await import("./harness.js")).memoryStore();
    const before = onMesh(dirkMesh, { store, bridge: pairing });
    await before.call(SetName, { name: "Dirk" });
    await before.call(AddService, { name: "app", kind: "bridged", target: app.origin });
    await before.call(StartSharing, undefined);
    const claudia = guest();
    await claudia.call(Join, { link: (await before.call(Invite, undefined)).url });
    const fetchApp = () => guestFetchOf(claudia)("app", new Request("http://service/"));

    await before.call(StopSharing, undefined);
    before.dispose();
    await fetchApp();
    expect(await claudia.call(GetGuest, undefined)).toMatchObject({ stage: "machine-offline" });

    const after = onMesh(dirkMesh, { store, bridge: pairing });
    others.push({ dispose: () => void after.call(StopSharing, undefined) });
    await after.call(StartSharing, undefined);
    let status = 0;
    for (let i = 0; i < 100 && status !== 200; i++) {
      status = (await fetchApp()).status;
      if (status !== 200) await new Promise((r) => setTimeout(r, 200));
    }
    expect(status).toBe(200);
    expect(await claudia.call(GetGuest, undefined)).toMatchObject({ stage: "joined" });
  });

  it("the invite link again after Dirk stopped and restarted (Try again, a reload): she is back in, not 'invite used'", async () => {
    const dirkMesh = meshFor(relay.addr);
    const pairing = () => ({ base: bridge.origin, token: TOKEN });
    const store = (await import("./harness.js")).memoryStore();
    const before = onMesh(dirkMesh, { store, bridge: pairing });
    await before.call(SetName, { name: "Dirk" });
    await before.call(StartSharing, undefined);
    const claudiaMesh = meshFor(relay.addr);
    const claudia = guest(claudiaMesh);
    const { url } = await before.call(Invite, undefined);
    expect(await claudia.call(Join, { link: url })).toMatchObject({ stage: "joined" });

    // Dirk stops sharing: her page sees he is off, and Try again joins with the same link.
    await before.call(StopSharing, undefined);
    before.dispose();
    expect(await claudia.call(Join, { link: url })).toMatchObject({ stage: "machine-offline" });

    // Dirk shares again.
    const after = onMesh(dirkMesh, { store, bridge: pairing });
    others.push({ dispose: () => void after.call(StopSharing, undefined) });
    await after.call(StartSharing, undefined);

    // Try again with the same link: her saved membership, not the spent invite.
    expect(await claudia.call(Join, { link: url })).toMatchObject({ stage: "joined" });
    // A reload: a new runtime over the same stores, opened on the same link.
    claudia.dispose();
    const reloaded = guest(claudiaMesh);
    expect(await reloaded.call(Join, { link: url })).toMatchObject({ stage: "joined" });
  }, 60_000);
});

describe("M5 — Dirk sees who joined", () => {
  it("a Guest who joins appears in Dirk's model, without Dirk asking", async () => {
    let model: PeerShareModel | undefined;
    dirk.rt.slots.observe(peershareModelSlot, (v) => {
      model = v[0];
    })();
    const before = model?.getSnapshot().guests.length ?? 0;

    await guest().call(Join, { link: (await dirk.call(Invite, undefined)).url });

    await expect
      .poll(() => model?.getSnapshot().guests.length, { timeout: 5_000 })
      .toBe(before + 1);
    const joinedAt = model?.getSnapshot().guests.at(-1)?.joinedAt ?? 0;
    expect(Math.abs(Date.now() - joinedAt)).toBeLessThan(60_000);
  });
});

describe("coming back with a saved identity", () => {
  it("revoked while her tab was closed: on her return she is told, not 'invite used', and the key is gone", async () => {
    const mesh = meshFor(relay.addr);
    const tab = guest(mesh);
    const { url } = await dirk.call(Invite, undefined);
    await tab.call(Join, { link: url });
    const peerId = await newestGuest();
    tab.dispose(); // the tab closes; the identity stays saved

    await dirk.call(RevokeGuest, { peerId });

    // The page opens again: Resume with the saved key.
    const back = guest(mesh);
    expect(await back.call(Resume, undefined)).toMatchObject({ stage: "revoked" });
    expect(await mesh.guestStore.load()).toBeUndefined();
    // And the old link, from a fresh start: the spent invite, as before.
    expect(await guest(mesh).call(Join, { link: url })).toMatchObject({ stage: "invite-used" });
  }, 60_000);

  it("revoked while away, then Join on her old link: told she was removed", async () => {
    const mesh = meshFor(relay.addr);
    const tab = guest(mesh);
    const { url } = await dirk.call(Invite, undefined);
    await tab.call(Join, { link: url });
    const peerId = await newestGuest();
    tab.dispose();
    await dirk.call(RevokeGuest, { peerId });

    expect(await guest(mesh).call(Join, { link: url })).toMatchObject({ stage: "revoked" });
    expect(await mesh.guestStore.load()).toBeUndefined();
  }, 60_000);

  it("the newest link's relays are used: a saved identity with a relay that moved still gets in", async () => {
    const mesh = meshFor(relay.addr);
    const tab = guest(mesh);
    const { url } = await dirk.call(Invite, undefined);
    await tab.call(Join, { link: url });
    tab.dispose();
    // Her saved identity names a relay that is gone.
    const saved = await mesh.guestStore.load();
    await mesh.guestStore.save({
      ...(saved as NonNullable<typeof saved>),
      relayAddrs: [
        "/ip4/127.0.0.1/tcp/1/ws/p2p/12D3KooWGZkMZ7kCq6tPVBv2TuyQ3pNzHUvWr7cAu5GLGqfgkdLk",
      ],
    });

    expect(await guest(mesh).call(Join, { link: url })).toMatchObject({ stage: "joined" });
  }, 60_000);

  it("after Close session, an answer still on its way does not bring the Viewer back", async () => {
    const tab = guest();
    await tab.call(Join, { link: (await dirk.call(Invite, undefined)).url });
    expect(await tab.call(CloseSession, undefined)).toEqual({ stage: "no-link" });
    // A watch tick would come within 5 s.
    await new Promise((r) => setTimeout(r, 6_000));
    expect(await tab.call(GetGuest, undefined)).toEqual({ stage: "no-link" });
  }, 30_000);
});

describe("Claudia sees Dirk's status", () => {
  it("without a request of hers: Dirk goes offline, comes back, and shares something new", async () => {
    const dirkMesh = meshFor(relay.addr);
    const pairing = () => ({ base: bridge.origin, token: TOKEN });
    const store = (await import("./harness.js")).memoryStore();
    const before = onMesh(dirkMesh, { store, bridge: pairing });
    await before.call(SetName, { name: "Dirk" });
    await before.call(AddService, { name: "app", kind: "bridged", target: app.origin });
    await before.call(StartSharing, undefined);
    const claudia = guest();
    await claudia.call(Join, { link: (await before.call(Invite, undefined)).url });
    const stage = async () => (await claudia.call(GetGuest, undefined)).stage;
    const poll = { timeout: 20_000, interval: 250 };

    await before.call(StopSharing, undefined);
    before.dispose();
    await expect.poll(stage, poll).toBe("machine-offline");

    const after = onMesh(dirkMesh, { store, bridge: pairing });
    others.push({ dispose: () => void after.call(StopSharing, undefined) });
    await after.call(StartSharing, undefined);
    await expect.poll(stage, poll).toBe("joined");

    const version = (await claudia.call(GetGuest, undefined)).catalogVersion ?? 0;
    await after.call(AddService, { name: "wiki", kind: "bridged", target: app.origin });
    await expect
      .poll(async () => (await claudia.call(GetGuest, undefined)).catalogVersion ?? 0, poll)
      .toBeGreaterThan(version);
    expect((await claudia.call(ListSharedServices, undefined)).map((s) => s.name)).toEqual([
      "app",
      "wiki",
    ]);
  }, 90_000);
});

describe("Dirk sees each Guest's status", () => {
  it("a Guest whose tab is gone (no Close session) turns from online to away", async () => {
    const claudia = guest();
    await claudia.call(Join, { link: (await dirk.call(Invite, undefined)).url });
    const peerId = await newestGuest();
    // Online from its first heartbeat after joining (every 5 s).
    await expect.poll(() => statusOf(peerId), { timeout: 10_000, interval: 250 }).toBe("online");

    // The tab closes: its node stops, and no heartbeat comes any more.
    claudia.dispose();

    // The hub's presence lasts 15 s and is swept every 5 s.
    await expect.poll(() => statusOf(peerId), { timeout: 30_000, interval: 500 }).toBe("away");
  }, 40_000);
});

describe("M9 — live connections", () => {
  it("Claudia's WebSocket reaches Dirk's app through the mesh, Dirk's tab and the Bridge", async () => {
    const claudia = guest();
    await claudia.call(Join, { link: (await dirk.call(Invite, undefined)).url });
    let open: GuestSocket | undefined;
    claudia.rt.slots.observe(guestSocketSlot, (v) => {
      open = v[0];
    })();

    const socket = (open as GuestSocket)("fooservice", "/live?x=1", ["vite-hmr"]);
    const next = (s: TunnelSocket) =>
      new Promise<unknown>((r) => {
        s.onmessage = (e) => r(e.data);
      });
    expect(await next(socket)).toBe("hello /live?x=1 vite-hmr");
    const reply = next(socket);
    socket.send("ping");
    expect(await reply).toBe("echo ping");
    expect(socket.protocol).toBe("vite-hmr");
    socket.close();
  });

  it("Revoke ends Claudia's open live connections too, not only her next requests", async () => {
    const claudia = guest();
    const before = new Set((await dirk.call(ListGuests, undefined)).map((g) => g.peerId));
    await claudia.call(Join, { link: (await dirk.call(Invite, undefined)).url });
    const peerId = (await dirk.call(ListGuests, undefined)).find((g) => !before.has(g.peerId))
      ?.peerId as string;
    let open: GuestSocket | undefined;
    claudia.rt.slots.observe(guestSocketSlot, (v) => {
      open = v[0];
    })();
    const socket = (open as GuestSocket)("fooservice", "/live", []);
    await new Promise<unknown>((r) => {
      socket.onmessage = r;
    });
    const closed = new Promise<unknown>((r) => {
      socket.onclose = r;
    });

    await dirk.call(RevokeGuest, { peerId });

    await expect(
      Promise.race([closed, new Promise((_, no) => setTimeout(no, 10_000, "still open"))]),
    ).resolves.toBeDefined();
  });
});
