# @statewalker/peershare.app

## What it is

The standalone PeerShare page, with two routes:

- `/peer-share#localUrl=…&t=…` is the Sharer. The fragment pairs the page with the
  Bridge (the Bridge prints or opens this link). Sharing starts when the page opens and
  stops with the tab (ADR 0001).
- `/peer-share/invite#join=…&from=Dirk` is a Guest. Join, then the Viewer: each Service
  in its own isolated session origin (ADR 0003), answered over the mesh.

It is `@statewalker/peershare.share` (logic) + `@statewalker/peershare.share-react` (views) +
`@statewalker/peershare.share/browser` (browser mesh platform, IndexedDB) + the session-shell
client (`src/vendor/`, see [PROVENANCE.md](PROVENANCE.md)).

## How to use

### Run it on this machine

```sh
apps/peershare.app/local/peershare.sh --demo --open        # Node
apps/peershare.app/local/peershare.sh --bun --demo --open  # the server under Bun
```

The script installs, builds, and starts a relay, the page, the session shell and the
Bridge, each on loopback (`local/serve.mjs`). Nothing is deployed and nothing native is built:

| | |
|---|---|
| `http://localhost:8080` | the page, for the Sharer and for Guests |
| `http://<name>.localhost:8081` | Guests' isolated sessions (`*.localhost` is a secure context in Chromium and Firefox) |
| `ws://127.0.0.1:8082` | the relay; its key is kept in `local/state/`, so its address survives restarts |
| `http://127.0.0.1:9090` | the Bridge, with a new Pairing token on every start |
| `http://127.0.0.1:3999` | with `--demo`: an app to share, with a WebSocket and a cookie |

It prints the link that pairs the page with the Bridge: open it (or pass `--open`), add a
Service (the demo app, or anything on your machine or LAN), invite, and open the Invite in
another browser profile or another browser. Everything is on loopback, so Guests are on this
machine. Options: `--port` (page; sessions and relay take the next two), `--bridge-port`,
`--demo-port`, `--no-cookie-jars`, `--no-build` (reuse the last build).

Until `@statewalker/httpeers-share` is on npm, run it with a checkout of statewalker/httpeers:
`HTTPEERS_DIR=../httpeers apps/peershare.app/local/peershare.sh --demo`. The script builds
that package there and links it in without touching the lockfile. `tests/local.test.ts` runs the
whole scenario against `local/serve.mjs` (`PEERSHARE_RUNTIME=bun` for Bun).

### Develop

```sh
pnpm build                # dist/
pnpm dev                  # vite
```

Serve `dist/` with every route falling back to `index.html`, and `/peershare.json` beside it:

```json
{
  "relayAddrs": ["/dns4/relay.example/tcp/443/wss/p2p/12D3Koo…"],
  "sessionOrigin": "https://{name}.p.sandclaw.ai"
}
```

## Publishing (decision 2.8)

```sh
pnpm build:site            # site/peershare.httpeers.net/: the page, peershare.json, .site/config.json
rclone sync site/peershare.httpeers.net httpeers:sites/peershare.httpeers.net
```

`build:site` reads the relay's addresses from its own document
(`https://relay.httpeers.net/.well-known/httpeers-relay.json`), points sessions at
`*.p.httpeers.net`, and sets `spa: true` so `/peer-share/invite` is served too. `SITE`,
`SESSION_ZONE` and `RELAY_DOCUMENT_URL` override the defaults. `tests/site.test.ts` checks
the folder.

## Internals

`tests/e2e.test.ts` runs the whole scenario in Chromium. Dirk and Claudia are two
browser contexts, with two IndexedDBs and two mesh nodes. Everything around them is real:
a relay, Dirk's Bridge and app, the built page on a public https origin, and session
origins built from the vendored shell (`tests/e2e-harness.ts`). `tests/deploy.test.ts` runs the same
scenario through the Docker deployment (`apps/peershare.app/deploy`). The two files run one at a time
(`fileParallelism: false`): each starts Chromium, a relay and a page build. The scenario checks:
- Dirk pairs with the Bridge, starts sharing, exposes his app and makes an Invite;
- Claudia opens it, joins, and sees the app in her own origin;
- the app's WebSocket to its own host works (the shim, `src/ws-shim.ts`, hands it to the Viewer,
  which carries it over the mesh);
- Dirk sees her in his Guests list.

The deployed `*.p.httpeers.net` shell accepts parent pages on `*.httpeers.net` only, which
is why the page is published there (decision 2.8). `apps/peershare.app/deploy` runs it under a zone
of one's own instead.

## License

MIT
