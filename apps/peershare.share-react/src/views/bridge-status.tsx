import { Button, Card, cn } from "@statewalker/ui.view.shadcn";
import { Laptop, Loader2, RefreshCw, ShieldQuestion } from "lucide-react";
import type { ReactNode } from "react";
import type { BridgeDiagnosis } from "./model.js";

/** The browser's Local Network Access permission, as `navigator.permissions.query` reads it. */
export type LocalNetworkPermission = "prompt" | "granted" | "denied" | "unsupported";

export interface BridgeStatusProps {
  permission: LocalNetworkPermission;
  /** Absent: not tried yet. `checking`: the call is out (and may be waiting on the prompt). */
  diagnosis?: BridgeDiagnosis | "checking";
  onCheck: () => void;
}

const said: Record<BridgeDiagnosis, { title: string; text: ReactNode; tone: string }> = {
  ok: {
    title: "Proxy connected",
    text: "You can share services on this computer, such as http://localhost:5173.",
    tone: "border-success/50",
  },
  "permission-needed": {
    title: "Your browser blocked access to your local network",
    text: "PeerShare needs it to reach the local proxy. Allow “local network access” for this site in the browser's site settings (the icon left of the address), then check again.",
    tone: "border-warning/60 bg-warning/10",
  },
  "bridge-not-running": {
    title: "No proxy is running at that address",
    text: "Start it with the command above, then check again. Services that allow calls from PeerShare, and remote https:// services, work without it.",
    tone: "border-destructive/50 bg-destructive/5",
  },
  "token-rejected": {
    title: "The proxy refused the key",
    text: "Enter the key it was started with (--key), or start it without one.",
    tone: "border-warning/60 bg-warning/10",
  },
};

/**
 * Rung 03's findings as a screen: the browser asks the Sharer before the page
 * may reach the local proxy (the Bridge), a refusal looks exactly like a stopped Bridge, and the
 * permission state is what tells them apart.
 */
export function BridgeStatus({ permission, diagnosis, onCheck }: BridgeStatusProps) {
  if (diagnosis == null && permission === "prompt") {
    return (
      <Card className="w-full max-w-2xl gap-3 p-4">
        <div className="flex gap-3">
          <ShieldQuestion className="text-muted-foreground mt-0.5 size-5 shrink-0" />
          <div className="grid gap-1 text-sm">
            <p className="font-medium">Your browser will ask one question</p>
            <p className="text-muted-foreground">
              To reach the proxy on this computer, PeerShare needs access to devices on your local
              network. When the browser asks, choose “Allow”. Nothing outside this computer and its
              network is reached this way.
            </p>
          </div>
        </div>
        <div>
          <Button onClick={onCheck}>
            <Laptop /> Connect to the proxy
          </Button>
        </div>
      </Card>
    );
  }

  if (diagnosis === "checking" || diagnosis == null) {
    return (
      <Card className="w-full max-w-2xl flex-row items-center gap-2 p-4 text-sm">
        <Loader2 className="size-4 animate-spin" />
        {permission === "prompt"
          ? "Waiting for your answer in the browser's prompt…"
          : "Reaching the proxy…"}
      </Card>
    );
  }

  const { title, text, tone } = said[diagnosis];
  return (
    <Card className={cn("w-full max-w-2xl gap-2 border p-4 text-sm", tone)}>
      <p className="font-medium">{title}</p>
      <p className="text-muted-foreground">{text}</p>
      {diagnosis !== "ok" && (
        <div>
          <Button size="sm" variant="outline" onClick={onCheck}>
            <RefreshCw /> Check again
          </Button>
        </div>
      )}
    </Card>
  );
}
