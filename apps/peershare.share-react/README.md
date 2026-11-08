# @statewalker/peershare.share-react

## What it is

PeerShare's screens, drawn from its usage scenarios (S1–S7 for the Sharer, G1–G4 for a Guest)
with shadcn/ui on Tailwind. `SharerScreen` and `GuestScreen` wire them to
`@statewalker/peershare.share`: they read its model (`peershare:model`, through
`useSyncExternalStore`) and act only through its commands.

## How to use

```tsx
import { PeerShareProvider, ProxyCard, SharerScreen, GuestScreen } from "@statewalker/peershare.share-react";
import "@statewalker/peershare.share-react/styles.css";

<PeerShareProvider rt={rt}>
  <SharerScreen proxy={<ProxyCard status={…} settings={…} command={…} supported onSave={…} onCheck={…} />} />
</PeerShareProvider>;
```

| Export | What |
|---|---|
| `SharerScreen` | The Sharer's page: name, sharing on and off (Stop asks first), services (add, edit, pause, Test again, Make default, Remove), Invite, Guests (Revoke). `proxy` is the slot for the local proxy's card, which the page that knows the proxy draws |
| `GuestScreen` | The invite with every Join outcome, then the Viewer: service tabs, offline, paused, nothing shared, Close session. `frameFor` supplies each Service's isolated origin |
| `ProxyCard` | The local proxy: what it is for, whether it answers (`unchecked`, `checking`, or a diagnosis), and its settings (the command that starts it, the address, the key). A diagnosis the settings fix opens them. With `supported={false}` (Safari) it says which browsers can reach it |
| `SharerPage`, `GuestLanding`, `GuestViewer`, and their parts (`ServiceCard`, `ServiceForm`/`ServiceDialog`, `InviteDialog`, `GuestsCard`, status badges) | The screens on their own: props in, callbacks out. Each `SharerPage` prop names the command it stands for |

`@statewalker/peershare.share-react/kit` exports the same screens without the wiring. Badge,
Switch, Alert and DropdownMenu, which `@statewalker/ui.view.shadcn` does not export, are shadcn
copies in `src/kit/primitives.tsx`.

### The gallery

`gallery/` shows every scenario step by step, as live frames, with the commands each step
calls. It is published at https://peershare.httpeers.net/ui/.

```sh
pnpm --filter @statewalker/peershare.share-react gallery          # dev server
pnpm --filter @statewalker/peershare.share-react build:gallery    # gallery/dist
```

`?frame=<id>` opens one frame alone, at its device's size, and runs its interaction script
(`gallery/play.ts`: typing and clicks, the way a person would). The gallery shows those pages
scaled down, so each frame's dialogs and menus stay inside it.

## Internals

- `validateDraft` keeps only the form's own checks (a name, no duplicates, the `0.0.0.0`
  hint). Whether an address can be shared, and how, is `checkServiceTarget` from
  `@statewalker/httpeers-share`: one rule, the logic's. The form shows the address's kind while
  it is typed, from the same rule.
- The model knows who joined, not who is connected now, so `SharerScreen` passes guests without
  presence and the page claims none ("1 guest", "1 joined"). `Guest.online` is for a caller that
  knows.
- `GuestScreen`'s fallback frame (before a Service's isolated origin is ready) is static text: a
  `srcdoc` frame shares the page's origin, and Service names are the Sharer's to choose.
- After Close session the Guest sees "Session closed", not the Join button again: the invite was
  used up and this browser forgot its identity.
- `GuestScreen` is tested against a stand-in PeerShare at the screens' seam (model and
  commands), because jsdom cannot host a libp2p mesh. The real Guest is tested in
  `@statewalker/peershare.share`; the page's end-to-end scenario (`apps/peershare.app/e2e-browser`)
  joins the two in Chromium, through these screens.
- `useCall` must be stable per runtime. An unstable one made the catalog effect re-run on every
  render, an endless loop that `GuestScreen`'s test caught.
- `test/kit.test.tsx` renders every gallery frame.

```sh
pnpm --filter @statewalker/peershare.share-react test
```

## License

MIT
