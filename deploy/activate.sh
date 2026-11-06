#!/usr/bin/env bash
# Activate the release this script was shipped in. Run as root on the instance,
# from inside the extracted release:
#
#   bash /opt/insight/releases/<version>/deploy/activate.sh
#
# The release workflow does this over SSM after downloading and extracting the
# tarball. Steps: migrate, switch `current`, restart PM2, health check — and if
# the check fails, switch back and restart the previous release.
#
# This file is never rewritten while it runs: each release carries its own
# copy, and the next deploy runs the next release's.
set -euo pipefail

RELEASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=deploy/lib.sh
. "$RELEASE_DIR/deploy/lib.sh"
VERSION="$(cat "$RELEASE_DIR/VERSION")"
KEEP_RELEASES="${KEEP_RELEASES:-5}"

echo "=== Activating insight $VERSION on $(uname -n) at $(date -u) ==="

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: $ENV_FILE is missing. See docs/DEPLOYMENT.md \"Environment file\"."
  exit 1
fi
if [ "$(stat -c %a "$ENV_FILE")" != "600" ]; then
  echo "ERROR: $ENV_FILE must be mode 600 (it holds every production secret)."
  exit 1
fi
check_env

PREVIOUS="$(link_target current)"
OLD_PREVIOUS="$(link_target previous)"
if [ "$PREVIOUS" = "$RELEASE_DIR" ]; then
  echo "Note: $VERSION is already current; re-activating it."
  PREVIOUS=""
fi

# Before the switch, so the old release keeps serving if a migration fails.
# Migrations must therefore work with the release they replace (additive only).
echo "--- Migrating ---"
(cd "$RELEASE_DIR" && node --env-file="$ENV_FILE" migrate.mjs)

echo "--- Switching to $VERSION ---"
if [ -n "$PREVIOUS" ]; then
  point_link previous "$PREVIOUS"
fi
point_link current "$RELEASE_DIR"
restart_app

echo "--- Health check ---"
if ! healthy "$VERSION"; then
  pm2 logs insight --lines 40 --nostream || true
  if [ -n "$PREVIOUS" ]; then
    PREVIOUS_VERSION="$(cat "$PREVIOUS/VERSION")"
    echo "--- Rolling back to $PREVIOUS_VERSION ---"
    point_link current "$PREVIOUS"
    if [ -n "$OLD_PREVIOUS" ] && [ -d "$OLD_PREVIOUS" ]; then
      point_link previous "$OLD_PREVIOUS"
    else
      rm -f "$APP_ROOT/previous"
    fi
    restart_app
    if healthy "$PREVIOUS_VERSION"; then
      echo "=== $VERSION FAILED; $PREVIOUS_VERSION is serving again ==="
    else
      echo "=== $VERSION FAILED and $PREVIOUS_VERSION is not healthy either. The site is down. ==="
    fi
  else
    echo "=== $VERSION FAILED and there is no previous release to return to. The site is down. ==="
  fi
  exit 1
fi

echo "--- Pruning old releases (keeping $KEEP_RELEASES) ---"
KEEP_CURRENT="$(link_target current)"
KEEP_PREVIOUS="$(link_target previous)"
# shellcheck disable=SC2012 # release names are plain [A-Za-z0-9._-]
ls -1dt "$APP_ROOT"/releases/*/ 2>/dev/null | sed 's:/$::' | tail -n +"$((KEEP_RELEASES + 1))" | while read -r OLD; do
  if [ "$OLD" != "$KEEP_CURRENT" ] && [ "$OLD" != "$KEEP_PREVIOUS" ]; then
    echo "removing $(basename "$OLD")"
    rm -rf "${OLD:?}"
  fi
done

echo "=== insight $VERSION is live ==="
