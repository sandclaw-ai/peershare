/**
 * Between the content script and the background worker, `chrome.runtime`
 * messages are JSON: bodies travel as base64.
 */

import type { WireRequest, WireResponse } from "@statewalker/peershare.share/extension";

/** The page's base for the extension (`viaExtension`); only the path matters. */
const BASE = "http://peershare-extension.invalid";

export interface JsonRequest {
  method: string;
  path: string;
  headers: [string, string][];
  body?: string;
}

export interface JsonResponse {
  status: number;
  statusText: string;
  headers: [string, string][];
  body: string;
}

export function requestToJson(wire: WireRequest): JsonRequest {
  return {
    method: wire.method,
    path: wire.path,
    headers: wire.headers,
    ...(wire.body != null ? { body: toBase64(new Uint8Array(wire.body)) } : {}),
  };
}

export function requestFromJson(json: JsonRequest): Request {
  return new Request(new URL(json.path, BASE), {
    method: json.method,
    headers: json.headers,
    ...(json.body != null ? { body: fromBase64(json.body) } : {}),
  });
}

export async function responseToJson(response: Response): Promise<JsonResponse> {
  return {
    status: response.status,
    statusText: response.statusText,
    headers: [...response.headers],
    body: toBase64(new Uint8Array(await response.arrayBuffer())),
  };
}

export function responseFromJson(json: JsonResponse): WireResponse {
  const body = fromBase64(json.body);
  return {
    status: json.status,
    statusText: json.statusText,
    headers: json.headers,
    body: body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer,
  };
}

export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  // In chunks: `String.fromCharCode(...bytes)` overflows the stack on large bodies.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
