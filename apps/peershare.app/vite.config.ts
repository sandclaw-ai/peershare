import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { buildInfo } from "../../build-info.mjs";
import extensionPkg from "../../chrome-extension/package.json" with { type: "json" };
import pkg from "./package.json" with { type: "json" };

/** One page, two routes: `/peer-share` (the Sharer) and `/peer-share/invite` (a Guest). */
export default defineConfig({
  resolve: { conditions: ["source", "browser", "import", "module", "default"] },
  plugins: [react(), tailwindcss()],
  // Which build this is: named by the page's diagnostics (src/build.ts).
  define: {
    __PEERSHARE_BUILD__: JSON.stringify({
      version: pkg.version,
      ...buildInfo(),
      // The extension the site publishes under /extension/: the proxy card names it.
      extension: extensionPkg.version,
    }),
  },
  build: { rollupOptions: { input: resolve(import.meta.dirname, "index.html") } },
});
