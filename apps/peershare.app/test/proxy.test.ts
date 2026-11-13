/** The downloadable proxy: today's Bridge, behind a command line. */

import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { gzipSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  DEFAULT_ORIGINS,
  PROXY_COMMIT,
  PROXY_VERSION,
  parseProxyArgs,
  startProxy,
} from "../proxy/proxy.ts";

const TARGET = "x-peershare-target";
const TOKEN = "x-peershare-bridge-token";
let app: { origin: string; close(): Promise<void> };

beforeAll(async () => {
  const server = createServer((req, res) => res.end(`echo ${req.url}`));
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const address = server.address();
  if (address == null || typeof address === "string") throw new Error("no address");
  app = {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((r) => server.close(() => r())),
  };
});
afterAll(() => app?.close());

describe("PROXY_VERSION", () => {
  it("is the newest release in CHANGELOG.txt", () => {
    const changelog = readFileSync(resolve(import.meta.dirname, "../proxy/CHANGELOG.txt"), "utf8");
    expect(changelog.match(/^(\d+\.\d+\.\d+) — /m)?.[1]).toBe(PROXY_VERSION);
  });
});

describe("parseProxyArgs", () => {
  it("defaults to port 9090, no key, the hub and local pages", () => {
    expect(parseProxyArgs([])).toEqual({
      port: 9090,
      key: "",
      origins: DEFAULT_ORIGINS,
      cookieJars: true,
    });
    expect(DEFAULT_ORIGINS).toEqual([
      "https://peershare.sandclaw.ai",
      "http://localhost:*",
      "http://127.0.0.1:*",
    ]);
  });

  it("replaces the origins with repeated or comma-separated --origin", () => {
    expect(parseProxyArgs(["--origin", "*"]).origins).toEqual(["*"]);
    expect(
      parseProxyArgs(["--origin", "https://a.example,https://b.example", "--origin", "http://c:*"])
        .origins,
    ).toEqual(["https://a.example", "https://b.example", "http://c:*"]);
    expect(parseProxyArgs(["--port", "0", "--key", "k", "--no-cookie-jars"])).toMatchObject({
      port: 0,
      key: "k",
      cookieJars: false,
    });
  });
});

describe("startProxy", () => {
  it("says which proxy it is on every answer, readable by the page", async () => {
    const proxy = await startProxy({ ...parseProxyArgs([]), port: 0 });
    try {
      const res = await fetch(`${proxy.origin}/`, { headers: { origin: "http://localhost:8080" } });
      expect(res.headers.get("x-peershare-proxy")).toBe(`${PROXY_VERSION} (${PROXY_COMMIT})`);
      expect(res.headers.get("access-control-expose-headers")).toContain("x-peershare-proxy");
    } finally {
      await proxy.close();
    }
  });

  it("relays a gzip-compressing Service with a body the browser can read", async () => {
    const page = "<!doctype html><p>compressed</p>";
    const gz = createServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/html", "content-encoding": "gzip" });
      res.end(gzipSync(page));
    });
    await new Promise<void>((r) => gz.listen(0, "127.0.0.1", r));
    const address = gz.address();
    if (address == null || typeof address === "string") throw new Error("no address");
    const proxy = await startProxy({ ...parseProxyArgs([]), port: 0 });
    try {
      const res = await fetch(`${proxy.origin}/`, {
        headers: {
          origin: "http://localhost:8080",
          [TARGET]: `http://127.0.0.1:${address.port}`,
          "accept-encoding": "gzip",
        },
      });
      expect(res.headers.get("content-encoding")).toBeNull();
      // Before the fix: "gzip" on a decoded body, and this read throws.
      expect(await res.text()).toBe(page);
    } finally {
      await proxy.close();
      await new Promise((r) => gz.close(r));
    }
  });

  it("relays for a local page with the defaults, and refuses another website", async () => {
    const proxy = await startProxy({ ...parseProxyArgs([]), port: 0 });
    try {
      expect(proxy.origin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
      const ok = await fetch(`${proxy.origin}/x`, {
        headers: { origin: "http://localhost:8080", [TARGET]: app.origin },
      });
      expect(ok.status).toBe(200);
      expect(await ok.text()).toBe("echo /x");
      const evil = await fetch(`${proxy.origin}/x`, {
        headers: { origin: "https://evil.example", [TARGET]: app.origin },
      });
      expect(evil.status).toBe(403);
    } finally {
      await proxy.close();
    }
  });

  it("requires the key when one is set, and links the hub to itself", async () => {
    const proxy = await startProxy({ ...parseProxyArgs([]), port: 0, key: "k" });
    try {
      const none = await fetch(`${proxy.origin}/x`, {
        headers: { origin: "http://localhost:8080", [TARGET]: app.origin },
      });
      expect(none.status).toBe(401);
      const keyed = await fetch(`${proxy.origin}/x`, {
        headers: { origin: "http://localhost:8080", [TARGET]: app.origin, [TOKEN]: "k" },
      });
      expect(keyed.status).toBe(200);
      expect(proxy.hubLink).toBe(
        `https://peershare.sandclaw.ai/#${new URLSearchParams({ localUrl: proxy.origin, t: "k" })}`,
      );
    } finally {
      await proxy.close();
    }
  });
});

describe("the command", () => {
  it("warns that --origin '*' lets every website use the proxy", async () => {
    const run = promisify(execFile)(
      "node",
      [resolve(import.meta.dirname, "../proxy/main.ts"), "--port", "0", "--origin", "*"],
      { timeout: 3_000, killSignal: "SIGINT" },
    );
    const { stdout, stderr } = await run.catch((e: { stdout: string; stderr: string }) => e);
    expect(stdout).toMatch(/http:\/\/127\.0\.0\.1:\d+/);
    expect(stderr).toContain("every website");
  });
});
