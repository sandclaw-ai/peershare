/**
 * The PeerShare browser extension: the local proxy's alternative. It relays
 * the page's Bridged requests from its own background worker, which neither
 * CORS nor Local Network Access stand in the way of, under the Bridge's rules
 * (only this computer and private networks) and the Bridge's wire contract
 * (`x-peershare-target`, the `x-peershare-bridge` markers). So PeerShare treats
 * it as one more way to reach the Bridge.
 *
 * The page and the extension's content script meet on `window.postMessage`:
 *
 *   page    → { channel, type: "connect", id }
 *   content → { channel, type: "connected", id, version, protocol }  + a MessagePort
 *   content → { channel, type: "ready", version, protocol }          (when it loads late)
 *
 * On the port, one message per request and one per answer, matched by `id`:
 *
 *   page    → { id, request: WireRequest }
 *   content → { id, response: WireResponse } | { id, error }
 */

import { MESH_CREDENTIAL_HEADERS } from "@statewalker/httpeers-core";
import {
  BRIDGE_GUEST_HEADER,
  BRIDGE_MARKER,
  BRIDGE_TARGET_HEADER,
  BRIDGE_TOKEN_HEADER,
} from "@statewalker/httpeers-share";
import { MARKER, type Upstream, urlUpstream } from "@statewalker/webrun-http-proxy";

export const EXTENSION_CHANNEL = "sandclaw-peershare-proxy";
/** Bumped when either side's messages change incompatibly. */
export const EXTENSION_PROTOCOL = 1;

export interface WireRequest {
  method: string;
  /** Path and query, relative to the Service's target. */
  path: string;
  headers: [string, string][];
  body?: ArrayBuffer;
}

export interface WireResponse {
  status: number;
  statusText: string;
  headers: [string, string][];
  body: ArrayBuffer;
}

/** A found extension: its version, and the Bridge it stands in for. */
export interface ExtensionRelay {
  version: string;
  /** A Bridge request (`x-peershare-target` set) in, the Bridge's answer out. */
  fetch(request: Request): Promise<Response>;
}

/** The base the page addresses the extension by; never resolved, only its path is used. */
const EXTENSION_BASE = "http://peershare-extension.invalid";

/**
 * A Bridged Service reached through the extension: the same headers stripped
 * and set as for the local proxy, and the same "the Bridge is not there" when
 * the extension does not answer, so the Probe reads it as `bridge-down`.
 */
export function viaExtension(relay: ExtensionRelay, target: string): Upstream {
  const upstream = urlUpstream({
    base: EXTENSION_BASE,
    stripRequestHeaders: [...MESH_CREDENTIAL_HEADERS, BRIDGE_TARGET_HEADER, BRIDGE_TOKEN_HEADER],
    headers: { [BRIDGE_TARGET_HEADER]: target },
    fetchImpl: (input, init) => relay.fetch(new Request(input, init)),
  });
  return async (request) => {
    const response = await upstream(request);
    if (response.headers.get(MARKER) !== "upstream-unreachable") return response;
    const headers = new Headers(response.headers);
    headers.delete(MARKER);
    headers.set(BRIDGE_MARKER, "bridge-unreachable");
    return new Response(response.body, { status: response.status, headers });
  };
}

/** The Bridge's own request headers: what the extension consumes and never passes on. */
export const EXTENSION_CONSUMED_HEADERS = [
  BRIDGE_TARGET_HEADER,
  BRIDGE_TOKEN_HEADER,
  BRIDGE_GUEST_HEADER,
];

/** A `Request` as the port carries it (structured clone: no streams). */
export async function toWireRequest(request: Request): Promise<WireRequest> {
  const url = new URL(request.url);
  const bodyless = request.method === "GET" || request.method === "HEAD";
  const body = bodyless ? undefined : await request.arrayBuffer();
  return {
    method: request.method,
    path: `${url.pathname}${url.search}`,
    headers: [...request.headers],
    ...(body != null && body.byteLength > 0 ? { body } : {}),
  };
}

/** Statuses a `Response` must have no body for. */
const NULL_BODY = new Set([101, 103, 204, 205, 304]);

export function fromWireResponse(wire: WireResponse): Response {
  return new Response(NULL_BODY.has(wire.status) ? null : wire.body, {
    status: wire.status,
    statusText: wire.statusText,
    headers: wire.headers,
  });
}
