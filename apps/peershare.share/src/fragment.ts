/**
 * PeerShare as a SandClaw logic fragment: `bootShell({ logic: [peershareFragment(init)] })`.
 *
 * The Feature contributes to the workspace's own Slots and Commands, the
 * same instances every other fragment uses; its views (peershare.share-react)
 * then find PeerShare's model and commands there.
 */

import { Commands, CommandsRegistry } from "@statewalker/shared-commands";
import { Slots } from "@statewalker/shared-slots";
import { getWorkspace } from "@statewalker/workspace.core";
import { type PeerShareInit, peershare } from "./public/feature.js";

export function peershareFragment(
  init: PeerShareInit,
): (ctx: Record<string, unknown>) => () => Promise<void> {
  return (ctx) => {
    const workspace = getWorkspace(ctx);
    const dispose = peershare(init).contribute({
      slots: workspace.requireAdapter(Slots),
      commands: workspace.requireAdapter(Commands),
      handled: CommandsRegistry.create(),
    });
    return async () => dispose();
  };
}
