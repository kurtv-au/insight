#!/usr/bin/env bash
# The build cache: everything a release build needs from the internet, in one
# tarball, so scripts/build-release.sh can run with no network at all.
#
#   scripts/build-cache.sh key                 print the cache key for this checkout
#   scripts/build-cache.sh create <out.tar.gz> download everything and pack it (needs internet)
#
# The key covers every input that changes what is inside: the lockfile, the
# workspace file (supportedArchitectures decides which platform binaries are
# fetched), and the Node and pnpm versions. A different key is a different
# cache; build-release.sh refuses a cache whose key does not match.
#
# Contents:
#   KEY                                 the key, checked by build-release.sh
#   store/                              pnpm store from `pnpm fetch` (lockfile only, all platforms)
#   pnpm-cache/                         package metadata; pnpm's supply-chain policy check
#                                       reads it on every install, offline included
#   pnpm/<os>-<arch>/pnpm               pnpm itself: from 12 it is a native binary, one per
#                                       platform (linux and darwin, x64 and arm64), each checked
#                                       against the npm registry's sha512
#   node/node-v<ver>-linux-<arch>.tar.gz Node for x64 and arm64 Linux, checksum-verified
# See docs/DEPLOYMENT.md "Offline builds".
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NODE_VERSION="$(tr -d '[:space:]' < "$ROOT/.node-version")"
PNPM_VERSION="$(node -p "require('$ROOT/package.json').packageManager.split('@')[1]" 2>/dev/null \
  || sed -n 's/.*"packageManager": *"pnpm@\([^"]*\)".*/\1/p' "$ROOT/package.json")"

sha256() {
  if command -v sha256sum >/dev/null; then sha256sum "$@"; else shasum -a 256 "$@"; fi
}

# This host as pnpm's platform names (the @pnpm/exe.<os>-<arch> packages)
host_platform() {
  local os arch
  case "$(uname -s)" in Linux) os=linux ;; Darwin) os=darwin ;; *) echo "unsupported OS $(uname -s)" >&2; return 1 ;; esac
  case "$(uname -m)" in x86_64 | amd64) arch=x64 ;; aarch64 | arm64) arch=arm64 ;; *) echo "unsupported CPU $(uname -m)" >&2; return 1 ;; esac
  echo "$os-$arch"
}

cache_key() {
  { cat "$ROOT/pnpm-lock.yaml" "$ROOT/pnpm-workspace.yaml"; echo "node=$NODE_VERSION pnpm=$PNPM_VERSION"; } \
    | sha256 | cut -c1-16
}

case "${1:-}" in
  key)
    cache_key
    ;;

  create)
    OUT="${2:?usage: build-cache.sh create <out.tar.gz>}"
    case "$OUT" in /*) ;; *) OUT="$PWD/$OUT" ;; esac
    KEY="$(cache_key)"
    WORK="$(mktemp -d)"
    trap 'rm -rf "${WORK:?}"' EXIT
    mkdir -p "$WORK/node" "$WORK/pnpm"

    echo "--- build cache $KEY (node $NODE_VERSION, pnpm $PNPM_VERSION) ---"
    echo "$KEY" > "$WORK/KEY"

    echo "--- pnpm $PNPM_VERSION (native binaries) ---"
    for PLATFORM in linux-x64 linux-arm64 darwin-x64 darwin-arm64; do
      PKG="@pnpm/exe.$PLATFORM"
      # The registry's sha512 for this exact version; the tarball must match it
      INTEGRITY="$(curl -fsSL "https://registry.npmjs.org/$PKG/$PNPM_VERSION" | node -e \
        'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).dist.integrity))')"
      curl -fsSL "https://registry.npmjs.org/$PKG/-/exe.$PLATFORM-$PNPM_VERSION.tgz" -o "$WORK/pnpm/$PLATFORM.tgz"
      ACTUAL="sha512-$(openssl dgst -sha512 -binary "$WORK/pnpm/$PLATFORM.tgz" | openssl base64 -A)"
      if [ "$ACTUAL" != "$INTEGRITY" ]; then
        echo "ERROR: $PKG@$PNPM_VERSION does not match the registry's integrity"
        exit 1
      fi
      mkdir -p "$WORK/pnpm/$PLATFORM"
      tar -xzf "$WORK/pnpm/$PLATFORM.tgz" -C "$WORK/pnpm/$PLATFORM" --strip-components=1 package/pnpm
      rm "$WORK/pnpm/$PLATFORM.tgz"
      echo "$PKG ok"
    done
    PNPM=("$WORK/pnpm/$(host_platform)/pnpm")

    echo "--- Node $NODE_VERSION (linux x64 + arm64) ---"
    BASE="https://nodejs.org/dist/v$NODE_VERSION"
    curl -fsSL "$BASE/SHASUMS256.txt" -o "$WORK/node/SHASUMS256.txt"
    for ARCH in x64 arm64; do
      FILE="node-v$NODE_VERSION-linux-$ARCH.tar.gz"
      curl -fsSL "$BASE/$FILE" -o "$WORK/node/$FILE"
      (cd "$WORK/node" && grep " $FILE\$" SHASUMS256.txt | sha256 -c -)
    done

    echo "--- pnpm fetch (every platform in pnpm-workspace.yaml) ---"
    # fetch reads only the lockfile, which is exactly what the offline install will need.
    # It runs in a scratch copy so it never touches this checkout's node_modules.
    mkdir -p "$WORK/project"
    cp "$ROOT/package.json" "$ROOT/pnpm-lock.yaml" "$ROOT/pnpm-workspace.yaml" "$WORK/project/"
    (cd "$WORK/project" && CI=1 npm_config_manage_package_manager_versions=false \
      "${PNPM[@]}" fetch --store-dir "$WORK/store" --config.cache-dir="$WORK/pnpm-cache")
    rm -rf "${WORK:?}/project"

    echo "--- packing ---"
    tar -czf "$OUT" -C "$WORK" .
    echo "Wrote $OUT ($(du -h "$OUT" | cut -f1)), key $KEY"
    ;;

  *)
    sed -n '2,22p' "$0"
    exit 1
    ;;
esac
