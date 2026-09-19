#!/usr/bin/env bash
# Start the demo runner in the background and wait until it is ready.
# It reads the API key from /root/ws/.anthropic_key when that file exists, otherwise it uses a fake AI.
#   bash docker/node-red/leaflimits/dev/start-demo.sh
set -euo pipefail
H=${LL_DEMO_HOME:-/tmp/leaflimits-demo}
HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
mkdir -p "$H"
if [ -f "$H/demo.pid" ] && kill -0 "$(cat "$H/demo.pid")" 2>/dev/null; then
    echo "Already running (pid $(cat "$H/demo.pid")). Run stop-demo.sh first if you want to restart it, for example after adding the key file."
    exit 0
fi
rm -f "$H/demo.pid"
LL_DEMO_HOME="$H" setsid nohup node "$HERE/demo.js" >"$H/demo.out" 2>&1 &
pid=$!
for _ in $(seq 1 90); do
    if grep -q 'LeafLimits demo is running' "$H/demo.out" 2>/dev/null; then cat "$H/demo.out"; exit 0; fi
    if ! kill -0 "$pid" 2>/dev/null; then cat "$H/demo.out"; exit 1; fi
    sleep 2
done
echo "Timed out waiting for the demo. See $H/demo.out and $H/node-red.log"
exit 1
