/**
 * The example site (example-site/, published at peershare-demo.sandclaw.ai): what makes it
 * shareable directly, checked on the files themselves.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { checkServiceTarget } from "@statewalker/httpeers-share";
import { describe, expect, it } from "vitest";

const site = resolve(import.meta.dirname, "../example-site");
const read = (path: string) => readFileSync(join(site, path), "utf8");

describe("the example site", () => {
  it("is shared directly: a remote https address with a domain name", () => {
    expect(checkServiceTarget("direct", "https://peershare-demo.sandclaw.ai").ok).toBe(true);
  });

  it("lets the published PeerShare page read it (cors)", () => {
    const config = JSON.parse(read(".site/config.json"));
    expect(config.cors).toContain("https://peershare.sandclaw.ai");
    expect(config.notFound).toBe("/404.html");
  });

  it("links its pages, assets and data relatively, so a Guest's origin serves them all", () => {
    const pages = readdirSync(site).filter((f) => f.endsWith(".html") && f !== "404.html");
    expect(pages.sort()).toEqual(["about.html", "index.html", "releases.html"]);
    for (const page of pages) {
      // No absolute address back to the site itself.
      expect(read(page)).not.toMatch(/(href|src)="https?:\/\//);
    }
    expect(read("assets/app.js")).toMatch(/fetch\(`data\//);
    for (const data of ["status", "releases"]) {
      expect(() => JSON.parse(read(`data/${data}.json`))).not.toThrow();
    }
  });
});
