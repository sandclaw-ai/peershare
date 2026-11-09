/** PeerShare's commands (PLAN §2.2): what menus, views, other Features and AI tools call. */

import { Command, passthrough } from "@statewalker/shared-commands";
import type { Result, ServiceDraft, SharerState } from "./types.js";

const required = <P, R>(key: string) =>
  Command.required(key).input(passthrough<P>()).output(passthrough<R>()).build();

export const SetName = required<{ name: string }, void>("peershare:set-name");
export const AddService = required<ServiceDraft, Result<{ id: string }>>("peershare:add-service");
export const EditService = required<{ id: string; draft: ServiceDraft }, Result>(
  "peershare:edit-service",
);
export const RemoveService = required<{ id: string }, void>("peershare:remove-service");
export const ToggleService = required<{ id: string; enabled: boolean }, void>(
  "peershare:toggle-service",
);
export const SetDefault = required<{ id: string }, void>("peershare:set-default");
export const ProbeService = required<{ id: string }, void>("peershare:probe");
export const GetSharer = required<void, SharerState>("peershare:get-sharer");

// —— M2–M5: the mesh ——————————————————————————————————————————————

export interface SharingState {
  /** Whether the Sharer is on its mesh ("Turn off server" turns this off). */
  sharing: boolean;
  /** The Sharer's peer id: its mesh's name. Stable across reloads. */
  peerId?: string;
}

/**
 * Where a Guest stands, as the Sharer's hub sees it:
 * - `online`: its heartbeats arrive (the hub's presence, 15 s);
 * - `away`: still a member, but no heartbeat lately (tab closed, asleep, offline);
 * - `left`: it closed its session;
 * - `revoked`: the Sharer revoked it.
 */
export type GuestStatus = "online" | "away" | "left" | "revoked";

export interface GuestRecord {
  peerId: string;
  /** When the Guest joined, in the hub's time (ms). */
  joinedAt: number;
  status: GuestStatus;
  /** When it left or was revoked (ms); only for those two. */
  endedAt?: number;
}

export const StartSharing = required<void, SharingState>("peershare:start");
export const StopSharing = required<void, SharingState>("peershare:stop");
export const GetSharing = required<void, SharingState>("peershare:get-sharing");
export const Invite = required<void, { url: string; expiresAt: number }>("peershare:invite");
export const ListGuests = required<void, GuestRecord[]>("peershare:list-guests");
export const RevokeGuest = required<{ peerId: string }, void>("peershare:revoke-guest");

export type GuestStage =
  | "no-link"
  | "joined"
  | "invite-used"
  | "invite-expired"
  | "machine-offline"
  /** The Sharer revoked this Guest: told by the hub's answer to its heartbeat. */
  | "revoked";

/**
 * Where a Join or a Resume is while it runs: reaching the relay, trying a direct (WebRTC)
 * connection to the Sharer's browser, then joining. Absent when nothing is under way.
 */
export type GuestConnecting = "relay" | "direct" | "joining";

export interface GuestState {
  stage: GuestStage;
  sharerName?: string;
  sharerPeerId?: string;
  /** Set while a Join or a Resume runs: what it is doing now. */
  connecting?: GuestConnecting;
  /**
   * Moves each time the Sharer's list of Services changes (added, renamed, paused…), as the
   * Guest's watch sees it: a view re-reads `ListSharedServices` when it does.
   */
  catalogVersion?: number;
}

export const Join = required<{ link: string }, GuestState>("peershare:join");
/** Back in with the saved identity: no Invite needed (rung 10). */
export const Resume = required<void, GuestState>("peershare:resume");
export const GetGuest = required<void, GuestState>("peershare:get-guest");
export const ListSharedServices = required<
  void,
  import("@statewalker/httpeers-share").CatalogEntry[]
>("peershare:list-shared-services");
/** Leave, and forget the Guest's identity: coming back needs a new Invite. */
export const CloseSession = required<void, GuestState>("peershare:close-session");
