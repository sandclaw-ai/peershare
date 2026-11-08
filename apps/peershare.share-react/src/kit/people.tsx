import { qrSvg } from "@statewalker/httpeers-qr";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
} from "@statewalker/ui.view.shadcn";
import { Check, Clock, Copy, Link2, ShieldAlert, UserPlus, Users } from "lucide-react";
import { useMemo, useState } from "react";
import type { Guest, Invite } from "../views/model.js";
import { HelpTip } from "./help-tip.js";
import { Alert, AlertDescription } from "./primitives.js";
import { NameAvatar, PresenceDot } from "./status.js";

// ——— Invite (scenario S5) ———————————————————————————————————————————————

function timeLeft(expiresAt: Date, now: Date) {
  const min = Math.max(0, Math.round((expiresAt.getTime() - now.getTime()) / 60_000));
  return min >= 60 ? `${Math.round(min / 60)} h` : `${min} min`;
}

function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex gap-2">
      <Input readOnly value={value} aria-label="Invite link" className="font-mono text-xs" />
      <Button
        type="button"
        variant="secondary"
        className="shrink-0"
        onClick={() => {
          void navigator.clipboard?.writeText(value).catch(() => {});
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? <Check /> : <Copy />}
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}

export interface InviteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invite: Invite;
  /** Makes a new link for the next guest. */
  onNewLink?: () => void;
  now?: Date;
}

export function InviteDialog({
  open,
  onOpenChange,
  invite,
  onNewLink,
  now = new Date(),
}: InviteDialogProps) {
  // Generated here from the link, never from outside input: safe to insert as markup.
  const svg = useMemo(() => qrSvg(invite.url), [invite.url]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          {/* The tip sits beside the title, not in it: the dialog is named by the title alone. */}
          <div className="flex items-center gap-2">
            <DialogTitle>Invite a guest</DialogTitle>
            <HelpTip title="Invites" help="security#invites">
              <p>
                This link lets one person join, once, within 24 hours. Its secret sits after the{" "}
                <code>#</code>, which browsers don't send to any server.
              </p>
              <p>Send it only to the person you mean: whoever joins with it first gets in.</p>
            </HelpTip>
          </div>
          <DialogDescription>
            Send this link to one person. It lets them see the services you share.
          </DialogDescription>
        </DialogHeader>
        {invite.used ? (
          <Alert>
            <Check />
            <AlertDescription>
              A guest joined with this link, so it no longer works. Make a new one for the next
              person.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="grid gap-4">
            <div className="bg-muted/40 grid place-items-center rounded-xl border p-4">
              <div
                role="img"
                aria-label="QR code of the invite link"
                className="size-44 rounded-md bg-white p-2 [&>svg]:size-full"
                dangerouslySetInnerHTML={{ __html: svg }}
              />
              <p className="text-muted-foreground mt-2 text-xs">Scan with a phone camera</p>
            </div>
            <CopyField value={invite.url} />
            <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
              <span className="inline-flex items-center gap-1.5">
                <Users className="size-3.5" /> Works for one person, once
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Clock className="size-3.5" /> Expires in {timeLeft(invite.expiresAt, now)}
              </span>
            </div>
          </div>
        )}
        <div className="flex justify-between gap-2">
          <Button variant="ghost" onClick={onNewLink}>
            <Link2 /> New link
          </Button>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ——— Guests (scenario S6) ————————————————————————————————————————————————

const clock = (at: Date) =>
  at.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });

export interface GuestsCardProps {
  guests: Guest[];
  /** Sharing is on: the invite button works. */
  canInvite: boolean;
  onInvite?: () => void;
  onRevoke?: (peerId: string) => void;
}

export function GuestsCard({ guests, canInvite, onInvite, onRevoke }: GuestsCardProps) {
  // Presence, where the caller knows it: who is connected right now.
  const known = guests.some((g) => g.online != null);
  const online = guests.filter((g) => g.online === true).length;
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b p-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-semibold">Guests</h2>
            <HelpTip title="Who can see your services" help="security#membership">
              <p>
                Each guest has a key that never leaves their browser. Your tab checks it on every
                connection and every request, so nobody can pose as a guest.
              </p>
              <p>Revoke ends a guest's access at once, including their live connections.</p>
            </HelpTip>
          </div>
          <p className="text-muted-foreground text-xs">
            {guests.length === 0
              ? "Nobody yet"
              : known
                ? `${guests.length} joined · ${online} online now`
                : `${guests.length} joined`}
          </p>
        </div>
        <Button size="sm" onClick={onInvite} disabled={!canInvite}>
          <UserPlus /> Invite
        </Button>
      </div>
      {guests.length === 0 ? (
        <div className="grid gap-2 p-6 text-center">
          <Users className="text-muted-foreground mx-auto size-6" />
          <p className="text-muted-foreground text-sm">
            Invite someone: each link admits one person, for 24 hours.
          </p>
        </div>
      ) : (
        <ul className="divide-y">
          {guests.map((guest) => (
            <li key={guest.peerId} className="flex items-center gap-3 px-4 py-3">
              <span className="relative">
                <NameAvatar name={guest.name} />
                {guest.online != null && (
                  <PresenceDot
                    value={guest.online ? "online" : "offline"}
                    className="ring-card absolute -right-0.5 -bottom-0.5 rounded-full ring-2"
                  />
                )}
              </span>
              <span className="grid min-w-0 flex-1">
                <span className="truncate text-sm font-medium">{guest.name}</span>
                <span className="text-muted-foreground text-xs">
                  {guest.online == null
                    ? "Joined"
                    : guest.online
                      ? "Online · joined"
                      : "Away · joined"}{" "}
                  {clock(guest.joinedAt)}
                </span>
              </span>
              <RevokeButton name={guest.name} onConfirm={() => onRevoke?.(guest.peerId)} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function RevokeButton({ name, onConfirm }: { name: string; onConfirm: () => void }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive">
          Revoke
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Revoke {name}?</AlertDialogTitle>
          <AlertDialogDescription>
            {name} loses access at once: open pages stop loading and live connections close. To let
            them back in, send a new invite.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className={cn("bg-destructive text-white hover:bg-destructive/90")}
          >
            Revoke access
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Sharing stops with this tab (ADR 0001): said once, where the Sharer looks. */
export function KeepTabOpen() {
  return (
    <Alert>
      <ShieldAlert />
      <AlertDescription>
        Sharing runs in this tab. Keep it open while guests use your services; closing it takes them
        offline until you come back.
      </AlertDescription>
    </Alert>
  );
}
