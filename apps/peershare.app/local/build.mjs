#!/usr/bin/env node
/**
 * `node local/build.mjs` (in apps/peershare.app) — what `serve.mjs` serves, into ./build:
 *
 *   build/page/    the PeerShare page
 *   build/shell/   the session shell
 *
 * The shell is built with its default zones: on a `*.localhost` session origin it
 * accepts any local parent page (policy.ts, `isLocalHost`), which is all a local
 * run needs.
 */
import { cpSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

const here = import.meta.dirname;
const page = resolve(here, "..");
// vite is the page's own dependency; resolve it from there.
const { build } = await import(createRequire(join(page, "package.json")).resolve("vite"));

const out = join(here, "build");
rmSync(out, { recursive: true, force: true });

await build({
  root: page,
  logLevel: "warn",
  build: { outDir: join(out, "page"), emptyOutDir: true },
});

const vendor = join(page, "src/vendor/session-shell");
for (const [entry, file] of [
  ["sw.ts", "relay-sw.js"],
  ["relay.ts", "_shell/relay.js"],
  ["../../ws-shim.ts", "_shell/ws-shim.js"],
]) {
  await build({
    root: vendor,
    logLevel: "warn",
    configFile: false,
    build: {
      outDir: join(out, "shell", file.includes("/") ? file.split("/")[0] : ""),
      emptyOutDir: false,
      minify: true,
      lib: {
        entry: join(vendor, entry),
        formats: ["iife"],
        name: "Shell",
        fileName: () => file.split("/").pop(),
      },
    },
  });
}
writeFileSync(
  join(out, "shell/relay.html"),
  '<!doctype html><meta charset="utf-8"><title>session relay</title><script src="/_shell/relay.js"></script>\n',
);
cpSync(join(vendor, "index.html"), join(out, "shell/index.html"));
console.log(`built ${out}`);
