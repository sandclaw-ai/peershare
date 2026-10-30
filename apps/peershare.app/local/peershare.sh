#!/usr/bin/env bash
# PeerShare on this machine, from a checkout of statewalker/sandclaw: installs,
# builds, and runs the relay, the page, the session shell and the Bridge.
#
#   apps/peershare.app/local/peershare.sh [--bun] [--no-build] [--demo] [--open]
#                                         [--port 8080] [--bridge-port 9090] [--no-cookie-jars]
#
#   --bun        run the server under Bun instead of Node (the build always uses Node)
#   --no-build   reuse local/build from the previous run
#   the rest     passed to local/serve.mjs
#
# HTTPEERS_DIR=<checkout of statewalker/httpeers> uses that checkout's
# @statewalker/httpeers-share instead of npm's (needed until 0.1.0 is published).
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/../../.." && pwd)"

runtime=node
build=1
args=()
for arg in "$@"; do
  case "$arg" in
    --bun) runtime=bun ;;
    --no-build) build=0 ;;
    *) args+=("$arg") ;;
  esac
done

fail() {
  echo "peershare: $*" >&2
  exit 1
}
command -v node >/dev/null || fail "needs Node.js 22 or later (https://nodejs.org)"
node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)' ||
  fail "needs Node.js 22 or later, found $(node --version)"
if [ "$runtime" = bun ]; then
  command -v bun >/dev/null || fail "--bun needs Bun (https://bun.sh)"
fi
if ! command -v pnpm >/dev/null; then
  corepack enable pnpm 2>/dev/null || true
  command -v pnpm >/dev/null || fail "needs pnpm: run 'corepack enable', or see https://pnpm.io"
fi

# Install. With HTTPEERS_DIR, link that checkout's httpeers-share through a
# pnpmfile hook kept outside the repository, without a lockfile, so no tracked
# file changes.
if [ -n "${HTTPEERS_DIR:-}" ]; then
  HTTPEERS_DIR="$(cd "$HTTPEERS_DIR" && pwd)"
  [ -f "$HTTPEERS_DIR/packages/httpeers-share/package.json" ] ||
    fail "HTTPEERS_DIR=$HTTPEERS_DIR is not a checkout of statewalker/httpeers"
  echo "peershare: building httpeers-share in $HTTPEERS_DIR"
  pnpm --dir "$HTTPEERS_DIR" install --frozen-lockfile
  pnpm --dir "$HTTPEERS_DIR" --filter "@statewalker/httpeers-share..." run build
  hook="$(mktemp "${TMPDIR:-/tmp}/peershare-pnpmfile.XXXXXX")"
  mv "$hook" "$hook.cjs"
  hook="$hook.cjs"
  trap 'rm -f "$hook"' EXIT
  cat >"$hook" <<'EOF'
const share = `link:${process.env.HTTPEERS_DIR}/packages/httpeers-share`;
module.exports = {
  hooks: {
    readPackage(pkg) {
      for (const deps of [pkg.dependencies, pkg.devDependencies])
        if (deps?.["@statewalker/httpeers-share"]) deps["@statewalker/httpeers-share"] = share;
      return pkg;
    },
  },
};
EOF
  echo "peershare: installing, with httpeers-share from $HTTPEERS_DIR"
  HTTPEERS_DIR="$HTTPEERS_DIR" pnpm --dir "$root" install --pnpmfile "$hook" --no-lockfile
else
  echo "peershare: installing"
  pnpm --dir "$root" install --frozen-lockfile ||
    fail "install failed. If @statewalker/httpeers-share is not on npm yet, run again with
  HTTPEERS_DIR=<checkout of statewalker/httpeers> $0 $*"
fi

# Build: the page, the packages it is made of, and the session shell.
if [ "$build" = 1 ] || [ ! -f "$here/build/page/index.html" ]; then
  echo "peershare: building"
  pnpm --dir "$root" --filter "@statewalker/peershare.app^..." run --if-present build
  node "$here/build.mjs"
fi

cd "$here"
exec "$runtime" serve.mjs ${args[@]+"${args[@]}"}
