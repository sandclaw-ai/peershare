import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GuestLanding, GuestViewer } from "../src/kit/guest.js";
import { EXAMPLE_SERVICE, ServiceForm } from "../src/kit/services.js";
import { SharerPage } from "../src/kit/sharer-page.js";
import type { Service } from "../src/views/model.js";

afterEach(cleanup);

const service = (id: string, isDefault: boolean): Service => ({
  id,
  name: id,
  kind: "direct",
  target: `https://${id}.example.org/`,
  enabled: true,
  isDefault,
  health: "ok",
  warnings: [],
});

describe("the example site", () => {
  it("with nothing shared yet, a link fills the form in with the example site", async () => {
    const onAdd = vi.fn();
    render(<SharerPage name="Dirk" sharing services={[]} guests={[]} onAdd={onAdd} />);
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Fill in the example site" })),
    );
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Example site");
    expect((screen.getByLabelText("Address") as HTMLInputElement).value).toBe(
      "https://peershare-demo.httpeers.net/",
    );
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Share service" })));
    expect(onAdd).toHaveBeenCalledWith(EXAMPLE_SERVICE, "direct");
  });

  it("is not offered once something is shared", () => {
    render(
      <SharerPage
        name="Dirk"
        sharing
        services={[service("a", true)]}
        guests={[]}
        onAdd={() => {}}
      />,
    );
    expect(screen.queryByRole("button", { name: "Fill in the example site" })).toBeNull();
  });
});

describe("exactly one default service", () => {
  it("the only service is the default: its switch is on and locked", () => {
    const only = service("a", true);
    render(<ServiceForm services={[only]} self={only} initial={{ ...only }} onSubmit={() => {}} />);
    const sw = screen.getByRole("switch");
    expect(sw.getAttribute("aria-checked")).toBe("true");
    expect(sw.hasAttribute("disabled")).toBe(true);
  });

  it("with other services, the switch is free and says only one is the default", () => {
    const a = service("a", true);
    const b = service("b", false);
    const onSubmit = vi.fn();
    render(<ServiceForm services={[a, b]} self={b} initial={{ ...b }} onSubmit={onSubmit} />);
    const sw = screen.getByRole("switch");
    expect(sw.hasAttribute("disabled")).toBe(false);
    expect(screen.getByText(/Only one service is the default/)).toBeTruthy();
    fireEvent.click(sw);
    fireEvent.submit(sw.closest("form") as HTMLFormElement);
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ isDefault: true }), "direct");
  });
});

describe("a guest can share their own services", () => {
  const shareLink = () => screen.getByRole("link", { name: /Share your own/ });

  it("from the invite page, in a new tab", () => {
    render(<GuestLanding sharerName="Dirk" stage="invite" />);
    expect(shareLink().getAttribute("href")).toBe("/");
    expect(shareLink().getAttribute("target")).toBe("_blank");
  });

  it("from the Viewer, without leaving the session", () => {
    render(
      <GuestViewer
        sharerName="Dirk"
        services={[{ id: "a", name: "a", paused: false }]}
        selected="a"
        presence="online"
        shareHref="https://peershare.example/"
      />,
    );
    expect(shareLink().getAttribute("href")).toBe("https://peershare.example/");
    expect(shareLink().getAttribute("target")).toBe("_blank");
  });
});

describe("a join says what it is doing", () => {
  it("while joining, the step replaces Decline", () => {
    render(<GuestLanding sharerName="Dirk" stage="joining" connecting="direct" />);
    expect(screen.getByRole("status").textContent).toMatch(/Trying a direct connection/);
    expect(screen.queryByRole("button", { name: "Decline" })).toBeNull();
  });
});

describe("turning the Default off says where it goes", () => {
  it("names the service that becomes the default", () => {
    const a = service("a", true);
    const b = service("b", false);
    render(<ServiceForm services={[a, b]} self={a} initial={{ ...a }} onSubmit={() => {}} />);
    fireEvent.click(screen.getByRole("switch"));
    expect(screen.getByText("Turned off, b becomes the default.")).toBeTruthy();
  });
});
