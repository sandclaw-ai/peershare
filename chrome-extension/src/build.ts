/** The git commit the extension was built from (build.mjs); "dev" where nothing stamped it. */

declare const __PEERSHARE_EXTENSION_COMMIT__: string | undefined;

export const COMMIT =
  typeof __PEERSHARE_EXTENSION_COMMIT__ !== "undefined" ? __PEERSHARE_EXTENSION_COMMIT__ : "dev";
