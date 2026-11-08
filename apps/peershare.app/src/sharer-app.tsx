/**
 * The Sharer's page, the hub: `/` (and `/peer-share`). Sharing starts as soon
 * as the page is open, and stops with the tab (ADR 0001). Services without
 * CORS go through the local proxy, which is checked only when it is in use:
 * after its settings are saved or come from a link, or on its first request.
 */

import { createRuntime, peershare, StartSharing } from "@statewalker/peershare.share";
import { browserMesh, idbSharerStore } from "@statewalker/peershare.share/browser";
import { PeerShareProvider, ProxyCard, SharerScreen } from "@statewalker/peershare.share-react";
import { useEffect, useRef, useState } from "react";
import { type BridgeDiagnosis, diagnoseBridge } from "./bridge-diagnosis.js";
import type { PeerShareConfig } from "./config.js";
import {
  loadProxySettings,
  proxySupported,
  type ProxySettings as Settings,
  saveProxySettings,
} from "./proxy-settings.js";

/** The published launcher: copies of the page elsewhere (`local/serve.mjs`) do not serve `/proxy/`. */
const PROXY_COMMAND = "curl -fsSL https://peershare.httpeers.net/proxy/peershare-proxy.sh | sh";

export function SharerApp({ config }: { config: PeerShareConfig }) {
  const fromLink = location.hash.includes("localUrl=");
  const [settings, setSettings] = useState(() => loadProxySettings(window));
  const current = useRef(settings);
  current.current = settings;
  const [diagnosis, setDiagnosis] = useState<BridgeDiagnosis | "checking">();
  const checked = useRef(false);
  const latest = useRef(0);

  const check = async () => {
    checked.current = true;
    // Only the latest check may report: an older one (a filtered port hangs) must not overwrite it.
    const run = ++latest.current;
    setDiagnosis("checking");
    const { url, key } = current.current;
    const result = await diagnoseBridge({ localUrl: url, token: key });
    if (run === latest.current) setDiagnosis(result);
  };

  const [rt] = useState(() => {
    const runtime = createRuntime();
    peershare({
      store: idbSharerStore(),
      // Read per request; the first request through the proxy checks it.
      bridge: () => {
        if (!checked.current) void check();
        return { base: current.current.url, token: current.current.key };
      },
      mesh: browserMesh({
        relayAddrs: config.relayAddrs,
        invitePage: config.invitePage ?? `${location.origin}/invite`,
        dev: config.dev ?? false,
      }),
    }).contribute(runtime);
    return runtime;
  });
  useEffect(() => {
    void rt.commands.call(StartSharing, undefined).promise;
    if (fromLink) void check();
  }, []);

  const save = (next: Settings) => {
    saveProxySettings(window, next);
    current.current = next;
    setSettings(next);
    void check();
  };

  return (
    <PeerShareProvider rt={rt}>
      <SharerScreen
        proxy={
          <ProxyCard
            status={diagnosis ?? "unchecked"}
            settings={settings}
            command={PROXY_COMMAND}
            supported={proxySupported(navigator.userAgent)}
            onSave={save}
            onCheck={() => void check()}
          />
        }
      />
    </PeerShareProvider>
  );
}
