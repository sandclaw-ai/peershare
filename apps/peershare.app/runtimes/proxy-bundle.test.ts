/**
 * The built proxy under each runtime the launcher may pick: it prints its URL
 * and relays HTTP and a WebSocket. `pnpm test:runtimes` (node, bun and deno
 * must be installed).
 */

import { type ChildProcess, spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WebSocket, WebSocketServer } from "ws";
import { buildProxy } from "../scripts/build-proxy.mjs";

const out = mkdtempSync(join(tmpdir(), "peershare-proxy-"));
const bundle = join(out, "peershare-proxy.mjs");
const HUB = "https://peershare.httpeers.net";
const RUNTIMES: Record<string, string[]> = {
  node: ["node", bundle],
  bun: ["bun", bundle],
  deno: ["deno", "run", "--allow-net", "--allow-env", "--allow-read", "--allow-sys", bundle],
};
let app: { origin: string; close(): Promise<void> };

beforeAll(async () => {
  await buildProxy(out, "peershare.httpeers.net");
  const server = createServer((req, res) => res.end(`echo ${req.url}`));
  const wss = new WebSocketServer({ server });
  wss.on("connection", (s) => s.on("message", (d) => s.send(`echo ${d}`)));
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const address = server.address();
  if (address == null || typeof address === "string") throw new Error("no address");
  app = {
    origin: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise((r) => {
        for (const c of wss.clients) c.terminate();
        server.close(() => r());
      }),
  };
}, 300_000);
afterAll(() => app?.close());

describe.each(Object.keys(RUNTIMES))("the proxy bundle under %s", (runtime) => {
  let child: ChildProcess;
  let origin: string;
  beforeAll(async () => {
    const [cmd, ...args] = RUNTIMES[runtime] ?? [];
    child = spawn(cmd as string, [...args, "--port", "0"], {
      stdio: ["ignore", "pipe", "inherit"],
    });
    origin = await new Promise((resolve, reject) => {
      child.stdout?.on("data", (d) => {
        const m = String(d).match(/http:\/\/127\.0\.0\.1:\d+/);
        if (m) resolve(m[0]);
      });
      child.on("exit", (code) => reject(new Error(`${runtime} exited ${code}`)));
    });
  });
  afterAll(() => {
    child?.kill();
  });

  it("relays HTTP for the hub", async () => {
    const res = await fetch(`${origin}/x`, {
      headers: { origin: HUB, "x-peershare-target": app.origin },
    });
    expect(await res.text()).toBe("echo /x");
  });

  it("relays a WebSocket both ways", async () => {
    const url = `${origin.replace("http:", "ws:")}/.peershare/socket?${new URLSearchParams({ target: `${app.origin}/live` })}`;
    const reply = await new Promise<string>((resolve, reject) => {
      const ws = new WebSocket(url, ["peershare."], { origin: HUB });
      ws.on("open", () => ws.send("ping"));
      ws.on("message", (d) => {
        resolve(String(d));
        ws.close();
      });
      ws.on("error", reject);
    });
    expect(reply).toBe("echo ping");
  }, 10_000);
});
