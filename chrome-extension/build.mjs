#!/usr/bin/env node
/**
 * `node build.mjs [--zip]` — the extension, ready to load unpacked, into ./dist:
 *
 *   manifest.json   with the version from package.json
 *   background.js   the background worker (an ES module)
 *   content.js      the content script (one classic script: content scripts cannot be modules)
 *   popup.js        the toolbar popup's script, next to public/'s popup.html, css and icons
 *
 * `--zip` also writes ./peershare-proxy-extension-<version>.zip (Chrome Web Store, downloads).
 *
 * Imported, `buildExtension(outDir)` and `zipFolder(dir, file)` do the same; the PeerShare
 * site publishes the zip under /extension/ (apps/peershare.app/scripts/build-site.mjs).
 */
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { crc32, deflateRawSync } from "node:zlib";
import { build } from "vite";
import { buildInfo } from "../build-info.mjs";

const root = import.meta.dirname;

/** The extension's version: package.json's. */
export const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;

/** The extension's changelog, published next to its download. */
export const changelog = join(root, "CHANGELOG.txt");

export async function buildExtension(out = join(root, "dist")) {
  rmSync(out, { recursive: true, force: true });
  const { commit } = buildInfo();
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
      publicDir: i === 0 ? join(root, "public") : false,
      resolve: { conditions: ["source", "browser", "import", "module", "default"] },
      define: { __PEERSHARE_EXTENSION_COMMIT__: JSON.stringify(commit) },
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
  return out;
}

/**
 * Every file under `dir`, as a zip with its files at the top (where Chrome's
 * "Load unpacked" and the Web Store expect manifest.json). Node's own zlib:
 * no `zip` command needed, so it builds in a slim container too.
 */
export function zipFolder(dir, file) {
  const files = listFiles(dir).sort();
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const path of files) {
    const name = Buffer.from(relative(dir, path).split("\\").join("/"));
    const data = readFileSync(path);
    const packed = deflateRawSync(data);
    const crc = crc32(data);
    // A fixed time (1980-01-01): the same files give the same zip.
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(0, 10); // time
    local.writeUInt16LE(0x21, 12); // date
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, packed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += local.length + name.length + packed.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, Buffer.concat([...locals, directory, end]));
  return file;
}

function listFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });
}

if (process.argv[1] === import.meta.filename) {
  const out = await buildExtension();
  console.log(`PeerShare Proxy extension ${version} → ${out}`);
  if (process.argv.includes("--zip")) {
    const zip = zipFolder(out, join(root, `peershare-proxy-extension-${version}.zip`));
    console.log(`zipped → ${zip}`);
  }
}
