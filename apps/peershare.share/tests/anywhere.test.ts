/** "Any URL, through the browser extension": the Sharer's opt-in, and the extension's. */

import { describe, expect, it } from "vitest";
import { AddService, GetSharer, ProbeService } from "../src/public/commands.js";
import type { ExtensionRelay } from "../src/public/extension.js";
import { sharerMountSlot } from "../src/public/extension-points.js";
import { ANYWHERE } from "../src/public/feature.js";
import { withPeerShare } from "./harness.js";

/** The extension, as the page sees it: "Allow any website" on or off in its popup. */
function extension(anyWebsite: boolean, seen: string[] = []): ExtensionRelay {
  return {
    version: "9.9.9",
    async fetch(request) {
      seen.push(`${request.headers.get("x-peershare-target")}${new URL(request.url).pathname}`);
      return anyWebsite
        ? new Response("<p>public</p>", {
            headers: { "content-type": "text/html", "x-peershare-bridge": "relayed" },
          })
        : new Response(null, {
            status: 403,
            headers: { "x-peershare-bridge": "target-forbidden" },
          });
    },
  };
}

const setUp = async (relay: ExtensionRelay | undefined, target = "https://example.com") => {
  const peer = withPeerShare({ extension: () => relay });
  const added = await peer.call(AddService, { name: "site", kind: ANYWHERE, target });
  let mount: ((r: Request) => Promise<Response>) | undefined;
  peer.rt.slots.observe(sharerMountSlot, (v) => {
    mount = v[0];
  })();
  const guestGets = (path: string) =>
    (mount as (r: Request) => Promise<Response>)(new Request(`http://sharer/s/site${path}`));
  const service = async () => {
    await peer.call(ProbeService, { id: "site" });
    return (await peer.call(GetSharer, undefined)).services[0];
  };
  return { ...peer, added, guestGets, service };
};

describe("a Service of kind anywhere", () => {
  it.each(["https://example.com", "http://8.8.8.8/x", "http://localhost:3000"])(
    "takes any http(s) address: %s",
    async (target) => {
      const { added } = await setUp(extension(true), target);
      expect(added).toMatchObject({ ok: true });
    },
  );

  it("refuses what is not http(s)", async () => {
    const { added } = await setUp(extension(true), "ftp://example.com");
    expect(added).toMatchObject({ ok: false });
  });

  it("reaches Guests through the extension once it allows any website", async () => {
    const seen: string[] = [];
    const { guestGets, service } = await setUp(extension(true, seen));
    expect(await service()).toMatchObject({ health: "ok" });
    const res = await guestGets("/about");
    expect(await res.text()).toBe("<p>public</p>");
    expect(seen.at(-1)).toBe("https://example.com/about");
  });

  it('is down, and says why, while the extension\'s "Allow any website" is off', async () => {
    const { service } = await setUp(extension(false));
    expect(await service()).toMatchObject({ health: "down", cause: "extension-refused" });
  });

  it("is down without the extension", async () => {
    const { service } = await setUp(undefined);
    expect(await service()).toMatchObject({ health: "down", cause: "bridge-down" });
  });
});
