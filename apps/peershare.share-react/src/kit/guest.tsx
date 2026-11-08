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
  Sparkles,
  WifiOff,
} from "lucide-react";
import type { ReactNode } from "react";
import { Alert, AlertDescription } from "./primitives.js";
import { BrandMark, NameAvatar, type Presence, PresenceDot } from "./status.js";

// ——— Before joining (scenarios G1, G2) ———————————————————————————————————

/** Where the Guest is before the Viewer: the invite, waiting, or the Sharer's answer. */
export type GuestStage =
  | "invite"
  | "joining"
  | "invite-used"
  | "invite-expired"
  | "machine-offline"
  | "declined"
  | "closed";

export interface GuestLandingProps {
  sharerName: string;
  stage: GuestStage;
  /** `Join`. */
  onJoin?: () => void;
  onDecline?: () => void;
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="bg-muted/30 flex min-h-full flex-col">
      <header className="px-6 py-4">
        <BrandMark />
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

export function GuestLanding({ sharerName, stage, onJoin, onDecline }: GuestLandingProps) {
  const name = sharerName || "Someone";
  if (stage === "invite-used")
    return (
      <Centered>
        <Outcome icon={<Link2Off />} tone="warn" title="This invite was already used">
          <p>Each invite admits one person. Ask {name} for a new link.</p>
        </Outcome>
      </Centered>
    );
  if (stage === "invite-expired")
    return (
      <Centered>
        <Outcome icon={<Clock />} tone="warn" title="This invite has expired">
          <p>Invites work for 24 hours. Ask {name} for a new link.</p>
        </Outcome>
      </Centered>
    );
  if (stage === "declined")
    return (
      <Centered>
        <Outcome icon={<Ban />} title={`You declined ${name}'s invite`}>
          <p>Nothing was stored in this browser. You can close this tab.</p>
        </Outcome>
      </Centered>
    );
  if (stage === "closed")
    return (
      <Centered>
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
  return (
    <Centered>
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
        <ul className="text-muted-foreground grid gap-2 text-sm">
          <li className="flex items-center gap-2.5">
            <Sparkles className="size-4 shrink-0" /> Nothing to install: it opens in this browser.
          </li>
          <li className="flex items-center gap-2.5">
            <Lock className="size-4 shrink-0" /> End-to-end encrypted, even on public Wi-Fi.
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
            ) : offline ? (
              <>
                <RefreshCw /> Try again
              </>
            ) : (
              `Join ${name}`
            )}
          </Button>
          <Button variant="ghost" disabled={joining} onClick={onDecline}>
            Decline
          </Button>
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

  return (
    <div className="bg-background flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-3 border-b px-3 py-2">
        <BrandMark className="text-sm [&>span]:size-6" />
        <span className="bg-border h-5 w-px" />
        <span className="flex min-w-0 items-center gap-2 text-sm">
          <PresenceDot value={revoked ? "offline" : presence} />
          <span className="truncate font-medium">{sharerName}</span>
        </span>
        {!revoked && services.length > 1 && (
          <nav className="bg-muted ml-2 flex min-w-0 gap-1 overflow-x-auto rounded-lg p-1">
            {services.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onSelect?.(s.id)}
                className={cn(
                  "text-muted-foreground inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors",
                  s.id === service?.id && "bg-background text-foreground shadow-sm",
                )}
              >
                {s.paused && <PauseCircle className="size-3" />}
                {s.name}
              </button>
            ))}
          </nav>
        )}
        <span className="flex-1" />
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
      {body}
    </div>
  );
}

function CloseSessionButton({ sharerName, onClose }: { sharerName: string; onClose?: () => void }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="ghost">
          <LogOut /> Close session
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
