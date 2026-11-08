import { Button, Card, cn } from "@statewalker/ui.view.shadcn";
import {
  CheckCircle2,
  Laptop,
  Loader2,
  PlugZap,
  RefreshCw,
  ShieldAlert,
  ShieldQuestion,
  TerminalSquare,
} from "lucide-react";
import type { ReactNode } from "react";
import type { BridgeDiagnosis } from "../views/model.js";

/**
 * Where the page stands with the Bridge (scenario S1):
 * - `none`: opened without a pairing link; only remote https services can be shared;
 * - `prompt`: paired, not called yet: the browser's Local Network Access question comes next;
 * - `checking`: the call is out (and may be waiting on that question);
 * - a diagnosis from `diagnoseBridge`.
 */
export type BridgeState = "none" | "prompt" | "checking" | BridgeDiagnosis;

export interface BridgeCardProps {
  state: BridgeState;
  /** The Bridge's address, e.g. `http://127.0.0.1:9090`. */
  address?: string;
  onConnect?: () => void;
}

function Shell({
  icon,
  tone,
  title,
  children,
  action,
}: {
  icon: ReactNode;
  tone?: "ok" | "warn" | "error";
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Card
      className={cn(
        "flex items-start gap-3 p-4",
        tone === "warn" && "border-warning/50 bg-warning/5",
        tone === "error" && "border-destructive/40 bg-destructive/5",
      )}
    >
      <span
        className={cn(
          "bg-muted inline-flex size-9 shrink-0 items-center justify-center rounded-lg [&>svg]:size-4.5",
          tone === "ok" && "bg-success/10 text-success",
          tone === "warn" && "bg-warning/15",
          tone === "error" && "bg-destructive/10 text-destructive",
        )}
      >
        {icon}
      </span>
      <div className="grid min-w-0 flex-1 gap-1 text-sm">
        <p className="font-medium">{title}</p>
        {children != null && <div className="text-muted-foreground grid gap-1">{children}</div>}
      </div>
      {action != null && <div className="shrink-0">{action}</div>}
    </Card>
  );
}

export function BridgeCard({
  state,
  address = "http://127.0.0.1:9090",
  onConnect,
}: BridgeCardProps) {
  const retry = (
    <Button size="sm" variant="outline" onClick={onConnect}>
      <RefreshCw /> Check again
    </Button>
  );
  switch (state) {
    case "ok":
      return (
        <Shell icon={<CheckCircle2 />} tone="ok" title="Bridge connected">
          <p>
            Services on this computer and its network can be shared.{" "}
            <span className="font-mono text-xs">{address}</span>
          </p>
        </Shell>
      );
    case "prompt":
      return (
        <Shell
          icon={<ShieldQuestion />}
          title="Your browser will ask one question"
          action={
            <Button size="sm" onClick={onConnect}>
              <Laptop /> Connect to the Bridge
            </Button>
          }
        >
          <p>
            To reach the Bridge, PeerShare needs access to devices on your local network. Choose
            “Allow” when asked. Nothing beyond this computer and its network is reached this way.
          </p>
        </Shell>
      );
    case "checking":
      return (
        <Shell icon={<Loader2 className="animate-spin" />} title="Reaching the Bridge…">
          <p>If the browser asks about your local network, choose “Allow”.</p>
        </Shell>
      );
    case "permission-needed":
      return (
        <Shell
          icon={<ShieldAlert />}
          tone="warn"
          title="Your browser blocked local network access"
          action={retry}
        >
          <p>
            Allow “Local network access” for this site (the icon left of the address bar), then
            check again.
          </p>
        </Shell>
      );
    case "bridge-not-running":
      return (
        <Shell icon={<PlugZap />} tone="error" title="The Bridge isn't running" action={retry}>
          <p>
            Start it on this computer and open the link it prints. Remote https:// services work
            without it.
          </p>
        </Shell>
      );
    case "token-rejected":
      return (
        <Shell icon={<RefreshCw />} tone="warn" title="The Bridge was restarted" action={retry}>
          <p>It expects a new pairing: open the link it printed when it started.</p>
        </Shell>
      );
    case "none":
      return (
        <Shell icon={<TerminalSquare />} title="No Bridge paired">
          <p>
            You can share remote https:// services now. To share services on this computer, run the
            PeerShare Bridge and open the link it prints.
          </p>
        </Shell>
      );
  }
}
