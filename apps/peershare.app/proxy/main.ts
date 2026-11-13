/**
 * `peershare-proxy [--port 9090] [--key <key>] [--origin <origin>]… [--no-cookie-jars]`
 *
 * Runs under Node, Bun or Deno; `peershare-proxy.sh` picks one.
 */

import { PROXY_VERSION, parseProxyArgs, startProxy } from "./proxy.ts";

const options = parseProxyArgs(process.argv.slice(2));
if (options.origins.includes("*")) {
  console.error(
    "peershare-proxy: --origin '*' lets every website you visit use this proxy to reach this machine and your network",
  );
}
const proxy = await startProxy(options);
console.log(banner(proxy.origin, options.key, options.origins, proxy.hubLink));

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => void proxy.close().then(() => process.exit(0)));
}

/** Labels right-aligned in one column; a list continues under its first value. */
function banner(origin: string, key: string, origins: string[], hubLink: string): string {
  const rows: [string, string[]][] = [
    ["Running at", [origin]],
    ...(key ? [["Key", [key]] as [string, string[]]] : []),
    ["Allowed pages", origins],
    ["Open the hub with it", [hubLink]],
  ];
  const width = Math.max(...rows.map(([label]) => label.length)) + 1;
  const lines = rows.flatMap(([label, values]) =>
    values.map((v, i) => `${(i === 0 ? `${label}:` : "").padStart(width)}   ${v}`),
  );
  return [
    "",
    `🦀 SandClaw.ai PeerShare Proxy ${PROXY_VERSION}`,
    "",
    ...lines,
    "",
    "⚪️  Ctrl+C stops it.",
    "",
  ].join("\n");
}
