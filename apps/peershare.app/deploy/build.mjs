#!/usr/bin/env node
/**
 * `node deploy/build.mjs` (in apps/peershare.app) — everything Caddy serves, into ./srv:
 *
 *   srv/page/    the PeerShare page (apps/peershare.app)
 *   srv/shell/   the session shell, built for this deployment's zones
 *   srv/config/  peershare.json
 *
 * Settings come from the environment (see .env.example).
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { buildShell } from "../scripts/build-shell.mjs";

const here = import.meta.dirname;
const page = resolve(here, "..");
// vite is the page's own dependency; resolve it from there.
const { build } = await import(createRequire(join(page, "package.json")).resolve("vite"));

const env = (name, fallback) => {
  const value = process.env[name] ?? fallback;
  if (value == null) throw new Error(`set ${name} (see apps/peershare.app/deploy/.env.example)`);
  return value;
};
const SESSION_ZONE = env("SESSION_ZONE"); // p.sandclaw.ai
const PARENT_ZONE = env("PARENT_ZONE"); // sandclaw.ai: the page lives here or one label under it
const HTTPS_PORT = env("HTTPS_PORT", "443");
const RELAY_ADDRS = env("RELAY_ADDRS").split(",").filter(Boolean);
const port = HTTPS_PORT === "443" ? "" : `:${HTTPS_PORT}`;

const srv = join(here, "srv");
rmSync(srv, { recursive: true, force: true });

// The page.
await build({
  root: page,
  logLevel: "warn",
  build: { outDir: join(srv, "page"), emptyOutDir: true },
});

// The shell, for this deployment's zones.
await buildShell(join(srv, "shell"), { sessionZone: SESSION_ZONE, parentZone: PARENT_ZONE });

// The deployment's facts, for the page.
mkdirSync(join(srv, "config"), { recursive: true });
writeFileSync(
  join(srv, "config/peershare.json"),
  `${JSON.stringify(
    {
      relayAddrs: RELAY_ADDRS,
      sessionOrigin: `https://{name}.${SESSION_ZONE}${port}`,
      ...(process.env.DEV === "true" ? { dev: true } : {}),
    },
    null,
    2,
  )}\n`,
);
console.log(`built ${srv}`);
