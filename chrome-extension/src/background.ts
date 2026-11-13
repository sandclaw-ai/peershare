/**
 * The extension's background worker: relays the PeerShare page's requests
 * (forwarded by the content script) to local Services.
 */

import { COMMIT } from "./build.js";
import { pageAllowed, relay } from "./relay.js";
import { type JsonRequest, requestFromJson, responseToJson } from "./wire.js";

const version = chrome.runtime.getManifest().version;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "relay") return false;
  // Defense in depth: the content script runs only on these pages anyway.
  if (sender.id !== chrome.runtime.id || !pageAllowed(sender.url)) {
    sendResponse({ error: "This page may not use the PeerShare extension." });
    return false;
  }
  relay(requestFromJson(message.request as JsonRequest), { version, commit: COMMIT })
    .then(responseToJson)
    .then(sendResponse, (error: unknown) => sendResponse({ error: String(error) }));
  // The answer comes later: keep the channel open.
  return true;
});
