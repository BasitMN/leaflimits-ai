# Shared helpers for the deploy scripts. Sourced, not executed.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

red()   { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
yellow(){ printf '\033[33m%s\033[0m\n' "$*"; }

# envval KEY [DEFAULT]: read a value from .env without sourcing it
# (the Node-RED password hash contains $ characters).
envval() {
    local line v
    line=$(grep -E "^$1=" .env 2>/dev/null | tail -1 || true)
    v=${line#*=}
    v=${v#\'}; v=${v%\'}
    v=${v#\"}; v=${v%\"}
    if [ -n "$v" ]; then printf '%s' "$v"; else printf '%s' "${2:-}"; fi
}

# hostfor BIND: address to use from this machine to reach a service bound to BIND
hostfor() {
    case "$1" in 0.0.0.0|"") printf '127.0.0.1' ;; *) printf '%s' "$1" ;; esac
}

dc() { docker compose --env-file .env "$@"; }
