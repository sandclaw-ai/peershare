import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { GuestsCard } from "../src/kit/people.js";
import type { Guest } from "../src/views/model.js";

afterEach(cleanup);

const at = (h: number) => new Date(Date.UTC(2026, 10, 9, h));
const guests: Guest[] = [
  { peerId: "a", name: "Guest aaaaaa", joinedAt: at(9), status: "online" },
  { peerId: "b", name: "Guest bbbbbb", joinedAt: at(8), status: "away" },
  { peerId: "c", name: "Guest cccccc", joinedAt: at(7), status: "left", endedAt: at(8) },
  { peerId: "d", name: "Guest dddddd", joinedAt: at(6), status: "revoked", endedAt: at(7) },
];

describe("the Sharer sees each Guest's status", () => {
  it("members say online or away and can be revoked; counts are of members only", () => {
    render(<GuestsCard guests={guests} canInvite />);
    expect(screen.getByText("2 joined · 1 online now")).toBeTruthy();
    const row = (name: string) => screen.getByText(name).closest("li") as HTMLElement;
    expect(within(row("Guest aaaaaa")).getByText(/Online · joined/)).toBeTruthy();
    expect(within(row("Guest bbbbbb")).getByText(/Away · joined/)).toBeTruthy();
    expect(within(row("Guest aaaaaa")).getByRole("button", { name: "Revoke" })).toBeTruthy();
  });

  it("who left or was revoked stays listed under Earlier, without Revoke", () => {
    render(<GuestsCard guests={guests} canInvite />);
    expect(screen.getByText("Earlier")).toBeTruthy();
    const row = (name: string) => screen.getByText(name).closest("li") as HTMLElement;
    expect(within(row("Guest cccccc")).getByText("Left")).toBeTruthy();
    expect(within(row("Guest cccccc")).getByText(/Left the session/)).toBeTruthy();
    expect(within(row("Guest dddddd")).getByText("Revoked")).toBeTruthy();
    expect(within(row("Guest dddddd")).queryByRole("button", { name: "Revoke" })).toBeNull();
  });

  it("with only departed guests, it says nobody is here now and offers an invite", () => {
    render(<GuestsCard guests={guests.slice(2)} canInvite />);
    expect(screen.getByText("Nobody now")).toBeTruthy();
    expect(screen.getByText(/Invite someone/)).toBeTruthy();
  });
});
