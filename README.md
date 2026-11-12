# PeerShare

Share local HTTP services with invited Guests over an httpeers mesh. Live at
https://peershare.sandclaw.ai.

| Package | What |
|---|---|
| [`apps/peershare.app`](apps/peershare.app) | the page (Sharer and Guest), the session shell, the local proxy |
| [`apps/peershare.share`](apps/peershare.share) | the logic: runtime, model, commands |
| [`apps/peershare.share-react`](apps/peershare.share-react) | the screens and the UI gallery |
| [`apps/peershare.help`](apps/peershare.help) | the help site (Astro), served under `/help/` |

```sh
pnpm install
pnpm test
pnpm typecheck
docker build -f docker/Dockerfile -t peershare .
```

Deployment: one image, `ghcr.io/sandclaw-ai/peershare`, built by `.github/workflows/docker.yml`
and run behind Traefik; see `apps/peershare.app/README.md`, "Deploying".

Extracted with its history from [statewalker/sandclaw](https://github.com/statewalker/sandclaw).
