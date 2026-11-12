import { defineConfig } from "astro/config";

/**
 * A static site under `/help` of the PeerShare site (the site workflow copies dist/ into its
 * `help/` folder). Pages are written as `security.html`, not `security/index.html`: httpeers'
 * sites host serves `/help/security` from `help/security.html`. Links carry the base through
 * `u()` (src/lib/url.ts).
 */
export default defineConfig({
  site: "https://peershare.sandclaw.ai",
  base: "/help",
  build: { format: "file" },
  trailingSlash: "never",
  // Compression joins a word to a link that starts the next source line ("onlibp2p"): the
  // prose here wraps at 100 columns, so whitespace is kept as written.
  compressHTML: false,
});
