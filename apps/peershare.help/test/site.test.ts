/**
 * The built help site: what httpeers' sites host and PeerShare need from it.
 * Builds once (astro build) into dist/.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const dist = join(root, "dist");
const read = (path: string) => readFileSync(join(dist, path), "utf8");
const PAGES = [
  "index.html",
  "getting-started.html",
  "how-it-works.html",
  "security.html",
  "local-proxy.html",
  "troubleshooting.html",
];

beforeAll(() => {
  // Vitest sets BASE_URL, MODE, NODE_ENV… in its own environment; inherited, they override the
  // config's base, and every link loses its /help.
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      ([k]) => !/^(BASE_URL|MODE|DEV|PROD|SSR|NODE_ENV|VITEST.*|TEST)$/.test(k),
    ),
  );
  execFileSync("pnpm", ["exec", "astro", "build"], { cwd: root, stdio: "ignore", env });
}, 120_000);

describe("the help site", () => {
  it("writes every page as a .html file, which the sites host serves at /help/<name>", () => {
    for (const page of PAGES) expect(existsSync(join(dist, page)), page).toBe(true);
  });

  it("links within itself under /help, and to the PeerShare page at the site's root", () => {
    for (const page of PAGES) {
      const html = read(page);
      const internal = [...html.matchAll(/(?:href|src)="(\/[^"]*)"/g)].map((m) => m[1] ?? "");
      expect(internal.length, page).toBeGreaterThan(0);
      for (const path of internal)
        expect(path === "/" || path.startsWith("/help/"), path).toBe(true);
    }
  });

  it("runs no script: it shares an origin with the PeerShare page, which holds the keys", () => {
    for (const page of PAGES) {
      const html = read(page);
      expect(html, page).not.toContain("<script");
      // And the browser is told so, whatever a page might contain one day.
      expect(html, page).toMatch(/http-equiv="Content-Security-Policy"[^>]*script-src 'none'/);
    }
  });

  it("explains why sharing is safe: Noise, peer IDs as keys, tab to tab, isolated origins", () => {
    // The page's text, as read: tags out, whitespace collapsed (the HTML keeps source line breaks).
    const security = read("security.html")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ");
    for (const words of ["Noise", "public key", "browser tab", "own origin", "single-use"]) {
      expect(security).toContain(words);
    }
  });
});
