/**
 * `ws` inside the proxy bundle. Bun has its own `ws`, the only one whose
 * upgrades its `node:http` completes: with the bundled copy, a relayed
 * WebSocket reaches the app but the page's upgrade never finishes. Node and
 * Deno have none, so they get the copy inlined here.
 */

import * as inlined from "ws-inlined";

const bunWs = "ws"; // not a literal import: the bundler must leave it to Bun
const ws: typeof inlined = "Bun" in globalThis ? await import(/* @vite-ignore */ bunWs) : inlined;

export const { WebSocket, WebSocketServer } = ws;
export default ws.default;
