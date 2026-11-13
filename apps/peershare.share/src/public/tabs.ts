/**
 * One PeerShare hub however many tabs show it.
 *
 * Every tab of the Sharer's page has the same identity (the key in IndexedDB).
 * Two hubs with one identity answer the relay in turn, each with its own
 * Invites in memory: a Guest reaching the "other" tab is refused an Invite it
 * never made (`invitation not-found`), and the two overwrite each other's
 * saved members. So exactly one tab, the leader, runs the hub, held by a Web
 * Lock; every other tab, a follower, shows the leader's snapshot and sends its
 * commands to the leader over a BroadcastChannel. When the leader's tab
 * closes, its lock passes to a follower, which starts the hub from the same
 * storage, and shares again if the leader was sharing.
 *
 * The page sees one Feature either way: the same commands, and one model that
 * never changes identity (views read it once).
 */

import type { CommandDeclaration } from "@statewalker/shared-commands";
import {
  AddService,
  EditService,
  GetDiagnostics,
  GetSharer,
  GetSharing,
  Invite,
  ListGuests,
  ProbeService,
  RemoveService,
  RevokeGuest,
  SetDefault,
  SetName,
  StartSharing,
  StopSharing,
  ToggleService,
} from "./commands.js";
import {
  type PeerShareModel,
  type PeerShareSnapshot,
  peershareModelSlot,
} from "./extension-points.js";
import { handle, type PeerShareInit, peershare } from "./feature.js";
import { type AppRuntime, createRuntime, type Feature } from "./suite.js";

/** What the Sharer's page calls: each runs on the leader, wherever it was called. */
const SHARER_COMMANDS: CommandDeclaration<never, unknown>[] = [
  SetName,
  AddService,
  EditService,
  RemoveService,
  ToggleService,
  SetDefault,
  ProbeService,
  GetSharer,
  StartSharing,
  StopSharing,
  GetSharing,
  Invite,
  ListGuests,
  RevokeGuest,
  GetDiagnostics,
] as never;

export type TabRole = "leader" | "follower";

/** A message bus between the tabs of one origin; a tab does not hear its own posts. */
export interface TabChannel {
  post(message: TabMessage): void;
  listen(onMessage: (message: TabMessage) => void): () => void;
  close(): void;
}

export interface TabCoordination {
  channel(name: string): TabChannel;
  /** Runs `lead` once this tab holds the lock `name`, and holds it until `lead` settles. */
  lock(name: string, lead: () => Promise<void>): void;
}

export type TabMessage =
  | { t: "hello"; from: string }
  | { t: "leader"; from: string }
  | { t: "snapshot"; from: string; snapshot: PeerShareSnapshot }
  | { t: "call"; from: string; id: number; key: string; payload: unknown }
  | { t: "result"; to: string; id: number; ok: true; value: unknown }
  | { t: "result"; to: string; id: number; ok: false; error: string };

/** BroadcastChannel and Web Locks; without Web Locks every tab leads, as before. */
export function browserTabs(): TabCoordination {
  return {
    channel(name) {
      const channel = new BroadcastChannel(name);
      return {
        post: (message) => channel.postMessage(message),
        listen(onMessage) {
          const handler = (event: MessageEvent) => onMessage(event.data as TabMessage);
          channel.addEventListener("message", handler);
          return () => channel.removeEventListener("message", handler);
        },
        close: () => channel.close(),
      };
    },
    lock(name, lead) {
      const locks = (globalThis.navigator as Navigator | undefined)?.locks;
      if (locks == null) void lead();
      else void locks.request(name, lead);
    },
  };
}

export interface SharedAcrossTabsInit {
  coordination?: TabCoordination;
  /** The lock's and the channel's name: one hub per name. */
  name?: string;
  /** Told when this tab starts or stops leading. */
  onRole?: (role: TabRole) => void;
}

const EMPTY: PeerShareSnapshot = {
  sharer: { name: "", services: [] },
  sharing: { sharing: false },
  guests: [],
  guest: { stage: "no-link" },
};

/** PeerShare for the Sharer's page, with one hub across all its tabs. */
export function sharedAcrossTabs(init: PeerShareInit, opts: SharedAcrossTabsInit = {}): Feature {
  return {
    id: "peershare",
    label: "PeerShare",
    contribute(rt) {
      const coordination = opts.coordination ?? browserTabs();
      const name = opts.name ?? "peershare-hub";
      const self = Math.random().toString(36).slice(2);
      const channel = coordination.channel(name);
      const log = init.log;
      const byKey = new Map(SHARER_COMMANDS.map((d) => [d.key, d]));

      const model = new TabModel(EMPTY);
      let role: TabRole = "follower";
      let leader: { rt: AppRuntime; dispose(): void } | undefined;
      let release: () => void = () => {};
      let disposed = false;
      // The last snapshot a follower saw: whether to share again on taking over.
      let wasSharing = false;

      let nextId = 0;
      const pending = new Map<
        number,
        {
          decl: CommandDeclaration<never, unknown>;
          payload: unknown;
          resolve(v: unknown): void;
          reject(e: Error): void;
        }
      >();
      const runHere = (decl: CommandDeclaration<never, unknown>, payload: unknown) =>
        (leader as { rt: AppRuntime }).rt.commands.call(decl, payload as never).promise;
      const send = (id: number) => {
        const call = pending.get(id);
        if (call != null)
          channel.post({ t: "call", from: self, id, key: call.decl.key, payload: call.payload });
      };
      const dispatch = (decl: CommandDeclaration<never, unknown>, payload: unknown) => {
        if (leader != null) return runHere(decl, payload);
        return new Promise((resolve, reject) => {
          const id = nextId++;
          pending.set(id, { decl, payload, resolve, reject });
          // No leader yet answers nothing: the call waits for one (or for this tab to lead).
          send(id);
        });
      };

      const stopListening = channel.listen((message) => {
        if (message.t === "snapshot" && role === "follower") {
          wasSharing = message.snapshot.sharing.sharing;
          model.set(message.snapshot);
        } else if (message.t === "leader" && role === "follower") {
          log?.info("tabs: another tab runs the hub");
          // A leader that closed mid-call never answered: ask the new one.
          for (const id of pending.keys()) send(id);
        } else if (message.t === "hello" && leader != null) {
          channel.post({ t: "snapshot", from: self, snapshot: model.getSnapshot() });
        } else if (message.t === "call" && leader != null) {
          const decl = byKey.get(message.key);
          const answer = (r: { ok: true; value: unknown } | { ok: false; error: string }) =>
            channel.post({ t: "result", to: message.from, id: message.id, ...r });
          if (decl == null) return answer({ ok: false, error: `Unknown command ${message.key}` });
          runHere(decl, message.payload).then(
            (value) => answer({ ok: true, value }),
            (error: unknown) =>
              answer({ ok: false, error: error instanceof Error ? error.message : String(error) }),
          );
        } else if (message.t === "result" && message.to === self) {
          const call = pending.get(message.id);
          if (call == null) return;
          pending.delete(message.id);
          if (message.ok) call.resolve(message.value);
          else call.reject(new Error(message.error));
        }
      });

      const lead = async () => {
        if (disposed) return;
        const inner = createRuntime();
        const disposeInner = peershare(init).contribute(inner);
        let innerModel: PeerShareModel | undefined;
        inner.slots.observe(peershareModelSlot, (values) => {
          innerModel = values[0];
        })();
        if (innerModel == null) throw new Error("PeerShare did not provide its model.");
        const source = innerModel;
        const publish = () => {
          model.set(source.getSnapshot());
          channel.post({ t: "snapshot", from: self, snapshot: source.getSnapshot() });
        };
        const stopPublishing = source.subscribe(publish);
        leader = {
          rt: inner,
          dispose: () => {
            stopPublishing();
            disposeInner();
          },
        };
        role = "leader";
        log?.info("tabs: this tab runs the hub");
        opts.onRole?.("leader");
        channel.post({ t: "leader", from: self });
        publish();
        // Calls that waited for a leader run here now.
        for (const [id, call] of [...pending]) {
          pending.delete(id);
          runHere(call.decl, call.payload).then(call.resolve, call.reject);
        }
        // Took over from a tab that was sharing: share again, as it did.
        if (wasSharing) void runHere(StartSharing as never, undefined).catch(() => {});
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      };
      // A follower until the lock says otherwise (a lock may be granted at once).
      opts.onRole?.("follower");
      channel.post({ t: "hello", from: self });
      coordination.lock(name, lead);

      const stopHandling = SHARER_COMMANDS.map((decl) =>
        handle(rt, decl, (payload) => dispatch(decl, payload)),
      );
      const stopModel = rt.slots.provide(peershareModelSlot, model);

      return () => {
        disposed = true;
        for (const stop of stopHandling) stop();
        stopModel();
        stopListening();
        for (const call of pending.values()) call.reject(new Error("The page is closing."));
        pending.clear();
        leader?.dispose();
        leader = undefined;
        channel.close();
        // Last: the next tab may lead only once this one has let go of the hub.
        release();
      };
    },
  };
}

/** One model for the page's lifetime, fed by whichever tab leads. */
class TabModel implements PeerShareModel {
  private readonly listeners = new Set<() => void>();
  constructor(private snapshot: PeerShareSnapshot) {}
  getSnapshot = (): PeerShareSnapshot => this.snapshot;
  subscribe = (onChange: () => void): (() => void) => {
    this.listeners.add(onChange);
    return () => this.listeners.delete(onChange);
  };
  set(snapshot: PeerShareSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of [...this.listeners]) listener();
  }
}
