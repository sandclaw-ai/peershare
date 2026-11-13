/**
 * `buildProxy(outDir, site)`: writes the proxy's files into `outDir`.
 *
 *   peershare-proxy.mjs   the proxy, one ESM file with every dependency inlined
 *                         (only `node:*` stays external), for Node, Bun and Deno
 *   peershare-proxy.sh    its launcher, pointed at `https://<site>`
 *   CHANGELOG.txt         what changed in each proxy version
 */
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { build } from "vite";

const app = resolve(import.meta.dirname, "..");
const require = createRequire(join(app, "package.json"));

export async function buildProxy(outDir, site) {
  await build({
    root: app,
    configFile: false,
    logLevel: "warn",
    ssr: { noExternal: true, target: "node" },
    // `ws` is chosen at run time (proxy/ws-for-runtime.ts); `ws-inlined` is the package itself.
    resolve: {
      alias: [
        { find: /^ws$/, replacement: join(app, "proxy/ws-for-runtime.ts") },
        { find: /^ws-inlined$/, replacement: join(dirname(require.resolve("ws")), "wrapper.mjs") },
      ],
    },
    build: {
      ssr: join(app, "proxy/main.ts"),
      outDir,
      emptyOutDir: false,
      rollupOptions: { output: { entryFileNames: "peershare-proxy.mjs" } },
    },
  });
  writeFileSync(
    join(outDir, "peershare-proxy.sh"),
    readFileSync(join(app, "proxy/peershare-proxy.sh"), "utf8").replaceAll("@SITE@", site),
  );
  copyFileSync(join(app, "proxy/CHANGELOG.txt"), join(outDir, "CHANGELOG.txt"));
}
