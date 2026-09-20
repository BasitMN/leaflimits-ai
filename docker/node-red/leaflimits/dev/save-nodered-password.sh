#!/usr/bin/env bash
# Saves the Node-RED editor password to <ws folder>/.nodered_password, next to (not inside) the repository, so that
# live-import.js can log in. The input is hidden and the password is never printed. Delete the file when you are done.
#   bash docker/node-red/leaflimits/dev/save-nodered-password.sh
set -euo pipefail
HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
WS=$(cd "$HERE/../../../../.." && pwd)
FILE="$WS/.nodered_password"
read -rs -p "Node-RED editor password for the live server (input is hidden): " P; echo
[ -n "$P" ] || { echo "Empty. Nothing saved." >&2; exit 1; }
umask 077
printf %s "$P" > "$FILE"
chmod 600 "$FILE" 2>/dev/null || true
unset P
echo "Saved $(wc -c < "$FILE" | tr -d ' ') bytes to $FILE. Delete it when the import is done: rm \"$FILE\""
