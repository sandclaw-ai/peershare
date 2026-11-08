import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { frames, scenarios } from "../gallery/scenarios.js";
import { SharerPage } from "../src/kit/sharer-page.js";
import { initials } from "../src/kit/status.js";

afterEach(cleanup);

describe("the kit, frame by frame", () => {
  it("covers every scenario of the description (S1–S7, G1–G4) and the safety tips (H1)", () => {
    expect(scenarios.map((s) => s.id)).toEqual([
      "s1",
      "s2",
      "s3",
      "s4",
      "s5",
      "s6",
      "s7",
      "g1",
      "g2",
      "g3",
      "g4",
      "h1",
    ]);
    expect(new Set(frames.map((f) => f.id)).size).toBe(frames.length);
  });

  it.each(frames.map((f) => [f.id, f] as const))("renders %s", (_id, frame) => {
    const { container } = render(<div>{frame.render()}</div>);
    expect(container.textContent?.length ?? 0).toBeGreaterThan(0);
  });

  it("names the guest in the invite, and the refusals say why", () => {
    const byId = (id: string) => frames.find((f) => f.id === id)?.render();
    render(<div>{byId("g1-landing")}</div>);
    expect(screen.getByRole("button", { name: "Join Dirk" })).toBeTruthy();
    cleanup();
    render(<div>{byId("g2-expired")}</div>);
    expect(screen.getByText("This invite has expired")).toBeTruthy();
  });
});

describe("initials", () => {
  it("takes a person's initials, and a guest's id", () => {
    expect(initials("Dirk Bauer")).toBe("DB");
    expect(initials("Dirk")).toBe("D");
    expect(initials("Guest 3fa9c2")).toBe("3F");
    expect(initials("  ")).toBe("?");
  });
});

describe("SharerPage", () => {
  it("Stop sharing asks first, then stops; Start sharing does not ask", async () => {
    const onSharingChange = vi.fn();
    const { rerender } = render(
      <SharerPage
        name="Dirk"
        sharing
        services={[]}
        guests={[]}
        onSharingChange={onSharingChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Stop sharing/ }));
    expect(onSharingChange).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: "Stop sharing" }));
    });
    expect(onSharingChange).toHaveBeenCalledWith(false);

    rerender(
      <SharerPage
        name="Dirk"
        sharing={false}
        services={[]}
        guests={[]}
        onSharingChange={onSharingChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Start sharing/ }));
    expect(onSharingChange).toHaveBeenLastCalledWith(true);
  });

  it("claims no presence it does not know", () => {
    render(
      <SharerPage
        name="Dirk"
        sharing
        services={[]}
        guests={[{ peerId: "p1", name: "Guest 3fa9c2", joinedAt: new Date(0) }]}
      />,
    );
    expect(screen.getByText("Sharing · 1 guest")).toBeTruthy();
    expect(screen.getByText("1 joined")).toBeTruthy();
    expect(screen.queryByText(/online/)).toBeNull();
  });
});
