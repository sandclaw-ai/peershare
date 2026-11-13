#!/usr/bin/env node
/**
 * `node build.mjs [--zip]` — the extension, ready to load unpacked, into ./dist:
 *
 *   manifest.json   with the version from package.json
 *   background.js   the background worker (an ES module)
 *   content.js      the content script (one classic script: content scripts cannot be modules)
 *   popup.js        the toolbar popup's script, next to public/'s popup.html, css and icons
 *
 * `--zip` also writes dist/../peershare-proxy-extension-<version>.zip, for the Chrome Web Store.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { build } from "vite";

const root = import.meta.dirname;
const out = join(root, "dist");
const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

rmSync(out, { recursive: true, force: true });
const entries = [
  ["src/background.ts", "background.js", "es"],
  ["src/content.ts", "content.js", "iife"],
  ["src/popup.ts", "popup.js", "es"],
];
for (const [i, [entry, file, format]] of entries.entries()) {
  await build({
    root,
    configFile: false,
    logLevel: "warn",
    // public/ (popup page, icons) once.
    publicDir: i === 0 ? "public" : false,
    resolve: { conditions: ["source", "browser", "import", "module", "default"] },
    build: {
      outDir: out,
      emptyOutDir: false,
      minify: false,
      target: "chrome120",
      lib: {
        entry: join(root, entry),
        formats: [format],
        name: "PeerShareProxy",
        fileName: () => file,
      },
    },
  });
}
writeFileSync(
  join(out, "manifest.json"),
  readFileSync(join(root, "manifest.json"), "utf8").replace("@VERSION@", version),
);
console.log(`PeerShare Proxy extension ${version} → ${out}`);

if (process.argv.includes("--zip")) {
  const zip = join(root, `peershare-proxy-extension-${version}.zip`);
  rmSync(zip, { force: true });
  execFileSync("zip", ["-qr", zip, "."], { cwd: out });
  console.log(`zipped → ${zip}`);
}
