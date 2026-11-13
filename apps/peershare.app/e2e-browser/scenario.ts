/**
 * The usage scenario, as a person drives it, against any deployment of the
 * page: Dirk shares his local app and invites Claudia; she sees it in her own
 * isolated origin; Dirk sees her in his Guests list.
 */

import type { Browser, Frame, Page } from "playwright";
import { expect } from "vitest";

export interface ScenarioInit {
  browser: Browser;
  pageOrigin: string;
  bridge: { origin: string; token: string };
  /** Dirk's local app. */
  appOrigin: string;
  /** Matches a session origin's URL. */
  sessionUrl: RegExp;
  screenshots?: string;
}

export async function person(browser: Browser): Promise<{ tab: Page; errors: string[] }> {
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  await context.grantPermissions(["local-network-access"]);
  const tab = await context.newPage();
  const errors: string[] = [];
  tab.on("pageerror", (e) => errors.push(String(e)));
  return { tab, errors };
}

export async function viewerFrame(tab: Page, sessionUrl: RegExp): Promise<Frame> {
  for (let i = 0; i < 300; i++) {
    const frame = tab
      .frames()
      .find((f) => sessionUrl.test(f.url()) && !f.url().endsWith("/relay.html"));
    if (frame != null) return frame;
    await tab.waitForTimeout(100);
  }
  throw new Error("no Viewer frame");
}

export async function dirkSharesClaudiaViews(init: ScenarioInit): Promise<void> {
  const dirk = await person(init.browser);
  await dirk.tab.goto(
    `${init.pageOrigin}/#localUrl=${encodeURIComponent(init.bridge.origin)}&t=${init.bridge.token}`,
  );
  await dirk.tab.getByText("Proxy connected").waitFor({ timeout: 30_000 });
  await dirk.tab.getByRole("button", { name: /Stop sharing/ }).waitFor({ timeout: 60_000 }); // sharing

  await dirk.tab.getByLabel("Your name").fill("Dirk");
  await dirk.tab.getByLabel("Name", { exact: true }).fill("fooService");
  await dirk.tab.getByLabel("Address", { exact: true }).fill(init.appOrigin);
  await dirk.tab.getByRole("button", { name: "Share service" }).click();
  await dirk.tab.getByRole("heading", { name: "fooService" }).waitFor();
  // Its Probe, through the proxy: the badge says it works.
  await dirk.tab.getByText("Working").waitFor({ timeout: 30_000 });
  // The service's menu: Test again runs the Probe again.
  await dirk.tab.getByRole("button", { name: "More for fooService" }).click();
  await dirk.tab.getByRole("menuitem", { name: "Test again" }).click();
  await dirk.tab.getByText("Working").waitFor({ timeout: 30_000 });

  // The header's Invite (the Guests card has one too).
  await dirk.tab.getByRole("button", { name: "Invite", exact: true }).first().click();
  const field = dirk.tab.getByLabel("Invite link", { exact: true });
  await field.waitFor({ timeout: 30_000 });
  const link = await field.inputValue();
  expect(link).toContain("from=Dirk");
  // With no `invitePage` in peershare.json, invites open /invite on the page's own site.
  expect(link.startsWith(`${init.pageOrigin}/invite#`)).toBe(true);

  const claudia = await person(init.browser);
  await claudia.tab.goto(link);
  await claudia.tab.getByRole("button", { name: /Join Dirk/ }).click();
  await claudia.tab.getByRole("button", { name: /Close session/ }).waitFor({ timeout: 60_000 });

  const frame = await viewerFrame(claudia.tab, init.sessionUrl);
  await frame.getByText("hello from Dirk's app").waitFor({ timeout: 30_000 });
  // Its live connection: a WebSocket from the isolated origin, over the mesh,
  // through Dirk's tab and the Bridge, to the app, and back (M9).
  await frame.getByText("live: pong").waitFor({ timeout: 30_000 });
  expect(new URL(frame.url()).origin).not.toBe(init.pageOrigin);
  // And Dirk sees who joined.
  await dirk.tab.keyboard.press("Escape");
  await dirk.tab.getByRole("dialog").waitFor({ state: "hidden", timeout: 5_000 });
  await dirk.tab.getByText(/Guest \S{6}/).waitFor({ timeout: 10_000 });
  // Online, from her heartbeats.
  await dirk.tab.getByText(/Online · joined/).waitFor({ timeout: 15_000 });

  // Dirk stops sharing: her page says so by itself, without a click of hers.
  await dirk.tab.getByRole("button", { name: "Stop sharing" }).click();
  await dirk.tab.getByRole("alertdialog").getByRole("button", { name: "Stop sharing" }).click();
  await claudia.tab.getByText("Dirk's computer isn't answering", { exact: false }).first().waitFor({
    timeout: 30_000,
  });

  // Dirk shares again; Claudia reloads her invite link: her membership, not "already used".
  await dirk.tab.getByRole("button", { name: "Start sharing" }).click();
  await dirk.tab.getByRole("button", { name: "Stop sharing" }).waitFor({ timeout: 30_000 });
  // The reload resumes by itself; Try again (a Join with the same link) is the other way back.
  await claudia.tab.reload();
  const back = claudia.tab.getByRole("button", { name: /Close session/ });
  for (let i = 0; i < 3 && !(await back.isVisible().catch(() => false)); i++) {
    const tryAgain = claudia.tab.getByRole("button", { name: "Try again" });
    await back.or(tryAgain).first().waitFor({ timeout: 60_000 });
    if (await tryAgain.isVisible().catch(() => false)) await tryAgain.click().catch(() => {});
  }
  await back.waitFor({ timeout: 60_000 });
  expect(await claudia.tab.getByText("This invite was already used").count()).toBe(0);

  // Dirk revokes her: her page tells her, and Dirk still sees her, as revoked.
  await dirk.tab.getByRole("button", { name: "Revoke" }).first().click();
  await dirk.tab.getByRole("alertdialog").getByRole("button", { name: "Revoke access" }).click();
  await claudia.tab.getByText("Dirk removed your access").waitFor({ timeout: 30_000 });
  await dirk.tab.getByText("Revoked by you").waitFor({ timeout: 10_000 });
  expect([...dirk.errors, ...claudia.errors]).toEqual([]);

  if (init.screenshots != null) {
    await dirk.tab.screenshot({ path: `${init.screenshots}/dirk.png`, fullPage: true });
    await claudia.tab.screenshot({ path: `${init.screenshots}/claudia.png`, fullPage: true });
  }
  await dirk.tab.context().close();
  await claudia.tab.context().close();
}

/** Dirk's local app. */
export async function startDirksApp(): Promise<{ origin: string; close(): Promise<void> }> {
  const { createServer } = await import("node:http");
  const { WebSocketServer } = await import("ws");
  const server = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    // A live channel, opened the way apps do: to their own host.
    res.end(`<!doctype html><html><head><title>Dirk's app</title></head><body>
<h1 id=hello>hello from Dirk's app</h1><p id=live>live: waiting</p>
<script>
const ws = new WebSocket((location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/live");
ws.onopen = () => ws.send("ping");
ws.onmessage = (e) => { document.getElementById("live").textContent = "live: " + e.data; };
ws.onclose = (e) => { if (!/pong/.test(document.getElementById("live").textContent)) document.getElementById("live").textContent = "live: closed " + e.code; };
</script></body></html>`);
  });
  const wss = new WebSocketServer({ server });
  wss.on("connection", (socket) =>
    socket.on("message", (data) => socket.send(data.toString() === "ping" ? "pong" : "?")),
  );
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const address = server.address();
  if (address == null || typeof address === "string") throw new Error("no address");
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise((r) => {
        for (const c of wss.clients) c.terminate();
        server.close(() => r());
      }),
  };
}
