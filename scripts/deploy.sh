#!/usr/bin/env bash
# Check the machine and .env, then start the whole MicroHydros backend.
#   ./scripts/deploy.sh
set -euo pipefail
# shellcheck source=lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

errors=0
fail() { red "  FAIL  $*"; errors=$((errors + 1)); }
ok()   { green "  ok    $*"; }
warn() { yellow "  warn  $*"; }

echo "Checking prerequisites"
command -v docker >/dev/null 2>&1 || { red "Docker is not installed."; exit 1; }
docker compose version >/dev/null 2>&1 || { red "Docker Compose v2 ('docker compose') is required."; exit 1; }
docker info >/dev/null 2>&1 || { red "Cannot talk to the Docker daemon (is it running, and are you in the docker group?)"; exit 1; }
ok "docker and docker compose"

if [ ! -f .env ]; then
    red "No .env file. Run: cp .env.example .env   and edit it."
    exit 1
fi

echo "Checking .env"
placeholder() { case "$1" in ""|replace-with-*) return 0 ;; *) return 1 ;; esac; }
for key in INFLUXDB_USERNAME INFLUXDB_PASSWORD INFLUXDB_TOKEN GRAFANA_USERNAME GRAFANA_PASSWORD; do
    if placeholder "$(envval "$key")"; then fail "$key is missing or still the example value"; fi
done
pw=$(envval INFLUXDB_PASSWORD)
if ! placeholder "$pw" && [ "${#pw}" -lt 8 ]; then fail "INFLUXDB_PASSWORD must be at least 8 characters"; fi
tok=$(envval INFLUXDB_TOKEN)
if ! placeholder "$tok" && [ "${#tok}" -lt 16 ]; then fail "INFLUXDB_TOKEN is too short (use: openssl rand -hex 32)"; fi
if [ -z "$(envval INFLUXDB_ORG)" ]; then fail "INFLUXDB_ORG is empty"; fi
if [ "$(envval INFLUXDB_BUCKET)" != "microhydros" ]; then
    fail "INFLUXDB_BUCKET must be 'microhydros' (the Grafana dashboard queries that bucket)"
fi

# Node-RED editor must not be open to the network without a login.
nr_bind=$(envval NODERED_BIND 0.0.0.0)
if [ -z "$(envval NODERED_ADMIN_HASH)" ]; then
    case "$nr_bind" in
        127.0.0.1|localhost) warn "Node-RED editor has no login (fine: bound to $nr_bind only)" ;;
        *) fail "NODERED_ADMIN_HASH is empty but Node-RED is bound to $nr_bind. Run ./scripts/hash-node-red-password.sh or set NODERED_BIND=127.0.0.1" ;;
    esac
else
    ok "Node-RED editor login configured"
fi

echo "Checking ports"
running=$(dc ps -q 2>/dev/null | wc -l | tr -d ' ')
for pair in MQTT_PORT:1883 NODERED_PORT:1880 INFLUX_PORT:8086 GRAFANA_PORT:3000; do
    key=${pair%%:*}; port=$(envval "$key" "${pair##*:}")
    if [ "$running" -gt 0 ]; then continue; fi   # our own containers hold the ports
    if command -v ss >/dev/null 2>&1; then
        if ss -ltn 2>/dev/null | awk '{print $4}' | grep -Eq "[:.]${port}\$"; then
            fail "port $port ($key) is already in use. Change $key in .env"
        else
            ok "port $port free ($key)"
        fi
    else
        warn "'ss' not found, cannot check port $port"
    fi
done

if [ -r /proc/meminfo ]; then
    avail_mb=$(awk '/MemAvailable/ {print int($2/1024)}' /proc/meminfo)
    if [ "${avail_mb:-0}" -lt 800 ]; then warn "only ${avail_mb} MB RAM available (about 800 MB recommended)"; else ok "${avail_mb} MB RAM available"; fi
fi

dc config -q || fail "docker compose config is invalid"

if [ "$errors" -gt 0 ]; then
    red "$errors problem(s) found. Nothing was started."
    exit 1
fi

echo "Starting the stack"
dc up -d

wait_for() { # wait_for NAME URL ACCEPTED_CODES
    local name=$1 url=$2 accepted=$3 code i
    for i in $(seq 1 60); do
        code=$(curl -s -o /dev/null -w '%{http_code}' "$url" 2>/dev/null || true)
        case " $accepted " in *" $code "*) ok "$name is up ($url)"; return 0 ;; esac
        sleep 2
    done
    fail "$name did not become ready ($url, last status: ${code:-none})"
    return 1
}
echo "Waiting for services"
wait_for InfluxDB "http://$(hostfor "$(envval INFLUX_BIND)"):$(envval INFLUX_PORT 8086)/health" "200"
wait_for Grafana  "http://$(hostfor "$(envval GRAFANA_BIND)"):$(envval GRAFANA_PORT 3000)/api/health" "200"
wait_for "Node-RED" "http://$(hostfor "$nr_bind"):$(envval NODERED_PORT 1880)/" "200 301 302 401"

if [ "$errors" -gt 0 ]; then
    red "Some services did not start. See: docker compose logs --tail=100"
    exit 1
fi

echo
green "MicroHydros backend is running."
echo "  Node-RED : http://$(hostfor "$nr_bind"):$(envval NODERED_PORT 1880)"
echo "  Grafana  : http://$(hostfor "$(envval GRAFANA_BIND)"):$(envval GRAFANA_PORT 3000)"
echo "  MQTT     : port $(envval MQTT_PORT 1883)"
echo "Next: ./scripts/smoke-test.sh"
