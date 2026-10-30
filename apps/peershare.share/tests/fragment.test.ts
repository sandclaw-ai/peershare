/** PeerShare in a SandClaw app: a logic fragment over the workspace's own slots and command bus. */

import { Commands } from "@statewalker/shared-commands";
import { Slots } from "@statewalker/shared-slots";
import { Workspace } from "@statewalker/workspace.core";
import { describe, expect, it } from "vitest";
import { peershareFragment } from "../src/fragment.js";
import { AddService, GetSharer } from "../src/public/commands.js";
import { peershareModelSlot } from "../src/public/extension-points.js";
import { memoryStore } from "./harness.js";

describe("the fragment", () => {
  it("answers PeerShare's commands on the workspace's bus and fills its slots; cleanup removes them", async () => {
    const workspace = new Workspace();
    const ctx: Record<string, unknown> = { "workspace:workspace": workspace };
    const commands = workspace.requireAdapter(Commands);
    const slots = workspace.requireAdapter(Slots);

    const cleanup = peershareFragment({ store: memoryStore() })(ctx);

    await commands.call(AddService, {
      name: "foo",
      kind: "bridged",
      target: "http://localhost:5173",
    }).promise;
    expect((await commands.call(GetSharer, undefined).promise).services).toHaveLength(1);
    let models = 0;
    slots.observe(peershareModelSlot, (v) => {
      models = v.length;
    })();
    expect(models).toBe(1);

    await cleanup();
    slots.observe(peershareModelSlot, (v) => {
      models = v.length;
    })();
    expect(models).toBe(0);
  });
});
