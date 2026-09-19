#!/usr/bin/env bash
# Stop the demo runner.
H=${LL_DEMO_HOME:-/tmp/leaflimits-demo}
if [ -f "$H/demo.pid" ] && kill -0 "$(cat "$H/demo.pid")" 2>/dev/null; then
    kill "$(cat "$H/demo.pid")"
    for _ in $(seq 1 20); do [ -f "$H/demo.pid" ] || break; sleep 1; done
    echo "stopped"
else
    rm -f "$H/demo.pid"
    echo "not running"
fi
