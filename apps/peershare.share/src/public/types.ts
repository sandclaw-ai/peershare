/** PeerShare's domain, as views and other Features see it (GLOSSARY.md). */

import type { Health, ProbeCause, ProbeWarning } from "@statewalker/httpeers-share";

export interface ServiceDraft {
  name: string;
  /** An id of the `peershare:upstream-kinds` extension point: "bridged", "direct", or another Feature's. */
  kind: string;
  target: string;
  isDefault?: boolean;
  /**
   * Show it to Guests although it forbids being framed: the hub removes its
   * `X-Frame-Options` and CSP `frame-ancestors` from what Guests get. Off by
   * default; see `framing.ts` and the help's "security#framing".
   */
  allowFraming?: boolean;
}

export interface SharedService {
  id: string;
  name: string;
  kind: string;
  target: string;
  enabled: boolean;
  isDefault: boolean;
  /** See `ServiceDraft.allowFraming`. */
  allowFraming?: boolean;
  /** The last Probe, or `checking` while one runs. */
  health?: Health | "checking" | "disabled";
  /**
   * Chromium's Local Network Access, for the address the Probe reached:
   * `permission-needed` it was refused; `permission-unanswered` the browser's
   * question is still open (dismissed, or never asked because nothing answered).
   */
  cause?: ProbeCause | "permission-needed" | "permission-unanswered";
  /** `framing-refused`: it forbids being framed, so Guests' browsers will not show it (see `allowFraming`). */
  warnings?: (ProbeWarning | "framing-refused")[];
}

/** The browser's Local Network Access permission; `unsupported` where there is no such check. */
export type LocalNetworkPermission = PermissionState | "unsupported";

export interface SharerState {
  name: string;
  services: SharedService[];
}

export type Refusal = { ok: false; reason: string };
export type Result<T extends object = object> = ({ ok: true } & T) | Refusal;

/** Where the Sharer's state survives a reload (IndexedDB in the page, memory in tests). */
export interface SharerStore {
  load(): Promise<SharerState | undefined>;
  save(state: SharerState): Promise<void>;
}
