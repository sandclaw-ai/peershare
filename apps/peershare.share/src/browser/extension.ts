/**
 * Finding the PeerShare browser extension from the page (see
 * `../public/extension.ts` for the messages).
 */

import {
  EXTENSION_CHANNEL,
  EXTENSION_PROTOCOL,
  type ExtensionRelay,
  fromWireResponse,
  toWireRequest,
  type WireResponse,
} from "../public/extension.js";

/** Long enough for a Service that is slow; a dead extension must not hang a Guest forever. */
const REQUEST_TIMEOUT_MS = 60_000;

/**
 * The extension, if it is installed and its content script runs on this page;
 * `undefined` after `timeoutMs` without an answer.
 */
export function findExtension(
  init: { timeoutMs?: number; win?: Window } = {},
): Promise<ExtensionRelay | undefined> {
  const win = init.win ?? window;
  const id = crypto.randomUUID();
  return new Promise((resolve) => {
    const connect = () =>
      win.postMessage({ channel: EXTENSION_CHANNEL, type: "connect", id }, win.location.origin);
    const done = (relay: ExtensionRelay | undefined) => {
      clearTimeout(timer);
      win.removeEventListener("message", onMessage);
      resolve(relay);
    };
    const onMessage = (event: MessageEvent) => {
      if (event.source !== win) return;
      const data = event.data;
      if (data?.channel !== EXTENSION_CHANNEL) return;
      if (data.protocol !== EXTENSION_PROTOCOL) return;
      // A content script that loaded after the page asked: ask again.
      if (data.type === "ready") return connect();
      const port = event.ports[0];
      if (data.type === "connected" && data.id === id && port != null) {
        done(
          relayOver(
            port,
            String(data.version),
            data.commit != null ? String(data.commit) : undefined,
          ),
        );
      }
    };
    const timer = setTimeout(() => done(undefined), init.timeoutMs ?? 500);
    win.addEventListener("message", onMessage);
    connect();
  });
}

function relayOver(port: MessagePort, version: string, commit?: string): ExtensionRelay {
  let next = 0;
  const pending = new Map<
    number,
    { resolve: (r: WireResponse) => void; reject: (e: Error) => void }
  >();
  port.onmessage = ({ data }) => {
    const call = pending.get(data?.id);
    if (call == null) return;
    pending.delete(data.id);
    if (data.response != null) call.resolve(data.response);
    else call.reject(new Error(String(data.error ?? "The extension did not answer.")));
  };
  return {
    version,
    ...(commit != null ? { commit } : {}),
    async fetch(request) {
      const id = next++;
      const wire = await toWireRequest(request);
      const response = await new Promise<WireResponse>((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error("The extension did not answer in time."));
        }, REQUEST_TIMEOUT_MS);
        pending.set(id, {
          resolve: (r) => {
            clearTimeout(timer);
            resolve(r);
          },
          reject: (e) => {
            clearTimeout(timer);
            reject(e);
          },
        });
        port.postMessage({ id, request: wire }, wire.body != null ? [wire.body] : []);
      });
      return fromWireResponse(response);
    },
  };
}
