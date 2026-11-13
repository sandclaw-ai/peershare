/**
 * The page's diagnostics log (`createLog`): kept in localStorage, so it survives reloads and
 * the hub's tabs share it, and reachable from the console as `peershareDiagnostics()`.
 */

import { createLog, type DiagnosticsLog } from "@statewalker/peershare.share";
import { BUILD } from "./build.js";

declare global {
  interface Window {
    /** The page's diagnostics log as text: what to paste into a bug report. */
    peershareDiagnostics?: () => string;
  }
}

export function pageLog(role: "hub" | "guest", context: () => Record<string, string> = () => ({})) {
  const log: DiagnosticsLog = createLog({
    storage: localStorage,
    key: `peershare.log.${role}`,
    context: () => ({
      page: role,
      version: BUILD.version,
      commit: BUILD.commit,
      built: BUILD.builtAt,
      // Never the hash: an invite link's is the invite.
      url: `${location.origin}${location.pathname}`,
      browser: navigator.userAgent,
      ...context(),
    }),
  });
  window.peershareDiagnostics = () => log.text();
  // The log outlives reloads: each page names its build, so older lines can be told apart.
  log.info(
    "page: opened",
    `${location.origin}${location.pathname}, PeerShare ${BUILD.version} (${BUILD.commit})`,
  );
  return log;
}
