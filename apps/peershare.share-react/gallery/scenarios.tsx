/**
 * PeerShare's usage scenarios, step by step: what the person sees (a frame), what they do
 * (`play`), and the PeerShare commands the step calls in the app.
 */

import { Card } from "@statewalker/ui.view.shadcn";
import type { ReactNode } from "react";
import { HealthBadge, KindBadge, ProxyCard, type ProxyStatus } from "../src/kit/index.js";
import type { Health } from "../src/views/model.js";
import { GuestDemo, guests, PROXY, PROXY_COMMAND, SharerDemo, services } from "./demos.js";
import { click, type Play, type } from "./play.js";

export type Device = "desktop" | "phone";

export interface Frame {
  id: string;
  title: string;
  caption: string;
  /** The commands of `@statewalker/peershare.share` this step calls. */
  commands?: string[];
  device: Device;
  height?: number;
  render: () => ReactNode;
  play?: Play;
}

export interface Scenario {
  id: string;
  actor: "Sharer" | "Guest";
  title: string;
  summary: string;
  frames: Frame[];
}

const proxyStates: { status: ProxyStatus; label: string; supported?: boolean }[] = [
  { status: "unchecked", label: "Not used yet" },
  { status: "checking", label: "Calling the proxy" },
  { status: "ok", label: "Connected" },
  { status: "permission-needed", label: "Local network access blocked" },
  { status: "bridge-not-running", label: "No proxy at that address (settings open)" },
  { status: "token-rejected", label: "Wrong key (settings open)" },
  { status: "unchecked", label: "Safari", supported: false },
];

function ProxySheet() {
  return (
    <div className="bg-muted/30 grid min-h-full content-start gap-3 p-6">
      {proxyStates.map(({ status, label, supported = true }) => (
        <div key={label} className="grid gap-1.5">
          <p className="text-muted-foreground font-mono text-xs">{label}</p>
          <ProxyCard
            status={status}
            settings={PROXY}
            command={PROXY_COMMAND}
            supported={supported}
          />
        </div>
      ))}
    </div>
  );
}

function StatusSheet() {
  const healths: Health[] = ["ok", "slow", "down", "checking", "disabled"];
  return (
    <div className="bg-muted/30 grid min-h-full content-start gap-4 p-6">
      <Card className="grid gap-3 p-4">
        <p className="text-sm font-medium">Health (the Probe)</p>
        <div className="flex flex-wrap gap-2">
          {healths.map((h) => (
            <HealthBadge key={h} value={h} />
          ))}
        </div>
        <p className="text-sm font-medium">Kind (from the address)</p>
        <div className="flex flex-wrap gap-2">
          <KindBadge kind="bridged" />
          <KindBadge kind="direct" />
        </div>
      </Card>
    </div>
  );
}

const typeService =
  (name: string, target: string): Play =>
  async () => {
    await type("Name", name);
    await type("Address", target);
  };

export const scenarios: Scenario[] = [
  {
    id: "s1",
    actor: "Sharer",
    title: "Connect the local proxy",
    summary:
      "Services without CORS on this computer or its network go through the local proxy. One card says what it is for, how to start it, and whether it answers; its address and key stay in this browser.",
    frames: [
      {
        id: "s1-prompt",
        title: "First open",
        caption:
          "Nothing is called yet: the proxy is checked when its settings are saved, when a pairing link fills them in, or on the first request through it.",
        device: "desktop",
        render: () => <SharerDemo proxy="unchecked" services={[]} guests={[]} />,
      },
      {
        id: "s1-setup",
        title: "Set up",
        caption:
          "The command that starts the proxy, with a copy button, and its address and key. Saving checks it; a link printed by the proxy fills both in.",
        device: "desktop",
        render: () => <SharerDemo proxy="unchecked" services={[]} guests={[]} />,
        play: () => click("Set up"),
      },
      {
        id: "s1-states",
        title: "Every proxy state",
        caption:
          "Not used yet, checking, connected, blocked by the browser, nothing at that address, wrong key, and Safari (which cannot reach it).",
        device: "desktop",
        height: 1250,
        render: () => <ProxySheet />,
      },
    ],
  },
  {
    id: "s2",
    actor: "Sharer",
    title: "Name yourself and share the first service",
    summary:
      "With nothing shared yet, the page is the form. The address decides how the service is reached; mistakes are explained in place.",
    frames: [
      {
        id: "s2-first",
        title: "The first service",
        caption:
          "Typing http://localhost:5173 shows “reached through the local proxy”. The first service is the default.",
        commands: ["SetName", "AddService"],
        device: "desktop",
        render: () => <SharerDemo services={[]} guests={[]} />,
        play: typeService("Design review", "http://localhost:5173"),
      },
      {
        id: "s2-remote",
        title: "A remote service",
        caption:
          "An https:// address with a domain name is reached directly, and must allow calls from PeerShare.",
        device: "desktop",
        render: () => <SharerDemo services={[]} guests={[]} />,
        play: typeService("Team wiki", "https://wiki.acme.dev"),
      },
      {
        id: "s2-refused",
        title: "An address PeerShare refuses",
        caption:
          "A remote service by IP address over http is refused, with the reason and what to do instead.",
        device: "desktop",
        render: () => <SharerDemo services={[]} guests={[]} />,
        play: async () => {
          await typeService("Status page", "http://93.184.216.34")();
          await click("Share service");
        },
      },
      {
        id: "s2-checking",
        title: "Shared, and tested at once",
        caption: "Sharing a service runs the Probe through the same route guests use.",
        commands: ["AddService", "ProbeService"],
        device: "desktop",
        render: () => <SharerDemo services={[]} guests={[]} />,
        play: async () => {
          await typeService("Design review", "http://localhost:5173")();
          await click("Share service");
        },
      },
    ],
  },
  {
    id: "s3",
    actor: "Sharer",
    title: "Check that services work",
    summary:
      "Each service shows its health and how it is reached. Problems come with the fix: start it, allow PeerShare in CORS, expect slow pages.",
    frames: [
      {
        id: "s3-health",
        title: "Three services, three states",
        caption:
          "Working on this computer; slow on the network (cookies kept per guest by the proxy); a remote wiki that doesn't allow calls from PeerShare.",
        commands: ["GetSharer", "ProbeService"],
        device: "desktop",
        height: 980,
        render: () => <SharerDemo />,
      },
      {
        id: "s3-status",
        title: "Status vocabulary",
        caption: "The badges every screen uses.",
        device: "desktop",
        height: 360,
        render: () => <StatusSheet />,
      },
      {
        id: "s3-phone",
        title: "On a phone",
        caption: "The same page in one column: header, proxy, services, then guests.",
        device: "phone",
        height: 1400,
        render: () => <SharerDemo />,
      },
    ],
  },
  {
    id: "s4",
    actor: "Sharer",
    title: "Manage services",
    summary:
      "Pause with the switch; everything else is in the service's menu. Removing asks first.",
    frames: [
      {
        id: "s4-menu",
        title: "The service menu",
        caption: "Edit, test again, make default, remove.",
        commands: ["EditService", "ProbeService", "SetDefault", "RemoveService"],
        device: "desktop",
        render: () => <SharerDemo />,
        play: () => click("More for Design review"),
      },
      {
        id: "s4-edit",
        title: "Edit",
        caption: "The same form, filled in. Saving tests the service again.",
        commands: ["EditService"],
        device: "desktop",
        render: () => <SharerDemo />,
        play: async () => {
          await click("More for Grafana");
          await click("Edit");
        },
      },
      {
        id: "s4-paused",
        title: "Paused",
        caption: "Guests see “paused” for it; their invites keep working.",
        commands: ["ToggleService"],
        device: "desktop",
        render: () => <SharerDemo />,
        play: () => click("Share Grafana"),
      },
      {
        id: "s4-remove",
        title: "Remove, after a question",
        caption: "Guests stop seeing it at once; guests and invites stay.",
        commands: ["RemoveService"],
        device: "desktop",
        render: () => <SharerDemo />,
        play: async () => {
          await click("More for Team wiki");
          await click("Remove");
        },
      },
    ],
  },
  {
    id: "s5",
    actor: "Sharer",
    title: "Invite a guest",
    summary:
      "One link per person: a QR code for a phone, a link to copy, once, for 24 hours. “New link” for the next person.",
    frames: [
      {
        id: "s5-invite",
        title: "The invite",
        caption: "Invite is enabled while sharing is on and at least one service is shared.",
        commands: ["Invite"],
        device: "desktop",
        render: () => <SharerDemo />,
        play: () => click("Invite"),
      },
    ],
  },
  {
    id: "s6",
    actor: "Sharer",
    title: "See and revoke guests",
    summary:
      "Who joined, who is online now, and one action: revoke, which ends their access and live connections at once.",
    frames: [
      {
        id: "s6-guests",
        title: "Guests, live",
        caption: "Presence comes from the mesh; a guest who closes their session leaves the list.",
        commands: ["ListGuests"],
        device: "desktop",
        render: () => <SharerDemo />,
      },
      {
        id: "s6-revoke",
        title: "Revoke",
        caption: "Confirmed first, because it ends what the guest has open.",
        commands: ["RevokeGuest"],
        device: "desktop",
        render: () => <SharerDemo />,
        play: () => click("Revoke"),
      },
      {
        id: "s6-empty",
        title: "No guests yet",
        caption: "The empty list says how invites work.",
        device: "desktop",
        render: () => <SharerDemo guests={[]} services={services.slice(0, 1)} />,
      },
    ],
  },
  {
    id: "s7",
    actor: "Sharer",
    title: "Stop and resume sharing",
    summary:
      "Sharing runs in this tab. Stopping asks first and says what guests will see; they come back by themselves.",
    frames: [
      {
        id: "s7-stop",
        title: "Stop sharing?",
        caption: "Guests see the computer as offline; invites and guests are kept.",
        commands: ["StopSharing"],
        device: "desktop",
        render: () => <SharerDemo />,
        play: () => click("Stop sharing"),
      },
      {
        id: "s7-off",
        title: "Sharing is off",
        caption: "Invite is disabled until sharing starts again.",
        commands: ["StartSharing"],
        device: "desktop",
        render: () => (
          <SharerDemo
            sharing={false}
            guests={guests.map((g) => ({ ...g, status: "away" as const }))}
          />
        ),
      },
    ],
  },
  {
    id: "g1",
    actor: "Guest",
    title: "Open an invite",
    summary:
      "From a phone camera or a chat: who invites, three promises, Join or Decline. Nothing to install.",
    frames: [
      {
        id: "g1-landing",
        title: "The invite",
        caption:
          "The Sharer's name comes from the link; the promises are the product's guarantees.",
        commands: ["Join"],
        device: "phone",
        render: () => <GuestDemo />,
      },
      {
        id: "g1-joining",
        title: "Joining",
        caption:
          "Dirk's tab answers the Join; the button says who we wait for, and the line below what the join is doing (here: trying a direct connection).",
        device: "phone",
        render: () => <GuestDemo />,
        play: () => click("Join Dirk"),
      },
    ],
  },
  {
    id: "g2",
    actor: "Guest",
    title: "When the invite doesn't work",
    summary: "Each refusal says why and what to ask for.",
    frames: [
      {
        id: "g2-used",
        title: "Already used",
        caption: "Each invite admits one person.",
        device: "phone",
        render: () => <GuestDemo stage="invite-used" />,
      },
      {
        id: "g2-expired",
        title: "Expired",
        caption: "Invites work for 24 hours.",
        device: "phone",
        render: () => <GuestDemo stage="invite-expired" />,
      },
      {
        id: "g2-offline",
        title: "Dirk's computer isn't answering",
        caption: "The tab is closed or sharing is off: try again later.",
        device: "phone",
        render: () => <GuestDemo stage="machine-offline" />,
      },
      {
        id: "g2-declined",
        title: "Declined",
        caption: "Nothing was stored.",
        device: "phone",
        render: () => <GuestDemo stage="declined" />,
      },
    ],
  },
  {
    id: "g3",
    actor: "Guest",
    title: "Use the shared services",
    summary:
      "A slim bar: whose services, whether they're reachable, which one. The service fills the rest, in its own isolated origin.",
    frames: [
      {
        id: "g3-viewer",
        title: "The Viewer",
        caption:
          "Two services as tabs; the Design review dev server with live reload, over the mesh.",
        commands: ["ListSharedServices"],
        device: "desktop",
        render: () => <GuestDemo stage="joined" />,
      },
      {
        id: "g3-switch",
        title: "Another service",
        caption: "Switching tabs opens the next service in its own origin.",
        device: "desktop",
        render: () => <GuestDemo stage="joined" />,
        play: () => click("Grafana"),
      },
      {
        id: "g3-offline",
        title: "Dirk went offline",
        caption: "A banner, the page dimmed, and it reconnects by itself.",
        device: "desktop",
        render: () => <GuestDemo stage="joined" presence="offline" />,
      },
      {
        id: "g3-paused",
        title: "A paused service",
        caption: "It comes back by itself when Dirk turns it on again.",
        device: "desktop",
        render: () => (
          <GuestDemo
            stage="joined"
            tabs={[{ id: "design", name: "Design review", paused: true }]}
          />
        ),
      },
      {
        id: "g3-revoked",
        title: "Access removed",
        caption: "After a Revoke: no session controls, one sentence on what to do.",
        device: "desktop",
        render: () => <GuestDemo stage="joined" revoked />,
      },
    ],
  },
  {
    id: "g4",
    actor: "Guest",
    title: "Leave, or come back",
    summary:
      "Closing the tab keeps the Guest in (the link resumes); Close session leaves and forgets.",
    frames: [
      {
        id: "g4-close",
        title: "Close the session?",
        caption: "The difference between closing the tab and closing the session, said once.",
        commands: ["CloseSession"],
        device: "desktop",
        render: () => <GuestDemo stage="joined" />,
        play: () => click("Close session"),
      },
      {
        id: "g4-closed",
        title: "Session closed",
        caption: "Coming back needs a new invite.",
        device: "phone",
        render: () => <GuestDemo stage="closed" />,
      },
    ],
  },
];

// The tips, open: what a person reads when they wonder whether this is safe.
scenarios.push({
  id: "h1",
  actor: "Sharer",
  title: "Why it is safe, where it matters",
  summary:
    "A light ? pill sits next to every element where safety matters. It opens a short explanation of how that part is protected, with a link to the help site.",
  frames: [
    {
      id: "h1-sharing",
      title: "Shared from this tab",
      caption:
        "Next to the sharing status: who can see the services, and that no server keeps them.",
      device: "desktop",
      render: () => <SharerDemo />,
      play: () => click("How this is kept safe: Shared from this tab"),
    },
    {
      id: "h1-invite",
      title: "Invites",
      caption: "In the invite dialog: one person, once, 24 hours, and the secret after the #.",
      device: "desktop",
      render: () => <SharerDemo />,
      play: async () => {
        await click("Invite");
        await click("How this is kept safe: Invites");
      },
    },
    {
      id: "h1-guest",
      title: "Encrypted end to end",
      caption: "On the invite page: how the guest's browser knows it reached the sharer's tab.",
      device: "phone",
      render: () => <GuestDemo />,
      play: () => click("How this is kept safe: Encrypted end to end"),
    },
    {
      id: "h1-viewer",
      title: "A private, isolated page",
      caption: "In the Viewer's bar: where the pages come from, and what they cannot reach.",
      device: "desktop",
      render: () => <GuestDemo stage="joined" />,
      play: () => click("How this is kept safe: A private, isolated page"),
    },
  ],
});

export const frames: Frame[] = scenarios.flatMap((s) => s.frames);
