/** M1 — the Sharer's Services, without a mesh, driven through commands. */

import { describe, expect, it } from "vitest";
import {
  AddService,
  EditService,
  GetSharer,
  RemoveService,
  SetDefault,
  SetName,
  ToggleService,
} from "../src/public/commands.js";
import { sharerMountSlot } from "../src/public/extension-points.js";
import { withPeerShare } from "./harness.js";

describe("M1 — Services", () => {
  it("add-service lists a Service; the first one is the Default", async () => {
    const { call } = withPeerShare();

    const added = await call(AddService, {
      name: "fooService",
      kind: "bridged",
      target: "http://localhost:5173",
    });

    expect(added).toEqual({ ok: true, id: "fooservice" });
    expect((await call(GetSharer, undefined)).services).toEqual([
      expect.objectContaining({
        id: "fooservice",
        name: "fooService",
        enabled: true,
        isDefault: true,
      }),
    ]);
  });

  it("refuses what v1 cannot share, an unknown kind, and a nameless Service", async () => {
    const { call } = withPeerShare();

    expect(
      await call(AddService, { name: "api", kind: "direct", target: "http://api.example.com" }),
    ).toEqual({
      ok: false,
      reason: "needs-https",
    });
    expect(await call(AddService, { name: "x", kind: "pigeon", target: "coo://" })).toEqual({
      ok: false,
      reason: "unknown-kind",
    });
    expect(
      await call(AddService, { name: " ", kind: "bridged", target: "http://localhost:1" }),
    ).toEqual({
      ok: false,
      reason: "needs-name",
    });
    expect((await call(GetSharer, undefined)).services).toEqual([]);
  });

  it("edit-service re-applies the rule; remove-service takes it off the list", async () => {
    const { call } = withPeerShare();
    await call(AddService, { name: "foo", kind: "bridged", target: "http://localhost:5173" });

    expect(
      await call(EditService, {
        id: "foo",
        draft: { name: "foo", kind: "direct", target: "http://x.example" },
      }),
    ).toEqual({
      ok: false,
      reason: "needs-https",
    });
    expect(
      await call(EditService, {
        id: "foo",
        draft: { name: "Foo app", kind: "bridged", target: "http://localhost:3000" },
      }),
    ).toEqual({
      ok: true,
    });
    expect((await call(GetSharer, undefined)).services[0]).toMatchObject({
      id: "foo",
      name: "Foo app",
      target: "http://localhost:3000",
    });

    await call(RemoveService, { id: "foo" });
    expect((await call(GetSharer, undefined)).services).toEqual([]);
  });

  it("exactly one Default: set-default moves it; removing the Default promotes the next", async () => {
    const { call } = withPeerShare();
    await call(AddService, { name: "a", kind: "bridged", target: "http://localhost:1" });
    await call(AddService, { name: "b", kind: "bridged", target: "http://localhost:2" });
    const defaults = async () =>
      (await call(GetSharer, undefined)).services.filter((s) => s.isDefault).map((s) => s.id);

    expect(await defaults()).toEqual(["a"]);
    await call(SetDefault, { id: "b" });
    expect(await defaults()).toEqual(["b"]);
    await call(RemoveService, { id: "b" });
    expect(await defaults()).toEqual(["a"]);
  });

  it("exactly one Default through the form too: add and edit with Default on take it from the others", async () => {
    const { call } = withPeerShare();
    const defaults = async () =>
      (await call(GetSharer, undefined)).services.filter((s) => s.isDefault).map((s) => s.id);
    const a = { name: "a", kind: "bridged", target: "http://localhost:1" };
    const b = { name: "b", kind: "bridged", target: "http://localhost:2" };
    const c = { name: "c", kind: "bridged", target: "http://localhost:3" };

    // The first Service is the Default even when the form says otherwise.
    await call(AddService, { ...a, isDefault: false });
    expect(await defaults()).toEqual(["a"]);
    await call(AddService, { ...b, isDefault: true });
    expect(await defaults()).toEqual(["b"]);
    await call(AddService, { ...c, isDefault: false });
    expect(await defaults()).toEqual(["b"]);

    // Edit with Default on: it becomes the only Default.
    await call(EditService, { id: "c", draft: { ...c, isDefault: true } });
    expect(await defaults()).toEqual(["c"]);
    // Edit with Default off: the Default moves to the first other Service.
    await call(EditService, { id: "c", draft: { ...c, isDefault: false } });
    expect(await defaults()).toEqual(["a"]);
    // A draft that does not mention Default leaves it as it was.
    await call(EditService, { id: "a", draft: { ...a, name: "a2" } });
    expect(await defaults()).toEqual(["a"]);
  });

  it("the only Service stays the Default, whatever its form says", async () => {
    const { call } = withPeerShare();
    const a = { name: "a", kind: "bridged", target: "http://localhost:1" };
    await call(AddService, a);
    await call(EditService, { id: "a", draft: { ...a, isDefault: false } });
    expect((await call(GetSharer, undefined)).services[0]?.isDefault).toBe(true);
  });

  it("toggle-service pauses: Guests get the paused page, naming the Sharer", async () => {
    const { rt, call } = withPeerShare();
    await call(SetName, { name: "Dirk" });
    await call(AddService, { name: "foo", kind: "bridged", target: "http://localhost:5173" });
    await call(ToggleService, { id: "foo", enabled: false });

    let mount: ((r: Request) => Promise<Response>) | undefined;
    rt.slots.observe(sharerMountSlot, (v) => {
      mount = v[0];
    })();
    const res = await (mount as (r: Request) => Promise<Response>)(
      new Request("http://sharer/s/foo/"),
    );
    expect(res.status).toBe(503);
    expect(await res.text()).toContain("Dirk paused foo");
  });
});
