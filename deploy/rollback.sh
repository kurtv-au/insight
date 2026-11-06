#!/usr/bin/env bash
# Serve an earlier release again, without rebuilding and without migrating:
#
#   bash /opt/insight/current/deploy/rollback.sh <version>
#   ls /opt/insight/releases          # what can be rolled back to
#
# Migrations are never reversed. This works because every migration is
# additive and must keep the release before it working (see activate.sh).
set -euo pipefail

# shellcheck source=deploy/lib.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
VERSION="${1:?usage: rollback.sh <version>  (see ls $APP_ROOT/releases)}"
TARGET="$APP_ROOT/releases/$VERSION"

if [ ! -f "$TARGET/VERSION" ]; then
  echo "ERROR: no release $VERSION in $APP_ROOT/releases. Available:"
  ls -1t "$APP_ROOT/releases"
  exit 1
fi

CURRENT="$(link_target current)"
echo "=== Rolling back to $VERSION (from $(cat "$CURRENT/VERSION" 2>/dev/null || echo none)) ==="
if [ -n "$CURRENT" ] && [ "$CURRENT" != "$TARGET" ]; then
  point_link previous "$CURRENT"
fi
point_link current "$TARGET"
restart_app
healthy "$VERSION"
echo "=== $VERSION is live ==="
