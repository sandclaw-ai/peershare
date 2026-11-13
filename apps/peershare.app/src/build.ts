/** Which build of the page this is: stamped in by vite.config.ts, "dev" where nothing stamped it. */

declare const __PEERSHARE_BUILD__:
  | { version: string; commit: string; builtAt: string; extension?: string }
  | undefined;

export const BUILD =
  typeof __PEERSHARE_BUILD__ !== "undefined"
    ? __PEERSHARE_BUILD__
    : { version: "dev", commit: "unknown", builtAt: "unknown", extension: undefined };
