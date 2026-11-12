# @statewalker/peershare.app

## What it is

The standalone PeerShare page, with two routes:

- `/` (and `/peer-share`) is the Sharer, the hub. Sharing starts when the page opens and
  stops with the tab. Services that allow calls from the page (CORS) need nothing
  installed; the others go through the local proxy (below).
- `/invite#join=…&from=Dirk` is a Guest (`/peer-share/invite` is also served). Join, then
  the Viewer: each Service in its own isolated session origin, answered over the mesh. Every invite link opens `invitePage` from `peershare.json`
  (`https://peershare.sandclaw.ai/invite` when published), or `/invite` on the page's own
  origin when it is not set. So a Sharer on any copy of the page, a local one included, hands
  out links that work for Guests anywhere.

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

`--public` is for real Guests on other machines. No local relay starts. The page uses httpeers'
relay (read from `https://relay.httpeers.net/.well-known/httpeers-relay.json`, so it needs the
network), and invites open `https://peershare.sandclaw.ai/invite`. Guests then join through
the published page and its session zone, while the Sharer's page, proxy and services stay on
this machine.

`HTTPEERS_DIR=../httpeers` runs it against a checkout of statewalker/httpeers instead of the
npm package: the script builds that package there and links it in without touching the
lockfile. `e2e-browser/local.test.ts` runs the whole scenario against `local/serve.mjs`
(`PEERSHARE_RUNTIME=bun` for Bun).

**`--bun` needs Bun 1.4 or later.** `@libp2p/websockets` accepts each TCP socket itself and
hands it to an `http.Server` with `server.emit("connection", socket)`. Bun's `node:http` ignored a
socket handed over that way up to 1.3.x (checked with 1.1.45, 1.2.23 and 1.3.14), so the relay
accepted no connections and the page stayed on "Proxy connected". Bun 1.4.0 to 1.4.4 answer it.
`peershare.sh --bun` and `serve.mjs` refuse an older Bun; `bun upgrade`, or run under Node.

### The proxy reaches services that send no CORS headers

A page can fetch a local service only if the service allows it with CORS. For the others, the
Sharer runs the proxy, which is the Bridge as a command:

```sh
curl -fsSL https://peershare.sandclaw.ai/proxy/peershare-proxy.sh | sh
curl -fsSL https://peershare.sandclaw.ai/proxy/peershare-proxy.sh | sh -s -- --port 9091 --key s3cret
```

The launcher fetches the proxy (`/proxy/peershare-proxy.mjs`, one file) into
`~/.cache/peershare/` and runs it with the first of Deno, Bun or Node it finds. With none of
them, it downloads Deno once into `~/.cache/peershare/deno-<version>/` (it needs `unzip`), and
never installs anything system-wide. It runs on macOS and Linux.

| Option | Default | Meaning |
|---|---|---|
| `--port` | `9090` | listens on `127.0.0.1` only |
| `--key` | none | when set, pages must send it; a wrong one is refused with 401 |
| `--origin` | `https://peershare.sandclaw.ai`, `http://localhost:*`, `http://127.0.0.1:*` | the pages allowed to use it; repeat it or use commas; it replaces the list |
| `--no-cookie-jars` | jars on | one cookie jar per Guest |

**Why the origin list, and why the key is optional.** A loopback port that answers
cross-origin requests can be reached by every website the Sharer visits. The origin list is
the guard: a page from any other origin gets 403 with no CORS grant. With that in place, the
key protects only against local pages, so it is off by default. `--origin '*'` lets every
site in, and the proxy prints a warning that says so. Targets are limited the same way as the
Bridge's: this machine and the private network.

**How the hub finds the proxy.** The hub's *Local proxy* card holds the proxy's address
(default `http://127.0.0.1:9090`) and key, which are kept in this browser's `localStorage`
(`peershare:proxy`, `src/proxy-settings.ts`). A link with `#localUrl=…&t=…`, as printed by the
proxy and `local/serve.mjs`, fills them in. The fragment is then removed from the address bar,
so the key doesn't stay on screen or in the history. The page checks the proxy only when it is
in use: after a save, after such a link, or on the first request a Service sends through it.
Opening the hub never probes the Sharer's machine. When a check fails, the page says why:
"No proxy is running at that address", "The proxy refused the key", or "Your browser blocked
access to your local network" (Chromium's Local Network Access). Chromium's refusal looks
exactly like a closed port, so the page reads the permission state to tell them apart
(`src/bridge-diagnosis.ts`). Safari blocks a secure page's calls to `http://127.0.0.1`, so
there the card says the proxy needs Chrome or Firefox. Services that send CORS headers still
work in Safari.

**Why one file runs on three runtimes.** `scripts/build-proxy.mjs` inlines every dependency
except `node:*`. The one exception is `ws`, which is picked at run time
(`proxy/ws-for-runtime.ts`). Under Bun, the bundled `ws` connects to the app but never
finishes the page's upgrade: the page waits with no error. So Bun gets its own built-in `ws`,
and Node and Deno get the inlined copy. `pnpm test:runtimes` runs the built file under all
three, and needs `bun` and `deno` installed. `test/launcher.test.ts` runs the launcher as a
real `sh`, with stub runtimes on `PATH`.

### An example site to share

`example-site/` is a small static site to try PeerShare with: a status board, a releases table
(both read from JSON by a script), an about page and a 404. It is published at
https://peershare-demo.sandclaw.ai by `.github/workflows/peershare-demo-site.yml`.

Share it with **Address** `https://peershare-demo.sandclaw.ai`. It is a remote https site with
a domain name, so it is shared directly, without the proxy. Directly means the PeerShare page
reads it with `fetch`, so the site has to allow that. Its `.site/config.json` lists
`https://peershare.sandclaw.ai` (and `http://localhost:8080` for `local/serve.mjs`) under
`cors`. httpeers' sites host then sends `Access-Control-Allow-Origin` and answers the preflight
that PeerShare's own `x-peershare-guest` header causes. Its links and data paths are relative,
so in a Guest's isolated origin every page, image and JSON file comes over the mesh.

#### Publishing it on every merge

`.github/workflows/peershare-demo-site.yml` publishes `example-site/` as it is (no build step)
whenever a push to `main` changes it, which includes merging a pull request. It can also be run by
hand. It uses statewalker/.github's `publish-site.yml`, which copies the files to httpeers' `sites`
bucket under the prefix `peershare-demo.sandclaw.ai`. The sites host serves them from there at
once, and the wildcard DNS and certificate for `*.httpeers.net` cover the name, so there is no DNS
or certificate step.

It uses the same two repository secrets as the PeerShare site, `HTTPEERS_S3_ACCESS_KEY_ID` and
`HTTPEERS_S3_SECRET_ACCESS_KEY`. They hold a RustFS user, `peershare-site`, whose policy lets it
write only the prefixes it is given. That user must be given the demo's prefix too; until then
the publish fails with "is a file not a directory". This is a one-time step:

1. On a computer with ssh access to the httpeers server, Docker, `openssl` and `gh` (logged in
   with admin rights on statewalker/sandclaw), check out statewalker/cellb.dev and run:

   ```sh
   REPO=statewalker/sandclaw \
   SITE_USER=peershare-site \
   SITE_DOMAIN=peershare.sandclaw.ai \
   SITE_DOMAINS="peershare.sandclaw.ai s.sandclaw.ai peershare-demo.sandclaw.ai" \
     site/scripts/setup-publish-secrets.sh
   ```

   The script reads RustFS's root key over ssh and uses it only on the server. It then:
   - rewrites the `peershare-site` policy for these three prefixes;
   - gives the user a new secret key and checks it can write under
     `peershare.sandclaw.ai/.site/`, a path that is never served;
   - stores the new pair in both repository secrets.

   The old key stops working at once, so the PeerShare site picks up the new one too.
   Always pass all three domains: a domain left out of `SITE_DOMAINS` loses its write access.
2. Publish without waiting for a change: run the **PeerShare example site** workflow from the
   Actions tab, or run `gh workflow run peershare-demo-site.yml -R statewalker/sandclaw --ref main`.
   Its last step fails unless `https://peershare-demo.sandclaw.ai/` answers.
3. Check that the CORS headers come back for the PeerShare page and not for other origins:

   ```sh
   curl -sI -H 'Origin: https://peershare.sandclaw.ai' https://peershare-demo.sandclaw.ai/data/status.json
   #   access-control-allow-origin: https://peershare.sandclaw.ai
   #   vary: Origin
   curl -sI -H 'Origin: https://example.org' https://peershare-demo.sandclaw.ai/data/status.json
   #   (no access-control-allow-origin)
   curl -si -X OPTIONS -H 'Origin: https://peershare.sandclaw.ai' \
     -H 'Access-Control-Request-Method: GET' \
     -H 'Access-Control-Request-Headers: x-peershare-guest' \
     https://peershare-demo.sandclaw.ai/data/status.json
   #   204, with access-control-allow-headers: x-peershare-guest
   ```

   The sites host answers `cors` since statewalker/httpeers#65. If no CORS header comes back, the
   sites host running on the server predates that change and needs a redeploy.

To allow another origin, add it to `cors` in `example-site/.site/config.json` and merge. The next
publish applies it; there is nothing to change on the server. `test/example-site.test.ts` checks
the config and that every link in the site is relative.

### The help site

`apps/peershare.help` (Astro) is published under https://peershare.sandclaw.ai/help/: what
PeerShare is, getting started, how it works, why it is safe, the local proxy, troubleshooting.
The site workflow builds it and copies it into the site's `help/` folder.

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
pnpm build:site            # site/peershare.sandclaw.ai/: the page, peershare.json, proxy/, .site/config.json
rclone sync site/peershare.sandclaw.ai httpeers:sites/peershare.sandclaw.ai
```

`build:site` reads the relay's addresses from its own document
(`https://relay.httpeers.net/.well-known/httpeers-relay.json`), points sessions at
`*.s.sandclaw.ai`, sets `invitePage` to `https://peershare.sandclaw.ai/invite`, and sets
`spa: true` so `/invite` is served too. `SITE`,
`SESSION_ZONE` and `RELAY_DOCUMENT_URL` override the defaults. `test/site.test.ts` checks
the folder.

## Internals

`e2e-browser/e2e.test.ts` runs the whole scenario in Chromium. Dirk and Claudia are two
browser contexts, with two IndexedDBs and two mesh nodes. Everything around them is real:
a relay, Dirk's Bridge and app, the built page on a public https origin, and session
origins built from the vendored shell (`e2e-browser/e2e-harness.ts`). `e2e-browser/deploy.test.ts` runs the same
scenario through the Docker deployment (`apps/peershare.app/deploy`). The two files run one at a time
(`fileParallelism: false`): each starts Chromium, a relay and a page build. `pnpm test` skips
them; `pnpm test:e2e-browser` runs them and needs Chromium (`pnpm exec playwright install
chromium`), plus Docker for `deploy.test.ts`. Each run picks free ports
(`e2e-browser/free-ports.ts`), so it does not collide with other services. The scenario checks:
- Dirk pairs with the Bridge, starts sharing, exposes his app and makes an Invite;
- Claudia opens it, joins, and sees the app in her own origin;
- the app's WebSocket to its own host works (the shim, `src/ws-shim.ts`, hands it to the Viewer,
  which carries it over the mesh);
- Dirk sees her in his Guests list.

Sessions live on `*.s.sandclaw.ai`, not on httpeers' shared `*.p.httpeers.net`. The Viewer
injects `/_shell/ws-shim.js` into every page a Service returns, and only this app's shell
(`src/vendor/session-shell`, built with the shim by `deploy/build.mjs`) has that file; the
shared shell on `*.p` does not, and there every shared app's WebSocket fails while its page
loads fine. Publish the shell to the `s.sandclaw.ai` prefix (relay.html last, as below):

```sh
SESSION_ZONE=s.sandclaw.ai PARENT_ZONE=httpeers.net RELAY_ADDRS=<relay multiaddr> node deploy/build.mjs
cd deploy/srv/shell && mkdir -p .site && echo '{ "notFound": "/index.html" }' > .site/config.json
rclone copy _shell <remote>:sites/s.sandclaw.ai/_shell
rclone copy . <remote>:sites/s.sandclaw.ai --exclude relay.html --exclude "_shell/**"
rclone copy relay.html <remote>:sites/s.sandclaw.ai
```

Either shell accepts parent pages on `*.httpeers.net` only, which is why the page is
published there (decision 2.8). `apps/peershare.app/deploy` runs it under a zone of one's
own instead.

## License

MIT
