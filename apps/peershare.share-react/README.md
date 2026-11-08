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
| `SharerServices`, `InviteDialog`, `GuestList`, `BridgeStatus`, `ProxySettings`, `GuestJoin`, `ViewerFrame` | the screens on their own: props in, callbacks out. `ProxySettings` takes the proxy's address and key, shows the command that starts it, and on a browser that cannot reach it (`supported={false}`) says which browsers can |

### The kit and the gallery

`@statewalker/peershare.share-react/kit` is the next generation of these screens, drawn from
PeerShare's usage scenarios (S1–S7 for the Sharer, G1–G4 for a Guest): presentational and
controlled, shadcn/ui on Tailwind. `SharerPage` is the whole Sharer page, and each prop names
the command it stands for. `GuestLanding` covers the invite and every Join outcome;
`GuestViewer` covers the Viewer and its states. The parts they are made of are exported too:
`BridgeCard`, `ServiceCard`, `ServiceForm`/`ServiceDialog`, `InviteDialog`, `GuestsCard`, and
the status badges. The shadcn primitives that `@statewalker/ui.view.shadcn` does not export
(Badge, Switch, Alert, DropdownMenu) live in `src/kit/primitives.tsx`.

The kit adds what the current screens lack: Remove and Make default (`RemoveService`,
`SetDefault`), a sharing status bar with a confirmation before Stop, a Bridge state for "no
Bridge", and the address's kind while it is typed. It is not wired yet: `SharerScreen` and
`GuestScreen` still draw the views above.

`gallery/` shows every scenario step by step, as live frames, with the commands each step
calls. It is published at https://peershare.httpeers.net/ui/.

```sh
pnpm --filter @statewalker/peershare.share-react gallery          # dev server
pnpm --filter @statewalker/peershare.share-react build:gallery    # gallery/dist
```

`?frame=<id>` opens one frame alone, at its device's size, and runs its interaction script
(`gallery/play.ts`: typing and clicks, the way a person would). The gallery shows those pages
scaled down, so each frame's dialogs and menus stay inside it. `test/kit.test.tsx` renders every
frame.

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
