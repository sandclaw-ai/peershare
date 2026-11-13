/**
 * Chromium's Local Network Access: a public page must be allowed before it may
 * call this computer (`loopback`) or the local network (`local`). A refused
 * call fails exactly like a closed port, so only the permission tells the
 * Sharer which of the two to fix.
 */

import type { LocalNetworkPermission } from "./types.js";

/** Where a URL points: the address spaces Local Network Access guards, or `public`. */
export type AddressSpace = "loopback" | "local" | "public";

export function addressSpaceOf(url: string): AddressSpace {
  let host: string;
  try {
    host = new URL(url).hostname.replace(/^\[|\]$/g, "").toLowerCase();
  } catch {
    return "public";
  }
  if (host === "localhost" || host.endsWith(".localhost") || host === "::1") return "loopback";
  if (/^127\./.test(host)) return "loopback";
  if (
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^f[cd][0-9a-f]{2}:/.test(host) ||
    /^fe80:/.test(host) ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".lan") ||
    host.endsWith(".home.arpa") ||
    // A bare name (`nas`, `printer`) resolves on the local network.
    !host.includes(".")
  ) {
    return "local";
  }
  return "public";
}

/**
 * The permission names that guard each space. Chromium started with one,
 * `local-network-access`, for both; newer builds (seen in 157) add
 * `loopback-network` for this computer and `local-network` for the network,
 * and keep the old name too. A browser knows some, all or none of them.
 */
const NAMES: Record<Exclude<AddressSpace, "public">, string[]> = {
  loopback: ["loopback-network", "local-network-access"],
  local: ["local-network", "local-network-access"],
};

/**
 * Whether this page may reach `space`, over every name this browser knows:
 * any `denied` blocks; otherwise any `prompt` still needs an answer;
 * `unsupported` when the browser has no such check (or the space is public).
 */
export async function localNetworkPermission(space: AddressSpace): Promise<LocalNetworkPermission> {
  if (space === "public") return "unsupported";
  const states = await Promise.all(NAMES[space].map(queryPermission));
  const known = states.filter((s): s is PermissionState => s !== "unsupported");
  if (known.length === 0) return "unsupported";
  if (known.includes("denied")) return "denied";
  if (known.includes("prompt")) return "prompt";
  return "granted";
}

async function queryPermission(name: string): Promise<LocalNetworkPermission> {
  try {
    return (await navigator.permissions.query({ name: name as PermissionName })).state;
  } catch {
    return "unsupported";
  }
}
