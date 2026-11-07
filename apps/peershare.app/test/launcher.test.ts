/**
 * `proxy/peershare-proxy.sh`, run as a real `sh` with a `PATH` of stubs: which
 * runtime it picks, and where it puts what it downloads.
 */

import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SCRIPT = readFileSync(
  resolve(import.meta.dirname, "../proxy/peershare-proxy.sh"),
  "utf8",
).replaceAll("@SITE@", "peershare.httpeers.net");
const UTILS = ["sh", "mkdir", "uname", "chmod", "rm", "cat", "mv"];
const which = (name: string) =>
  execFileSync("sh", ["-c", `command -v ${name}`])
    .toString()
    .trim();

/** A home, and a `bin` holding only the given stubs and basic utilities; each stub logs its arguments. */
function machine(runtimes: string[], { curlFails = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), "peershare-launcher-"));
  const bin = join(root, "bin");
  const home = join(root, "home");
  const log = join(root, "log");
  mkdirSync(bin);
  mkdirSync(home);
  for (const u of UTILS) symlinkSync(which(u), join(bin, u));
  const stub = (name: string, body = "") => {
    writeFileSync(join(bin, name), `#!/bin/sh\necho "${name} $*" >> "${log}"\n${body}`);
    chmodSync(join(bin, name), 0o755);
  };
  // curl -fsSL <url> -o <file>
  stub("curl", curlFails ? 'echo "partial" > "$4"; exit 22\n' : 'echo "fetched $2" > "$4"\n');
  // unzip -q -o <zip> -d <dir>: leaves a stub deno
  stub("unzip", `printf '#!/bin/sh\\necho "cached-deno $*" >> "${log}"\\n' > "$5/deno"\n`);
  for (const r of runtimes) stub(r);
  const run = (...args: string[]) => {
    execFileSync("sh", ["-c", SCRIPT, "peershare-proxy.sh", ...args], {
      env: { PATH: bin, HOME: home },
    });
    return readFileSync(log, "utf8").trim().split("\n");
  };
  return { run, home, cache: join(home, ".cache/peershare") };
}

const BUNDLE_URL = "https://peershare.httpeers.net/proxy/peershare-proxy.mjs";

describe("peershare-proxy.sh", () => {
  it("fetches the proxy into ~/.cache/peershare and prefers Deno, then Bun, then Node", () => {
    const all = machine(["deno", "bun", "node"]);
    const bundle = join(all.cache, "peershare-proxy.mjs");
    expect(all.run("--port", "1234")).toEqual([
      `curl -fsSL ${BUNDLE_URL} -o ${bundle}.tmp`,
      `deno run --allow-net --allow-env --allow-read --allow-sys ${bundle} --port 1234`,
    ]);
    expect(readFileSync(bundle, "utf8")).toBe(`fetched ${BUNDLE_URL}\n`);

    expect(machine(["bun", "node"]).run().at(-1)).toMatch(/^bun .*\/peershare-proxy\.mjs$/);
    expect(machine(["node"]).run("--key", "k").at(-1)).toMatch(
      /^node .*\/peershare-proxy\.mjs --key k$/,
    );
  });

  it("keeps the cached proxy when the download fails, and has none to run without it", () => {
    const offline = machine(["node"], { curlFails: true });
    expect(() => offline.run()).toThrow();
    writeFileSync(join(offline.cache, "peershare-proxy.mjs"), "cached\n");
    expect(offline.run("--port", "3").at(-1)).toMatch(/^node .*\/peershare-proxy\.mjs --port 3$/);
    expect(readFileSync(join(offline.cache, "peershare-proxy.mjs"), "utf8")).toBe("cached\n");
  });

  it("downloads Deno into the cache once when no runtime is installed", () => {
    const bare = machine([]);
    const first = bare.run("--port", "1");
    const arch = process.arch === "arm64" ? "aarch64" : "x86_64";
    const os = process.platform === "darwin" ? "apple-darwin" : "unknown-linux-gnu";
    const dir = join(bare.cache, "deno-2.9.8");
    expect(first).toContain(
      `curl -fsSL https://dl.deno.land/release/v2.9.8/deno-${arch}-${os}.zip -o ${dir}/deno.zip`,
    );
    expect(first.at(-1)).toMatch(
      /^cached-deno run --allow-net --allow-env --allow-read --allow-sys .*\.mjs --port 1$/,
    );
    expect(existsSync(join(dir, "deno"))).toBe(true);

    const second = bare.run("--port", "2").slice(first.length);
    expect(second.filter((l) => l.includes("dl.deno.land"))).toEqual([]);
    expect(second.at(-1)).toMatch(/--port 2$/);
  });
});
