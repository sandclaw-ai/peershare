import { Button, cn } from "@statewalker/ui.view.shadcn";
import { ArrowUpRight, ShieldCheck } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Badge, Popover, PopoverContent, PopoverTrigger } from "./primitives.js";

/** PeerShare's help site: how to use it, how it works, why it is safe. */
export const HELP_URL = "https://peershare.sandclaw.ai/help/";

export interface HelpTipProps {
  /** What the tip is about, for its button's label and its heading: "Invites". */
  title: string;
  /** One or two sentences: what keeps this part safe, and how. */
  children: ReactNode;
  /** The help page (and section) that says more: `security#invites`. */
  help?: string;
  side?: "top" | "right" | "bottom" | "left";
  className?: string;
}

/**
 * A light "?" pill (an outline Badge) next to an element that matters for safety. It opens a
 * Popover with how that part is kept safe and a link to the help site.
 * - Hovering with a mouse opens it as a preview: focus stays where it was, and it closes when
 *   the pointer leaves.
 * - A click, a tap, or Enter/Space on the focused pill pins it open: focus moves into it (so
 *   the keyboard reaches "Learn more"), and Escape or a click outside closes it. A click after
 *   a hover keeps the preview open rather than toggling it shut.
 * A Popover rather than a Tooltip, so it works on touch screens and its link can be clicked.
 */
export function HelpTip({ title, children, help, side = "bottom", className }: HelpTipProps) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const closing = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(closing.current), []);

  const preview = () => {
    clearTimeout(closing.current);
    setOpen(true);
  };
  // A moment's grace, so the pointer can travel from the pill to the card.
  const endPreview = () => {
    clearTimeout(closing.current);
    if (!pinned) closing.current = setTimeout(() => setOpen(false), 180);
  };
  const mouse = (fn: () => void) => (e: React.PointerEvent) => {
    if (e.pointerType === "mouse") fn();
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        clearTimeout(closing.current);
        setOpen(next);
        setPinned(next);
      }}
    >
      <PopoverTrigger asChild>
        <Badge
          asChild
          variant="outline"
          className={cn(
            "bg-muted/60 text-muted-foreground hover:text-foreground data-[state=open]:text-foreground h-[18px] min-w-[22px] cursor-pointer rounded-full px-1.5 text-[11px] leading-none font-semibold",
            className,
          )}
        >
          <button
            type="button"
            aria-label={`How this is kept safe: ${title}`}
            onPointerEnter={mouse(preview)}
            onPointerLeave={mouse(endPreview)}
            onClick={(e) => {
              // Open as a preview: pin it instead of letting the trigger toggle it shut.
              if (open && !pinned) {
                e.preventDefault();
                clearTimeout(closing.current);
                setPinned(true);
              }
            }}
          >
            ?
          </button>
        </Badge>
      </PopoverTrigger>
      <PopoverContent
        side={side}
        align="start"
        sideOffset={6}
        collisionPadding={12}
        className="grid gap-2 p-3 text-sm"
        onPointerEnter={mouse(preview)}
        onPointerLeave={mouse(endPreview)}
        // A hover preview leaves the focus where it was; a pinned tip takes it.
        onOpenAutoFocus={(e) => {
          if (!pinned) e.preventDefault();
        }}
      >
        <p className="flex items-center gap-1.5 font-medium">
          <ShieldCheck className="text-success size-4 shrink-0" /> {title}
        </p>
        <div className="text-muted-foreground grid gap-1.5 leading-relaxed">{children}</div>
        {help != null && (
          <Button asChild variant="link" size="sm" className="h-auto w-fit px-0 py-0 text-xs">
            <a href={`${HELP_URL}${help}`} target="_blank" rel="noreferrer">
              Learn more <span className="sr-only">about {title.toLowerCase()}</span>
              <ArrowUpRight className="size-3" />
            </a>
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
