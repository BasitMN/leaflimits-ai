#!/usr/bin/env bash
# Print a NODERED_ADMIN_HASH line for .env. Uses the bcrypt library inside the Node-RED image.
#   ./scripts/hash-node-red-password.sh
set -euo pipefail
read -r -s -p "Node-RED admin password: " pw; echo
read -r -s -p "Repeat: " pw2; echo
[ "$pw" = "$pw2" ] || { echo "Passwords differ." >&2; exit 1; }
[ "${#pw}" -ge 8 ] || { echo "Use at least 8 characters." >&2; exit 1; }
hash=$(docker run --rm -e PW="$pw" nodered/node-red:5.0.7 node -e "console.log(require('bcryptjs').hashSync(process.env.PW, 8))")
echo "Add this line to .env (keep the single quotes):"
echo "NODERED_ADMIN_HASH='${hash}'"
