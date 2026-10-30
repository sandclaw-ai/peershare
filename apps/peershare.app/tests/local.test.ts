/**
 * The local run (`local/`): the same scenario as e2e.test.ts, against
 * `local/serve.mjs` started as a separate process, the way `local/peershare.sh`
 * starts it. `PEERSHARE_RUNTIME=bun` runs the server under Bun.
 */

import { type ChildProcess, execFile, spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { type Browser, chromium } from "playwright";
import { afterAll, beforeAll, describe, it } from "vitest";
import { dirkSharesClaudiaViews, startDirksApp } from "./scenario.js";

const local = resolve(dirname(fileURLToPath(import.meta.url)), "../local");
const runtime = process.env.PEERSHARE_RUNTIME ?? "node";
const PORT = 18080;

let server: ChildProcess;
let sharerUrl: URL;
let app: Awaited<ReturnType<typeof startDirksApp>>;
let browser: Browser;

beforeAll(async () => {
  await promisify(execFile)("node", [resolve(local, "build.mjs")]);
  app = await startDirksApp();
  server = spawn(
    runtime,
    [resolve(local, "serve.mjs"), "--port", `${PORT}`, "--bridge-port", "0"],
    {
      stdio: ["ignore", "pipe", "inherit"],
    },
  );
  sharerUrl = await new Promise<URL>((ok, fail) => {
    let out = "";
    server.stdout?.on("data", (chunk) => {
      out += chunk;
      const link = /http:\/\/localhost:\d+\/peer-share#\S+/.exec(out)?.[0];
      if (link != null) ok(new URL(link));
    });
    server.on("exit", (code) => fail(new Error(`serve.mjs exited with ${code}:\n${out}`)));
  });
  browser = await chromium.launch();
}, 120_000);
afterAll(async () => {
  await browser?.close();
  server?.kill("SIGINT");
  await app?.close();
});

describe("PeerShare, run locally", () => {
  it("Dirk exposes his local app and invites Claudia; she sees it in her own isolated origin", async () => {
    const pairing = new URLSearchParams(sharerUrl.hash.slice(1));
    await dirkSharesClaudiaViews({
      browser,
      pageOrigin: sharerUrl.origin,
      bridge: { origin: pairing.get("localUrl") ?? "", token: pairing.get("t") ?? "" },
      appOrigin: app.origin,
      sessionUrl: new RegExp(`^http://[a-z0-9]+\\.localhost:${PORT + 1}/`),
    });
  });
});
