#!/usr/bin/env node
/**
 * `node scripts/build-shell.mjs <outDir>` — the session shell, built for one deployment's zones:
 *
 *   <outDir>/index.html          the empty-session page (every unknown path)
 *   <outDir>/relay.html          the page a parent frames to connect
 *   <outDir>/relay-sw.js         the worker (at the root: a worker's scope cannot exceed its dir)
 *   <outDir>/_shell/relay.js, ws-shim.js
 *
 * SESSION_ZONE (e.g. s.sandclaw.ai) and PARENT_ZONE (e.g. sandclaw.ai: the page lives there or
 * one label under it) come from the environment when run as a script. Used by deploy/build.mjs
 * and the Docker image.
 */
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const page = resolve(import.meta.dirname, "..");

export async function buildShell(outDir, { sessionZone, parentZone }) {
  // vite is the page's own dependency; resolve it from there.
  const { build } = await import(createRequire(join(page, "package.json")).resolve("vite"));
  const vendor = join(page, "src/vendor/session-shell");
  const define = {
    __PEERSHARE_SESSION_ZONE__: JSON.stringify(sessionZone),
    __PEERSHARE_PARENT_ZONE__: JSON.stringify(parentZone),
  };
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  for (const [entry, out] of [
    ["sw.ts", "relay-sw.js"],
    ["relay.ts", "_shell/relay.js"],
    // The WebSocket shim (M9): served beside the relay, outside the worker's reach.
    ["../../ws-shim.ts", "_shell/ws-shim.js"],
  ]) {
    await build({
      root: vendor,
      logLevel: "warn",
      configFile: false,
      define,
      build: {
        outDir: join(outDir, out.includes("/") ? out.split("/")[0] : ""),
        emptyOutDir: false,
        minify: true,
        lib: {
          entry: join(vendor, entry),
          formats: ["iife"],
          name: "Shell",
          fileName: () => out.split("/").pop(),
        },
      },
    });
  }
  writeFileSync(
    join(outDir, "relay.html"),
    '<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><title>session relay</title><script src="/_shell/relay.js"></script>\n',
  );
  cpSync(join(vendor, "index.html"), join(outDir, "index.html"));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const env = (name) => {
    const value = process.env[name];
    if (!value) throw new Error(`set ${name}`);
    return value;
  };
  const out = resolve(process.argv[2] ?? "shell");
  await buildShell(out, { sessionZone: env("SESSION_ZONE"), parentZone: env("PARENT_ZONE") });
  console.log(`shell ready: ${out}`);
}
