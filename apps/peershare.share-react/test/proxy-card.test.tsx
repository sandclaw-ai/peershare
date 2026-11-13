import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { olderVersion, ProxyCard } from "../src/kit/proxy.js";

afterEach(cleanup);

const COMMAND = "curl -fsSL https://peershare.sandclaw.ai/proxy/peershare-proxy.sh | sh";
const SETTINGS = { url: "http://127.0.0.1:9090", key: "" };

describe("ProxyCard — the local proxy: status and settings", () => {
  it("not used yet: Set up shows the command, and saves the address and key", () => {
    const onSave = vi.fn();
    render(
      <ProxyCard
        status="unchecked"
        settings={SETTINGS}
        command={COMMAND}
        supported
        onSave={onSave}
      />,
    );
    expect(screen.queryByLabelText("Proxy address")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Set up/ }));
    expect(screen.getByText(COMMAND)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Proxy address"), {
      target: { value: "http://127.0.0.1:9091" },
    });
    fireEvent.change(screen.getByLabelText("Key"), { target: { value: "k" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith({ url: "http://127.0.0.1:9091", key: "k" });
  });

  it("connected: says so, with the address", () => {
    render(<ProxyCard status="ok" settings={SETTINGS} command={COMMAND} supported />);
    expect(screen.getByText("Proxy connected")).toBeTruthy();
    expect(screen.getByText(SETTINGS.url)).toBeTruthy();
  });

  it.each([
    ["bridge-not-running", /No proxy is running/],
    ["token-rejected", /refused the key/],
  ] as const)("%s: says why and opens the settings that fix it", (status, title) => {
    const onCheck = vi.fn();
    render(
      <ProxyCard
        status={status}
        settings={SETTINGS}
        command={COMMAND}
        supported
        onCheck={onCheck}
      />,
    );
    expect(screen.getByText(title)).toBeTruthy();
    expect(screen.getByLabelText("Proxy address")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Check again/ }));
    expect(onCheck).toHaveBeenCalled();
  });

  it("on a browser that cannot reach it, says which browsers can, and asks for nothing", () => {
    render(
      <ProxyCard status="unchecked" settings={SETTINGS} command={COMMAND} supported={false} />,
    );
    expect(screen.getByText(/needs Chrome or Firefox/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Set up/ })).toBeNull();
  });

  it("names the version the download gives, so people know when to update", () => {
    render(
      <ProxyCard
        status="unchecked"
        settings={SETTINGS}
        command={COMMAND}
        supported
        open
        extensionLatest="0.1.1"
      />,
    );
    const link = screen.getByRole("link", { name: "Download the extension 0.1.1" });
    expect(link.getAttribute("href")).toMatch(/peershare-proxy-extension\.zip$/);
    expect(screen.getAllByRole("link", { name: "what's new" })[0]?.getAttribute("href")).toMatch(
      /extension\/CHANGELOG\.txt$/,
    );
  });

  it("an installed extension older than the download says a newer one is available", () => {
    const { rerender } = render(
      <ProxyCard
        status="extension"
        settings={SETTINGS}
        command={COMMAND}
        supported
        extensionVersion="0.1.0"
        extensionLatest="0.1.1"
      />,
    );
    expect(screen.getByRole("link", { name: "0.1.1 is available" })).toBeTruthy();
    rerender(
      <ProxyCard
        status="extension"
        settings={SETTINGS}
        command={COMMAND}
        supported
        extensionVersion="0.1.1"
        extensionLatest="0.1.1"
      />,
    );
    expect(screen.queryByText(/is available/)).toBeNull();
  });

  it("compares versions by number", () => {
    expect(olderVersion("0.1.9", "0.1.10")).toBe(true);
    expect(olderVersion("0.2.0", "0.1.10")).toBe(false);
    expect(olderVersion("0.1.1", "0.1.1")).toBe(false);
    expect(olderVersion("dev", "0.1.1")).toBe(false);
  });
});
