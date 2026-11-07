#!/bin/sh
# The PeerShare proxy, on this machine:
#
#   curl -fsSL https://@SITE@/proxy/peershare-proxy.sh | sh
#   curl -fsSL https://@SITE@/proxy/peershare-proxy.sh | sh -s -- --port 9090 --key <key> --origin <origin>
#
# Fetches the proxy (one JavaScript file) into ~/.cache/peershare/ and runs it
# with the first of Deno, Bun or Node found. With none of them, Deno is
# downloaded into ~/.cache/peershare/deno-<version>/ once — never system-wide.
# macOS and Linux.
#
# Everything runs from `main`, called on the last line: a download cut short
# defines nothing, so `curl … | sh` never runs part of the script.
set -eu

SITE="https://@SITE@"
DENO_VERSION="2.9.8"
cache="$HOME/.cache/peershare"

fail() {
  echo "peershare-proxy: $*" >&2
  exit 1
}

fetch() {
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$1" -o "$2"
  elif command -v wget >/dev/null 2>&1; then
    wget -q -O "$2" "$1"
  else
    fail "needs curl or wget"
  fi
}

main() {
  mkdir -p "$cache"
  bundle="$cache/peershare-proxy.mjs"
  # Into a temporary file first: a download cut short must not replace a good copy.
  if fetch "$SITE/proxy/peershare-proxy.mjs" "$bundle.tmp"; then
    mv "$bundle.tmp" "$bundle"
  else
    rm -f "$bundle.tmp"
    [ -f "$bundle" ] || fail "could not download $SITE/proxy/peershare-proxy.mjs"
    echo "peershare-proxy: could not download the proxy; running the copy in $cache" >&2
  fi

  if command -v deno >/dev/null 2>&1; then
    exec deno run --allow-net --allow-env --allow-read --allow-sys "$bundle" "$@"
  elif command -v bun >/dev/null 2>&1; then
    exec bun "$bundle" "$@"
  elif command -v node >/dev/null 2>&1; then
    exec node "$bundle" "$@"
  fi

  case "$(uname -s)" in
    Linux) os="unknown-linux-gnu" ;;
    Darwin) os="apple-darwin" ;;
    *) fail "runs on macOS and Linux; on $(uname -s), install Deno, Bun or Node and run peershare-proxy.mjs" ;;
  esac
  case "$(uname -m)" in
    x86_64 | amd64) arch="x86_64" ;;
    arm64 | aarch64) arch="aarch64" ;;
    *) fail "no Deno build for $(uname -m): install Bun or Node" ;;
  esac
  deno="$cache/deno-$DENO_VERSION/deno"
  if [ ! -x "$deno" ]; then
    command -v unzip >/dev/null 2>&1 || fail "needs unzip to install Deno into $cache (or install Deno, Bun or Node)"
    echo "peershare-proxy: no Deno, Bun or Node found; downloading Deno $DENO_VERSION into $cache" >&2
    mkdir -p "$cache/deno-$DENO_VERSION"
    fetch "https://dl.deno.land/release/v$DENO_VERSION/deno-$arch-$os.zip" "$cache/deno-$DENO_VERSION/deno.zip"
    unzip -q -o "$cache/deno-$DENO_VERSION/deno.zip" -d "$cache/deno-$DENO_VERSION"
    rm -f "$cache/deno-$DENO_VERSION/deno.zip"
    chmod +x "$deno"
  fi
  exec "$deno" run --allow-net --allow-env --allow-read --allow-sys "$bundle" "$@"
}

main "$@"
