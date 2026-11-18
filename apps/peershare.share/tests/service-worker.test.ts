/** A Service whose page registers a ServiceWorker of its own: flagged by the Probe. */

import { describe, expect, it } from "vitest";
import { registersServiceWorker, scriptPaths } from "../src/internal/service-worker.js";
import { AddService, GetSharer, ProbeService } from "../src/public/commands.js";
import type { ExtensionRelay } from "../src/public/extension.js";
import { ANYWHERE } from "../src/public/feature.js";
import { withPeerShare } from "./harness.js";

const REGISTERS = "if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');";

describe("scriptPaths", () => {
  it("takes the page's own scripts and module preloads, not other sites'", () => {
    const html = `
      <script type="module" src="/_astro/app.js"></script>
      <script src="./rel.js?v=2"></script>
      <script src="https://cdn.example.com/lib.js"></script>
      <script src="//cdn.example.com/other.js"></script>
      <link rel="modulepreload" href="/_astro/chunk.js">
      <script src="/_astro/app.js"></script>`;
    expect(scriptPaths(html)).toEqual(["/_astro/app.js", "/rel.js?v=2", "/_astro/chunk.js"]);
  });
});

describe("registersServiceWorker", () => {
  const none = async () => undefined;

  it("finds it in an inline script", async () => {
    expect(await registersServiceWorker(`<script>${REGISTERS}</script>`, none)).toBe(true);
  });

  it("finds it in a script the page loads", async () => {
    const read = async (path: string) => (path === "/app.js" ? REGISTERS : "");
    expect(await registersServiceWorker('<script src="/app.js"></script>', read)).toBe(true);
  });

  it("finds the optional-chained form", async () => {
    const code = "navigator.serviceWorker?.register(url)";
    expect(await registersServiceWorker(`<script>${code}</script>`, none)).toBe(true);
  });

  it("ignores a page that only talks about it", async () => {
    const html = "<p>Call navigator.serviceWorker.register() to install one.</p>";
    expect(await registersServiceWorker(html, none)).toBe(false);
  });

  it("reads at most MAX scripts", async () => {
    const read: string[] = [];
    const html = Array.from({ length: 12 }, (_, i) => `<script src="/s${i}.js"></script>`).join("");
    await registersServiceWorker(
      html,
      async (p) => {
        read.push(p);
        return "";
      },
      3,
    );
    expect(read).toEqual(["/s0.js", "/s1.js", "/s2.js"]);
  });
});

/** A site served through the extension: its page, and its script. */
function site(script: string): ExtensionRelay {
  return {
    version: "9.9.9",
    async fetch(request) {
      const path = new URL(request.url).pathname;
      if (path === "/")
        return new Response('<!doctype html><script type="module" src="/app.js"></script>', {
          headers: { "content-type": "text/html", "x-peershare-bridge": "relayed" },
        });
      if (path === "/app.js")
        return new Response(script, {
          headers: { "content-type": "text/javascript", "x-peershare-bridge": "relayed" },
        });
      return new Response("not found", {
        status: 404,
        headers: { "x-peershare-bridge": "relayed" },
      });
    },
  };
}

const probed = async (relay: ExtensionRelay) => {
  const { call } = withPeerShare({ extension: () => relay });
  await call(AddService, { name: "app", kind: ANYWHERE, target: "https://app.example" });
  await call(ProbeService, { id: "app" });
  return (await call(GetSharer, undefined)).services[0];
};

describe("the Probe", () => {
  it("warns about a page that registers its own service worker", async () => {
    const service = await probed(site(REGISTERS));
    expect(service).toMatchObject({ health: "ok" });
    expect(service?.warnings).toContain("service-worker");
  });

  it("does not warn about a page that doesn't", async () => {
    const service = await probed(site("console.log('hi')"));
    expect(service?.warnings).not.toContain("service-worker");
  });
});
