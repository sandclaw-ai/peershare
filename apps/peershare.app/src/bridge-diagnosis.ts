/**
 * What the PeerShare page can learn about its Bridge, in a browser.
 *
 * Chromium's Local Network Access check fails a refused request exactly like
 * a closed port: `TypeError: Failed to fetch`, nothing reaches the Bridge.
 * Only the permission state tells the two apart, so it is read alongside.
 */

import { BRIDGE_TOKEN_HEADER } from "@statewalker/httpeers-share";
import { addressSpaceOf, localNetworkPermission } from "@statewalker/peershare.share";

export type BridgeDiagnosis = "ok" | "permission-needed" | "bridge-not-running" | "token-rejected";

export async function diagnoseBridge(init: {
  localUrl: string;
  token: string;
  /** Told which proxy answered (`x-peershare-proxy`), for the diagnostics. */
  onProxy?: (which: string) => void;
}): Promise<BridgeDiagnosis> {
  let response: Response;
  try {
    response = await fetch(`${init.localUrl}/`, {
      headers: { [BRIDGE_TOKEN_HEADER]: init.token },
    });
  } catch {
    // Read AFTER the attempt: the attempt is what asks the Sharer.
    // Every name this browser has for the proxy's space (loopback, as a rule).
    const permission = await localNetworkPermission(addressSpaceOf(init.localUrl));
    // "unsupported": a browser without the check — the failure is the Bridge's.
    return permission === "prompt" || permission === "denied"
      ? "permission-needed"
      : "bridge-not-running";
  }
  init.onProxy?.(response.headers.get("x-peershare-proxy") ?? "a proxy older than 0.1.2");
  if (response.status === 401) return "token-rejected";
  // Something else may answer on that port; to the Sharer it is the same:
  // the Bridge is not there.
  const body = await response.json().catch(() => undefined);
  return body?.bridge === "peershare" ? "ok" : "bridge-not-running";
}
