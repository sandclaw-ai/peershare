# @statewalker/peershare.share-react

## What it is

PeerShare's views. The screens were prototyped in Storybook (`statewalker-sandbox`, `apps/peershare-ui-protos`)
and moved here with their tests. `SharerScreen` and `GuestScreen` wire them to
`@statewalker/peershare.share`: they read its model (`peershare:model`, through
`useSyncExternalStore`) and act only through its commands.

## How to use

```tsx
import { PeerShareProvider, SharerScreen, GuestScreen } from "@statewalker/peershare.share-react";
import "@statewalker/peershare.share-react/styles.css";

<PeerShareProvider rt={rt}>
  <SharerScreen />
</PeerShareProvider>;
```

| Export | What |
|---|---|
| `SharerScreen` | Services (add, edit, Test again, Turn off), server on/off, Invite dialog, Guests (Revoke) |
| `GuestScreen` | the Join page with every outcome, then the Viewer (picker, paused, offline, Close session). `frameFor` supplies the isolated origin per Service |
| `SharerServices`, `InviteDialog`, `GuestList`, `BridgeStatus`, `GuestJoin`, `ViewerFrame` | the screens on their own: props in, callbacks out |

## Internals

- `validateDraft` keeps only the form's own checks (a name, no duplicates, the `0.0.0.0`
  hint). Whether an address can be shared, and how, is `checkServiceTarget` from
  `@statewalker/httpeers-share`: one rule, the logic's.
- `src/vendor/` holds ui-protos parts copied from sandclaw, listed in
  [PROVENANCE.md](PROVENANCE.md).
- `GuestScreen` is tested against a stand-in PeerShare at the views' seam (model and
  commands), because jsdom cannot host a libp2p mesh. The real Guest is tested in
  `@statewalker/peershare.share`; the page's end-to-end test joins the two.
- Found while wiring: `useCall` must be stable per runtime. An unstable one made the
  catalog effect re-run on every render, an endless loop that `GuestScreen`'s test caught.

```sh
pnpm --filter @statewalker/peershare.share-react test
```

## License

MIT
