/** Small status pieces every PeerShare screen shares: health, kind, presence, the brand mark. */

import { Avatar, AvatarFallback, Button, cn } from "@statewalker/ui.view.shadcn";
import { CircleHelp, CircleOff, Globe, Laptop, Loader2, Share2 } from "lucide-react";
import type { Health, UpstreamKind } from "../views/model.js";
import { HELP_URL } from "./help-tip.js";
import { Badge } from "./primitives.js";

const health: Record<
  Health,
  { text: string; variant: "success" | "warning" | "destructive" | "secondary" | "outline" }
> = {
  ok: { text: "Working", variant: "success" },
  slow: { text: "Slow", variant: "warning" },
  down: { text: "Unreachable", variant: "destructive" },
  disabled: { text: "Paused", variant: "secondary" },
  checking: { text: "Checking", variant: "outline" },
};

export function HealthBadge({ value }: { value: Health }) {
  const { text, variant } = health[value];
  return (
    <Badge variant={variant}>
      {value === "checking" ? (
        <Loader2 className="animate-spin" />
      ) : value === "disabled" ? (
        <CircleOff />
      ) : (
        <span
          className={cn(
            "size-1.5 rounded-full",
            value === "ok" && "bg-success",
            value === "slow" && "bg-warning",
            value === "down" && "bg-destructive",
          )}
        />
      )}
      {text}
    </Badge>
  );
}

export function KindBadge({ kind }: { kind: UpstreamKind }) {
  return kind === "bridged" ? (
    <Badge
      variant="outline"
      title="On this computer or its network, reached through the local proxy"
    >
      <Laptop /> Local
    </Badge>
  ) : (
    <Badge variant="outline" title="Reached directly over https">
      <Globe /> Remote
    </Badge>
  );
}

export type Presence = "online" | "connecting" | "offline";

export function PresenceDot({ value, className }: { value: Presence; className?: string }) {
  return (
    <span className={cn("relative inline-flex size-2.5", className)} title={value}>
      {value === "online" && (
        <span className="bg-success/60 absolute inline-flex size-full animate-ping rounded-full opacity-60" />
      )}
      <span
        className={cn(
          "relative inline-flex size-2.5 rounded-full",
          value === "online" && "bg-success",
          value === "connecting" && "bg-warning animate-pulse",
          value === "offline" && "bg-muted-foreground/40",
        )}
      />
    </span>
  );
}

/** Letters for an avatar: "Dirk Bauer" → "DB", "Dirk" → "D", "Guest 3fa9c2" → "3F". */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const last = words.length > 1 ? words[words.length - 1] : undefined;
  if (last != null && /^guest$/i.test(words[0] ?? "")) return last.slice(0, 2).toUpperCase();
  return ((words[0]?.[0] ?? "") + (last?.[0] ?? "")).toUpperCase();
}

export function NameAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <Avatar aria-hidden className={cn("size-8", className)}>
      <AvatarFallback className="text-muted-foreground text-xs font-semibold">
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  );
}

export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <span className="bg-primary text-primary-foreground inline-flex size-7 items-center justify-center rounded-lg">
        <Share2 className="size-4" />
      </span>
      PeerShare
    </span>
  );
}

export function HelpLink({ className }: { className?: string }) {
  return (
    <Button asChild variant="ghost" size="sm" className={cn("text-muted-foreground", className)}>
      <a href={HELP_URL} target="_blank" rel="noreferrer">
        <CircleHelp /> Help
      </a>
    </Button>
  );
}
