/**
 * The whole scenario against the LIVE deployment: the page on peershare.sandclaw.ai, sessions on
 * *.s.sandclaw.ai, httpeers' relay. Only Dirk's app and the Bridge run on this machine.
 *
 *   PEERSHARE_LIVE=1 pnpm exec vitest run e2e-browser/live.test.ts
 *   PEERSHARE_LIVE=https://other.host HEADED=1 SCREENSHOTS=/tmp/shots pnpm exec vitest run …
 *
 * Skipped unless PEERSHARE_LIVE is set: it needs the network and the deployment.
 */
import { mkdirSync } from "node:fs";
import { createBridge, type Listening, listenLoopback } from "@statewalker/httpeers-share/bridge";
import { type Browser, chromium } from "playwright";
import { afterAll, beforeAll, describe, it } from "vitest";
import { dirkSharesClaudiaViews, startDirksApp } from "./scenario.ts";

const LIVE = process.env.PEERSHARE_LIVE;
const page = LIVE == null || LIVE === "1" ? "https://peershare.sandclaw.ai" : LIVE;
const sessionZone = process.env.PEERSHARE_SESSION_ZONE ?? "s.sandclaw.ai";
const TOKEN = `live-${Math.random().toString(36).slice(2)}`;

let app: Awaited<ReturnType<typeof startDirksApp>>;
let bridge: Listening;
let browser: Browser;

describe.skipIf(LIVE == null)("the live deployment", () => {
  beforeAll(async () => {
    app = await startDirksApp();
    bridge = await listenLoopback(
      createBridge({ token: TOKEN, allowedOrigins: [page], cookieJars: true }),
    );
    browser = await chromium.launch({
      headless: process.env.HEADED == null,
      slowMo: process.env.HEADED == null ? 0 : 150,
    });
  });
  afterAll(async () => {
    await browser?.close();
    await bridge?.close();
    await app?.close();
  });

  it("Dirk shares his app, Claudia views it in her own origin, Dirk revokes her", async () => {
    const screenshots = process.env.SCREENSHOTS;
    if (screenshots != null) mkdirSync(screenshots, { recursive: true });
    await dirkSharesClaudiaViews({
      browser,
      pageOrigin: page,
      bridge: { origin: bridge.origin, token: TOKEN },
      appOrigin: app.origin,
      sessionUrl: new RegExp(`^https://[a-z0-9-]+\\.${sessionZone.replaceAll(".", "\\.")}/`),
      screenshots,
    });
  });
});
