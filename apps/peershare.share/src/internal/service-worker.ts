/**
 * Does a Service's page register a ServiceWorker of its own? In a Guest's
 * session it cannot: the session origin's worker is PeerShare's, and the
 * browser fetches a worker's script from the network, past every worker, so
 * the app's script never arrives (the session host answers 404). Whatever
 * needs that worker -- offline pages, a demo running in it -- breaks for Guests.
 *
 * Looked for in the page's inline scripts and in the first few scripts it
 * loads from its own site (most apps register from a bundle, not the HTML).
 * One level deep: a registration in a chunk those scripts import is missed.
 */

const REGISTER = /\bserviceWorker\s*\??\.\s*register\s*\(/;

/** Scripts read at most per Probe: each is one more request through the Upstream. */
export const MAX_SCRIPTS = 8;

export async function registersServiceWorker(
  html: string,
  /** A path on the Service (`/assets/app.js`), its text; undefined when it cannot be read. */
  read: (path: string) => Promise<string | undefined>,
  max = MAX_SCRIPTS,
): Promise<boolean> {
  if (inlineScripts(html).some((code) => REGISTER.test(code))) return true;
  for (const path of scriptPaths(html).slice(0, max)) {
    const code = await read(path).catch(() => undefined);
    if (code != null && REGISTER.test(code)) return true;
  }
  return false;
}

function inlineScripts(html: string): string[] {
  return [...html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(
    (m) => m[1] ?? "",
  );
}

/** Same-site script URLs as paths: `<script src>` and `<link rel="modulepreload">`, in order. */
export function scriptPaths(html: string): string[] {
  const found = [
    ...[...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)].map((m) => m[1]),
    ...[...html.matchAll(/<link\b[^>]*\brel=["']modulepreload["'][^>]*>/gi)].map(
      (m) => /\bhref=["']([^"']+)["']/i.exec(m[0])?.[1],
    ),
  ];
  const base = "http://service.invalid/";
  const paths: string[] = [];
  for (const src of found) {
    if (src == null || src.startsWith("data:")) continue;
    let url: URL;
    try {
      url = new URL(src, base);
    } catch {
      continue;
    }
    // Another site's script (a CDN) is not the app's own: it is not fetched.
    if (url.origin !== new URL(base).origin) continue;
    const path = url.pathname + url.search;
    if (!paths.includes(path)) paths.push(path);
  }
  return paths;
}
