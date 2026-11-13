/** One hub however many tabs show the Sharer's page (tabs.ts). */

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  AddService,
  GetDiagnostics,
  GetSharer,
  GetSharing,
  Invite,
  StartSharing,
} from "../src/public/commands.js";
import { createLog } from "../src/public/diagnostics.js";
import { type PeerShareSnapshot, peershareModelSlot } from "../src/public/extension-points.js";
import type { PeerShareInit } from "../src/public/feature.js";
import { createRuntime } from "../src/public/suite.js";
import {
  sharedAcrossTabs,
  type TabChannel,
  type TabCoordination,
  type TabMessage,
  type TabRole,
} from "../src/public/tabs.js";
import { memoryStore } from "./harness.js";
import { meshFor, startRelay } from "./mesh-harness.js";

/** BroadcastChannel and Web Locks for tabs in one process: no tab hears itself; one lock holder. */
function browserWithTabs(): TabCoordination {
  const tabs = new Set<(m: TabMessage) => void>();
  const queue: Array<() => Promise<void>> = [];
  const next = () => {
    const lead = queue[0];
    if (lead == null) return;
    void lead().finally(() => {
      queue.shift();
      next();
    });
  };
  return {
    channel(): TabChannel {
      let mine: ((m: TabMessage) => void) | undefined;
      return {
        post: (message) => {
          for (const tab of [...tabs])
            if (tab !== mine) queueMicrotask(() => tab(structuredClone(message)));
        },
        listen(onMessage) {
          mine = onMessage;
          tabs.add(onMessage);
          return () => tabs.delete(onMessage);
        },
        close: () => {
          if (mine) tabs.delete(mine);
        },
      };
    },
    lock(_name, lead) {
      queue.push(lead);
      if (queue.length === 1) next();
    },
  };
}

function openTab(browser: TabCoordination, init: PeerShareInit) {
  const rt = createRuntime();
  const roles: TabRole[] = [];
  const close = sharedAcrossTabs(init, {
    coordination: browser,
    onRole: (r) => roles.push(r),
  }).contribute(rt);
  let model: { getSnapshot(): PeerShareSnapshot } | undefined;
  rt.slots.observe(peershareModelSlot, (v) => {
    model = v[0];
  })();
  return {
    call: <P, R>(decl: import("@statewalker/shared-commands").CommandDeclaration<P, R>, p: P) =>
      rt.commands.call(decl, p).promise,
    snapshot: () => (model as { getSnapshot(): PeerShareSnapshot }).getSnapshot(),
    role: () => roles.at(-1),
    close,
  };
}

const closing: Array<() => void> = [];
afterEach(() => {
  for (const close of closing.splice(0)) close();
});

describe("tabs — one hub", () => {
  it("the first tab leads; the second follows and shows the same Sharer", async () => {
    const browser = browserWithTabs();
    const store = memoryStore();
    const a = openTab(browser, { store });
    const b = openTab(browser, { store });
    closing.push(a.close, b.close);
    await expect.poll(() => a.role()).toBe("leader");
    expect(b.role()).toBe("follower");

    await b.call(AddService, { name: "dev", kind: "bridged", target: "http://localhost:5173" });

    // Done by the leader, seen by both.
    expect((await a.call(GetSharer, undefined)).services.map((s) => s.id)).toEqual(["dev"]);
    await expect.poll(() => b.snapshot().sharer.services.map((s) => s.id)).toEqual(["dev"]);
  });

  it("a command a follower sends before any tab leads waits, then runs", async () => {
    const browser = browserWithTabs();
    const store = memoryStore();
    const a = openTab(browser, { store });
    closing.push(a.close);
    // Called at once: the lock is granted after this tab's first call.
    const added = a.call(AddService, { name: "x", kind: "bridged", target: "http://localhost:1" });
    await expect(added).resolves.toEqual({ ok: true, id: "x" });
  });

  it("when the leader's tab closes, a follower takes over the same Sharer", async () => {
    const browser = browserWithTabs();
    const store = memoryStore();
    const a = openTab(browser, { store });
    const b = openTab(browser, { store });
    closing.push(b.close);
    await expect.poll(() => a.role()).toBe("leader");
    await a.call(AddService, { name: "dev", kind: "bridged", target: "http://localhost:5173" });

    a.close();
    await expect.poll(() => b.role()).toBe("leader");
    expect((await b.call(GetSharer, undefined)).services.map((s) => s.id)).toEqual(["dev"]);
  });

  it("diagnostics come from the leader, whichever tab asks", async () => {
    const browser = browserWithTabs();
    const store = memoryStore();
    const log = createLog();
    const a = openTab(browser, { store, log });
    const b = openTab(browser, { store, log: createLog() });
    closing.push(a.close, b.close);
    await expect.poll(() => a.role()).toBe("leader");
    expect(await b.call(GetDiagnostics, undefined)).toContain("tabs: this tab runs the hub");
  });
});

describe("tabs — one hub on a mesh", () => {
  let relay: Awaited<ReturnType<typeof startRelay>>;
  beforeAll(async () => {
    relay = await startRelay();
  });
  afterAll(() => relay?.stop());

  it("every tab invites through the one hub; a follower that takes over shares again as the same peer", async () => {
    const browser = browserWithTabs();
    const store = memoryStore();
    // One browser: the tabs share its key and its hub storage.
    const mesh = meshFor(relay.addr);
    const a = openTab(browser, { store, mesh });
    const b = openTab(browser, { store, mesh });
    closing.push(b.close);
    await b.call(StartSharing, undefined);
    const peerId = (await a.call(GetSharing, undefined)).peerId;
    expect(peerId).toBeDefined();
    await expect.poll(() => b.snapshot().sharing).toEqual({ sharing: true, peerId });

    // Made from the follower, by the leader's hub: the Invite is one that hub knows.
    const invite = await b.call(Invite, undefined);
    expect(invite.url).toContain("join=");
    await expect.poll(() => a.snapshot().invite?.url).toBe(invite.url);

    a.close();
    await expect.poll(() => b.role()).toBe("leader");
    await expect
      .poll(async () => b.call(GetSharing, undefined), { timeout: 30_000 })
      .toEqual({ sharing: true, peerId });
  }, 60_000);
});
