/** The always-on diagnostics log, and the Guest's precise join outcomes. */

import { MemberJoinError } from "@statewalker/httpeers-member";
import { describe, expect, it } from "vitest";
import { guestOutcome } from "../src/internal/guest.manager.js";
import { createLog, describeError } from "../src/public/diagnostics.js";

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

describe("createLog", () => {
  it("keeps entries with their level, newest last, in text under a header", () => {
    let t = Date.UTC(2026, 10, 13, 12, 0, 0);
    const log = createLog({ now: () => t++, context: () => ({ page: "hub" }) });
    log.info("sharing: on");
    log.warn("invite: refused", "abc… → 403");
    const text = log.text();
    expect(text).toMatch(/^PeerShare diagnostics\n/);
    expect(text).toContain("page: hub");
    expect(text).toContain("INFO  sharing: on");
    expect(text).toContain("WARN  invite: refused: abc… → 403");
    expect(text.indexOf("sharing: on")).toBeLessThan(text.indexOf("invite: refused"));
  });

  it("drops the oldest entries past its capacity", () => {
    const log = createLog({ capacity: 3 });
    for (const n of [1, 2, 3, 4, 5]) log.info(`e${n}`);
    expect(log.entries().map((e) => e.event)).toEqual(["e3", "e4", "e5"]);
  });

  it("survives a reload, and two tabs append to the same log", () => {
    const storage = memoryStorage();
    const tabA = createLog({ storage, key: "k" });
    const tabB = createLog({ storage, key: "k" });
    tabA.info("from a");
    tabB.info("from b");
    tabA.info("from a again");
    const reloaded = createLog({ storage, key: "k" });
    expect(reloaded.entries().map((e) => e.event)).toEqual(["from a", "from b", "from a again"]);
  });

  it("keeps working when storage refuses", () => {
    const log = createLog({
      storage: {
        getItem: () => null,
        setItem: () => {
          throw new Error("quota");
        },
        removeItem: () => {},
      },
    });
    expect(() => log.info("x")).not.toThrow();
  });
});

describe("describeError", () => {
  it("gives the whole cause chain, and libp2p's code", () => {
    const root = Object.assign(new Error("no reservation"), { code: "NO_RESERVATION" });
    const error = new Error("dial failed", { cause: root });
    expect(describeError(error)).toBe(
      "Error: dial failed ← Error: no reservation [NO_RESERVATION]",
    );
  });
});

describe("guestOutcome", () => {
  const refused = (answer: string) =>
    new MemberJoinError("invitation-refused", "the hub would not accept that invitation", {
      cause: new Error(`join: invitation redemption failed (403 ): ${answer}`),
    });

  it.each([
    ['{"error":"invitation already-redeemed"}', "invite-used"],
    ['{"error":"invitation expired"}', "invite-expired"],
    ['{"error":"invitation not-found"}', "invite-unknown"],
    ['{"error":"something new"}', "join-failed"],
  ])("the hub's %s → %s, with the hub's words", (answer, stage) => {
    const outcome = guestOutcome(refused(answer));
    expect(outcome.stage).toBe(stage);
    expect(outcome.problem).toContain(answer);
  });

  it("an error the hub never answered is machine-offline, still with its words", () => {
    const outcome = guestOutcome(new Error("NO_RESERVATION"));
    expect(outcome).toEqual({ stage: "machine-offline", problem: "Error: NO_RESERVATION" });
  });
});
