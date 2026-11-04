import { ruleSet } from "@statewalker/httpeers-access";

/**
 * PeerShare's mesh rules. A Guest may reach the Sharer's Services (`/s/…`)
 * the hub endpoints a member needs to stay a member (`/.well-known/…`) and
 * `/session/leave` to end its own membership, nothing else (apps/peershare-protos
 * rung 05).
 */
export const PEERSHARE_RULES = ruleSet({
  version: 1,
  rules: ['capability("peershare:view") <- role("guest");'],
  policies: [
    'allow if capability("peershare:view"), resource($r), $r.starts_with("/s/");',
    'allow if capability("peershare:view"), resource($r), $r.starts_with("/.well-known/");',
    'allow if capability("peershare:view"), resource($r), $r.starts_with("/session/");',
  ],
});

export const INVITE_TTL_MS = 24 * 60 * 60 * 1000;
