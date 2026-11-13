/** Which Local Network Access permission guards an address, and how its names combine. */

import { afterEach, describe, expect, it, vi } from "vitest";
import { addressSpaceOf, localNetworkPermission } from "../src/public/index.js";

describe("addressSpaceOf", () => {
  it.each([
    ["http://localhost:9090", "loopback"],
    ["http://127.0.0.1:9090", "loopback"],
    ["http://[::1]:8080", "loopback"],
    ["http://app.localhost:5173", "loopback"],
    ["http://192.168.1.20:3000", "local"],
    ["http://10.0.0.5", "local"],
    ["http://172.20.1.1", "local"],
    ["http://nas.local", "local"],
    ["http://nas:5000", "local"],
    ["https://wiki.acme.dev", "public"],
    ["http://172.32.0.1", "public"],
    ["not a url", "public"],
  ])("%s is %s", (url, space) => {
    expect(addressSpaceOf(url)).toBe(space);
  });
});

describe("localNetworkPermission", () => {
  afterEach(() => vi.unstubAllGlobals());

  /** A browser that knows `states`' names; any other name throws, as Chromium does. */
  function browser(states: Record<string, PermissionState>) {
    vi.stubGlobal("navigator", {
      permissions: {
        query: async ({ name }: { name: string }) => {
          const state = states[name];
          if (state == null) throw new TypeError(`unknown permission ${name}`);
          return { state };
        },
      },
    });
  }

  it("is denied when the space's own name is, though the old name says granted (Chrome 157)", async () => {
    browser({
      "local-network-access": "granted",
      "loopback-network": "denied",
      "local-network": "prompt",
    });
    expect(await localNetworkPermission("loopback")).toBe("denied");
  });

  it("reads only the names for the space asked about", async () => {
    browser({
      "local-network-access": "granted",
      "loopback-network": "granted",
      "local-network": "prompt",
    });
    expect(await localNetworkPermission("loopback")).toBe("granted");
    expect(await localNetworkPermission("local")).toBe("prompt");
  });

  it("uses the one old name on older builds", async () => {
    browser({ "local-network-access": "denied" });
    expect(await localNetworkPermission("local")).toBe("denied");
  });

  it("is unsupported without the check, or for public addresses", async () => {
    browser({});
    expect(await localNetworkPermission("loopback")).toBe("unsupported");
    browser({ "local-network-access": "denied" });
    expect(await localNetworkPermission("public")).toBe("unsupported");
  });
});
