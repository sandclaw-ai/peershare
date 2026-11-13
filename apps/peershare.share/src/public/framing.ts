/**
 * A Service that refuses to be framed, and the Sharer's opt-in to show it anyway.
 *
 * A Guest sees every Service inside a frame of the PeerShare page, at an
 * origin of its own (`<name>.s.sandclaw.ai`). A Service whose answers carry
 * `X-Frame-Options` or a CSP `frame-ancestors` directive that does not admit
 * that page is refused by the Guest's browser: Firefox and Chrome show an
 * error instead of it.
 *
 * `allowFraming` (per Service, off by default) removes exactly those two
 * rules from what the Sharer's hub sends to Guests, and nothing else: the
 * rest of the Service's CSP stays in force, and the Service on its own origin
 * (what the Sharer opens directly) keeps all its rules. The session shell
 * then adds its own `frame-ancestors`, which admits only pages on the parent
 * zone. The help's "security#framing" says what that trades away.
 */

/** Whether a Service's answer forbids being shown inside the PeerShare page. */
export function refusesFraming(headers: Headers): boolean {
  if (headers.has("x-frame-options")) return true;
  return frameAncestors(headers.get("content-security-policy")).some(
    // Only `*` admits a page on another site; 'self', 'none' and other hosts do not.
    (sources) => !sources.split(/\s+/).includes("*"),
  );
}

/** The answer without `X-Frame-Options` and without any CSP `frame-ancestors` directive. */
export function withoutFramingRules(response: Response): Response {
  const csp = response.headers.get("content-security-policy");
  const xfo = response.headers.has("x-frame-options");
  if (!xfo && frameAncestors(csp).length === 0) return response;
  const headers = new Headers(response.headers);
  headers.delete("x-frame-options");
  if (csp != null) {
    const kept = stripFrameAncestors(csp);
    if (kept === "") headers.delete("content-security-policy");
    else headers.set("content-security-policy", kept);
  }
  const nullBody = [101, 204, 205, 304].includes(response.status);
  return new Response(nullBody ? null : response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Several CSP headers arrive joined by commas (one policy each); a policy's
 * directives are separated by semicolons. Neither character occurs inside a
 * directive's sources, so splitting on them is exact.
 */
function policies(csp: string): string[][] {
  return csp.split(",").map((policy) =>
    policy
      .split(";")
      .map((d) => d.trim())
      .filter(Boolean),
  );
}

const isFrameAncestors = (directive: string) => /^frame-ancestors(\s|$)/i.test(directive);

function frameAncestors(csp: string | null): string[] {
  if (csp == null) return [];
  return policies(csp)
    .flat()
    .filter(isFrameAncestors)
    .map((d) => d.replace(/^frame-ancestors\s*/i, ""));
}

function stripFrameAncestors(csp: string): string {
  return policies(csp)
    .map((directives) => directives.filter((d) => !isFrameAncestors(d)).join("; "))
    .filter(Boolean)
    .join(", ");
}
