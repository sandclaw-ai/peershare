import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button,
  Card,
  cn,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@statewalker/ui.view.shadcn";
import {
  Ban,
  Clock,
  Globe,
  Link2Off,
  Loader2,
  Lock,
  LogOut,
  MonitorX,
  PauseCircle,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  WifiOff,
} from "lucide-react";
import type { ReactNode } from "react";
import { DiagnosticsButton } from "./diagnostics.js";
import { HelpTip } from "./help-tip.js";
import { Alert, AlertDescription } from "./primitives.js";
import {
  BrandMark,
  HelpLink,
  NameAvatar,
  type Presence,
  PresenceDot,
  ShareYourOwnLink,
} from "./status.js";

// ——— Before joining (scenarios G1, G2) ———————————————————————————————————

/** Where the Guest is before the Viewer: the invite, waiting, or the Sharer's answer. */
export type GuestStage =
  | "invite"
  | "joining"
  | "invite-used"
  | "invite-expired"
  | "machine-offline"
  | "invite-unknown"
  | "join-failed"
  | "declined"
  | "closed";

export interface GuestLandingProps {
  sharerName: string;
  stage: GuestStage;
  /** `Join`. */
  onJoin?: () => void;
  onDecline?: () => void;
  /** PeerShare's sharing page, for a Guest to share their own services (`/` by default). */
  shareHref?: string;
  /** While `joining`: what the join is doing now (`GuestState.connecting`). */
  connecting?: "relay" | "direct" | "joining";
  /** Why the last join did not get in, in the words of whoever refused (`GuestState.problem`). */
  problem?: string;
  /** `GetDiagnostics`: shown as "Copy diagnostics" wherever a join did not get in. */
  diagnostics?: () => Promise<string>;
}

/** What went wrong, in the refuser's own words, and the page's log to send to whoever helps. */
function Details({
  problem,
  diagnostics,
}: {
  problem?: string;
  diagnostics?: () => Promise<string>;
}) {
  if (problem == null && diagnostics == null) return null;
  return (
    <div className="grid justify-items-center gap-1">
      {problem != null && (
        <details className="w-full text-left">
          <summary className="text-muted-foreground cursor-pointer text-xs">What happened</summary>
          <p className="bg-muted mt-1 rounded-md p-2 font-mono text-[11px] break-words">
            {problem}
          </p>
        </details>
      )}
      {diagnostics != null && <DiagnosticsButton load={diagnostics} />}
    </div>
  );
}

/** What a join is doing, in words: a direct connection can take seconds before the relay steps in. */
const connectingText = {
  relay: "Reaching the relay…",
  direct: "Trying a direct connection… This can take a few seconds on some networks.",
  joining: "Connected. Joining…",
} as const;

function Centered({ children, shareHref }: { children: ReactNode; shareHref?: string }) {
  return (
    <div className="bg-muted/30 flex min-h-full flex-col">
      <header className="flex items-center justify-between gap-2 px-6 py-4">
        <BrandMark />
        <span className="flex items-center gap-1">
          <ShareYourOwnLink href={shareHref} />
          <HelpLink />
        </span>
      </header>
      <main className="grid flex-1 place-items-center px-4 pb-16">{children}</main>
    </div>
  );
}

function Outcome({
  icon,
  tone = "muted",
  title,
  children,
}: {
  icon: ReactNode;
  tone?: "muted" | "warn" | "error";
  title: string;
  children: ReactNode;
}) {
  return (
    <Card className="grid w-full max-w-sm justify-items-center gap-3 p-8 text-center">
      <span
        className={cn(
          "inline-flex size-12 items-center justify-center rounded-full [&>svg]:size-5",
          tone === "muted" && "bg-muted text-muted-foreground",
          tone === "warn" && "bg-warning/15",
          tone === "error" && "bg-destructive/10 text-destructive",
        )}
      >
        {icon}
      </span>
      <h1 className="text-lg font-semibold">{title}</h1>
      <div className="text-muted-foreground grid gap-3 text-sm">{children}</div>
    </Card>
  );
}

export function GuestLanding({
  sharerName,
  stage,
  onJoin,
  onDecline,
  shareHref,
  connecting,
  problem,
  diagnostics,
}: GuestLandingProps) {
  const name = sharerName || "Someone";
  const details = <Details problem={problem} diagnostics={diagnostics} />;
  if (stage === "invite-used")
    return (
      <Centered shareHref={shareHref}>
        <Outcome icon={<Link2Off />} tone="warn" title="This invite was already used">
          <p>Each invite admits one person. Ask {name} for a new link.</p>
          {details}
        </Outcome>
      </Centered>
    );
  if (stage === "invite-expired")
    return (
      <Centered shareHref={shareHref}>
        <Outcome icon={<Clock />} tone="warn" title="This invite has expired">
          <p>Invites work for 24 hours. Ask {name} for a new link.</p>
          {details}
        </Outcome>
      </Centered>
    );
  if (stage === "invite-unknown")
    return (
      <Centered shareHref={shareHref}>
        <Outcome
          icon={<Link2Off />}
          tone="warn"
          title={`${name}'s PeerShare doesn't know this invite`}
        >
          <p>
            {name}'s computer answered, but not with this invite: it was made before PeerShare was
            reset there, or in a PeerShare that has since been closed. Ask {name} for a new link.
          </p>
          {details}
        </Outcome>
      </Centered>
    );
  if (stage === "declined")
    return (
      <Centered shareHref={shareHref}>
        <Outcome icon={<Ban />} title={`You declined ${name}'s invite`}>
          <p>Nothing was stored in this browser. You can close this tab.</p>
        </Outcome>
      </Centered>
    );
  if (stage === "closed")
    return (
      <Centered shareHref={shareHref}>
        <Outcome icon={<LogOut />} title="Session closed">
          <p>
            This browser no longer has access to {name}'s services. To come back, ask {name} for a
            new invite.
          </p>
        </Outcome>
      </Centered>
    );

  const joining = stage === "joining";
  const offline = stage === "machine-offline";
  const failed = stage === "join-failed";
  return (
    <Centered shareHref={shareHref}>
      <Card className="grid w-full max-w-sm gap-5 p-6">
        <div className="grid justify-items-center gap-3 text-center">
          <NameAvatar name={name} className="size-14 text-base" />
          <div className="grid gap-1">
            <h1 className="text-xl font-semibold tracking-tight">{name} invited you</h1>
            <p className="text-muted-foreground text-sm">
              to see the services they share from their computer.
            </p>
          </div>
        </div>
        {offline && (
          <Alert variant="warning">
            <WifiOff />
            <AlertDescription>
              {name}'s computer isn't answering. Ask {name} to keep PeerShare open, then try again.
            </AlertDescription>
          </Alert>
        )}
        {failed && (
          <Alert variant="warning">
            <ShieldAlert />
            <AlertDescription>
              {name}'s computer answered, but did not let you in. Try again, or ask {name} for a new
              link.
            </AlertDescription>
          </Alert>
        )}
        {(offline || failed) && details}
        <ul className="text-muted-foreground grid gap-2 text-sm">
          <li className="flex items-center gap-2.5">
            <Sparkles className="size-4 shrink-0" /> Nothing to install: it opens in this browser.
          </li>
          <li className="flex items-center gap-2.5">
            <Lock className="size-4 shrink-0" /> End-to-end encrypted, even on public Wi-Fi.
            <HelpTip title="Encrypted end to end" help="security#encryption">
              <p>
                The link carries the key of the browser that created it, and the connection proves
                it reached that browser.
              </p>
              <p>The relay that helps you connect only forwards bytes it cannot read.</p>
            </HelpTip>
          </li>
          <li className="flex items-center gap-2.5">
            <Globe className="size-4 shrink-0" /> Each service opens in its own isolated page.
          </li>
        </ul>
        <div className="grid gap-2">
          <Button size="lg" disabled={joining} onClick={onJoin}>
            {joining ? (
              <>
                <Loader2 className="animate-spin" /> Waiting for {name}…
              </>
            ) : offline || failed ? (
              <>
                <RefreshCw /> Try again
              </>
            ) : (
              `Join ${name}`
            )}
          </Button>
          {!(joining && connecting != null) && (
            <Button variant="ghost" disabled={joining} onClick={onDecline}>
              Decline
            </Button>
          )}
          {/* Mounted empty, so screen readers announce each step as it appears. */}
          <p
            className={cn(
              "text-muted-foreground text-center text-xs leading-relaxed",
              joining && connecting != null ? "min-h-9" : "sr-only",
            )}
            role="status"
          >
            {joining && connecting != null ? connectingText[connecting] : ""}
          </p>
        </div>
      </Card>
    </Centered>
  );
}

// ——— The Viewer (scenarios G3, G4) ————————————————————————————————————————

export interface ViewerTab {
  id: string;
  name: string;
  paused: boolean;
}

export interface GuestViewerProps {
  sharerName: string;
  services: ViewerTab[];
  selected: string;
  presence: Presence;
  /** The Sharer revoked this Guest. */
  revoked?: boolean;
  onSelect?: (id: string) => void;
  /** `CloseSession`. */
  onCloseSession?: () => void;
  /** The selected service itself: the isolated session's iframe in the app, a stand-in here. */
  renderService?: (service: ViewerTab) => ReactNode;
  /** PeerShare's sharing page, for a Guest to share their own services (`/` by default). */
  shareHref?: string;
}

function Notice({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="grid flex-1 place-content-center justify-items-center gap-2 p-8 text-center">
      <span className="bg-muted text-muted-foreground mb-1 inline-flex size-12 items-center justify-center rounded-full [&>svg]:size-5">
        {icon}
      </span>
      <p className="font-medium">{title}</p>
      <p className="text-muted-foreground max-w-sm text-sm">{children}</p>
    </div>
  );
}

export function GuestViewer({
  sharerName,
  services,
  selected,
  presence,
  revoked = false,
  onSelect,
  onCloseSession,
  renderService = () => null,
  shareHref,
}: GuestViewerProps) {
  const service = services.find((s) => s.id === selected) ?? services[0];
  let body: ReactNode;
  if (revoked) {
    body = (
      <Notice icon={<Ban />} title={`${sharerName} removed your access`}>
        Their services are no longer open to this browser. Ask {sharerName} for a new invite if you
        need them again.
      </Notice>
    );
  } else if (service == null) {
    body = (
      <Notice icon={<MonitorX />} title={`${sharerName} isn't sharing anything right now`}>
        Their services appear here as soon as they share one.
      </Notice>
    );
  } else if (service.paused) {
    body = (
      <Notice icon={<PauseCircle />} title={`${sharerName} paused ${service.name}`}>
        It comes back here by itself when {sharerName} turns it on again.
      </Notice>
    );
  } else {
    body = (
      <div className={cn("flex flex-1 flex-col", presence === "offline" && "opacity-50")}>
        {renderService(service)}
      </div>
    );
  }

  const tabbed = !revoked && services.length > 1 && service != null;
  // The services are Tabs: the list in the bar controls the panel below it.
  return (
    <Tabs
      value={service?.id ?? ""}
      onValueChange={(id) => onSelect?.(id)}
      className="bg-background flex h-full min-h-0 flex-col"
    >
      <header className="flex items-center gap-3 border-b px-3 py-2">
        <BrandMark compact className="text-sm [&>span:first-child]:size-6" />
        <span className="bg-border h-5 w-px max-sm:hidden" />
        <span className="flex shrink-0 items-center gap-2 text-sm">
          <PresenceDot value={revoked ? "offline" : presence} />
          <span className="max-w-32 truncate font-medium sm:max-w-48">{sharerName}</span>
          {!revoked && (
            <HelpTip title="A private, isolated page" help="security#isolation">
              <p>
                {service?.name ?? "This service"} comes from {sharerName}'s computer, encrypted end
                to end, to people {sharerName} invited.
              </p>
              <p>
                It runs in its own isolated page, so it cannot read your PeerShare key, token or
                other services.
              </p>
            </HelpTip>
          )}
        </span>
        {tabbed && (
          <TabsList className="ml-2 h-8 max-w-full min-w-0 overflow-x-auto">
            {services.map((s) => (
              <TabsTrigger key={s.id} value={s.id} className="gap-1.5 text-xs">
                {s.paused && <PauseCircle className="size-3" />}
                {s.name}
              </TabsTrigger>
            ))}
          </TabsList>
        )}
        <span className="flex-1" />
        <ShareYourOwnLink href={shareHref} />
        {!revoked && <CloseSessionButton sharerName={sharerName} onClose={onCloseSession} />}
      </header>
      {presence === "offline" && !revoked && (
        <div className="border-warning/50 bg-warning/10 flex items-center gap-2 border-b px-4 py-2 text-sm">
          <WifiOff className="size-4 shrink-0" />
          {sharerName}'s computer isn't answering. This page reconnects by itself.
        </div>
      )}
      {presence === "connecting" && !revoked && (
        <div className="text-muted-foreground flex items-center gap-2 border-b px-4 py-2 text-sm">
          <Loader2 className="size-4 animate-spin" /> Reconnecting to {sharerName}…
        </div>
      )}
      {tabbed ? (
        <TabsContent value={service.id} className="mt-0 flex flex-1 flex-col">
          {body}
        </TabsContent>
      ) : (
        body
      )}
    </Tabs>
  );
}

function CloseSessionButton({ sharerName, onClose }: { sharerName: string; onClose?: () => void }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="ghost">
          <LogOut />
          <span className="max-sm:sr-only">Close session</span>
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Close the session?</AlertDialogTitle>
          <AlertDialogDescription>
            You leave {sharerName}'s services and this browser forgets the invite: coming back needs
            a new one. Just closing the tab keeps you in.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Stay</AlertDialogCancel>
          <AlertDialogAction onClick={onClose}>Close and forget</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
