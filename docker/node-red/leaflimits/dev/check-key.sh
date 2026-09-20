#!/usr/bin/env bash
# Checks the Anthropic API key in the key file, one step at a time, and explains any failure in plain words.
# The key is never printed and never put on a command line.
#   bash docker/node-red/leaflimits/dev/check-key.sh
#   LL_DEMO_KEY_FILE=/other/file bash .../check-key.sh
set -uo pipefail
HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
KF=${LL_DEMO_KEY_FILE:-$(cd "$HERE/../../../../.." && pwd)/.anthropic_key}
MODEL=${ANTHROPIC_MODEL:-claude-sonnet-5}
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
bad=0

step() { printf '\n%s\n' "$1"; }
ok()   { printf '  \033[32mOK\033[0m    %s\n' "$1"; }
fail() { printf '  \033[31mFAIL\033[0m  %s\n' "$1"; bad=1; }
note() { printf '        %s\n' "$1"; }

call() { # call METHOD PATH [BODYFILE] -> prints HTTP status, body in $TMP/body
    local extra=()
    [ -n "${3:-}" ] && extra=(-d "@$3")
    printf 'header = "x-api-key: %s"\nheader = "anthropic-version: 2023-06-01"\nheader = "content-type: application/json"\n' "$KEY" |
        curl -s -m 60 -o "$TMP/body" -w '%{http_code}' -K - -X "$1" "${extra[@]}" "https://api.anthropic.com$2"
}
err() { python3 - "$TMP/body" <<'PY'
import json, sys
try:
    e = json.load(open(sys.argv[1])).get('error', {})
    print((e.get('type') or '?') + ': ' + (e.get('message') or ''))
except Exception:
    print('(no readable answer)')
PY
}

step "1. Key file ($KF)"
if [ ! -s "$KF" ]; then fail "the file is missing or empty. Save the key first (see the command in the chat)."; exit 1; fi
KEY=$(tr -d '\n\r' < "$KF")
ok "file found, $(wc -c < "$KF" | tr -d ' ') bytes, modified $(date -r "$KF" '+%d %b %H:%M')"
case "$KEY" in sk-ant-*) ok "starts like an Anthropic key (sk-ant-)";; *) fail "does not start with sk-ant-. It may be another kind of key, or the wrong text was saved."; note "Create an API key in the Anthropic Console under API Keys."; exit 1;; esac
case "$KEY" in *[[:space:]]*) fail "contains a space inside. Save it again without extra characters."; exit 1;; *) ok "no stray spaces or line breaks";; esac

step "2. Is the key accepted? (lists models, free)"
code=$(call GET /v1/models)
case "$code" in
    200) ok "accepted by Anthropic"
         python3 - "$TMP/body" "$MODEL" <<'PY'
import json, sys
ids = [m['id'] for m in json.load(open(sys.argv[1])).get('data', [])]
print('        %d models visible. %s: %s' % (len(ids), sys.argv[2], 'available' if sys.argv[2] in ids else 'NOT in the list'))
PY
         ;;
    401) fail "HTTP 401: Anthropic does not accept this key ($(err))"
         note "Typical causes: the key was deleted, revoked or disabled in the Console; it was copied incompletely; or"
         note "it belongs to an organization or workspace that no longer exists. Create a new key and save it again."
         exit 1;;
    403) fail "HTTP 403: the key is valid but not allowed to do this ($(err))"
         note "Check the workspace and permissions of the key in the Console."; exit 1;;
    *)   fail "HTTP $code ($(err))"; exit 1;;
esac

step "3. Can it run a request? (16 tokens of text, costs almost nothing)"
printf '{"model":"%s","max_tokens":16,"messages":[{"role":"user","content":"Say hi"}]}' "$MODEL" > "$TMP/req.json"
code=$(call POST /v1/messages "$TMP/req.json")
case "$code" in
    200) python3 - "$TMP/body" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
print('  \033[32mOK\033[0m    request served by %s, %s input and %s output tokens' % (d.get('model'), d['usage']['input_tokens'], d['usage']['output_tokens']))
PY
         ;;
    400) if grep -qi 'credit balance' "$TMP/body"; then
             fail "no credit: $(err)"
             note "Add credit under Plans & Billing in the Console. API credit is separate from a Claude.ai subscription."
         else fail "HTTP 400: $(err)"; fi
         bad=1;;
    401) fail "HTTP 401: $(err)"; bad=1;;
    403) fail "HTTP 403: $(err)"; note "The key or workspace is not allowed to use this model."; bad=1;;
    404) fail "HTTP 404: $(err)"; note "The model name '$MODEL' is not available to this key. Set ANTHROPIC_MODEL, for example claude-haiku-4-5-20251001."; bad=1;;
    429) fail "HTTP 429: too many requests or a rate limit ($(err))"; note "Wait a minute and run the check again."; bad=1;;
    5*)  fail "HTTP $code: Anthropic is overloaded or down ($(err))"; note "Try again in a few minutes."; bad=1;;
    *)   fail "HTTP $code ($(err))"; bad=1;;
esac

echo
if [ "$bad" -eq 0 ]; then echo "The key works. Restart the demo runner so it picks it up: stop-demo.sh, then start-demo.sh."; else echo "The key does not work yet. See the messages above."; exit 1; fi
