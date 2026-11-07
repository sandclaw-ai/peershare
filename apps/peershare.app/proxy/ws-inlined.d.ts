/** `ws` itself, under the name `proxy/ws-for-runtime.ts` imports it by (`scripts/build-proxy.mjs`). */
declare module "ws-inlined" {
  export * from "ws";
  export { default } from "ws";
}
