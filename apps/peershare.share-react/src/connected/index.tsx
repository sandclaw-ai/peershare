/**
 * The screens, wired: they read PeerShare's model (`peershare:model`) and act
 * only through its commands. Nothing here knows about the mesh.
 */

import type { CatalogEntry } from "@statewalker/httpeers-share";
import {
  AddService,
  type AppRuntime,
  CloseSession,
  EditService,
  GetDiagnostics,
  Invite,
  Join,
  ListSharedServices,
  type PeerShareModel,
  type PeerShareSnapshot,
  ProbeService,
  peershareModelSlot,
  RemoveService,
  RevokeGuest,
  SetDefault,
  SetName,
  StartSharing,
  StopSharing,
  ToggleService,
} from "@statewalker/peershare.share";
import type { CommandDeclaration } from "@statewalker/shared-commands";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import { GuestLanding, type GuestStage, GuestViewer, type ViewerTab } from "../kit/guest.js";
import { SharerPage } from "../kit/sharer-page.js";
import type { Guest, Service } from "../views/model.js";

const Runtime = createContext<AppRuntime | null>(null);

export function PeerShareProvider({ rt, children }: { rt: AppRuntime; children: ReactNode }) {
  return <Runtime.Provider value={rt}>{children}</Runtime.Provider>;
}

function useRuntime(): AppRuntime {
  const rt = useContext(Runtime);
  if (rt == null) throw new Error("PeerShare's views need <PeerShareProvider rt={…}> around them.");
  return rt;
}

/** PeerShare's model, as provided on the runtime's `peershare:model` slot. */
function useModel(): PeerShareModel {
  const rt = useRuntime();
  const [model] = useState(() => {
    let found: PeerShareModel | undefined;
    rt.slots.observe(peershareModelSlot, (values) => {
      found = values[0];
    })();
    if (found == null) throw new Error("PeerShare is not contributed to this runtime.");
    return found;
  });
  return model;
}

export function usePeerShare(): PeerShareSnapshot {
  const model = useModel();
  return useSyncExternalStore(model.subscribe, model.getSnapshot);
}

/** Calls a command. Stable per runtime: effects may depend on it without re-running each render. */
function useCall() {
  const rt = useRuntime();
  return useCallback(
    <P, R>(decl: CommandDeclaration<P, R>, payload: P) => rt.commands.call(decl, payload).promise,
    [rt],
  );
}

/** The logic's Service, as the screens draw it. */
function toView(s: PeerShareSnapshot["sharer"]["services"][number]): Service {
  const warnings: Service["warnings"] = [...(s.warnings ?? [])];
  if (
    s.cause === "cors-missing" ||
    s.cause === "permission-needed" ||
    s.cause === "permission-unanswered"
  )
    warnings.push(s.cause);
  return {
    id: s.id,
    name: s.name,
    kind: s.kind === "direct" ? "direct" : "bridged",
    target: s.target,
    enabled: s.enabled,
    isDefault: s.isDefault,
    health: s.enabled ? (s.health ?? "checking") : "disabled",
    warnings,
    ...(s.allowFraming === true ? { allowFraming: true } : {}),
  };
}

export interface SharerScreenProps {
  /** The local proxy's card (`ProxyCard`): the page that knows the proxy draws it. */
  proxy?: ReactNode;
}

/** The Sharer's page (scenarios S1–S7). */
export function SharerScreen({ proxy }: SharerScreenProps = {}) {
  const snapshot = usePeerShare();
  const call = useCall();
  const [inviteOpen, setInviteOpen] = useState(false);
  const services = snapshot.sharer.services;

  // The hub's view of each Guest: online or away from its heartbeats, or left / revoked.
  const guests: Guest[] = snapshot.guests.map((g) => ({
    peerId: g.peerId,
    name: `Guest ${g.peerId.slice(-6)}`,
    joinedAt: new Date(g.joinedAt),
    status: g.status,
    ...(g.endedAt != null ? { endedAt: new Date(g.endedAt) } : {}),
  }));

  return (
    <SharerPage
      name={snapshot.sharer.name}
      onNameChange={(name) => void call(SetName, { name })}
      sharing={snapshot.sharing.sharing}
      onSharingChange={(on) => void call(on ? StartSharing : StopSharing, undefined)}
      proxy={proxy}
      services={services.map(toView)}
      guests={guests}
      invite={
        snapshot.invite != null
          ? {
              url: snapshot.invite.url,
              expiresAt: new Date(snapshot.invite.expiresAt),
              used: false,
            }
          : undefined
      }
      inviteOpen={inviteOpen && snapshot.invite != null}
      onInviteOpenChange={setInviteOpen}
      onInvite={async () => {
        await call(Invite, undefined);
        setInviteOpen(true);
      }}
      diagnostics={() => call(GetDiagnostics, undefined)}
      onAdd={(draft, kind) => void call(AddService, { ...draft, kind })}
      onEdit={(id, draft, kind) => void call(EditService, { id, draft: { ...draft, kind } })}
      onToggle={(id, enabled) => void call(ToggleService, { id, enabled })}
      onProbe={(id) => void call(ProbeService, { id })}
      onMakeDefault={(id) => void call(SetDefault, { id })}
      onRemove={(id) => void call(RemoveService, { id })}
      onRevoke={(peerId) => void call(RevokeGuest, { peerId })}
    />
  );
}

export interface GuestScreenProps {
  /** The invite link this page was opened with. */
  link: string;
  /** The Sharer's name as the link states it, shown before joining. */
  sharerName: string;
  /** What the frame shows for a Service: in the page, its isolated session origin. */
  frameFor?: (service: ViewerTab) => { src?: string; srcDoc?: string };
}

/** A Guest's page (scenarios G1–G4): the invite and its outcomes, then the Viewer. */
export function GuestScreen({ link, sharerName, frameFor }: GuestScreenProps) {
  const { guest } = usePeerShare();
  const call = useCall();
  const [joining, setJoining] = useState(false);
  // What the last Join answered when it did not get in: the hub's refusal or
  // an unreachable Sharer. The Guest's state stays "no-link" then, so without
  // this the page would show the Join button again and nothing else.
  const [refused, setRefused] = useState<GuestStage>();
  // The refuser's own words for the last failed join (`GuestState.problem`).
  const [problem, setProblem] = useState<string>();
  const [declined, setDeclined] = useState(false);
  const [closed, setClosed] = useState(false);
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [selected, setSelected] = useState<string>();

  const revoked = guest.stage === "revoked";
  // Revoked is shown in the Viewer, in place of the service: the Guest was in it.
  const joined = guest.stage === "joined" || guest.stage === "machine-offline" || revoked;
  // The Sharer's list changed (added, renamed, paused…): the Guest's watch moved the version.
  const catalogVersion = guest.catalogVersion ?? 0;
  const stageNow = guest.stage;
  useEffect(() => {
    void catalogVersion;
    void stageNow;
    if (!joined || revoked) return;
    void call(ListSharedServices, undefined).then((entries) => {
      setCatalog(entries);
      setSelected((current) => current ?? entries.find((e) => e.isDefault)?.id ?? entries[0]?.id);
    });
    // The stage too: back from machine-offline, the list may have changed or been empty.
  }, [joined, revoked, call, catalogVersion, stageNow]);

  // A tab in the background shows it in its title too.
  useEffect(() => {
    if (!revoked) return;
    const before = document.title;
    document.title = `Access removed · ${before}`;
    return () => {
      document.title = before;
    };
  }, [revoked]);

  const name = guest.sharerName ?? sharerName;
  // PeerShare's sharing page sits beside the invite page: `/invite` → `/`,
  // `/peer-share/invite` → `/peer-share/`.
  const shareHref = (() => {
    try {
      return new URL(link).pathname.replace(/invite\/?$/, "") || "/";
    } catch {
      return "/";
    }
  })();

  if (!joined) {
    const stage: GuestStage = closed
      ? "closed"
      : declined
        ? "declined"
        : joining || guest.connecting != null
          ? "joining"
          : guest.stage !== "no-link"
            ? (guest.stage as GuestStage) // not joined here: see `joined` above
            : (refused ?? "invite");
    return (
      <GuestLanding
        sharerName={name}
        stage={stage}
        connecting={guest.connecting}
        shareHref={shareHref}
        problem={problem ?? guest.problem}
        diagnostics={() => call(GetDiagnostics, undefined)}
        onJoin={async () => {
          setJoining(true);
          const answer = await call(Join, { link });
          setRefused(answer.stage === "joined" ? undefined : (answer.stage as GuestStage));
          setProblem(answer.stage === "joined" ? undefined : answer.problem);
          setJoining(false);
        }}
        onDecline={() => setDeclined(true)}
      />
    );
  }

  const services: ViewerTab[] = catalog.map((c) => ({ id: c.id, name: c.name, paused: c.paused }));
  return (
    <GuestViewer
      sharerName={name}
      services={services}
      selected={selected ?? services[0]?.id ?? ""}
      presence={guest.stage === "machine-offline" ? "offline" : "online"}
      revoked={revoked}
      shareHref={shareHref}
      onSelect={setSelected}
      onCloseSession={async () => {
        await call(CloseSession, undefined);
        setClosed(true);
      }}
      renderService={(service) => (
        <iframe
          title={`${service.name}, shared by ${name}`}
          className="w-full flex-1 border-0"
          // A srcdoc frame shares this page's origin: static text only, never the
          // Sharer's words (a Service name is theirs to choose).
          {...(frameFor?.(service) ?? {
            srcDoc: `<!doctype html><p style="font-family:system-ui;margin:2rem">Opening…</p>`,
          })}
        />
      )}
    />
  );
}
