/**
 * `peershare-proxy [--port 9090] [--key <key>] [--origin <origin>]… [--no-cookie-jars]`
 *
 * Runs under Node, Bun or Deno; `peershare-proxy.sh` picks one.
 */

import { parseProxyArgs, startProxy } from "./proxy.ts";

const options = parseProxyArgs(process.argv.slice(2));
if (options.origins.includes("*")) {
  console.error(
    "peershare-proxy: --origin '*' lets every website you visit use this proxy to reach this machine and your network",
  );
}
const proxy = await startProxy(options);
console.log(`PeerShare proxy at ${proxy.origin}${options.key ? ` (key: ${options.key})` : ""}
  allowed pages: ${options.origins.join(", ")}
  open the hub with it: ${proxy.hubLink}
Ctrl+C stops it.`);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => void proxy.close().then(() => process.exit(0)));
}
