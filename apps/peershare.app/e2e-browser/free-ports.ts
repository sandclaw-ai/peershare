import { createServer } from "node:net";

function listen(port: number): Promise<number | undefined> {
  return new Promise((done) => {
    const server = createServer()
      .once("error", () => done(undefined))
      .listen(port, "0.0.0.0", () => {
        const address = server.address();
        server.close(() => done(typeof address === "object" ? address?.port : undefined));
      });
  });
}

/**
 * The first of `count` consecutive ports that are free on every interface, so a
 * run never collides with whatever else holds a fixed port on the machine
 * (`local/serve.mjs` takes port, port + 1 and port + 2; Docker binds 0.0.0.0).
 */
export async function freePorts(count: number): Promise<number> {
  for (let attempt = 0; attempt < 50; attempt++) {
    const base = await listen(0);
    if (base == null || base + count > 65535) continue;
    let free = true;
    for (let i = 1; i < count && free; i++) free = (await listen(base + i)) != null;
    if (free) return base;
  }
  throw new Error(`no ${count} consecutive free ports`);
}
