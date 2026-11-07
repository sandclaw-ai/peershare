import { Button, Card, Input, Label } from "@statewalker/ui.view.shadcn";
import { useEffect, useState } from "react";

export interface ProxySettingsValue {
  url: string;
  key: string;
}

export interface ProxySettingsProps {
  value: ProxySettingsValue;
  /** The command that starts the proxy on the Sharer's computer. */
  command: string;
  /** False on a browser that cannot reach a loopback proxy from this page. */
  supported: boolean;
  onSave: (value: ProxySettingsValue) => void;
}

/** Where the page finds the local proxy that reaches services without CORS. */
export function ProxySettings({ value, command, supported, onSave }: ProxySettingsProps) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  return (
    <Card className="w-full max-w-2xl gap-3 p-4 text-sm">
      <div className="grid gap-1">
        <p className="font-medium">Local proxy</p>
        <p className="text-muted-foreground">
          For services on this computer or network that do not allow calls from PeerShare (no CORS).
          Start it with:
        </p>
        <code className="bg-muted rounded px-2 py-1 font-mono text-xs break-all">{command}</code>
      </div>
      {supported ? (
        <form
          className="grid gap-2 sm:grid-cols-[1fr_12rem_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            onSave({ url: draft.url.trim(), key: draft.key });
          }}
        >
          <div className="grid gap-1">
            <Label htmlFor="proxy-url">Proxy address</Label>
            <Input
              id="proxy-url"
              className="font-mono"
              value={draft.url}
              onChange={(e) => setDraft({ ...draft, url: e.target.value })}
            />
          </div>
          <div className="grid gap-1">
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
      ) : (
        <p className="text-muted-foreground">
          The local proxy needs Chrome or Firefox: this browser blocks a secure page's calls to your
          computer. Remote https:// services that allow PeerShare work here too.
        </p>
      )}
    </Card>
  );
}
