/**
 * The built extension (dist/) in a real Chromium: a page on 127.0.0.1 finds
 * it, and reaches a local Service through it. Run `pnpm build` first.
 */

import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { type BrowserContext, chromium } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const dist = join(import.meta.dirname, "../dist");
let context: BrowserContext;
let profile: string;
const servers: Server[] = [];

async function serve(handler: Parameters<typeof createServer>[1]): Promise<string> {
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const address = server.address();
  if (address == null || typeof address === "string") throw new Error("no address");
  return `http://127.0.0.1:${address.port}`;
}

let page: string;
let service: string;

beforeAll(async () => {
  if (!existsSync(join(dist, "manifest.json"))) throw new Error("Run `pnpm build` first.");
  page = await serve((_req, res) => {
    res.writeHead(200, { "content-type": "text/html" });
    res.end("<!doctype html><title>page</title>");
  });
  service = await serve((req, res) => {
    res.writeHead(200, { "content-type": "text/plain", "content-encoding": "gzip" });
    res.end(gzipSync(`service at ${req.url}`));
  });
  profile = mkdtempSync(join(tmpdir(), "peershare-extension-"));
  context = await chromium.launchPersistentContext(profile, {
    channel: "chromium",
    args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
  });
}, 60_000);

afterAll(async () => {
  await context?.close();
  for (const s of servers) s.close();
  if (profile) rmSync(profile, { recursive: true, force: true });
});

/** The page's side of the protocol, by hand (`findExtension` does the same). */
async function askThroughExtension(path: string, target: string | null) {
  const tab = await context.newPage();
  await tab.goto(page);
  return tab.evaluate(
    async ({ path, target }) => {
      const channel = "sandclaw-peershare-proxy";
      const port = await new Promise<{ port: MessagePort; version: string }>((resolve, reject) => {
        const id = crypto.randomUUID();
        const timer = setTimeout(() => reject(new Error("no extension")), 5000);
        const ask = () => window.postMessage({ channel, type: "connect", id }, location.origin);
        window.addEventListener("message", (e) => {
          if (e.source !== window || e.data?.channel !== channel) return;
          if (e.data.type === "ready") ask();
          const p = e.ports[0];
          if (e.data.type === "connected" && e.data.id === id && p != null) {
            clearTimeout(timer);
            resolve({ port: p, version: e.data.version });
          }
        });
        ask();
      });
      const headers: [string, string][] = target ? [["x-peershare-target", target]] : [];
      const answer = await new Promise<{
        response?: { status: number; headers: [string, string][]; body: ArrayBuffer };
        error?: string;
      }>((resolve) => {
        port.port.onmessage = (e) => resolve(e.data);
        port.port.postMessage({ id: 0, request: { method: "GET", path, headers } });
      });
      if (answer.response == null) return { error: answer.error, version: port.version };
      return {
        version: port.version,
        status: answer.response.status,
        headers: Object.fromEntries(answer.response.headers),
        text: new TextDecoder().decode(answer.response.body),
      };
    },
    { path, target },
  );
}

describe("the extension in Chromium", () => {
  it("is found by a local page, and says which version runs", async () => {
    const answer = await askThroughExtension("/", null);
    expect(answer.version).toBe("0.1.0");
    expect(JSON.parse(answer.text ?? "")).toMatchObject({ bridge: "peershare", via: "extension" });
  });

  it("relays to a local Service across origins, decoded", async () => {
    const answer = await askThroughExtension("/hello?x=1", service);
    expect(answer).toMatchObject({ status: 200, text: "service at /hello?x=1" });
    expect(answer.headers?.["x-peershare-bridge"]).toBe("relayed");
    expect(answer.headers?.["content-encoding"]).toBeUndefined();
  });

  it("refuses a public target", async () => {
    const answer = await askThroughExtension("/", "https://example.com");
    expect(answer.status).toBe(403);
  });
});
