/** The Sharer's screen, wired to the real PeerShare logic through its model and commands. */

import {
  createRuntime,
  GetSharer,
  peershare,
  type SharerState,
} from "@statewalker/peershare.share";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PeerShareProvider, SharerScreen } from "../src/connected/index.js";

afterEach(cleanup);

function runtimeWithPeerShare() {
  const rt = createRuntime();
  let saved: SharerState | undefined;
  peershare({
    store: {
      load: async () => saved,
      save: async (s) => {
        saved = s;
      },
    },
  }).contribute(rt);
  return rt;
}

const sharer = async (rt: ReturnType<typeof runtimeWithPeerShare>) =>
  (await rt.commands.call(GetSharer, undefined).promise).services;

/** Shares a service through the form: the dialog when services exist, the page when none do. */
async function share(name: string, target: string) {
  const dialog = screen.queryByRole("dialog");
  const scope = dialog != null ? within(dialog) : screen;
  fireEvent.change(scope.getByLabelText("Name"), { target: { value: name } });
  fireEvent.change(scope.getByLabelText("Address"), { target: { value: target } });
  await act(async () => {
    fireEvent.click(scope.getByRole("button", { name: "Share service" }));
  });
}

function renderScreen(rt: ReturnType<typeof runtimeWithPeerShare>) {
  render(
    <PeerShareProvider rt={rt}>
      <SharerScreen proxy={<p>the proxy card</p>} />
    </PeerShareProvider>,
  );
}

describe("SharerScreen", () => {
  it("a service typed into the first-run form appears in the list, from the model", async () => {
    const rt = runtimeWithPeerShare();
    renderScreen(rt);
    expect(screen.getByText("the proxy card")).toBeTruthy();

    await share("fooService", "http://localhost:5173");

    expect(await screen.findByRole("heading", { name: "fooService" })).toBeTruthy();
    expect(await sharer(rt)).toHaveLength(1);
  });

  it("the switch pauses a service (toggle-service)", async () => {
    const rt = runtimeWithPeerShare();
    renderScreen(rt);
    await share("foo", "http://localhost:5173");

    await act(async () => {
      fireEvent.click(await screen.findByRole("switch", { name: "Share foo" }));
    });

    expect((await sharer(rt))[0]?.enabled).toBe(false);
  });

  it("a second service from the dialog; the list follows Make default and Remove", async () => {
    const rt = runtimeWithPeerShare();
    renderScreen(rt);
    await share("foo", "http://localhost:5173");
    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: /Add service/ }));
    });
    await share("bar", "http://localhost:3000");
    expect(await screen.findByRole("heading", { name: "bar" })).toBeTruthy();

    // Called as commands: the screen follows the model. (The menu needs a real pointer;
    // the page's end-to-end scenario clicks it.)
    const { SetDefault, RemoveService } = await import("@statewalker/peershare.share");
    const bar = (await sharer(rt)).find((s) => s.name === "bar");
    await act(async () => {
      await rt.commands.call(SetDefault, { id: bar?.id ?? "" }).promise;
    });
    expect((await sharer(rt)).find((s) => s.name === "bar")?.isDefault).toBe(true);
    expect(await screen.findAllByText("Default")).toHaveLength(1);

    await act(async () => {
      await rt.commands.call(RemoveService, { id: bar?.id ?? "" }).promise;
    });
    expect(screen.queryByRole("heading", { name: "bar" })).toBeNull();
  });

  it("without a mesh, sharing is off and the page offers to start it", () => {
    renderScreen(runtimeWithPeerShare());
    expect(screen.getByRole("button", { name: /Start sharing/ })).toBeTruthy();
    expect(screen.getByText("Sharing is off")).toBeTruthy();
  });
});
