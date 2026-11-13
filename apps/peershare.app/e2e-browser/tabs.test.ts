/**
 * Two tabs of the Sharer's page in one browser: one hub, the same state in
 * both. An Invite made in either tab admits a Guest; when the hub's tab
 * closes, the other tab takes over and keeps sharing.
 */

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createBridge, type Listening, listenLoopback } from "@statewalker/httpeers-share/bridge";
import type { Browser } from "playwright";
import { build } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Hosted, launch, servePage, serveSessions, startRelay } from "./e2e-harness.js";
import { person, startDirksApp, viewerFrame } from "./scenario.js";

const here = dirname(fileURLToPath(import.meta.url));
const TOKEN = "peershare-tabs";
let app: Awaited<ReturnType<typeof startDirksApp>>;
let relay: Awaited<ReturnType<typeof startRelay>>;
let page: Hosted;
let sessions: Hosted;
let bridge: Listening;
let browser: Browser;

beforeAll(async () => {
  await build({ root: resolve(here, ".."), logLevel: "error" });
  app = await startDirksApp();
  relay = await startRelay();
  sessions = await serveSessions(resolve(here, "../src/vendor/session-shell"));
  page = await servePage(resolve(here, "../dist"), () => ({
    relayAddrs: [relay.addr],
    sessionOrigin: `https://{name}.localhost:${sessions.port}`,
    dev: true,
  }));
  bridge = await listenLoopback(createBridge({ token: TOKEN, allowedOrigins: [page.origin] }));
  browser = await launch(page, sessions);
}, 120_000);
afterAll(async () => {
  await browser?.close();
  await bridge?.close();
  await page?.close();
  await sessions?.close();
  await relay?.stop();
  await app?.close();
});

describe("the Sharer's page in two tabs", () => {
  it("shows one hub in both; an Invite from the second tab admits a Guest; the second tab takes over", async () => {
    const dirk = await person(browser);
    const first = dirk.tab;
    await first.goto(`${page.origin}/#localUrl=${encodeURIComponent(bridge.origin)}&t=${TOKEN}`);
    await first.getByText("Proxy connected").waitFor({ timeout: 30_000 });
    await first.getByRole("button", { name: /Stop sharing/ }).waitFor({ timeout: 60_000 });
    await first.getByLabel("Your name").fill("Dirk");
    await first.getByLabel("Name", { exact: true }).fill("fooService");
    await first.getByLabel("Address", { exact: true }).fill(app.origin);
    await first.getByRole("button", { name: "Share service" }).click();
    await first.getByText("Working").waitFor({ timeout: 30_000 });

    // The second tab: the same service and sharing state, from the first tab's hub.
    const second = await first.context().newPage();
    await second.goto(page.origin);
    await second.getByRole("heading", { name: "fooService" }).waitFor({ timeout: 30_000 });
    await second.getByRole("button", { name: /Stop sharing/ }).waitFor({ timeout: 30_000 });

    // Invited from the second tab: the one hub made it, so it knows it.
    await second.getByRole("button", { name: "Invite", exact: true }).first().click();
    const field = second.getByLabel("Invite link", { exact: true });
    await field.waitFor({ timeout: 30_000 });
    const link = await field.inputValue();

    const claudia = await person(browser);
    await claudia.tab.goto(link);
    await claudia.tab.getByRole("button", { name: /Join Dirk/ }).click();
    await claudia.tab.getByRole("button", { name: /Close session/ }).waitFor({ timeout: 60_000 });
    const frame = await viewerFrame(claudia.tab, /^https:\/\/[a-z0-9]+\.localhost:/);
    await frame.getByText("hello from Dirk's app").waitFor({ timeout: 30_000 });

    // Both tabs list her.
    await second.keyboard.press("Escape");
    await first.getByText(/Guest \S{6}/).waitFor({ timeout: 15_000 });
    await second.getByText(/Guest \S{6}/).waitFor({ timeout: 15_000 });

    // The hub's log says what happened, from either tab.
    const log = await second.evaluate(() => window.peershareDiagnostics?.() ?? "");
    expect(log).toContain("invite: created");
    expect(log).toContain("invite: redeemed");

    // The hub's tab closes: the second tab takes over and shares again.
    await first.close();
    await second.getByRole("button", { name: /Stop sharing/ }).waitFor({ timeout: 60_000 });
    await second.getByRole("button", { name: "Invite", exact: true }).first().click();
    const again = await second.getByLabel("Invite link", { exact: true }).inputValue();
    expect(again).not.toBe(link);
    const otto = await person(browser);
    await otto.tab.goto(again);
    await otto.tab.getByRole("button", { name: /Join Dirk/ }).click();
    await otto.tab.getByRole("button", { name: /Close session/ }).waitFor({ timeout: 60_000 });
  }, 240_000);
});
