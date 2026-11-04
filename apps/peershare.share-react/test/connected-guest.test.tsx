/**
 * M7 — the Guest's screen, wired. The real Guest needs a mesh, which jsdom
 * cannot host; here a stand-in PeerShare answers at the views' seam (the
 * model and the commands). The real one is tested in @statewalker/peershare.
 */

import {
  CloseSession,
  createRuntime,
  type GuestState,
  Join,
  ListSharedServices,
  type PeerShareSnapshot,
  peershareModelSlot,
} from "@statewalker/peershare.share";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GuestScreen, PeerShareProvider } from "../src/connected/index.js";

afterEach(cleanup);

/** `answer`: what Join says; a refused or unreachable Join leaves the Guest at "no-link". */
function standInPeerShare(answer: GuestState["stage"] = "joined") {
  const rt = createRuntime();
  let snapshot: PeerShareSnapshot = {
    sharer: { name: "", services: [] },
    sharing: { sharing: false },
    guests: [],
    guest: { stage: "no-link" },
  };
  const listeners = new Set<() => void>();
  const setGuest = (guest: GuestState) => {
    snapshot = { ...snapshot, guest };
    for (const l of listeners) l();
  };
  rt.slots.provide(peershareModelSlot, {
    getSnapshot: () => snapshot,
    subscribe: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  });
  const joined = vi.fn(async ({ link }: { link: string }) => {
    void link;
    const state: GuestState = { stage: answer, sharerName: "Dirk", sharerPeerId: "12D3KooWDirk" };
    if (answer === "joined") setGuest(state);
    return state;
  });
  rt.commands.listen(Join, (cmd) => joined(cmd.payload));
  rt.commands.listen(ListSharedServices, () =>
    Promise.resolve([
      { id: "foo", name: "fooService", isDefault: true, paused: false },
      { id: "wiki", name: "Team wiki", isDefault: false, paused: true },
    ]),
  );
  const closed = vi.fn(async () => {
    setGuest({ stage: "no-link" });
    return { stage: "no-link" } as GuestState;
  });
  rt.commands.listen(CloseSession, () => closed());
  return { rt, joined, closed };
}

describe("M7 — GuestScreen", () => {
  it("Join sends the link; the Viewer then lists Dirk's Services; Close session ends it", async () => {
    const { rt, joined, closed } = standInPeerShare();
    render(
      <PeerShareProvider rt={rt}>
        <GuestScreen
          link="https://tools.sandclaw.ai/peer-share/invite#join=x&from=Dirk"
          sharerName="Dirk"
        />
      </PeerShareProvider>,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Join Dirk/ }));
    });
    expect(joined).toHaveBeenCalledWith({
      link: "https://tools.sandclaw.ai/peer-share/invite#join=x&from=Dirk",
    });
    expect(await screen.findByText(/Team wiki/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Close session/ }));
    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: "Close and forget" }));
    });
    expect(closed).toHaveBeenCalled();
    expect(await screen.findByRole("button", { name: /Join Dirk/ })).toBeTruthy();
  });

  it.each([
    ["invite-used", /This invite has already been used/],
    ["machine-offline", /Dirk's computer isn't answering/],
  ] as const)(
    "a Join that does not get in (%s) says why, and opens no Viewer",
    async (stage, what) => {
      const { rt } = standInPeerShare(stage);
      render(
        <PeerShareProvider rt={rt}>
          <GuestScreen link="https://x/peer-share/invite#join=x&from=Dirk" sharerName="Dirk" />
        </PeerShareProvider>,
      );

      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /Join Dirk/ }));
      });
      expect(await screen.findByText(what)).toBeTruthy();
      expect(screen.queryByText(/Team wiki/)).toBeNull();
    },
  );
});
