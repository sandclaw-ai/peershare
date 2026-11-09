/**
 * The Sharer on its own mesh: it IS the hub (ADR 0001). Everything the
 * prototype rungs found is here: revocations enforced (rung 09), Guests on
 * relay links served (rung 11), Guests named for the Bridge's cookie jars
 * (rung 16), one static advertisement with the live catalog at `/s/` (rung 07).
 */

import { generateKeyPair } from "@libp2p/crypto/keys";
import type { Libp2p } from "@libp2p/interface";
import { selfCertifyingKeys, withAccess } from "@statewalker/httpeers-access";
import { mintToken } from "@statewalker/httpeers-access/issuer";
import { ANONYMOUS, type FetchHandler, lookupPeer } from "@statewalker/httpeers-core";
import { createHub, type Hub, usesTransportIdentity } from "@statewalker/httpeers-hub";
import {
  dialRelay,
  type Peer,
  servePeer,
  signerOf,
  waitForCircuitReservation,
} from "@statewalker/httpeers-libp2p";
import { encodeInvite, revokeGuest, stampGuest } from "@statewalker/httpeers-share";
import type { GuestRecord, SharingState } from "../public/commands.js";
import type { MeshInit } from "../public/mesh.js";
import { INVITE_TTL_MS, PEERSHARE_RULES } from "./rules.js";

interface Running {
  node: Libp2p;
  hub: Hub;
  peer: Peer;
  watch: ReturnType<typeof setInterval>;
}

/**
 * The hub adds members inside its own endpoints and says nothing, so the
 * Sharer's view of who joined is refreshed by looking: often enough to feel
 * live, rarely enough to cost nothing.
 */
const MEMBERS_WATCH_MS = 500;
/** How often the hub expires presence: a Guest that stops beating shows as away within this plus its 15 s TTL. */
const PRESENCE_SWEEP_MS = 5_000;
/** Guests who left or were revoked, kept for the Sharer to see: the most recent ones. */
const DEPARTED_KEPT = 20;

export class SharingManager {
  private running: Running | undefined;
  private peerId: string | undefined;

  constructor(
    private readonly mesh: MeshInit,
    private readonly mount: FetchHandler,
    private readonly sharerName: () => string,
    private readonly notify: () => void = () => {},
  ) {}

  /** The last Invite made, for the Invite dialog. */
  lastInvite: { url: string; expiresAt: number } | undefined;

  state(): SharingState {
    return {
      sharing: this.running != null,
      ...(this.peerId != null ? { peerId: this.peerId } : {}),
    };
  }

  async start(): Promise<SharingState> {
    if (this.running != null) return this.state();
    const { platform, relayAddrs, sharerKey, hubStorage } = this.mesh;
    let privateKey = await sharerKey.load();
    if (privateKey == null) {
      privateKey = await generateKeyPair("Ed25519");
      await sharerKey.save(privateKey);
    }

    let isMember: (id: string) => boolean = () => false;
    const node = await platform.createSharerNode({ privateKey, isMember: () => isMember });
    const peerId = node.peerId.toString();
    for (const addr of relayAddrs) await dialRelay(node, addr);
    await waitForCircuitReservation(node);

    const signer = signerOf(privateKey);
    const hub = await createHub({
      selfPeerId: peerId,
      policies: PEERSHARE_RULES,
      storage: hubStorage,
      // Without a sweep, presence never expires and a Guest that left looks online for good.
      sweepIntervalMs: PRESENCE_SWEEP_MS,
      mintToken: async (sub, roles) => mintToken({ signer, sub, roles, ttlMs: 10 * 60_000 }),
      extraMounts: {
        "/s": stampGuest(this.track(this.mount)),
        // A Guest's Close session: it leaves the Sharer's Guests list. The
        // peer is the one the mesh proved, never one the request names.
        "/session": async (request) => {
          const guest = lookupPeer(request);
          if (request.method !== "POST" || guest == null || guest === ANONYMOUS) {
            return new Response(null, { status: 404 });
          }
          this.end(guest, "left");
          return new Response(null, { status: 204 });
        },
      },
      ownAdvertisements: [
        { id: "peershare", kind: "peershare", title: `${this.sharerName()}'s services` },
      ],
    });
    isMember = (id) => hub.isMember(id);

    const peer = await servePeer({
      node,
      mounts: hub.mounts,
      access: withAccess({
        issuer: peerId,
        rules: PEERSHARE_RULES,
        selfPeer: peerId,
        keys: selfCertifyingKeys(),
        provenPeer: (req) => lookupPeer(req) ?? ANONYMOUS,
        bootstrap: usesTransportIdentity(),
        revocation: hub.revocations,
      }),
      serveOnLimitedConnection: true,
    });

    let seen = "";
    const watch = setInterval(() => {
      // Who is a member, and who of them is online: either changing redraws the Guests list.
      const now = hub
        .meshView()
        .members.map((m) => `${m.peerId}:${m.online ? 1 : 0}`)
        .sort()
        .join(",");
      if (now !== seen) {
        seen = now;
        this.notify();
      }
    }, MEMBERS_WATCH_MS);
    this.running = { node, hub, peer, watch };
    this.peerId = peerId;
    this.notify();
    return this.state();
  }

  async stop(): Promise<SharingState> {
    const running = this.running;
    this.running = undefined;
    if (running != null) {
      clearInterval(running.watch);
      for (const step of [
        () => running.peer.stop(),
        () => running.hub.stop(),
        () => running.node.stop(),
      ]) {
        await Promise.resolve()
          .then(step)
          .catch(() => {});
      }
    }
    this.notify();
    return this.state();
  }

  /** A one-time Invite to all the Sharer's Services, valid 24 h (rungs 05, 06). */
  async invite(): Promise<{ url: string; expiresAt: number }> {
    const hub = this.required().hub;
    const { id, expiresAt } = await hub.invitations.create(["guest"], INVITE_TTL_MS);
    const url = encodeInvite(this.mesh.invitePage, {
      relayAddrs: this.mesh.relayAddrs,
      sharerPeerId: this.peerId as string,
      invitationId: id,
      sharerName: this.sharerName(),
    });
    this.lastInvite = { url, expiresAt };
    this.notify();
    return this.lastInvite;
  }

  /** The Guests who are members now, then those who left or were revoked, most recent first. */
  guests(): GuestRecord[] {
    const hub = this.running?.hub;
    const online = new Set(
      (hub?.meshView().members ?? []).filter((m) => m.online).map((m) => m.peerId),
    );
    const members: GuestRecord[] = (hub?.members.list() ?? [])
      .filter((m) => m.peerId !== this.peerId)
      .map((m) => ({
        peerId: m.peerId,
        joinedAt: m.updatedAt,
        status: online.has(m.peerId) ? "online" : "away",
      }));
    const current = new Set(members.map((m) => m.peerId));
    const departed = [...this.departed.values()]
      .filter((d) => !current.has(d.peerId))
      .sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0));
    return [...members, ...departed];
  }

  /** Guests who left or were revoked while this tab is open: the Sharer still sees them. */
  private readonly departed = new Map<string, GuestRecord>();

  /** A Guest stops being a member: revoked by the Sharer, or left by its own Close session. */
  private end(peerId: string, status: "left" | "revoked"): void {
    const hub = this.required().hub;
    const member = hub.members.list().find((m) => m.peerId === peerId);
    revokeGuest(hub, peerId);
    for (const end of this.open.get(peerId) ?? []) end();
    if (member != null) {
      this.departed.delete(peerId);
      this.departed.set(peerId, {
        peerId,
        joinedAt: member.updatedAt,
        status,
        endedAt: Date.now(),
      });
      while (this.departed.size > DEPARTED_KEPT) {
        const oldest = this.departed.keys().next().value;
        if (oldest == null) break;
        this.departed.delete(oldest);
      }
    }
    this.notify();
  }

  /**
   * Revocation is checked when a request starts; a response still streaming
   * (a Service's WebSocket or event stream over the mesh) would outlive it,
   * so the Guest's open responses are ended too (see `track`).
   */
  revoke(peerId: string): void {
    this.end(peerId, "revoked");
  }

  /** Each Guest's responses still streaming, by peer id: what `revoke` ends. */
  private readonly open = new Map<string, Set<() => void>>();

  /**
   * Wraps the `/s` mount so each response body a Guest is still reading can be
   * ended from here: the Guest sees its stream close, and cancelling the
   * Service's side closes the socket to the app.
   */
  private track(handler: FetchHandler): FetchHandler {
    return async (request) => {
      const response = await handler(request);
      const guest = lookupPeer(request);
      if (response.body == null || guest == null || guest === ANONYMOUS) return response;
      const reader = response.body.getReader();
      const ends = this.open.get(guest) ?? new Set<() => void>();
      this.open.set(guest, ends);
      let ended = false;
      const forget = () => {
        ends.delete(end);
        if (ends.size === 0) this.open.delete(guest);
      };
      let output: ReadableStreamDefaultController<Uint8Array>;
      const end = () => {
        if (ended) return;
        ended = true;
        forget();
        void reader.cancel().catch(() => {});
        output.close();
      };
      ends.add(end);
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          output = controller;
        },
        async pull(controller) {
          const { done, value } = await reader.read();
          if (ended) return;
          if (done) {
            ended = true;
            forget();
            controller.close();
          } else controller.enqueue(value);
        },
        cancel(reason) {
          ended = true;
          forget();
          return reader.cancel(reason);
        },
      });
      return new Response(body, response);
    };
  }

  private required(): Running {
    if (this.running == null) throw new Error("PeerShare is not sharing: start it first.");
    return this.running;
  }
}
