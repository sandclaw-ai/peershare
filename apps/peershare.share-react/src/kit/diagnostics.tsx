import { Button, cn } from "@statewalker/ui.view.shadcn";
import { Check, ClipboardCopy } from "lucide-react";
import { useState } from "react";

export interface DiagnosticsButtonProps {
  /** The page's diagnostics log as text (`GetDiagnostics`). */
  load: () => Promise<string>;
  className?: string;
}

/**
 * "Copy diagnostics": the page's log (what it tried, what it was told, every
 * error with its causes) to the clipboard, to paste into a message. Where the
 * clipboard is refused, the text is shown to select by hand.
 */
export function DiagnosticsButton({ load, className }: DiagnosticsButtonProps) {
  const [state, setState] = useState<"idle" | "copied">("idle");
  const [shown, setShown] = useState<string>();
  return (
    <div className={cn("grid gap-2", className)}>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="text-muted-foreground w-fit"
        onClick={async () => {
          const text = await load().catch((e: unknown) => `Could not read the log: ${String(e)}`);
          try {
            await navigator.clipboard.writeText(text);
            setState("copied");
            setTimeout(() => setState("idle"), 2000);
          } catch {
            setShown(text);
          }
        }}
      >
        {state === "copied" ? <Check /> : <ClipboardCopy />}
        {state === "copied" ? "Copied" : "Copy diagnostics"}
      </Button>
      {shown != null && (
        <textarea
          readOnly
          aria-label="Diagnostics"
          className="bg-muted h-40 w-full rounded-md p-2 font-mono text-[11px]"
          value={shown}
          onFocus={(e) => e.currentTarget.select()}
        />
      )}
    </div>
  );
}
