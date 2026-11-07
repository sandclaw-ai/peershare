import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProxySettings } from "../src/views/proxy-settings.js";

afterEach(cleanup);

const COMMAND = "curl -fsSL https://peershare.httpeers.net/proxy/peershare-proxy.sh | sh";

describe("Proxy settings — where the page finds the local proxy", () => {
  it("shows the command that starts the proxy, and saves the address and key", () => {
    const onSave = vi.fn();
    render(
      <ProxySettings
        value={{ url: "http://127.0.0.1:9090", key: "" }}
        command={COMMAND}
        supported
        onSave={onSave}
      />,
    );
    expect(screen.getByText(COMMAND)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Proxy address"), {
      target: { value: "http://127.0.0.1:9091" },
    });
    fireEvent.change(screen.getByLabelText("Key"), { target: { value: "k" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith({ url: "http://127.0.0.1:9091", key: "k" });
  });

  it("on a browser that cannot reach it, says which browsers can, and asks for nothing", () => {
    render(
      <ProxySettings
        value={{ url: "http://127.0.0.1:9090", key: "" }}
        command={COMMAND}
        supported={false}
        onSave={() => {}}
      />,
    );
    expect(screen.getByText(/needs Chrome or Firefox/)).toBeTruthy();
    expect(screen.queryByLabelText("Proxy address")).toBeNull();
  });
});
