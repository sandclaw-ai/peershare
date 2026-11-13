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
  ShieldAlert,
  Star,
  Trash2,
  Unplug,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import {
  type DraftCheck,
  type Service,
  type ServiceDraft,
  siteSettingsUrl,
  type UpstreamKind,
  validateDraft,
  type Warning,
} from "../views/model.js";
import { HELP_URL, HelpTip } from "./help-tip.js";
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
const PAGE_ORIGIN = "https://peershare.sandclaw.ai";

// ——— Advice (scenario S3) ———————————————————————————————————————————

function Advice({ service }: { service: Service }) {
  const notes: ReactNode[] = [];
  // A missing CORS header or a refused local network also reads as "down": its own advice is the useful one.
  const explained = service.warnings.some(
    (w) => w === "cors-missing" || w === "permission-needed" || w === "permission-unanswered",
  );
  if (service.health === "down" && !explained) {
    notes.push(
      <Alert key="down" variant="destructive">
        <Unplug />
        <AlertTitle>PeerShare can't reach it</AlertTitle>
        <AlertDescription>
          {service.kind === "bridged"
            ? "Check that it is running, and that the local proxy is running and connected, then test again."
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
  for (const w of service.warnings)
    notes.push(<WarningNote key={w} warning={w} kind={service.kind} />);
  if (notes.length === 0) return null;
  return <div className="grid gap-2">{notes}</div>;
}

function WarningNote({ warning, kind }: { warning: Warning; kind: Service["kind"] }) {
  if (warning === "cors-missing") {
    return (
      <Alert variant="warning">
        <AlertTriangle />
        <AlertTitle>It doesn't allow calls from PeerShare</AlertTitle>
        <AlertDescription>
          <p>
            Add <span className="text-foreground font-mono">{PAGE_ORIGIN}</span> to its CORS
            settings, or share it through the local proxy.
          </p>
        </AlertDescription>
      </Alert>
    );
  }
  if (warning === "permission-needed") {
    return (
      <Alert variant="warning">
        <ShieldAlert />
        <AlertTitle>Your browser blocked local network access</AlertTitle>
        <AlertDescription>
          <PermissionSteps kind={kind} />
        </AlertDescription>
      </Alert>
    );
  }
  if (warning === "permission-unanswered") {
    return (
      <Alert variant="warning">
        <ShieldAlert />
        <AlertTitle>Your browser hasn't allowed local network access yet</AlertTitle>
        <AlertDescription>
          <ol className="list-decimal space-y-1 pl-4">
            <li>
              {kind === "bridged"
                ? "Check that the local proxy is running (it prints “PeerShare Proxy” and its address)."
                : "Check that the service is running and its address is right."}
            </li>
            <li>Test again. If your browser asks about the local network, choose “Allow”.</li>
            <li>
              No question? It may have been dismissed: allow it in the site settings, as below.
            </li>
          </ol>
          <PermissionSteps kind={kind} />
        </AlertDescription>
      </Alert>
    );
  }
  if (warning === "framing-refused") {
    return (
      <Alert variant="warning">
        <AlertTriangle />
        <AlertTitle>It refuses to be shown inside another page</AlertTitle>
        <AlertDescription>
          <p>
            It forbids embedding (X-Frame-Options or frame-ancestors), so your guests' browsers show
            an error instead of it. Allow it in this service's settings (Edit), or change the app.{" "}
            <a
              className="underline"
              href={`${HELP_URL}security#framing`}
              target="_blank"
              rel="noreferrer"
            >
              What allowing it risks
            </a>
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
          The local proxy keeps each guest's cookies apart, so each guest signs in once.
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

/**
 * How to allow Local Network Access in Chromium. The setting's name differs
 * between versions, and newer ones have two: this computer, and the network.
 */
function PermissionSteps({ kind }: { kind: Service["kind"] }) {
  const origin = typeof location === "undefined" ? PAGE_ORIGIN : location.origin;
  const reached =
    kind === "bridged"
      ? "this computer (the local proxy runs here)"
      : "devices on your local network";
  return (
    <div className="grid gap-1.5">
      <p>PeerShare needs your browser's permission to reach {reached}.</p>
      <ol className="list-decimal space-y-1 pl-4">
        <li>
          Click the icon left of the address bar, then “Site settings”. Or paste into the address
          bar:{" "}
          <span className="text-foreground font-mono break-all select-all">
            {siteSettingsUrl(origin)}
          </span>
        </li>
        <li>
          Set every local network setting to “Allow”: “Local network access”, or in newer Chrome
          both the one for this device and the one for the local network.
        </li>
        <li>Reload this page, then test again.</li>
      </ol>
    </div>
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
    text: "On this computer or its network: reached through the local proxy.",
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
  /** A service to try PeerShare with, offered as a link that fills the form in. */
  example?: ServiceDraft;
  onSubmit: (draft: ServiceDraft, kind: UpstreamKind) => void;
  onCancel?: () => void;
}

const emptyDraft: ServiceDraft = { name: "", target: "", isDefault: false };

/**
 * PeerShare's example site: a small static site published for trying PeerShare out. It allows
 * PeerShare's page (CORS), so it is shared directly, without the local proxy.
 */
export const EXAMPLE_SERVICE: ServiceDraft = {
  name: "Example site",
  target: "https://peershare-demo.sandclaw.ai/",
  isDefault: true,
};

export function ServiceForm({
  initial = emptyDraft,
  services,
  self,
  submitText = "Share service",
  example,
  onSubmit,
  onCancel,
}: ServiceFormProps) {
  const [draft, setDraft] = useState(initial);
  // Exactly one service is the Default: with no other service, this one has to be it.
  const onlyOne = !services.some((s) => s.id !== self?.id);
  // Turning the Default off hands it on: to the first other service, as the logic does.
  const handedTo =
    self?.isDefault === true && !draft.isDefault
      ? services.find((s) => s.id !== self.id)?.name
      : undefined;
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
        if (check.ok)
          onSubmit(
            { ...draft, name: draft.name.trim(), isDefault: onlyOne || draft.isDefault },
            check.kind,
          );
      }}
    >
      {example != null && (
        <p className="bg-muted/50 text-muted-foreground flex flex-wrap items-center gap-x-1 rounded-md px-3 py-2 text-sm">
          Just trying PeerShare?
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto px-0 py-0"
            onClick={() => {
              setSubmitted(undefined);
              setDraft(example);
            }}
          >
            Fill in the example site
          </Button>
        </p>
      )}
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
        <span className="flex items-center gap-2">
          <Label htmlFor="service-target">Address</Label>
          <HelpTip title="Local or remote" help="getting-started#share">
            <p>
              An address on this computer or your network is reached through the local proxy, which
              only listens on this computer.
            </p>
            <p>
              A remote https site is read directly, so it must allow PeerShare (CORS); it sees an
              anonymous ID for each guest.
            </p>
          </HelpTip>
        </span>
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
          <span className="text-muted-foreground text-xs">
            {onlyOne
              ? "Guests see it first. Your only service is always the default."
              : handedTo != null
                ? `Turned off, ${handedTo} becomes the default.`
                : "Guests see it first. Only one service is the default."}
          </span>
        </span>
        <Switch
          checked={onlyOne || draft.isDefault}
          disabled={onlyOne}
          onCheckedChange={(on) => setDraft({ ...draft, isDefault: on })}
        />
      </Label>
      <Label
        className={cn(
          "flex items-center justify-between gap-3 rounded-lg border p-3 font-normal",
          draft.allowFraming === true && "border-warning/50 bg-warning/5",
        )}
      >
        <span className="grid gap-1.5">
          <Badge className="bg-destructive w-fit text-white">RISKY</Badge>
          <span className="text-sm font-medium">Show it even if it forbids embedding</span>
          <span className="text-muted-foreground text-xs">
            Some apps don't allow other websites to show them inside their own page. The rule
            protects the app's users from a trick: a hostile site hides the app under fake buttons,
            so a click meant for the fake button really lands on something like "Delete" or
            "Approve". Your guests see every app through the PeerShare page, so an app with this
            rule shows them only an error. On, PeerShare lifts the rule for your guests, so they can
            see and use the app. You use the app as before. Turn it on only for apps where an
            unintended click by a guest can't do real harm, or for guests you trust.
          </span>
          <span className="text-muted-foreground text-xs">
            <span className="text-foreground font-medium">Technical:</span> removes the{" "}
            <code>X-Frame-Options</code> header and the CSP <code>frame-ancestors</code> directive
            from the responses guests get (the rest of the CSP stays). The guest's copy then runs
            framable only by pages on sandclaw.ai, the session shell's own frame-ancestors. What
            remains: a compromised sandclaw.ai page could clickjack a guest, acting with that
            guest's own session; your cookies are never involved.{" "}
            <a
              className="underline"
              href={`${HELP_URL}security#framing`}
              target="_blank"
              rel="noreferrer"
            >
              What this risks
            </a>
          </span>
        </span>
        <Switch
          checked={draft.allowFraming === true}
          onCheckedChange={(on) => setDraft({ ...draft, allowFraming: on })}
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

export function ServicesEmpty({ children }: { children: ReactNode }) {
  return (
    <Card className="grid gap-5 p-6">
      <div className="grid gap-1">
        <h2 className="text-lg font-semibold">Share your first service</h2>
        <p className="text-muted-foreground text-sm">
          Anything with a web page: a dev server, a dashboard, a notebook. It stays where it runs;
          guests see it through your browser.
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
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">Services</h2>
          <HelpTip title="Where your pages go" help="how-it-works#one-request">
            <p>
              A guest's request reaches this tab over the encrypted connection. The tab fetches the
              page from your service and sends it back the same way.
            </p>
            <p>The relay that helps browsers connect only forwards bytes it cannot read.</p>
          </HelpTip>
        </div>
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
