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
  Card,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from "@statewalker/ui.view.shadcn";
import {
  AlertTriangle,
  Cookie,
  Globe,
  Laptop,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Star,
  Trash2,
  Unplug,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import {
  type DraftCheck,
  type Service,
  type ServiceDraft,
  type UpstreamKind,
  validateDraft,
  type Warning,
} from "../views/model.js";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Switch,
} from "./primitives.js";
import { HealthBadge, KindBadge } from "./status.js";

/** The page's own origin: what a Direct service must allow (CORS). */
const PAGE_ORIGIN = "https://peershare.httpeers.net";

// ——— Advice (scenario S3) ———————————————————————————————————————————

function Advice({ service }: { service: Service }) {
  const notes: ReactNode[] = [];
  // A missing CORS header also reads as "down": its own advice is the useful one.
  if (service.health === "down" && !service.warnings.includes("cors-missing")) {
    notes.push(
      <Alert key="down" variant="destructive">
        <Unplug />
        <AlertTitle>PeerShare can't reach it</AlertTitle>
        <AlertDescription>
          {service.kind === "bridged"
            ? "Check that it is running on this computer and that the Bridge is still open, then test again."
            : "Check the address and that the service is online, then test again."}
        </AlertDescription>
      </Alert>,
    );
  }
  if (service.health === "slow") {
    notes.push(
      <Alert key="slow" variant="warning">
        <AlertTriangle />
        <AlertTitle>It answers slowly</AlertTitle>
        <AlertDescription>Guests will wait for its pages.</AlertDescription>
      </Alert>,
    );
  }
  for (const w of service.warnings) notes.push(<WarningNote key={w} warning={w} />);
  if (notes.length === 0) return null;
  return <div className="grid gap-2">{notes}</div>;
}

function WarningNote({ warning }: { warning: Warning }) {
  if (warning === "cors-missing") {
    return (
      <Alert variant="warning">
        <AlertTriangle />
        <AlertTitle>It doesn't allow calls from PeerShare</AlertTitle>
        <AlertDescription>
          <p>
            Add <span className="text-foreground font-mono">{PAGE_ORIGIN}</span> to its CORS
            settings, or run it on this computer and share it through the Bridge.
          </p>
        </AlertDescription>
      </Alert>
    );
  }
  if (warning === "cookies-set") {
    return (
      <Alert>
        <Cookie />
        <AlertTitle>It signs people in with cookies</AlertTitle>
        <AlertDescription>
          The Bridge keeps each guest's cookies apart, so each guest signs in once.
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <Alert>
      <AlertTriangle />
      <AlertTitle>It uses live connections</AlertTitle>
      <AlertDescription>Pages load for guests, but live parts may stay still.</AlertDescription>
    </Alert>
  );
}

// ——— One service ——————————————————————————————————————————————————————

export interface ServiceCardProps {
  service: Service;
  onToggle?: (enabled: boolean) => void;
  onProbe?: () => void;
  onEdit?: () => void;
  onMakeDefault?: () => void;
  onRemove?: () => void;
}

export function ServiceCard({
  service,
  onToggle,
  onProbe,
  onEdit,
  onMakeDefault,
  onRemove,
}: ServiceCardProps) {
  const [confirmRemove, setConfirmRemove] = useState(false);
  return (
    <Card className={cn("grid gap-3 p-4", !service.enabled && "bg-muted/30")}>
      <div className="flex items-start gap-3">
        <div className="grid min-w-0 flex-1 gap-1.5">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h3 className="truncate font-semibold">{service.name}</h3>
            {service.isDefault && (
              <Badge variant="secondary" title="Guests see it first">
                <Star /> Default
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground truncate font-mono text-xs">{service.target}</p>
          <div className="flex flex-wrap items-center gap-1.5">
            <HealthBadge value={service.health} />
            <KindBadge kind={service.kind} />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Label className="text-muted-foreground flex items-center gap-2 text-xs font-normal">
            {service.enabled ? "Shared" : "Paused"}
            <Switch
              checked={service.enabled}
              aria-label={`Share ${service.name}`}
              onCheckedChange={(on) => onToggle?.(on)}
            />
          </Label>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" aria-label={`More for ${service.name}`}>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onEdit}>
                <Pencil /> Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={service.health === "checking" || !service.enabled}
                onSelect={onProbe}
              >
                <RefreshCw /> Test again
              </DropdownMenuItem>
              <DropdownMenuItem disabled={service.isDefault} onSelect={onMakeDefault}>
                <Star /> Make default
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setConfirmRemove(true)}>
                <Trash2 /> Remove
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <Advice service={service} />
      {(service.health === "down" || service.health === "slow") && (
        <div>
          <Button size="sm" variant="outline" onClick={onProbe}>
            <RefreshCw /> Test again
          </Button>
        </div>
      )}
      <AlertDialog open={confirmRemove} onOpenChange={setConfirmRemove}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {service.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Guests stop seeing it at once. Your guests and their invites stay as they are.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={onRemove}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

// ——— The add / edit form (scenarios S2, S4) ———————————————————————————

const kindLine: Record<UpstreamKind, { icon: ReactNode; text: string }> = {
  bridged: {
    icon: <Laptop />,
    text: "On this computer or its network: reached through the Bridge.",
  },
  direct: {
    icon: <Globe />,
    text: "A remote service: reached directly, so it must allow calls from PeerShare.",
  },
};

export interface ServiceFormProps {
  initial?: ServiceDraft;
  /** The other services: names must differ. */
  services: Service[];
  /** The service being edited. */
  self?: Service;
  submitText?: string;
  onSubmit: (draft: ServiceDraft, kind: UpstreamKind) => void;
  onCancel?: () => void;
}

const emptyDraft: ServiceDraft = { name: "", target: "", isDefault: false };

export function ServiceForm({
  initial = emptyDraft,
  services,
  self,
  submitText = "Share service",
  onSubmit,
  onCancel,
}: ServiceFormProps) {
  const [draft, setDraft] = useState(initial);
  const [submitted, setSubmitted] = useState<DraftCheck>();
  // What the address alone says, while typing: the kind, or nothing yet.
  const live = draft.target.trim() === "" ? undefined : validateDraft({ ...draft, name: "x" }, []);
  const errors = submitted != null && !submitted.ok ? submitted.errors : {};
  return (
    <form
      noValidate
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const check = validateDraft(draft, services, self?.id);
        setSubmitted(check);
        if (check.ok) onSubmit({ ...draft, name: draft.name.trim() }, check.kind);
      }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="service-name">Name</Label>
        <Input
          id="service-name"
          value={draft.name}
          placeholder="Design review"
          aria-invalid={errors.name != null}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        />
        <p className={cn("text-xs", errors.name ? "text-destructive" : "text-muted-foreground")}>
          {errors.name ?? "What your guests see."}
        </p>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="service-target">Address</Label>
        <Input
          id="service-target"
          value={draft.target}
          placeholder="http://localhost:5173"
          className="font-mono"
          aria-invalid={errors.target != null}
          onChange={(e) => setDraft({ ...draft, target: e.target.value })}
        />
        {errors.target != null ? (
          <p className="text-destructive text-xs">{errors.target}</p>
        ) : live?.ok ? (
          <p className="text-muted-foreground flex items-center gap-1.5 text-xs [&>svg]:size-3.5">
            {kindLine[live.kind].icon}
            {kindLine[live.kind].text}
          </p>
        ) : (
          <p className="text-muted-foreground text-xs">
            A local address like http://localhost:3000, or a remote https:// address.
          </p>
        )}
      </div>
      <Label className="flex items-center justify-between gap-3 rounded-lg border p-3 font-normal">
        <span className="grid gap-0.5">
          <span className="text-sm font-medium">Default service</span>
          <span className="text-muted-foreground text-xs">Guests see it first.</span>
        </span>
        <Switch
          checked={draft.isDefault}
          onCheckedChange={(on) => setDraft({ ...draft, isDefault: on })}
        />
      </Label>
      <div className="flex flex-wrap justify-end gap-2">
        {onCancel != null && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={draft.target.trim() === "" || draft.name.trim() === ""}>
          {submitText}
        </Button>
      </div>
    </form>
  );
}

export function ServiceDialog({
  open,
  onOpenChange,
  editing,
  ...form
}: ServiceFormProps & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {editing ? `Edit ${form.self?.name ?? "service"}` : "Share a service"}
          </DialogTitle>
          <DialogDescription>
            A web app on this computer, on your network, or a remote https site.
          </DialogDescription>
        </DialogHeader>
        <ServiceForm {...form} onCancel={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

// ——— The list, and the first run ——————————————————————————————————————

export function ServicesEmpty({
  bridged,
  children,
}: {
  /** A Bridge is paired (connected or not yet): local services can be shared. */
  bridged: boolean;
  children: ReactNode;
}) {
  return (
    <Card className="grid gap-5 p-6">
      <div className="grid gap-1">
        <h2 className="text-lg font-semibold">Share your first service</h2>
        <p className="text-muted-foreground text-sm">
          {bridged
            ? "Anything with a web page: a dev server, a dashboard, a notebook. It stays on your computer; guests see it through your browser."
            : "A remote https:// service that allows calls from PeerShare. Pair the Bridge to share services on this computer."}
        </p>
      </div>
      {children}
    </Card>
  );
}

export function ServicesHeader({ count, onAdd }: { count: number; onAdd?: () => void }) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold">Services</h2>
        <p className="text-muted-foreground text-sm">
          {count === 1 ? "1 service" : `${count} services`} open to your guests.
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={onAdd}>
        <Plus /> Add service
      </Button>
    </div>
  );
}
