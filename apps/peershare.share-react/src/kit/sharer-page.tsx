import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Input,
} from "@statewalker/ui.view.shadcn";
import { Power, UserPlus } from "lucide-react";
import { type ReactNode, useState } from "react";
import type { Guest, Invite, Service, ServiceDraft, UpstreamKind } from "../views/model.js";
import { HelpTip } from "./help-tip.js";
import { GuestsCard, InviteDialog, KeepTabOpen } from "./people.js";
import { Alert, AlertDescription, AlertTitle, Badge } from "./primitives.js";
import {
  ServiceCard,
  ServiceDialog,
  ServiceForm,
  ServicesEmpty,
  ServicesHeader,
} from "./services.js";
import { BrandMark, HelpLink, PresenceDot } from "./status.js";

/**
 * The Sharer's whole page (scenarios S1–S7), controlled: every change is a callback that the
 * wiring turns into a PeerShare command (see each prop). The add/edit dialog and the
 * confirmations are the page's own state.
 */
export interface SharerPageProps {
  name: string;
  /** `SetName`. */
  onNameChange?: (name: string) => void;
  /** `GetSharing`: the mesh is on. */
  sharing: boolean;
  /** `StartSharing` / `StopSharing`. */
  onSharingChange?: (on: boolean) => void;
  /** The local proxy's card (`ProxyCard`), shown above the services. */
  proxy?: ReactNode;
  services: Service[];
  guests: Guest[];
  /** The last Invite made, shown while `inviteOpen`. */
  invite?: Invite;
  inviteOpen?: boolean;
  onInviteOpenChange?: (open: boolean) => void;
  /** `Invite`: makes a link (and opens the dialog). */
  onInvite?: () => void;
  /** `AddService`. */
  onAdd?: (draft: ServiceDraft, kind: UpstreamKind) => void;
  /** `EditService`. */
  onEdit?: (id: string, draft: ServiceDraft, kind: UpstreamKind) => void;
  /** `ToggleService`. */
  onToggle?: (id: string, enabled: boolean) => void;
  /** `ProbeService`. */
  onProbe?: (id: string) => void;
  /** `SetDefault`. */
  onMakeDefault?: (id: string) => void;
  /** `RemoveService`. */
  onRemove?: (id: string) => void;
  /** `RevokeGuest`. */
  onRevoke?: (peerId: string) => void;
  /** Story states: open the add dialog, or the edit dialog of a service. */
  dialog?: { mode: "add" } | { mode: "edit"; id: string };
  now?: Date;
}

export function SharerPage(props: SharerPageProps) {
  const { name, sharing, proxy, services, guests, invite, inviteOpen = false, now } = props;
  const [dialog, setDialog] = useState(props.dialog);
  const [confirmStop, setConfirmStop] = useState(false);
  const editing = dialog?.mode === "edit" ? services.find((s) => s.id === dialog.id) : undefined;
  const canInvite = sharing && services.some((s) => s.enabled);
  const presence = guests.some((g) => g.online != null);
  const online = guests.filter((g) => g.online === true).length;
  const count = presence ? online : guests.length;

  return (
    <div className="bg-muted/30 min-h-full">
      <header className="bg-background/95 sticky top-0 z-10 border-b backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <BrandMark />
          <span className="text-muted-foreground hidden text-sm sm:inline">as</span>
          <Input
            aria-label="Your name"
            value={name}
            placeholder="Your name"
            className="h-8 w-36"
            onChange={(e) => props.onNameChange?.(e.target.value)}
          />
          <span className="flex-1" />
          <HelpLink />
          <span className="inline-flex items-center gap-1.5">
            <Badge
              variant={sharing ? "success" : "secondary"}
              className="text-foreground gap-2 rounded-full px-3 py-1"
            >
              <PresenceDot value={sharing ? "online" : "offline"} />
              {sharing
                ? `Sharing · ${count} ${count === 1 ? "guest" : "guests"}${presence ? " online" : ""}`
                : "Not sharing"}
            </Badge>
            <HelpTip title="Shared from this tab" help="security#tabs">
              <p>
                Only people who join with your invites can see your services, over connections
                encrypted end to end. This tab serves them itself: no PeerShare server can read or
                keep your pages.
              </p>
              <p>Closing the tab stops sharing.</p>
            </HelpTip>
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => (sharing ? setConfirmStop(true) : props.onSharingChange?.(true))}
          >
            <Power /> {sharing ? "Stop sharing" : "Start sharing"}
          </Button>
          <Button size="sm" onClick={props.onInvite} disabled={!canInvite}>
            <UserPlus /> Invite
          </Button>
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl gap-6 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="grid content-start gap-4">
          {proxy}
          {!sharing && (
            <Alert variant="warning">
              <Power />
              <AlertTitle>Sharing is off</AlertTitle>
              <AlertDescription>
                Guests see your computer as offline. They stay invited and come back on their own
                when you start sharing again.
              </AlertDescription>
            </Alert>
          )}
          {services.length === 0 ? (
            <ServicesEmpty>
              <ServiceForm
                services={services}
                initial={{ name: "", target: "", isDefault: true }}
                onSubmit={(draft, kind) => props.onAdd?.(draft, kind)}
              />
            </ServicesEmpty>
          ) : (
            <>
              <ServicesHeader count={services.length} onAdd={() => setDialog({ mode: "add" })} />
              <div className="grid gap-3">
                {services.map((s) => (
                  <ServiceCard
                    key={s.id}
                    service={s}
                    onToggle={(on) => props.onToggle?.(s.id, on)}
                    onProbe={() => props.onProbe?.(s.id)}
                    onEdit={() => setDialog({ mode: "edit", id: s.id })}
                    onMakeDefault={() => props.onMakeDefault?.(s.id)}
                    onRemove={() => props.onRemove?.(s.id)}
                  />
                ))}
              </div>
            </>
          )}
        </section>
        <aside className="grid content-start gap-4">
          <GuestsCard
            guests={guests}
            canInvite={canInvite}
            onInvite={props.onInvite}
            onRevoke={props.onRevoke}
          />
          <KeepTabOpen />
        </aside>
      </main>

      <ServiceDialog
        key={dialog?.mode === "edit" ? dialog.id : "add"}
        open={dialog != null}
        onOpenChange={(open) => !open && setDialog(undefined)}
        editing={editing != null}
        services={services}
        self={editing}
        initial={
          editing != null
            ? { name: editing.name, target: editing.target, isDefault: editing.isDefault }
            : undefined
        }
        submitText={editing != null ? "Save" : "Share service"}
        onSubmit={(draft, kind) => {
          if (editing != null) props.onEdit?.(editing.id, draft, kind);
          else props.onAdd?.(draft, kind);
          setDialog(undefined);
        }}
      />

      {invite != null && (
        <InviteDialog
          open={inviteOpen}
          onOpenChange={(open) => props.onInviteOpenChange?.(open)}
          invite={invite}
          onNewLink={props.onInvite}
          now={now}
        />
      )}

      <AlertDialog open={confirmStop} onOpenChange={setConfirmStop}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Stop sharing?</AlertDialogTitle>
            <AlertDialogDescription>
              {guests.length === 0
                ? "Your services go offline."
                : `${guests.length === 1 ? "Your guest sees" : `Your ${guests.length} guests see`} your computer as offline.`}{" "}
              Invites and guests are kept: start sharing again and they reconnect by themselves.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep sharing</AlertDialogCancel>
            <AlertDialogAction onClick={() => props.onSharingChange?.(false)}>
              Stop sharing
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
