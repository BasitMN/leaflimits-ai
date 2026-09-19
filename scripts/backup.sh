#!/usr/bin/env bash
# Back up InfluxDB data and the Node-RED data volume into backups/<timestamp>/.
# The backup contains secrets (Node-RED credentials, InfluxDB data). It is git-ignored.
#   ./scripts/backup.sh
set -euo pipefail
# shellcheck source=lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

[ -f .env ] || { red "No .env file."; exit 1; }
dest="backups/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$dest"
chmod 700 backups "$dest"

echo "Backing up InfluxDB"
dc exec -T influxdb sh -c 'rm -rf /tmp/backup && influx backup /tmp/backup --token "$DOCKER_INFLUXDB_INIT_ADMIN_TOKEN"'
dc cp influxdb:/tmp/backup "$dest/influxdb"
dc exec -T influxdb rm -rf /tmp/backup

echo "Backing up Node-RED data"
dc cp node-red:/data "$dest/node-red-data"

green "Backup written to $dest"
