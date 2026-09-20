#!/usr/bin/env bash
# Saves the Anthropic API key to the one place the demo runner reads it: <ws folder>/.anthropic_key,
# next to (not inside) the repository. Works from any terminal on this phone, because the location is
# worked out from where this script is. The key is typed hidden and never printed.
#   bash docker/node-red/leaflimits/dev/save-key.sh
set -euo pipefail
HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
WS=$(cd "$HERE/../../../../.." && pwd)      # dev -> leaflimits -> node-red -> docker -> repo -> ws folder
FILE="$WS/.anthropic_key"
read -rs -p "Anthropic API key (input is hidden): " K; echo
K=$(printf %s "$K" | tr -d '[:space:]')
case "$K" in
    sk-ant-*) ;;
    *) echo "That does not start with sk-ant-. Nothing saved." >&2; exit 1;;
esac
umask 077
printf %s "$K" > "$FILE"
chmod 600 "$FILE" 2>/dev/null || true
unset K
echo "Saved $(wc -c < "$FILE" | tr -d ' ') bytes to $FILE"
[ -e "$WS/$(basename "$(cd "$HERE/../../../.." && pwd)")/.anthropic_key" ] && echo "Note: an older key file inside the repo folder is still there. It can be deleted."
echo "Next: bash $HERE/check-key.sh"
