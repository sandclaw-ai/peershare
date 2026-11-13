import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { frames } from "../gallery/scenarios.js";
import { HELP_URL, HelpTip } from "../src/kit/help-tip.js";
import { InviteDialog } from "../src/kit/people.js";

afterEach(cleanup);

const tip = () => (
  <HelpTip title="Invites" help="security#invites">
    <p>This link lets one person join, once.</p>
  </HelpTip>
);
const pill = () => screen.getByRole("button", { name: "How this is kept safe: Invites" });
const shown = () => screen.queryByText("This link lets one person join, once.") != null;

describe("HelpTip", () => {
  it("is a small ? pill that opens how this part is kept safe, with a link to the help", async () => {
    render(tip());
    expect(pill().textContent).toBe("i");
    await act(async () => fireEvent.click(pill()));
    expect(shown()).toBe(true);
    const more = screen.getByRole("link", { name: /Learn more about invites/ });
    expect(more.getAttribute("href")).toBe(`${HELP_URL}security#invites`);
    expect(more.getAttribute("target")).toBe("_blank");
  });

  it("a click pins it and takes the focus, so the keyboard reaches Learn more; Escape closes it", async () => {
    render(tip());
    await act(async () => fireEvent.click(pill()));
    expect(document.activeElement?.closest("[data-slot=popover-content]")).not.toBeNull();
    await act(async () =>
      fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" }),
    );
    expect(shown()).toBe(false);
  });

  it("opened by hovering, a click keeps it open instead of toggling it shut", async () => {
    render(tip());
    await act(async () => fireEvent.pointerEnter(pill(), { pointerType: "mouse" }));
    expect(shown()).toBe(true);
    await act(async () => fireEvent.click(pill()));
    expect(shown()).toBe(true);
    // Pinned: leaving with the pointer no longer closes it.
    await act(async () => {
      fireEvent.pointerLeave(pill(), { pointerType: "mouse" });
      await new Promise((r) => setTimeout(r, 250));
    });
    expect(shown()).toBe(true);
  });
});

describe("help tips name nothing but themselves", () => {
  it("the invite dialog is named by its title alone", () => {
    render(
      <InviteDialog
        open
        onOpenChange={() => {}}
        invite={{ url: "https://x/invite#join=a&from=Dirk", expiresAt: new Date(), used: false }}
      />,
    );
    expect(screen.getByRole("dialog", { name: "Invite a guest" })).toBeTruthy();
  });

  it("the Services and Guests headings are their words alone", () => {
    render(<div>{frames.find((f) => f.id === "s3-health")?.render()}</div>);
    expect(screen.getByRole("heading", { name: "Services" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Guests" })).toBeTruthy();
  });
});

/** The screens a person decides on, and the tips each must carry. */
const expected: Record<string, string[]> = {
  "s3-health": [
    "Shared from this tab",
    "Who can see your services",
    "Where your pages go",
    "The local proxy",
  ],
  "s1-prompt": ["The local proxy", "Local or remote"],
  "g1-landing": ["Encrypted end to end"],
  "g3-viewer": ["A private, isolated page"],
};

describe("help tips on the critical screens", () => {
  it.each(Object.entries(expected))("%s explains its safety", (id, titles) => {
    const frame = frames.find((f) => f.id === id);
    render(<div>{frame?.render()}</div>);
    for (const title of titles) {
      expect(screen.getByRole("button", { name: `How this is kept safe: ${title}` })).toBeTruthy();
    }
  });
});

describe("every Learn more lands on a section of the help site", () => {
  const kit = resolve(import.meta.dirname, "../src/kit");
  const pages = resolve(import.meta.dirname, "../../peershare.help/src/pages");
  const targets = readdirSync(kit)
    .filter((f) => f.endsWith(".tsx"))
    .flatMap((f) => [
      ...readFileSync(join(kit, f), "utf8").matchAll(/help="([^"#]+)(?:#([^"]+))?"/g),
    ])
    .map((m) => ({ page: m[1] ?? "", anchor: m[2] }));

  it("finds the tips' links", () => {
    expect(targets.length).toBeGreaterThanOrEqual(8);
  });

  it.each(targets.map((t) => [`${t.page}${t.anchor ? `#${t.anchor}` : ""}`, t] as const))(
    "%s exists",
    (_label, { page, anchor }) => {
      const source = readFileSync(join(pages, `${page}.astro`), "utf8");
      if (anchor != null) expect(source).toContain(`id="${anchor}"`);
    },
  );
});
