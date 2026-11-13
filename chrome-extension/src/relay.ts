/**
 * The Bridge's job, done by the extension: one request from the PeerShare
 * page, carrying `x-peershare-target`, relayed to that Service.
 *
 * The same rules as the local proxy (`@statewalker/httpeers-share/bridge`):
 * - only this computer and private networks (`checkTarget`); names other than
 *   `localhost` are refused, since the extension cannot resolve `.local`
 *   names to check where they point;
 * - the Bridge's own headers are consumed here, never passed to the Service;
 * - the Service's failures are answered with the Bridge's markers
 *   (`x-peershare-bridge: target-unreachable`), so the page tells them apart
 *   from the extension's.
 *
 * Unlike the local proxy, an extension's `fetch` cannot see redirects (it
 * would get an opaque one) or `Set-Cookie`: redirects are followed, and no
 * cookies are sent or kept.
 */

import { BRIDGE_MARKER, BRIDGE_TARGET_HEADER, checkTarget } from "@statewalker/httpeers-share";
import { EXTENSION_CONSUMED_HEADERS } from "@statewalker/peershare.share/extension";
import { MARKER, urlUpstream } from "@statewalker/webrun-http-proxy";

export interface RelayInit {
  /** The extension's version, told to a page that asks. */
  version: string;
  /** The git commit it was built from, told likewise. */
  commit?: string;
  /** Injected by tests; the extension's own `fetch` otherwise. */
  fetchImpl?: typeof fetch;
}

export async function relay(request: Request, init: RelayInit): Promise<Response> {
  const target = request.headers.get(BRIDGE_TARGET_HEADER) || null;
  // No target: the page asks whether its Bridge is there (as of the local proxy).
  if (target == null) {
    return Response.json({
      bridge: "peershare",
      via: "extension",
      version: init.version,
      ...(init.commit != null ? { commit: init.commit } : {}),
    });
  }
  if (checkTarget(target) !== "allowed") return refuse(403, "target-forbidden");

  const fetchImpl = init.fetchImpl ?? fetch;
  const upstream = urlUpstream({
    base: target,
    stripRequestHeaders: EXTENSION_CONSUMED_HEADERS,
    // `urlUpstream` asks for `redirect: "manual"`, which an extension only sees as opaque.
    fetchImpl: (input, options) =>
      fetchImpl(new Request(input, { ...options, redirect: "follow", credentials: "omit" })),
  });
  const response = await upstream(request);
  if (response.headers.get(MARKER) != null) return refuse(502, "target-unreachable");

  const headers = new Headers(response.headers);
  // `fetch` decoded the body: neither its encoding nor its encoded length applies any more.
  headers.delete("content-encoding");
  headers.delete("content-length");
  headers.set(BRIDGE_MARKER, "relayed");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function refuse(status: number, reason: string): Response {
  return new Response(null, { status, headers: { [BRIDGE_MARKER]: reason } });
}

/**
 * The pages the extension relays for: the PeerShare hub, and pages served
 * from this computer (a local run of PeerShare). Its content script runs
 * only there too; this is checked again for every message.
 */
export function pageAllowed(url: string | undefined): boolean {
  if (url == null) return false;
  let page: URL;
  try {
    page = new URL(url);
  } catch {
    return false;
  }
  if (page.origin === "https://peershare.sandclaw.ai") return true;
  return page.protocol === "http:" && ["localhost", "127.0.0.1"].includes(page.hostname);
}
