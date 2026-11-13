/**
 * A Service that forbids being framed (CSP frame-ancestors 'none', X-Frame-Options: DENY),
 * shared to a Guest in Chromium: refused by her browser by default, shown once the Sharer
 * allows it for that Service.
 */

import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createBridge, type Listening, listenLoopback } from "@statewalker/httpeers-share/bridge";
import type { Browser, Frame, Page } from "playwright";
import { build } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Hosted, launch, servePage, serveSessions, startRelay } from "./e2e-harness.js";
import { person } from "./scenario.js";

const here = dirname(fileURLToPath(import.meta.url));
const TOKEN = "peershare-framing";
let app: { origin: string; close(): Promise<void> };
let relay: Awaited<ReturnType<typeof startRelay>>;
let page: Hosted;
let sessions: Hosted;
let bridge: Listening;
let browser: Browser;

beforeAll(async () => {
  await build({ root: resolve(here, ".."), logLevel: "error" });
  const server = createServer((_req, res) => {
    res.writeHead(200, {
      "content-type": "text/html",
      "content-security-policy": "default-src 'self'; frame-ancestors 'none'",
      "x-frame-options": "DENY",
    });
    res.end("<!doctype html><title>strict</title><p>hello from the strict app</p>");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const address = server.address();
  if (address == null || typeof address === "string") throw new Error("no address");
  app = {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((r) => server.close(() => r())),
  };
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

/**
 * The Guest's service frame. A frame the browser refused to show is replaced by its error page
 * (chrome-error://…), which never gets the session's URL: then there is none.
 */
async function serviceFrame(tab: Page): Promise<Frame | undefined> {
  for (let i = 0; i < 150; i++) {
    const frame = tab
      .frames()
      .find((f) => /\.localhost:/.test(f.url()) && !f.url().endsWith("/relay.html"));
    if (frame != null) return frame;
    await tab.waitForTimeout(100);
  }
  return undefined;
}

async function guestSees(link: string): Promise<string> {
  const guest = await person(browser);
  await guest.tab.goto(link);
  await guest.tab.getByRole("button", { name: /Join Dirk/ }).click();
  await guest.tab.getByRole("button", { name: /Close session/ }).waitFor({ timeout: 60_000 });
  const frame = await serviceFrame(guest.tab);
  await guest.tab.waitForTimeout(3000);
  const text =
    frame == null
      ? ""
      : await frame
          .locator("body")
          .innerText({ timeout: 5_000 })
          .catch(() => "");
  await guest.tab.context().close();
  return text;
}

describe("a Service that forbids being framed", () => {
  it("is refused in the Guest's frame by default, and shown once the Sharer allows it", async () => {
    const dirk = await person(browser);
    const tab = dirk.tab;
    await tab.goto(`${page.origin}/#localUrl=${encodeURIComponent(bridge.origin)}&t=${TOKEN}`);
    await tab.getByRole("button", { name: /Stop sharing/ }).waitFor({ timeout: 60_000 });
    await tab.getByLabel("Your name").fill("Dirk");
    await tab.getByLabel("Name", { exact: true }).fill("strict");
    await tab.getByLabel("Address", { exact: true }).fill(app.origin);
    await tab.getByRole("button", { name: "Share service" }).click();
    // The Probe sees the rule and says so, with what to do.
    await tab.getByText("It refuses to be shown inside another page").waitFor({ timeout: 30_000 });

    const invite = async () => {
      await tab.getByRole("button", { name: "Invite", exact: true }).first().click();
      const link = await tab.getByLabel("Invite link", { exact: true }).inputValue();
      await tab.keyboard.press("Escape");
      return link;
    };

    // Off: her browser refuses to show it.
    expect(await guestSees(await invite())).not.toContain("hello from the strict app");

    // On, from the service's settings.
    await tab.getByRole("button", { name: "More for strict" }).click();
    await tab.getByRole("menuitem", { name: "Edit" }).click();
    await tab.getByRole("switch", { name: /forbids embedding/ }).click();
    await tab.getByRole("button", { name: "Save" }).click();
    await tab
      .getByText("It refuses to be shown inside another page")
      .waitFor({ state: "detached", timeout: 30_000 });

    expect(await guestSees(await invite())).toContain("hello from the strict app");
  }, 240_000);
});
