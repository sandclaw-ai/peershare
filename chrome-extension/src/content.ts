/**
 * The extension's content script, on the PeerShare page only (see the
 * manifest's `content_scripts.matches`): hands the page a MessagePort, and
 * forwards each request on it to the background worker.
 *
 * Built as one classic script: content scripts cannot be modules.
 */

import {
  EXTENSION_CHANNEL,
  EXTENSION_PROTOCOL,
  type WireRequest,
} from "@statewalker/peershare.share/extension";
import { type JsonResponse, requestToJson, responseFromJson } from "./wire.js";

const version = chrome.runtime.getManifest().version;
const hello = { channel: EXTENSION_CHANNEL, version, protocol: EXTENSION_PROTOCOL };

window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  const data = event.data;
  if (data?.channel !== EXTENSION_CHANNEL || data.type !== "connect") return;
  const channel = new MessageChannel();
  channel.port1.onmessage = async ({ data: call }) => {
    const { id, request } = call as { id: number; request: WireRequest };
    try {
      const answer = await chrome.runtime.sendMessage({
        type: "relay",
        request: requestToJson(request),
      });
      if (answer == null || "error" in answer) {
        channel.port1.postMessage({ id, error: answer?.error ?? "No answer from the extension." });
        return;
      }
      const response = responseFromJson(answer as JsonResponse);
      channel.port1.postMessage({ id, response }, [response.body]);
    } catch (error) {
      // Typically "Extension context invalidated": the extension was updated or removed.
      channel.port1.postMessage({ id, error: String(error) });
    }
  };
  window.postMessage({ ...hello, type: "connected", id: data.id }, location.origin, [
    channel.port2,
  ]);
});

// For a page that asked before this script ran.
window.postMessage({ ...hello, type: "ready" }, location.origin);
