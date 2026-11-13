# SandClaw.ai PeerShare Proxy — Chrome extension

The [local proxy](../apps/peershare.app/proxy/)'s job, without a script to start: it lets the
PeerShare page (`https://peershare.sandclaw.ai`) reach services on this computer and the local
network that don't allow calls from other sites (no CORS).

Stripped down from [WebRun DevTools](https://github.com/statewalker/webrun-devtools) to its proxy
part, and speaking the local proxy's wire contract, so PeerShare treats it as one more way to
reach the Bridge.

## How it works

```
PeerShare page ──postMessage + MessagePort──▶ content.js ──chrome.runtime──▶ background.js ──fetch──▶ service
```

- `src/content.ts` runs only on the PeerShare page and on `localhost` / `127.0.0.1` pages. When
  the page asks (`findExtension()` in `@statewalker/peershare.share/browser`) it hands over a
  `MessagePort`; each request on it goes to the background worker.
- `src/background.ts` checks the sender's page again and calls `relay()`.
- `src/relay.ts` is the Bridge's job under the Bridge's rules: only `localhost` and private or
  Tailscale addresses, the Bridge's headers consumed, the Bridge's `x-peershare-bridge` markers
  on failures. The protocol between page and extension is in
  `apps/peershare.share/src/public/extension.ts`.

Unlike the script: no per-guest cookie jars (an extension can't see `Set-Cookie`), redirects are
followed (an extension only sees opaque ones), no WebSockets, and `.local` names are refused (an
extension can't resolve them to check where they point).

## Build and load

```sh
pnpm install
pnpm --filter @statewalker/peershare.chrome-extension build   # → chrome-extension/dist
pnpm --filter @statewalker/peershare.chrome-extension zip     # also a .zip for the Web Store
```

In Chrome: `chrome://extensions` → **Developer mode** → **Load unpacked** → `chrome-extension/dist`.

The version is `package.json`'s; each release has an entry in `CHANGELOG.txt`.

## Test

```sh
pnpm --filter @statewalker/peershare.chrome-extension test
```
