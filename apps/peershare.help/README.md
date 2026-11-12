# @statewalker/peershare.help

## What it is

PeerShare's help site, built with [Astro](https://astro.build) and published at
https://peershare.sandclaw.ai/help/, next to the page it explains. It covers what PeerShare is,
how to use it, how it works, why it is safe, the local proxy, and troubleshooting. The security
page explains:
- sharing happens between browser tabs, and no server stores anything;
- connections are encrypted end to end with Noise (WebRTC's DTLS on direct links, with the keys
  bound through that Noise channel);
- a peer ID is a public key, and identity comes from the handshake, never from the caller;
- membership is a Biscuit token bound to the guest's key and verified offline;
- invites are single-use, expire after 24 hours, and carry their secrets in the URL fragment;
- each service opens in its own isolated origin;
- the local proxy listens on loopback only and reaches only nearby addresses;
- and what none of this protects against.

## How to use

```sh
pnpm --filter @statewalker/peershare.help dev     # http://localhost:4321/help/
pnpm --filter @statewalker/peershare.help build   # dist/, for the site's help/ folder
pnpm --filter @statewalker/peershare.help test    # builds, then checks dist/
```

Astro 7.4 needs Node 22.23.4 or later (CI runs Node 24). The PeerShare site workflow
(`.github/workflows/peershare-site.yml`) builds this package and copies `dist/` into the site's
`help/` folder.

## Internals

- **It runs no script.** It shares an origin with the PeerShare page, which holds the Sharer's
  key, so it is plain HTML and CSS, and a test checks that no page contains a `<script>`.
- **`base: "/help"`.** Every internal link goes through `u()` (`src/lib/url.ts`), and "Open
  PeerShare" goes to `/`.
- **`build.format: "file"`** writes `security.html`, which the sites host serves at
  `/help/security`.
- **`compressHTML: false`.** Compression joined a word to a link that started the next source
  line ("onlibp2p").
- **The test builds with Vitest's environment removed.** Vitest sets `BASE_URL`, `MODE` and
  similar variables, and inherited by `astro build` they replace the config's base.
- The pages are `.astro` files with plain HTML prose; `src/pages/_nav.ts` orders them (the `_`
  keeps it out of the routes). The architecture diagram is inline SVG
  (`src/components/Architecture.astro`).
- To try PeerShare with nothing installed, share the separate example site
  (`apps/peershare.app/example-site`, at https://peershare-demo.sandclaw.ai).

## License

MIT
