#!/usr/bin/env node
/**
 * `node local/serve.mjs [--port 8080] [--open] [--demo] [--no-cookie-jars]` (or `bun local/serve.mjs …`)
 *
 * PeerShare on this machine, nothing deployed: a relay, the page, the session
 * shell and the Bridge, each on loopback. Run `local/build.mjs` first (or use
 * `local/peershare.sh`, which does both).
 *
 *   http://localhost:<port>               the page (Sharer and Guests)
 *   http://<name>.localhost:<port + 1>    Guests' isolated sessions
 *   ws://127.0.0.1:<port + 2>             the relay
 *   http://127.0.0.1:9090                 the Bridge (--bridge-port)
 *   http://127.0.0.1:3999                 a demo app to share (--demo)
 *
 * Everything is on loopback, so Sharer and Guests are browser profiles (or
 * browsers) on this machine. `*.localhost` session origins are secure contexts
 * in Chromium and Firefox, so ServiceWorkers run there over plain http.
 */

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { parseArgs } from "node:util";
import { noise } from "@chainsafe/libp2p-noise";
import { yamux } from "@chainsafe/libp2p-yamux";
import { circuitRelayServer } from "@libp2p/circuit-relay-v2";
import { generateKeyPair, privateKeyFromProtobuf, privateKeyToProtobuf } from "@libp2p/crypto/keys";
import { identify } from "@libp2p/identify";
import { webSockets } from "@libp2p/websockets";
import { createBridge, listenLoopback } from "@statewalker/httpeers-share/bridge";
import { createLibp2p } from "libp2p";
import { WebSocketServer } from "ws";

const { values } = parseArgs({
  options: {
    port: { type: "string", default: "8080" },
    "bridge-port": { type: "string", default: "9090" },
    "demo-port": { type: "string", default: "3999" },
    open: { type: "boolean", default: false },
    demo: { type: "boolean", default: false },
    "no-cookie-jars": { type: "boolean", default: false },
  },
});

const here = import.meta.dirname;
const built = join(here, "build");
if (!existsSync(join(built, "page/index.html"))) {
  console.error("No build found: run `node local/build.mjs` first (or `local/peershare.sh`).");
  process.exit(1);
}
const PAGE_PORT = Number(values.port);
const SESSION_PORT = PAGE_PORT + 1;
const RELAY_PORT = PAGE_PORT + 2;
const pageOrigin = `http://localhost:${PAGE_PORT}`;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

/** A file under `root`, or null; never a path outside it. */
async function fileIn(root, path) {
  const file = normalize(join(root, path));
  if (!file.startsWith(root)) return null;
  try {
    return { body: await readFile(file), type: TYPES[extname(file)] ?? "application/octet-stream" };
  } catch {
    return null;
  }
}

/** Listens on IPv4 and, where there is one, IPv6 loopback: browsers try `localhost` as either. */
async function listenLocal(handler, port) {
  const listen = (host) =>
    new Promise((resolve, reject) => {
      const server = createServer(handler);
      server.once("error", reject);
      server.listen(port, host, () => resolve(server));
    });
  const servers = [await listen("127.0.0.1")];
  await listen("::1").then(
    (s) => servers.push(s),
    () => {},
  );
  return servers;
}

// --- the relay, with a key kept across runs so its address stays the same
const state = join(here, "state");
mkdirSync(state, { recursive: true });
const keyFile = join(state, "relay.key");
const relayKey = existsSync(keyFile)
  ? privateKeyFromProtobuf(readFileSync(keyFile))
  : await generateKeyPair("Ed25519");
if (!existsSync(keyFile)) writeFileSync(keyFile, privateKeyToProtobuf(relayKey), { mode: 0o600 });

const relay = await createLibp2p({
  privateKey: relayKey,
  addresses: { listen: [`/ip4/127.0.0.1/tcp/${RELAY_PORT}/ws`] },
  transports: [webSockets()],
  connectionEncrypters: [noise()],
  streamMuxers: [yamux()],
  // One machine: every peer comes from the same host, so no per-host limits.
  connectionManager: { inboundConnectionThreshold: 1000, maxIncomingPendingConnections: 1000 },
  services: {
    identify: identify(),
    relay: circuitRelayServer({
      reservations: {
        applyDefaultLimit: true,
        defaultDataLimit: 1n << 30n,
        defaultDurationLimit: 6 * 3600_000,
      },
    }),
  },
});
const relayAddr = relay
  .getMultiaddrs()
  .map(String)
  .find((a) => a.includes("/ws/"));

const config = JSON.stringify({
  relayAddrs: [relayAddr],
  sessionOrigin: `http://{name}.localhost:${SESSION_PORT}`,
  // Lets the page dial a plain ws:// relay on loopback.
  dev: true,
});

// --- the page: every route is index.html, /peershare.json beside it
const pageRoot = join(built, "page");
const page = await listenLocal(async (req, res) => {
  const path = new URL(req.url ?? "/", "http://x").pathname;
  if (path === "/peershare.json") {
    res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    return void res.end(config);
  }
  const file =
    (path.startsWith("/assets/") ? await fileIn(pageRoot, path) : null) ??
    (await fileIn(pageRoot, "index.html"));
  if (file == null) return void res.writeHead(404).end();
  res.writeHead(200, { "content-type": file.type }).end(file.body);
}, PAGE_PORT);

// --- the session shell: every name serves the same files (the Caddyfile, locally)
const shellRoot = join(built, "shell");
const sessions = await listenLocal(async (req, res) => {
  const path = new URL(req.url ?? "/", "http://x").pathname;
  const shell = path === "/relay.html" || path === "/relay-sw.js" || path.startsWith("/_shell/");
  const file = await fileIn(shellRoot, shell ? path : "index.html");
  if (file == null) return void res.writeHead(404).end();
  res
    .writeHead(200, {
      "content-type": file.type,
      ...(path === "/relay-sw.js" ? { "cache-control": "no-store" } : {}),
    })
    .end(file.body);
}, SESSION_PORT);

// --- the Bridge: a new Pairing token on every launch, never stored
const token = randomBytes(32).toString("base64url");
const bridge = await listenLoopback(
  createBridge({ token, allowedOrigin: pageOrigin, cookieJars: !values["no-cookie-jars"] }),
  Number(values["bridge-port"]),
);

// --- a demo app to share, with a WebSocket (the tunnel) and a cookie (the jars)
let demo = null;
if (values.demo) demo = await startDemo(Number(values["demo-port"]));

const sharerUrl = `${pageOrigin}/peer-share#${new URLSearchParams({ localUrl: bridge.origin, t: token })}`;
console.log(`
PeerShare, running locally
  page      ${pageOrigin}
  sessions  http://<name>.localhost:${SESSION_PORT}
  relay     ${relayAddr}
  Bridge    ${bridge.origin}${demo ? `\n  demo app  ${demo.origin}  (add it as a Service)` : ""}

Open this to share (the link pairs the page with this Bridge; it changes on every start):
  ${sharerUrl}

Open Invites in another browser profile, or another browser, on this machine.
Ctrl+C stops everything.
`);
if (values.open) openInBrowser(sharerUrl);

let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  for (const s of [...page, ...sessions]) {
    s.closeAllConnections?.();
    s.close();
  }
  await Promise.allSettled([bridge.close(), relay.stop(), demo?.close()]);
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

function openInBrowser(url) {
  const [cmd, ...args] =
    process.platform === "darwin"
      ? ["open", url]
      : process.platform === "win32"
        ? ["cmd", "/c", "start", "", url]
        : ["xdg-open", url];
  spawn(cmd, args, { stdio: "ignore", detached: true })
    .on("error", () => console.log("(could not open a browser; open the link above)"))
    .unref();
}

async function startDemo(port) {
  const html = `<!doctype html><meta charset="utf-8"><title>Demo app</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:36rem;margin:3rem auto;padding:0 1rem}code{background:#f4f4f5;padding:0 .3em}</style>
<h1>A local app, shared</h1>
<p>Served from <code>127.0.0.1:${port}</code> on the Sharer's machine.</p>
<p>Visits from this browser: <b id="visits">…</b> <small>(a cookie)</small></p>
<p>Clock over a WebSocket: <b id="clock">connecting…</b></p>
<script>
fetch("/api/visit").then(r => r.json()).then(v => { visits.textContent = v.visits; });
const ws = new WebSocket(location.origin.replace(/^http/, "ws") + "/clock");
ws.onmessage = (e) => { clock.textContent = e.data; };
ws.onclose = () => { clock.textContent = "closed"; };
</script>`;
  const server = createServer((req, res) => {
    const path = new URL(req.url ?? "/", "http://x").pathname;
    if (path === "/api/visit") {
      const n = Number(/(?:^|;\s*)visits=(\d+)/.exec(req.headers.cookie ?? "")?.[1] ?? 0) + 1;
      res.writeHead(200, {
        "content-type": "application/json",
        "set-cookie": `visits=${n}; Path=/; HttpOnly; SameSite=Lax`,
      });
      return void res.end(JSON.stringify({ visits: n }));
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(html);
  });
  const wss = new WebSocketServer({ server, path: "/clock" });
  wss.on("connection", (ws) => {
    const tick = () => ws.send(new Date().toLocaleTimeString());
    tick();
    const timer = setInterval(tick, 1000);
    ws.on("close", () => clearInterval(timer));
  });
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  return {
    origin: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise((resolve) => {
        for (const c of wss.clients) c.terminate();
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
