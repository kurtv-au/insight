#!/usr/bin/env bash
# Build a release tarball from the build cache, with no network.
#
#   scripts/build-release.sh <cache-dir> <version> [out-dir]
#
# <cache-dir> is an unpacked scripts/build-cache.sh tarball. Everything comes
# from it: Node (unless the host's node is already exactly .node-version),
# pnpm, and every package. The release CI job runs this inside
# `docker run --network none`, so anything that reaches for the internet fails
# the build rather than quietly working. Needs only bash, tar and gzip.
#
# The source is copied to a scratch directory first and built there, so a run
# on a developer checkout never replaces its node_modules with another
# platform's binaries — and never sees its .env (Nuxt loads .env at build
# time, and nothing from it may be baked into a release).
#
# Output: <out-dir>/insight-<version>.tar.gz containing
#   .output/                    the compiled app (self-contained; node .output/server/index.mjs)
#   migrate.mjs                 scripts/migrate.ts, bundled — applies migrations with no drizzle-kit
#   create-admin.mjs            scripts/create-admin.ts, bundled — the first platform admin, with no pnpm
#   server/db/migrations/       what migrate.mjs applies
#   ecosystem.config.cjs        PM2
#   deploy/                     activate.sh, rollback.sh, nginx and logrotate config
#   VERSION
set -euo pipefail

CACHE="${1:?usage: build-release.sh <cache-dir> <version> [out-dir]}"
VERSION="${2:?usage: build-release.sh <cache-dir> <version> [out-dir]}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${3:-$ROOT/dist}"
CACHE="$(cd "$CACHE" && pwd)"
mkdir -p "$OUT_DIR"
OUT_DIR="$(cd "$OUT_DIR" && pwd)"

case "$VERSION" in
  *[!A-Za-z0-9._-]*) echo "ERROR: version may contain only letters, digits, '.', '_' and '-'"; exit 1 ;;
esac

NODE_VERSION="$(tr -d '[:space:]' < "$ROOT/.node-version")"
EXPECTED_KEY="$(bash "$ROOT/scripts/build-cache.sh" key)"
if [ "$(cat "$CACHE/KEY" 2>/dev/null)" != "$EXPECTED_KEY" ]; then
  echo "ERROR: the build cache is for key '$(cat "$CACHE/KEY" 2>/dev/null || echo none)', this checkout needs '$EXPECTED_KEY'."
  echo "       The lockfile, pnpm-workspace.yaml, .node-version or pnpm version changed."
  echo "       Run the build-cache workflow (or scripts/build-cache.sh create) and retry."
  exit 1
fi

WORK="$(mktemp -d)"
trap 'rm -rf "${WORK:?}"' EXIT

echo "=== insight $VERSION (cache $EXPECTED_KEY) ==="

# Node: the host's if it is the pinned version, otherwise the cached Linux build.
if [ "$(node -v 2>/dev/null || true)" != "v$NODE_VERSION" ]; then
  case "$(uname -s)-$(uname -m)" in
    Linux-x86_64) ARCH=x64 ;;
    Linux-aarch64 | Linux-arm64) ARCH=arm64 ;;
    *) echo "ERROR: need node v$NODE_VERSION on PATH (the cache only carries Linux builds)"; exit 1 ;;
  esac
  mkdir -p "$WORK/node"
  tar -xzf "$CACHE/node/node-v$NODE_VERSION-linux-$ARCH.tar.gz" -C "$WORK/node" --strip-components=1
  export PATH="$WORK/node/bin:$PATH"
fi
echo "node $(node -v)"

# pnpm straight from the cache (a native binary per platform): no corepack,
# no npm, no download.
case "$(uname -s)-$(uname -m)" in
  Linux-x86_64) PNPM_PLATFORM=linux-x64 ;;
  Linux-aarch64 | Linux-arm64) PNPM_PLATFORM=linux-arm64 ;;
  Darwin-x86_64) PNPM_PLATFORM=darwin-x64 ;;
  Darwin-arm64) PNPM_PLATFORM=darwin-arm64 ;;
  *) echo "ERROR: no cached pnpm for $(uname -s)-$(uname -m)"; exit 1 ;;
esac
PNPM_BIN="$WORK/bin"
mkdir -p "$PNPM_BIN"
cp "$CACHE/pnpm/$PNPM_PLATFORM/pnpm" "$PNPM_BIN/pnpm"
chmod +x "$PNPM_BIN/pnpm"
export PATH="$PNPM_BIN:$PATH"
echo "pnpm $(pnpm -v)"

export CI=1
export NUXT_TELEMETRY_DISABLED=1
# pnpm would otherwise fetch the packageManager version if it ever differed from itself.
export npm_config_manage_package_manager_versions=false

echo "--- Copying source ---"
SRC="$WORK/src"
mkdir -p "$SRC"
tar -C "$ROOT" \
  --exclude=./node_modules --exclude=./.output --exclude=./.nuxt --exclude=./.nitro \
  --exclude=./.data --exclude=./.cache --exclude=./dist --exclude=./.git \
  --exclude='./.env' --exclude='./.env.*' --exclude=./.playwright-mcp \
  -cf - . | tar -C "$SRC" -xf -
cd "$SRC"

echo "--- Installing (offline) ---"
pnpm install --offline --frozen-lockfile --store-dir "$CACHE/store" --config.cache-dir="$CACHE/pnpm-cache"

echo "--- Building ---"
pnpm build

echo "--- Bundling the migration runner and create-admin ---"
STAGE="$WORK/stage"
mkdir -p "$STAGE/server/db"
# mysql2 is CommonJS and require()s Node built-ins, which an ESM bundle can't
# do without a require of its own: the banner gives it one.
for SCRIPT in migrate create-admin; do
  pnpm exec esbuild "scripts/$SCRIPT.ts" --bundle --platform=node --format=esm --target=node22 \
    --banner:js="import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" \
    --outfile="$STAGE/$SCRIPT.mjs" --log-level=warning
done

echo "--- Packaging ---"
cp -R .output "$STAGE/.output"
cp -R server/db/migrations "$STAGE/server/db/migrations"
cp ecosystem.config.cjs "$STAGE/"
cp -R deploy "$STAGE/deploy"
echo "$VERSION" > "$STAGE/VERSION"

TARBALL="$OUT_DIR/insight-$VERSION.tar.gz"
tar -czf "$TARBALL" -C "$STAGE" .
echo "=== Wrote $TARBALL ($(du -h "$TARBALL" | cut -f1)) ==="
