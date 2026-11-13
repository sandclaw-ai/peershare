/**
 * The Guest: a member of the Sharer's mesh that serves nothing of its own.
 * Join redeems the Invite once; after that the saved identity resumes the
 * membership (rung 10); Close session forgets it.
 */

import { generateKeyPair } from "@libp2p/crypto/keys";
import type { Ed25519PrivateKey } from "@libp2p/interface";
import { createMounts } from "@statewalker/httpeers-core";
import {
  type MemberHandle,
  MemberJoinError,
  type MemberState,
  startMember,
} from "@statewalker/httpeers-member";
import {
  type CatalogEntry,
  decodeInvite,
  isSharerOffline,
  joinOutcome,
  openTunnel,
  type TunnelSocket,
} from "@statewalker/httpeers-share";
import type { GuestConnecting, GuestStage, GuestState } from "../public/commands.js";
import { type DiagnosticsLog, describeError, noLog } from "../public/diagnostics.js";
import type { GuestIdentity, MeshInit } from "../public/mesh.js";
import { PEERSHARE_RULES } from "./rules.js";

/** startMember's steps, as the Guest's page names them. */
const STEP: Record<MemberState, GuestConnecting | undefined> = {
  "connecting-relay": "relay",
  "starting-peer": "relay",
  "dialing-hub": "direct",
  resuming: "joining",
  joining: "joining",
  "awaiting-reservation": "joining",
  "mounting-edge": "joining",
  ready: undefined,
  stopped: undefined,
};

/**
 * How often a joined Guest asks the Sharer for its Services: that is how its page learns,
 * without a click, that the Sharer went offline, came back, or changed what it shares.
 */
export const HUB_WATCH_MS = 5_000;

/** startMember's refusals that mean the hub does not list this key as a member any more. */
function noLongerAMember(error: unknown): boolean {
  if (!(error instanceof MemberJoinError)) return false;
  // Resumed without an invite, or with a spent one: the hub refused the membership.
  return error.reason === "not-a-member" || error.reason === "invitation-refused";
}

/**
 * What a failed Join or Resume means, as precisely as the error says.
 *
 * The hub's own refusals arrive as `MemberJoinError("invitation-refused")`
 * with its answer quoted in the message (`{"error":"invitation not-found"}`):
 * used, expired and unknown Invites each get their own stage, and any other
 * refusal is `join-failed` with the hub's words. Only an error that never got
 * an answer from the hub (no reservation at the relay, a dial that failed)
 * means the Sharer's computer is not answering.
 */
export function guestOutcome(error: unknown): { stage: GuestStage; problem: string } {
  const problem = describeError(error);
  if (error instanceof MemberJoinError) {
    const stage = joinOutcome(error);
    if (stage === "invite-used" || stage === "invite-expired") return { stage, problem };
    if (/invitation not-found/.test(problem)) return { stage: "invite-unknown", problem };
    return { stage: "join-failed", problem };
  }
  return { stage: "machine-offline", problem };
}

export class GuestManager {
  private member: MemberHandle | undefined;
  private state_: GuestState = { stage: "no-link" };

  constructor(
    private readonly mesh: MeshInit,
    private readonly notify: () => void = () => {},
    private readonly log: DiagnosticsLog = noLog,
  ) {}

  private get current(): GuestState {
    return this.state_;
  }

  private set current(next: GuestState) {
    this.state_ = next;
    this.notify();
  }

  state(): GuestState {
    return { ...this.current };
  }

  async join(link: string): Promise<GuestState> {
    const invite = decodeInvite(link);
    // Already a member of this Sharer's mesh (joined before; Try again after an outage; a
    // reload on the invite link): come back with that key. startMember resumes the
    // membership and redeems the invite only if the hub no longer knows the key. A new
    // key would redeem the invite again, and a spent invite answers "already used".
    const saved = await this.mesh.guestStore.load();
    const identity: GuestIdentity =
      saved != null && saved.sharerPeerId === invite.sharerPeerId
        ? {
            ...saved,
            sharerName: invite.sharerName || saved.sharerName,
            // The newest link names the relays to use: they may have moved since. The
            // Sharer is proven by its key (Noise), whichever relay carries the bytes.
            relayAddrs: invite.relayAddrs,
          }
        : {
            privateKey: await generateKeyPair("Ed25519"),
            sharerPeerId: invite.sharerPeerId,
            sharerName: invite.sharerName,
            relayAddrs: invite.relayAddrs,
          };
    this.log.info("join: invite opened", {
      sharer: invite.sharerPeerId,
      relays: invite.relayAddrs,
      // Enough to tell invites apart in a log, not enough to use one.
      invitation: `${invite.invitationId.slice(0, 6)}…`,
      knownSharer: identity !== undefined && saved?.sharerPeerId === invite.sharerPeerId,
    });
    return this.enter(identity, invite.invitationId, saved?.privateKey === identity.privateKey);
  }

  /** Back in with the saved identity, without an Invite. */
  async resume(): Promise<GuestState> {
    const identity = await this.mesh.guestStore.load();
    if (identity == null) return this.state();
    this.log.info("resume: with the saved identity", { sharer: identity.sharerPeerId });
    return this.enter(identity, undefined, true);
  }

  async catalog(): Promise<CatalogEntry[]> {
    const res = await this.fetch("/s/");
    return res.ok ? res.json() : [];
  }

  /** The Viewer's route to a Service: `/peers/<sharer>/s/<id><path>` through the member's JS fetch. */
  async fetchService(serviceId: string, request: Request): Promise<Response> {
    const url = new URL(request.url);
    const body =
      request.method === "GET" || request.method === "HEAD" ? null : await request.arrayBuffer();
    const what = `${request.method} ${serviceId}${url.pathname}`;
    try {
      const res = await this.fetch(`/s/${serviceId}${url.pathname}${url.search}`, {
        method: request.method,
        headers: request.headers,
        body,
      });
      // Only failures: a page load is dozens of requests.
      if (res.status >= 500) {
        const marker = res.headers.get("x-peershare-bridge") ?? res.headers.get("x-webrun-proxy");
        this.log.warn(
          "service: request failed",
          `${what} → ${res.status}${marker ? ` (${marker})` : ""}`,
        );
      }
      return res;
    } catch (error) {
      this.log.error("service: request failed", error, what);
      throw error;
    }
  }

  /** A live connection to a Service (M9): a WebSocket inside one request over the mesh. */
  openSocket(serviceId: string, path: string, protocols: string[]): TunnelSocket {
    const member = this.member;
    const sharer = this.current.sharerPeerId;
    return openTunnel(
      async (request) =>
        member == null || sharer == null
          ? new Response("not joined", { status: 409 })
          : member.fetch(request),
      `http://local/peers/${sharer}/s/${serviceId}${path}`,
      protocols,
    );
  }

  async closeSession(): Promise<GuestState> {
    // Tell the Sharer first, so it stops listing this Guest. An offline Sharer
    // cannot hear it; the Guest leaves anyway and Dirk can still Revoke.
    this.log.info("session: closed by the Guest");
    await this.fetch("/session/leave", { method: "POST" }).catch(() => {});
    await this.leave();
    await this.mesh.guestStore.clear();
    this.current = { stage: "no-link" };
    return this.state();
  }

  async leave(): Promise<void> {
    clearInterval(this.watch);
    this.watch = undefined;
    // Answers still on their way belong to the session that is ending: they must not set
    // the stage of whatever comes next (Close session, revoked, a new join).
    this.generation++;
    const member = this.member;
    this.member = undefined;
    await member?.stop().catch(() => {});
  }

  /**
   * One Join or Resume at a time: the page resumes on load while the Guest may already click
   * Join, and two at once would run one key on two nodes, the first never stopped.
   */
  private enter(identity: GuestIdentity, invitationId?: string, saved = false) {
    const run = this.entering.then(() => this.enterNow(identity, invitationId, saved));
    this.entering = run.catch(() => {});
    return run;
  }
  private entering: Promise<unknown> = Promise.resolve();

  private async enterNow(
    identity: GuestIdentity,
    invitationId: string | undefined,
    saved: boolean,
  ): Promise<GuestState> {
    await this.leave();
    const started = Date.now();
    try {
      this.member = await this.start(identity.privateKey, identity, invitationId);
    } catch (error) {
      this.connecting(undefined);
      const who = { sharerName: identity.sharerName, sharerPeerId: identity.sharerPeerId };
      const doing = invitationId != null ? "join" : "resume";
      // A saved key the hub no longer knows: revoked while this page was closed (or the
      // Sharer's hub was reset). Its link, if any, is spent. Say so, and forget the key.
      if (saved && noLongerAMember(error)) {
        this.log.error(`${doing}: no longer a member`, error);
        await this.mesh.guestStore.clear();
        this.current = { stage: "revoked", ...who };
        return this.state();
      }
      // A refused Invite leaves the Guest where it was; an offline Sharer
      // keeps the identity, so the Guest can come back (rung 10).
      const outcome = guestOutcome(error);
      this.log.error(
        `${doing}: failed → ${outcome.stage}`,
        error,
        `after ${Date.now() - started} ms`,
      );
      return { ...outcome, ...who };
    }
    this.log.info("joined", `in ${Date.now() - started} ms`);
    await this.mesh.guestStore.save(identity);
    this.current = {
      stage: "joined",
      sharerName: identity.sharerName,
      sharerPeerId: identity.sharerPeerId,
    };
    this.startWatch();
    return this.state();
  }

  private start(privateKey: Ed25519PrivateKey, identity: GuestIdentity, invitationId?: string) {
    return startMember({
      key: "peers",
      mounts: createMounts(),
      rules: PEERSHARE_RULES,
      config: { relayAddrs: identity.relayAddrs, hubPeerId: identity.sharerPeerId },
      platform: this.mesh.platform.member,
      privateKey,
      // What the page shows while it waits: a direct connection that cannot come up
      // costs seconds before the relay takes over.
      onState: (step) => {
        this.log.info("join: step", step);
        this.connecting(STEP[step]);
      },
      // The hub answers a heartbeat with 403 once this Guest is no longer a member: the
      // Sharer revoked it. That is the Guest's notice, within a heartbeat (5 s), even if
      // it makes no request of its own.
      onPresenceRefused: (refusal) => {
        this.log.warn("presence: refused by the hub", refusal.kind);
        if (refusal.kind === "not-a-member") void this.revoked();
      },
      ...(invitationId != null ? { invitationId } : {}),
    });
  }

  /** Revoked: leave the mesh and forget the identity, which no hub will take back. */
  private async revoked(): Promise<void> {
    // Heartbeats keep coming while it leaves: act on the first refusal only.
    if (this.revoking || this.member == null) return;
    this.revoking = true;
    this.log.warn("session: revoked by the Sharer");
    try {
      const { sharerName, sharerPeerId } = this.current;
      await this.mesh.guestStore.clear();
      await this.leave();
      this.current = { stage: "revoked", sharerName, sharerPeerId };
    } finally {
      this.revoking = false;
    }
  }
  private revoking = false;

  private watch: ReturnType<typeof setInterval> | undefined;
  private lastCatalog = "";

  /** While joined: ask for the Services every `HUB_WATCH_MS`; `fetch` keeps the stage right. */
  private startWatch(): void {
    clearInterval(this.watch);
    this.lastCatalog = "";
    const generation = this.generation;
    let watching = false;
    const tick = async () => {
      if (watching) return;
      watching = true;
      try {
        const res = await this.fetch("/s/");
        if (!res.ok || generation !== this.generation) return;
        const catalog = await res.text();
        if (catalog !== this.lastCatalog) {
          const first = this.lastCatalog === "";
          this.lastCatalog = catalog;
          if (!first)
            this.current = {
              ...this.current,
              catalogVersion: (this.current.catalogVersion ?? 0) + 1,
            };
        }
      } catch {
        // A transport fault: the next tick tries again.
      } finally {
        watching = false;
      }
    };
    void tick();
    this.watch = setInterval(() => void tick(), HUB_WATCH_MS);
  }
  private generation = 0;

  private connecting(step: GuestConnecting | undefined): void {
    if (this.current.connecting === step) return;
    const { connecting: _, ...rest } = this.current;
    this.current = step == null ? rest : { ...rest, connecting: step };
  }

  private async fetch(path: string, init?: RequestInit): Promise<Response> {
    const member = this.member;
    const sharer = this.current.sharerPeerId;
    if (member == null || sharer == null) {
      return new Response("not joined", { status: 409 });
    }
    const generation = this.generation;
    const res = await member.fetch(new Request(`http://local/peers/${sharer}${path}`, init));
    // Left (or left and came back) meanwhile: this answer says nothing about the stage now.
    if (generation !== this.generation || member !== this.member) return res;
    if (await isSharerOffline(res)) {
      if (this.current.stage !== "machine-offline")
        this.log.warn("sharer: stopped answering", `${path} → ${res.status}`);
      this.current = { ...this.current, stage: "machine-offline" };
    } else if (this.current.stage === "machine-offline") {
      this.log.info("sharer: answering again");
      this.current = { ...this.current, stage: "joined" };
    }
    return res;
  }
}
