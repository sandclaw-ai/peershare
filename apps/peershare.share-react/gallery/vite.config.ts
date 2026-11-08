import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * The gallery as a static site: `pnpm build:gallery` writes gallery/dist, or wherever `--outDir`
 * says (the PeerShare site publishes it under /ui/). Relative paths, so any prefix works.
 */
export default defineConfig({
  root: import.meta.dirname,
  base: "./",
  resolve: { conditions: ["source", "browser", "import", "module", "default"] },
  plugins: [react(), tailwindcss()],
  build: { outDir: "dist", emptyOutDir: true },
});
