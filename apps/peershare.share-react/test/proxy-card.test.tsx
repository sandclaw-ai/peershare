import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProxyCard } from "../src/kit/proxy.js";

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
});
