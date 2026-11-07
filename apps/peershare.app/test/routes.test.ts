import { describe, expect, it } from "vitest";
import { isGuestPage } from "../src/routes.ts";

describe("routes", () => {
  it("open the Guest page at /invite and /peer-share/invite", () => {
    for (const p of ["/invite", "/invite/", "/peer-share/invite", "/peer-share/invite/x"]) {
      expect(isGuestPage(p)).toBe(true);
    }
    for (const p of ["/", "/peer-share", "/invited", "/proxy/peershare-proxy.sh"]) {
      expect(isGuestPage(p)).toBe(false);
    }
  });
});
