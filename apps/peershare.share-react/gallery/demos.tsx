/**
 * The kit's screens with state of their own, so every gallery frame can be clicked through:
 * the callbacks that call PeerShare commands in the app change local state here instead.
 */

import { useState } from "react";
import {
  GuestLanding,
  type GuestStage,
  GuestViewer,
  type Presence,
  ProxyCard,
  type ProxySettingsValue,
  type ProxyStatus,
  SharerPage,
  type ViewerTab,
} from "../src/kit/index.js";
import type { Guest, Invite, Service } from "../src/views/model.js";

export const PROXY_COMMAND =
  "curl -fsSL https://peershare.httpeers.net/proxy/peershare-proxy.sh | sh";
export const PROXY: ProxySettingsValue = { url: "http://127.0.0.1:9090", key: "" };

/** "Now" in every frame, so screenshots do not change from one run to the next. */
export const NOW = new Date("2026-11-07T10:30:00Z");

export const services: Service[] = [
  {
    id: "design",
    name: "Design review",
    kind: "bridged",
    target: "http://localhost:5173",
    enabled: true,
    isDefault: true,
    health: "ok",
    warnings: [],
  },
  {
    id: "grafana",
    name: "Grafana",
    kind: "bridged",
    target: "http://192.168.1.20:3000",
    enabled: true,
    isDefault: false,
    health: "slow",
    warnings: ["cookies-set"],
  },
  {
    id: "wiki",
    name: "Team wiki",
    kind: "direct",
    target: "https://wiki.acme.dev",
    enabled: true,
    isDefault: false,
    health: "down",
    warnings: ["cors-missing"],
  },
];

export const guests: Guest[] = [
  {
    peerId: "12D3KooWClaudia3fa9c2",
    name: "Guest 3fa9c2",
    joinedAt: new Date("2026-11-07T09:12:00Z"),
    status: "online",
  },
  {
    peerId: "12D3KooWMarta81be07",
    name: "Guest 81be07",
    joinedAt: new Date("2026-11-06T16:40:00Z"),
    status: "away",
  },
  {
    peerId: "12D3KooWJonas5d21aa",
    name: "Guest 5d21aa",
    joinedAt: new Date("2026-11-06T10:05:00Z"),
    status: "left",
    endedAt: new Date("2026-11-06T11:30:00Z"),
  },
  {
    peerId: "12D3KooWEve77c0de",
    name: "Guest 77c0de",
    joinedAt: new Date("2026-11-05T08:00:00Z"),
    status: "revoked",
    endedAt: new Date("2026-11-05T09:15:00Z"),
  },
];

const inviteFor = (n: number): Invite => ({
  url: `https://peershare.httpeers.net/peer-share/invite#join=eyJodWIiOiIxMkQzS29vV0RpcmsiLCJ0IjoiYjY0In0${n}&from=Dirk`,
  expiresAt: new Date(NOW.getTime() + 24 * 3600_000),
  used: false,
});

export interface SharerDemoProps {
  name?: string;
  sharing?: boolean;
  proxy?: ProxyStatus;
  services?: Service[];
  guests?: Guest[];
}

export function SharerDemo(props: SharerDemoProps) {
  const [name, setName] = useState(props.name ?? "Dirk");
  const [sharing, setSharing] = useState(props.sharing ?? true);
  const [proxy, setProxy] = useState<ProxyStatus>(props.proxy ?? "ok");
  const [settings, setSettings] = useState<ProxySettingsValue>(PROXY);
  const [list, setList] = useState(props.services ?? services);
  const [people, setPeople] = useState(props.guests ?? guests);
  const [invites, setInvites] = useState(0);
  const [inviteOpen, setInviteOpen] = useState(false);

  const update = (id: string, change: Partial<Service>) =>
    setList((all) => all.map((s) => (s.id === id ? { ...s, ...change } : s)));
  const probe = (id: string) => {
    update(id, { health: "checking" });
    setTimeout(() => update(id, { health: "ok", warnings: [] }), 900);
  };

  return (
    <SharerPage
      name={name}
      onNameChange={setName}
      sharing={sharing}
      onSharingChange={setSharing}
      proxy={
        <ProxyCard
          status={proxy}
          settings={settings}
          command={PROXY_COMMAND}
          supported
          onSave={(next) => {
            setSettings(next);
            setProxy("checking");
            setTimeout(() => setProxy("ok"), 1200);
          }}
          onCheck={() => {
            setProxy("checking");
            setTimeout(() => setProxy("ok"), 1200);
          }}
        />
      }
      services={list}
      guests={people}
      invite={invites > 0 ? inviteFor(invites) : undefined}
      inviteOpen={inviteOpen}
      onInviteOpenChange={setInviteOpen}
      onInvite={() => {
        setInvites((n) => n + 1);
        setInviteOpen(true);
      }}
      onAdd={(draft, kind) => {
        const id = `s${Date.now()}`;
        setList((all) => [
          ...all.map((s) => (draft.isDefault ? { ...s, isDefault: false } : s)),
          { id, ...draft, kind, enabled: true, health: "checking", warnings: [] },
        ]);
        setTimeout(() => update(id, { health: "ok" }), 900);
      }}
      onEdit={(id, draft, kind) => {
        update(id, { ...draft, kind });
        probe(id);
      }}
      onToggle={(id, enabled) => update(id, { enabled, health: enabled ? "ok" : "disabled" })}
      onProbe={probe}
      onMakeDefault={(id) => setList((all) => all.map((s) => ({ ...s, isDefault: s.id === id })))}
      onRemove={(id) => setList((all) => all.filter((s) => s.id !== id))}
      onRevoke={(peerId) => setPeople((all) => all.filter((g) => g.peerId !== peerId))}
      now={NOW}
    />
  );
}

// ——— A stand-in for a shared service, as the Viewer frames it ——————————————

export function StandInService({ service }: { service: ViewerTab }) {
  if (service.id === "grafana") {
    return (
      <div className="grid flex-1 content-start gap-4 bg-zinc-950 p-6 text-zinc-100">
        <p className="text-sm font-medium text-zinc-400">Grafana · Home lab</p>
        <div className="grid grid-cols-3 gap-4">
          {["CPU 23%", "Memory 61%", "Requests 1.2k/min"].map((t) => (
            <div key={t} className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
              <p className="text-xs text-zinc-400">{t.split(" ")[0]}</p>
              <p className="mt-1 text-2xl font-semibold">{t.split(" ").slice(1).join(" ")}</p>
              <div className="mt-3 flex h-10 items-end gap-1">
                {[4, 7, 5, 8, 6, 9, 7, 10, 8, 6].map((h, i) => (
                  <span
                    key={i}
                    className="w-full rounded-sm bg-emerald-500/70"
                    style={{ height: `${h * 10}%` }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="grid flex-1 content-start gap-5 bg-white p-8 text-zinc-900">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium tracking-wide text-violet-600 uppercase">
            localhost:5173
          </p>
          <h1 className="text-2xl font-bold">Onboarding redesign</h1>
        </div>
        <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-medium text-violet-700">
          Live reload connected
        </span>
      </div>
      <div className="grid grid-cols-3 gap-4">
        {["Welcome", "Pick a workspace", "Invite your team"].map((t, i) => (
          <div key={t} className="rounded-xl border border-zinc-200 p-4 shadow-sm">
            <div className="mb-3 h-24 rounded-lg bg-gradient-to-br from-violet-100 to-sky-100" />
            <p className="text-xs text-zinc-500">Step {i + 1}</p>
            <p className="font-medium">{t}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

const viewerTabs: ViewerTab[] = [
  { id: "design", name: "Design review", paused: false },
  { id: "grafana", name: "Grafana", paused: false },
];

export interface GuestDemoProps {
  stage?: GuestStage | "joined";
  /** What Join answers: joined, or a refusal. */
  answer?: GuestStage | "joined";
  tabs?: ViewerTab[];
  presence?: Presence;
  revoked?: boolean;
}

export function GuestDemo(props: GuestDemoProps) {
  const [stage, setStage] = useState(props.stage ?? "invite");
  const [selected, setSelected] = useState((props.tabs ?? viewerTabs)[0]?.id ?? "");
  if (stage !== "joined") {
    return (
      <GuestLanding
        sharerName="Dirk"
        stage={stage}
        connecting={stage === "joining" ? "direct" : undefined}
        onJoin={() => {
          setStage("joining");
          setTimeout(() => setStage(props.answer ?? "joined"), 1200);
        }}
        onDecline={() => setStage("declined")}
      />
    );
  }
  return (
    <GuestViewer
      sharerName="Dirk"
      services={props.tabs ?? viewerTabs}
      selected={selected}
      presence={props.presence ?? "online"}
      revoked={props.revoked}
      onSelect={setSelected}
      onCloseSession={() => setStage("closed")}
      renderService={(s) => <StandInService service={s} />}
    />
  );
}
