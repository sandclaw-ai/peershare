import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { frames, scenarios } from "../gallery/scenarios.js";
import { initials } from "../src/kit/status.js";

afterEach(cleanup);

describe("the kit, frame by frame", () => {
  it("covers every scenario of the description (S1–S7, G1–G4)", () => {
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
