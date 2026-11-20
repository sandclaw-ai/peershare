/**
 * The Bridge's job, done by the extension: one request from the PeerShare
 * page, carrying `x-peershare-target`, relayed to that Service.
 *
 * The same rules as the local proxy (`@statewalker/httpeers-share/bridge`):
 * - only this computer and private networks (`checkTarget`); names other than
 *   `localhost` and `*.localhost` are refused, since the extension cannot
 *   resolve `.local` names to check where they point (`*.localhost` needs no
 *   check: Chrome answers it with loopback itself, RFC 6761). Unless its user turned on "Allow any
 *   website" in the popup (`anyWebsite`, off by default): then any http(s)
 *   URL, still without cookies;
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
  /**
   * Relay to any http(s) URL, not only this computer and private networks.
   * Only the extension's own popup turns it on (`chrome.storage.local`): no page can.
   */
  anyWebsite?: boolean;
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
      anyWebsite: init.anyWebsite === true,
    });
  }
  if (!targetAllowed(target, init.anyWebsite === true))
    return refuse(
      403,
      "target-forbidden",
      init.anyWebsite === true || !/^https?:\/\//i.test(target)
        ? `The PeerShare extension does not relay to ${target}.`
        : `The PeerShare extension relays only to this computer and private networks. To reach ${target}, turn on "Allow any website" in the extension's popup.`,
    );

  const fetchImpl = init.fetchImpl ?? fetch;
  const upstream = urlUpstream({
    base: target,
    stripRequestHeaders: EXTENSION_CONSUMED_HEADERS,
    // `urlUpstream` asks for `redirect: "manual"`, which an extension only sees as opaque.
    // It also hands on a body as a stream, which Chromium sends only over HTTP/2 or later:
    // to a local Service on HTTP/1.1 every POST would fail. The body came whole over the
    // page's port anyway, so it goes on whole.
    fetchImpl: async (input, options) => {
      const outbound = new Request(input, options);
      const body = outbound.body == null ? undefined : await outbound.arrayBuffer();
      return fetchImpl(outbound.url, {
        method: outbound.method,
        headers: outbound.headers,
        body,
        signal: outbound.signal,
        redirect: "follow",
        credentials: "omit",
      });
    },
  });
  const response = await upstream(request);
  // Its text says why (`upstream … could not be reached: <the error>`): kept for diagnostics.
  if (response.headers.get(MARKER) != null)
    return refuse(502, "target-unreachable", await response.text());

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

/** This computer and private networks; any http(s) URL once the user allowed it. */
export function targetAllowed(target: string, anyWebsite: boolean): boolean {
  const verdict = checkTarget(target);
  if (verdict === "allowed") return true;
  // `*.localhost`: Chrome resolves it to loopback without asking DNS, so it is this computer.
  if (typeof verdict === "object" && verdict.require === "loopback") return true;
  if (!anyWebsite) return false;
  try {
    const url = new URL(target);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function refuse(status: number, reason: string, detail?: string): Response {
  return new Response(detail ?? null, {
    status,
    headers: {
      [BRIDGE_MARKER]: reason,
      ...(detail != null ? { "content-type": "text/plain; charset=utf-8" } : {}),
    },
  });
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
