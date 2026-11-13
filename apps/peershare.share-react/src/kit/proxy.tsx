import { Button, Card, cn, Input, Label } from "@statewalker/ui.view.shadcn";
import {
  Check,
  CheckCircle2,
  Copy,
  KeyRound,
  Loader2,
  PlugZap,
  Puzzle,
  RefreshCw,
  Settings2,
  ShieldAlert,
  TerminalSquare,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import type { BridgeDiagnosis } from "../views/model.js";
import { HELP_URL, HelpTip } from "./help-tip.js";

/**
 * Where the page stands with the local proxy (scenario S1), the small program that reaches
 * services without CORS on this computer and its network:
 * - `unchecked`: not called yet; it is checked when its settings are saved or come from a
 *   link, or on the first request through it;
 * - `checking`: the call is out (and may wait on the browser's local-network question);
 * - a diagnosis: `ok`, `permission-needed`, `bridge-not-running`, `token-rejected`;
 * - `extension`: the PeerShare browser extension is installed and relays instead.
 */
export type ProxyStatus = "unchecked" | "checking" | BridgeDiagnosis | "extension";

/** How to install the browser extension, the proxy script's alternative. */
export const EXTENSION_HELP = `${HELP_URL}local-proxy#extension`;
/** The browser extension, as the PeerShare site publishes it. */
export const EXTENSION_DOWNLOAD =
  "https://peershare.sandclaw.ai/extension/peershare-proxy-extension.zip";

export interface ProxySettingsValue {
  url: string;
  /** `""`: the proxy was started without `--key`. */
  key: string;
}

export interface ProxyCardProps {
  status: ProxyStatus;
  settings: ProxySettingsValue;
  /** The command that starts the proxy on the Sharer's computer. */
  command: string;
  /** False on a browser that cannot reach a loopback proxy from this page (Safari). */
  supported: boolean;
  onSave?: (settings: ProxySettingsValue) => void;
  onCheck?: () => void;
  /** Show the settings open (story states); a problem the settings fix opens them anyway. */
  open?: boolean;
  /** The browser extension's version, when status is `extension`. */
  extensionVersion?: string;
}

function CommandLine({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="bg-muted flex items-center gap-2 rounded-md py-1 pr-1 pl-3">
      <code className="min-w-0 flex-1 truncate font-mono text-xs" title={command}>
        {command}
      </code>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        aria-label="Copy the command"
        onClick={() => {
          void navigator.clipboard?.writeText(command).catch(() => {});
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? <Check /> : <Copy />}
      </Button>
    </div>
  );
}

function SettingsForm({
  settings,
  command,
  onSave,
}: {
  settings: ProxySettingsValue;
  command: string;
  onSave?: (s: ProxySettingsValue) => void;
}) {
  const [draft, setDraft] = useState(settings);
  useEffect(() => setDraft(settings), [settings]);
  return (
    <div className="grid gap-3 border-t pt-3">
      <div className="grid gap-1.5">
        <p className="text-muted-foreground text-xs">Start it on this computer:</p>
        <CommandLine command={command} />
        <div className="text-muted-foreground grid gap-1 text-xs">
          <p>Or, in Chrome, use the PeerShare browser extension instead: nothing to start.</p>
          <ol className="list-decimal space-y-0.5 pl-4">
            <li>
              <a className="text-foreground underline" href={EXTENSION_DOWNLOAD} download>
                Download the extension
              </a>{" "}
              and unzip it.
            </li>
            <li>
              Open <span className="font-mono">chrome://extensions</span> and switch on “Developer
              mode”.
            </li>
            <li>
              Click “Load unpacked”, choose the unzipped folder, then reload this page.{" "}
              <a className="underline" href={EXTENSION_HELP} target="_blank" rel="noreferrer">
                More about the extension
              </a>
            </li>
          </ol>
        </div>
      </div>
      <form
        className="grid gap-2 sm:grid-cols-[1fr_11rem_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          onSave?.({ url: draft.url.trim(), key: draft.key });
        }}
      >
        <div className="grid gap-1.5">
          <Label htmlFor="proxy-url">Proxy address</Label>
          <Input
            id="proxy-url"
            className="font-mono"
            value={draft.url}
            onChange={(e) => setDraft({ ...draft, url: e.target.value })}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="proxy-key">Key</Label>
          <Input
            id="proxy-key"
            type="password"
            placeholder="none"
            value={draft.key}
            onChange={(e) => setDraft({ ...draft, key: e.target.value })}
          />
        </div>
        <Button type="submit" variant="outline">
          Save
        </Button>
      </form>
    </div>
  );
}

const said: Record<
  Exclude<ProxyStatus, "unchecked">,
  { icon: ReactNode; tone?: "ok" | "warn" | "error"; title: string; text: string }
> = {
  checking: {
    icon: <Loader2 className="animate-spin" />,
    title: "Reaching the proxy…",
    text: "If the browser asks about devices on your local network, choose “Allow”.",
  },
  extension: {
    icon: <Puzzle />,
    tone: "ok",
    title: "Browser extension connected",
    text: "Services on this computer and its network can be shared, through the PeerShare extension.",
  },
  ok: {
    icon: <CheckCircle2 />,
    tone: "ok",
    title: "Proxy connected",
    text: "Services on this computer and its network can be shared.",
  },
  "permission-needed": {
    icon: <ShieldAlert />,
    tone: "warn",
    title: "Your browser blocked local network access",
    text: "Click the icon left of the address bar → “Site settings”, set every local network setting to “Allow” (newer Chrome has one for this device and one for the local network), reload this page, then check again.",
  },
  "bridge-not-running": {
    icon: <PlugZap />,
    tone: "error",
    title: "No proxy is running at that address",
    text: "Start it with the command below, then check again. Services that allow calls from PeerShare work without it.",
  },
  "token-rejected": {
    icon: <KeyRound />,
    tone: "warn",
    title: "The proxy refused the key",
    text: "Enter the key it was started with (--key), or start it without one.",
  },
};

/** The local proxy: what it is for, whether it answers, and its settings. */
export function ProxyCard({
  status,
  settings,
  command,
  supported,
  onSave,
  onCheck,
  open,
  extensionVersion,
}: ProxyCardProps) {
  // Problems the settings fix open them; the Sharer can open them any time.
  const needsSettings = status === "bridge-not-running" || status === "token-rejected";
  const [expanded, setExpanded] = useState(open ?? needsSettings);
  useEffect(() => {
    if (needsSettings) setExpanded(true);
  }, [needsSettings]);

  const view =
    status === "unchecked"
      ? {
          icon: <TerminalSquare />,
          tone: undefined,
          title: "Local proxy",
          text: "For services on this computer or its network that don't allow calls from PeerShare (no CORS).",
        }
      : said[status];
  const canRetry =
    status !== "unchecked" && status !== "checking" && status !== "ok" && status !== "extension";

  if (!supported) {
    return (
      <Card className="flex items-start gap-3 p-4">
        <Icon tone={undefined}>
          <TerminalSquare />
        </Icon>
        <div className="grid min-w-0 flex-1 gap-1 text-sm">
          <p className="font-medium">Local proxy</p>
          <p className="text-muted-foreground">
            The local proxy needs Chrome or Firefox: this browser blocks a secure page's calls to
            your computer. Remote https:// services that allow PeerShare work here too.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card
      className={cn(
        "grid gap-3 p-4",
        view.tone === "warn" && "border-warning/50 bg-warning/5",
        view.tone === "error" && "border-destructive/40 bg-destructive/5",
      )}
    >
      <div className="flex items-start gap-3">
        <Icon tone={view.tone}>{view.icon}</Icon>
        <div className="grid min-w-0 flex-1 gap-1 text-sm">
          <p className="flex items-center gap-2 font-medium">
            <span>{view.title}</span>
            <HelpTip title="The local proxy" help="security#proxy">
              <p>
                It listens only on this computer (127.0.0.1), answers only PeerShare and pages on
                this computer, and reaches only this computer and your network, never the internet.
              </p>
              <p>Recent Chrome and Edge also ask you before this page may use it.</p>
            </HelpTip>
          </p>
          <p className="text-muted-foreground">
            {view.text}
            {status === "ok" && (
              <>
                {" "}
                <span className="font-mono text-xs">{settings.url}</span>
              </>
            )}
            {status === "extension" && extensionVersion != null && (
              <>
                {" "}
                <span className="font-mono text-xs">v{extensionVersion}</span>
              </>
            )}
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          {canRetry && (
            <Button size="sm" variant="outline" onClick={onCheck}>
              <RefreshCw /> Check again
            </Button>
          )}
          <Button
            size="sm"
            variant={status === "unchecked" && !expanded ? "default" : "ghost"}
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
          >
            <Settings2 /> {status === "unchecked" ? "Set up" : "Settings"}
          </Button>
        </div>
      </div>
      {expanded && <SettingsForm settings={settings} command={command} onSave={onSave} />}
    </Card>
  );
}

function Icon({ tone, children }: { tone?: "ok" | "warn" | "error"; children: ReactNode }) {
  return (
    <span
      className={cn(
        "bg-muted inline-flex size-9 shrink-0 items-center justify-center rounded-lg [&>svg]:size-4.5",
        tone === "ok" && "bg-success/10 text-success",
        tone === "warn" && "bg-warning/15",
        tone === "error" && "bg-destructive/10 text-destructive",
      )}
    >
      {children}
    </span>
  );
}
