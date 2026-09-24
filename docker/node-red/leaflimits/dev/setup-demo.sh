#!/usr/bin/env bash
# Installs what the demo runner needs: Node-RED 5.0.7, an in-process MQTT broker (aedes), the mqtt client
# and the built Angular app. Everything goes to $LL_DEMO_HOME (default /tmp/leaflimits-demo), never into the repo.
# On the phone (Termux/proot) node_modules cannot live under ~/ws, which allows no links.
#   bash docker/node-red/leaflimits/dev/setup-demo.sh
set -euo pipefail
H=${LL_DEMO_HOME:-/tmp/leaflimits-demo}
CACHE=${LL_NPM_CACHE:-$H/npm-cache}
REPO=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)
mkdir -p "$H/npm10" "$H/modules" "$H/build/app"

# The distro npm 9 has a cache race under proot, so use npm 10 for these installs.
if [ ! -x "$H/npm10/node_modules/.bin/npm" ]; then
    (cd "$H/npm10" && { [ -f package.json ] || npm init -y >/dev/null; } && npm install --no-audit --no-fund --loglevel=error npm@10)
fi
NPM="$H/npm10/node_modules/.bin/npm"

if [ ! -d "$H/modules/node_modules/node-red" ] || [ ! -d "$H/modules/node_modules/aedes" ] || [ ! -d "$H/modules/node_modules/mqtt" ]; then
    echo "Installing node-red, aedes and mqtt ..."
    (cd "$H/modules" && { [ -f package.json ] || "$NPM" init -y >/dev/null; } &&
        "$NPM" install --no-audit --no-fund --loglevel=error --legacy-peer-deps --cache "$CACHE" node-red@5.0.7 aedes mqtt)
fi

echo "Building the app ..."
tar -C "$REPO/app" --exclude=node_modules --exclude=.angular --exclude=dist -cf - . | tar -C "$H/build/app" -xf -
(cd "$H/build/app" &&
    { [ -d node_modules ] || "$NPM" install --no-audit --no-fund --loglevel=error --legacy-peer-deps --cache "$CACHE"; } &&
    NG_CLI_ANALYTICS=false CI=true ./node_modules/.bin/ng build --base-href /leaflimits/ --output-path "$H/app-dist" >/dev/null)

echo "Ready. Start the demo with:"
echo "  LL_DEMO_HOME=$H node $REPO/docker/node-red/leaflimits/dev/demo.js"
