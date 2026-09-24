#!/usr/bin/env bash
# End-to-end check of a running stack: MQTT -> Node-RED validation -> InfluxDB -> Grafana.
# Publishes one valid reading for a fake device, waits for it in InfluxDB, then removes it.
#   ./scripts/smoke-test.sh
set -uo pipefail
# shellcheck source=lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

failures=0
pass() { green "PASS  $*"; }
fail() { red "FAIL  $*"; failures=$((failures + 1)); }

[ -f .env ] || { red "No .env file."; exit 1; }
DEV="smoke-test-01"
BOOT="smoke-$(date +%s)"

# 1. Node-RED answers and the seeded flows are loaded
nr_url="http://$(hostfor "$(envval NODERED_BIND)"):$(envval NODERED_PORT 1880)/"
code=$(curl -s -o /dev/null -w '%{http_code}' "$nr_url" || true)
case "$code" in 200|301|302|401) pass "Node-RED answers ($code)" ;; *) fail "Node-RED not reachable at $nr_url ($code)" ;; esac
if dc exec -T node-red test -s /data/flows.json; then pass "flows.json present in the Node-RED volume"; else fail "flows.json missing in the Node-RED volume"; fi

# 2. Publish one valid message and wait for the four points in InfluxDB
payload=$(printf '{"schema_version":1,"device_id":"%s","boot_id":"%s","sequence":1,"uptime_ms":5000,"measurements":{"internal_temperature_c":23.5,"internal_humidity_percent":55.2,"external_temperature_c":18.4,"water_temperature_c":20.7},"sensor_status":{"internal_sht31":"ok","external_ds18b20":"ok","water_ds18b20":"ok"}}' "$DEV" "$BOOT")
if dc exec -T mosquitto mosquitto_pub -h localhost -q 1 -t "microhydros/v1/devices/$DEV/telemetry/raw" -m "$payload"; then
    pass "published test message to Mosquitto"
else
    fail "could not publish to Mosquitto"
fi

count_points() {
    dc exec -T influxdb sh -c 'influx query "from(bucket: \"${DOCKER_INFLUXDB_INIT_BUCKET}\")
      |> range(start: -10m)
      |> filter(fn: (r) => r._measurement == \"sensor_reading\" and r._field == \"value\" and r.device_id == \"'"$DEV"'\")
      |> group()
      |> count()" --org "$DOCKER_INFLUXDB_INIT_ORG" --token "$DOCKER_INFLUXDB_INIT_ADMIN_TOKEN" --raw' 2>/dev/null \
      | tr -d '\r' | awk -F, 'NF>3 && $NF ~ /^[0-9]+$/ {n=$NF} END {print n+0}'
}
n=0
for _ in $(seq 1 15); do
    n=$(count_points)
    [ "${n:-0}" -ge 4 ] && break
    sleep 2
done
if [ "${n:-0}" -ge 4 ]; then pass "4 validated readings stored in InfluxDB"; else fail "expected 4 points in InfluxDB, found ${n:-0} (is the storage tab enabled in Node-RED?)"; fi

# 3. Grafana is healthy and the datasource was provisioned
g_url="http://$(hostfor "$(envval GRAFANA_BIND)"):$(envval GRAFANA_PORT 3000)"
if curl -fsS "$g_url/api/health" >/dev/null 2>&1; then pass "Grafana healthy"; else fail "Grafana health check failed"; fi
if curl -fsS -u "$(envval GRAFANA_USERNAME):$(envval GRAFANA_PASSWORD)" "$g_url/api/datasources" 2>/dev/null | grep -q "MicroHydros InfluxDB"; then
    pass "Grafana datasource 'MicroHydros InfluxDB' provisioned"
else
    fail "Grafana datasource not found (check GRAFANA_USERNAME / GRAFANA_PASSWORD)"
fi

# 4. Remove the test points so real data stays clean
if dc exec -T influxdb sh -c 'influx delete --bucket "$DOCKER_INFLUXDB_INIT_BUCKET" --org "$DOCKER_INFLUXDB_INIT_ORG" --token "$DOCKER_INFLUXDB_INIT_ADMIN_TOKEN" --start 1970-01-01T00:00:00Z --stop 2100-01-01T00:00:00Z --predicate "device_id=\"'"$DEV"'\""' >/dev/null 2>&1; then
    pass "test data removed"
else
    yellow "warn  could not remove the test data (device_id=$DEV)"
fi

echo
if [ "$failures" -eq 0 ]; then green "Smoke test passed."; else red "$failures check(s) failed."; exit 1; fi
