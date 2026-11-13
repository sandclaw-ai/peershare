/**
 * Which build this is, for every part PeerShare ships (the site, the proxy, the extension): the
 * git commit and the time it was built, stamped into the bundle so logs and banners can say it.
 *
 * The commit comes from PEERSHARE_COMMIT where git is not there (the Docker build, which leaves
 * .git out and gets the commit as BUILD_ID), else from git itself; "-dirty" marks a build with
 * uncommitted changes to tracked files.
 */
import { execFileSync } from "node:child_process";

export function buildInfo() {
  return { commit: commit(), builtAt: new Date().toISOString() };
}

function commit() {
  if (process.env.PEERSHARE_COMMIT) return process.env.PEERSHARE_COMMIT;
  const git = (...args) =>
    execFileSync("git", args, { cwd: import.meta.dirname, stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  try {
    const hash = git("rev-parse", "--short", "HEAD");
    let dirty = false;
    try {
      git("diff", "--quiet", "HEAD");
    } catch {
      dirty = true;
    }
    return dirty ? `${hash}-dirty` : hash;
  } catch {
    return "unknown";
  }
}
