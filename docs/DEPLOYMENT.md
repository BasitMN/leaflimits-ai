# Deploying the MicroHydros backend

This runs the full backend (Mosquitto, Node-RED with the validation and storage flows,
InfluxDB, Grafana) on any machine with Docker. It uses the root `compose.yaml`.
The running Hetzner server still uses `docker/compose.hetzner.yaml`, which is unchanged.

**Status:** written and statically checked, not yet run against real Docker. Phase D5 of
`docs/PLAN.md` (a clean-machine run) is what proves it.

## Requirements

- Docker Engine with Compose v2 (`docker compose version`)
- Free ports for MQTT, Node-RED, InfluxDB and Grafana (defaults 1883, 1880, 8086, 3000)
- About 800 MB free RAM
- `git`, `curl`, `openssl`

## Steps

```bash
git clone git@github.com:BasitMN/leaflimits-ai.git
cd leaflimits-ai
git checkout deploy          # until this branch is merged

cp .env.example .env
openssl rand -hex 32         # use the output as INFLUXDB_TOKEN
./scripts/hash-node-red-password.sh   # paste the printed line into .env
vim .env                     # set passwords, ports, bind addresses

./scripts/deploy.sh          # checks .env, ports, RAM; starts the stack; waits until ready
./scripts/smoke-test.sh      # MQTT -> Node-RED -> InfluxDB -> Grafana, then cleans up
```

`deploy.sh` refuses to start when `.env` still has example values, when the InfluxDB
bucket is not `microhydros` (the dashboard queries that name), when a port is taken, or
when Node-RED would be reachable from the network without a login.

## What happens on first start

- InfluxDB creates the organisation, bucket and token from `.env`.
- Node-RED copies `docker/node-red/seed/flows.json` into its empty data volume. That file
  holds both flows with the storage tab enabled. Later edits in the editor are kept in the
  volume and are not overwritten.
- Grafana loads the InfluxDB datasource and the dashboard from `docker/grafana/`.

Rebuild the seed after changing an export in `docker/node-red/flows/`:

```bash
python3 scripts/build-seed-flows.py
```

## Settings that differ per machine

All of these are in `.env`. See `.env.example` for the full list.

| Setting | Purpose |
|---|---|
| `*_PORT` | Host port for MQTT, Node-RED, InfluxDB, Grafana |
| `*_BIND` | `0.0.0.0` for all interfaces, `127.0.0.1` for local only (for example behind a reverse proxy) |
| `NODERED_ADMIN_USER`, `NODERED_ADMIN_HASH` | Node-RED editor login. Keep the single quotes around the hash |
| `NODERED_CREDENTIAL_SECRET` | Encrypts stored credentials |

## Running next to another stack on the same host

A second copy can run beside an existing one, for example on the Hetzner server (stage E2 of
`docs/PLAN.md`). Use a separate folder with its own `.env` and set:

```dotenv
COMPOSE_PROJECT_NAME=leaflimits-test
MQTT_PORT=1885
NODERED_PORT=1882
INFLUX_PORT=8088
GRAFANA_PORT=3003
MOSQUITTO_MEM=64m
NODERED_MEM=256m
INFLUX_MEM=512m
GRAFANA_MEM=384m
```

- The project name prefixes container, volume and network names, so nothing is shared with the
  other stack. `deploy.sh` stops with a clear message if a container name is already used by
  another project.
- The `*_MEM` values are ceilings per container. A container that reaches its ceiling is
  restarted on its own, so it cannot cause the host to kill a container of the other stack.
- Check free ports first with `ss -tlnp`. On the Hetzner server, 1880, 1881, 1883, 1884,
  3000 to 3002, 8086, 8087 and 9000 to 9443 are taken.
- All scripts (`deploy.sh`, `smoke-test.sh`, `backup.sh`) use the project name from `.env`.

## Pointing the ESP32 at the new server

The firmware default is still the Hetzner address. Set the broker URL with
`idf.py menuconfig` (MicroHydros Configuration, MQTT Broker URL) and reflash. Use a hostname
instead of an IP address, so a later server move only needs a DNS change.

## Backup

```bash
./scripts/backup.sh          # writes backups/<timestamp>/ with InfluxDB and Node-RED data
```

Backups contain secrets and are git-ignored.

## Known limits (see docs/PLAN.md, section 9)

- MQTT is anonymous and unencrypted. Do not expose port 1883 to an untrusted network (phase D2).
- A restore script is not written yet.
- Node-RED still uses the InfluxDB admin token. Scoped tokens are part of phase D2.
