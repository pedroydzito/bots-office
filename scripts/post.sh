#!/usr/bin/env bash
# Publish Bot Office messages through Supabase.
#
#   export BOT_OFFICE_TOPIC=your-access-code       # or a file named "topic" next to this script
#   export BOT_OFFICE_ACCOUNT=captacao              # optional, default: principal
#
#   scripts/post.sh status "X Writer" working "Drafting tonight's post"
#   scripts/post.sh status "X Writer" waiting_user "Needs your OK to publish"
#   scripts/post.sh status "X Writer" done "Published"
#   scripts/post.sh talk   "SDR" "Closer" "Handing off 3 hot leads"
#   scripts/post.sh talk-end "SDR" "Closer"
#   scripts/post.sh usage 37 2026-11-10T00:00:00Z '{"SDR":4.1,"Closer":2.5}'
#   scripts/post.sh cortex 123 '[{"title":"Pricing notes","updated":"2026-11-07T12:00:00Z"}]'
#   scripts/post.sh roster my-roster.json
#   scripts/post.sh photo "Closer" face.jpg
#   scripts/post.sh raw '{"groups":{"SDR":"Sales"}}'
#
# Requires curl. `roster` also needs jq. `photo` needs ImageMagick.
# Keep BOT_OFFICE_SUPABASE_URL / KEY in sync with src/lib/transport.js.
set -euo pipefail
export LC_ALL=C

TOPIC="${BOT_OFFICE_TOPIC:-${TOPIC:-}}"
ACCOUNT="${BOT_OFFICE_ACCOUNT:-principal}"
URL="${BOT_OFFICE_SUPABASE_URL:-https://sqwcsncrlzznxwksrche.supabase.co}"
KEY="${BOT_OFFICE_SUPABASE_KEY:-sb_publishable_FftQEYa2xe4wQCndfscbrg_ydE47IQX}"
URL="${URL%/}"

if [[ -z "$TOPIC" ]]; then
  topic_file="$(cd "$(dirname "$0")" && pwd)/topic"
  if [[ -f "$topic_file" ]]; then
    TOPIC="$(tr -d '[:space:]' < "$topic_file")"
  fi
fi
if [[ -z "$TOPIC" ]]; then
  echo "Set BOT_OFFICE_TOPIC (your access code) or create a file named 'topic' next to this script." >&2
  exit 1
fi
if [[ ! "$TOPIC" =~ ^[A-Za-z0-9_-]{1,64}$ ]]; then
  echo "Bot Office: access code must be 1-64 letters, numbers, - or _." >&2
  exit 1
fi
if [[ -z "$KEY" || -z "$URL" ]]; then
  echo "Bot Office: Supabase URL and publishable key are required." >&2
  exit 1
fi

# JSON-escape a string (no jq needed)
js() {
  local s=${1//\\/\\\\}
  s=${s//\"/\\\"}
  s=${s//$'\n'/ }
  s=${s//$'\t'/ }
  printf '"%s"' "$s"
}

# Identical status posts inside 2 minutes are dropped. A later repeat still
# goes out, so a heartbeat can refresh a bot before the 30-minute idle decay.
guard_dir() {
  local base="${XDG_CACHE_HOME:-${HOME:-/tmp}/.cache}/bot-office"
  if mkdir -p "$base" 2>/dev/null; then
    printf '%s' "$base"
    return
  fi
  base="/tmp/bot-office-guard"
  mkdir -p "$base"
  printf '%s' "$base"
}

send() {
  local payload="$1" tmp code body
  body="{\"access_code\":$(js "$TOPIC"),\"payload\":$payload}"
  tmp="$(mktemp)"
  code="$(curl -sS -o "$tmp" -w '%{http_code}' --max-time 25 \
    -H "apikey: $KEY" \
    -H "Authorization: Bearer $KEY" \
    -H "Content-Type: application/json" \
    --data-binary "$body" \
    "$URL/rest/v1/rpc/office_publish")" || {
    rm -f "$tmp"
    echo "Bot Office: network error while publishing." >&2
    exit 1
  }
  if [[ "$code" -lt 200 || "$code" -ge 300 ]]; then
    local msg
    msg="$(tr '\n' ' ' < "$tmp" | cut -c1-400)"
    rm -f "$tmp"
    echo "Bot Office: publish failed (HTTP ${code}). ${msg}" >&2
    exit 1
  fi
  rm -f "$tmp"
  echo "sent: $payload"
}

send_status() {
  local payload="$1" dir hash file now prev_time prev_payload
  hash=""
  if command -v sha256sum >/dev/null; then
    hash="$(printf '%s' "$TOPIC" | sha256sum | awk '{print $1}')"
  elif command -v shasum >/dev/null; then
    hash="$(printf '%s' "$TOPIC" | shasum -a 256 | awk '{print $1}')"
  fi
  if [[ -z "$hash" ]]; then
    send "$payload"
    return
  fi
  dir="$(guard_dir)"
  file="$dir/${hash}.status"
  now="$(date +%s)"
  if [[ -f "$file" ]]; then
    prev_time="$(head -n 1 "$file" 2>/dev/null || echo 0)"
    prev_payload="$(tail -n +2 "$file" 2>/dev/null || true)"
    if [[ "$prev_payload" == "$payload" && "$prev_time" =~ ^[0-9]+$ ]]; then
      if (( now - prev_time < 120 )); then
        echo "skipped: identical status"
        exit 0
      fi
    fi
  fi
  send "$payload"
  printf '%s\n%s\n' "$now" "$payload" > "$file" 2>/dev/null || true
}

cmd="${1:-}"
shift || true
case "$cmd" in
  status)
    [[ $# -ge 2 ]] || { echo "usage: status <bot> <working|done|idle|waiting_user|error> [step]" >&2; exit 1; }
    send_status "{\"bot\":$(js "$1"),\"status\":$(js "$2"),\"step\":$(js "${3:-}")}"
    ;;
  talk)
    [[ $# -ge 2 ]] || { echo "usage: talk <from> <to> [step]" >&2; exit 1; }
    send "{\"type\":\"talk\",\"from\":$(js "$1"),\"to\":$(js "$2"),\"step\":$(js "${3:-}"),\"status\":\"start\"}"
    ;;
  talk-end)
    [[ $# -ge 2 ]] || { echo "usage: talk-end <from> <to> [step]" >&2; exit 1; }
    send "{\"type\":\"talk\",\"from\":$(js "$1"),\"to\":$(js "$2"),\"step\":$(js "${3:-}"),\"status\":\"end\"}"
    ;;
  usage)
    [[ $# -ge 1 ]] || { echo "usage: usage <total_pct> [resets_at_iso] [bots_json]" >&2; exit 1; }
    send "{\"type\":\"usage\",\"account\":$(js "$ACCOUNT"),\"total_used_pct\":$1,\"resets_at\":$(js "${2:-}"),\"bots\":${3:-{\}}}"
    ;;
  cortex)
    [[ $# -ge 1 ]] || { echo "usage: cortex <notes> [recent_json_array]" >&2; exit 1; }
    send "{\"cortex\":{\"notes\":$1,\"recent\":${2:-[]}}}"
    ;;
  roster)
    command -v jq >/dev/null || { echo "roster needs jq" >&2; exit 1; }
    here="$(cd "$(dirname "$0")/.." && pwd)"
    # Long rosters are split into several {"roster":[...]} messages of at most ~3500 bytes,
    # sent back to back. The site joins parts that arrive within 15 seconds into one list.
    max=3500
    chunk=""
    parts=0
    flush() {
      [[ -z "$chunk" ]] && return
      send "{\"account\":$(js "$ACCOUNT"),\"roster\":[$chunk]}"
      parts=$((parts + 1))
      chunk=""
    }
    while IFS= read -r item; do
      if (( ${#item} + 16 > max )); then
        echo "skipping a roster entry over $max bytes (drop the photo or shorten it)" >&2
        continue
      fi
      if [[ -n "$chunk" ]] && (( ${#chunk} + ${#item} + 16 > max )); then flush; fi
      chunk="${chunk:+$chunk,}$item"
    done < <(jq -c '.[] | {name, id, shape, color, accessory, team, photo, hidden, role, beside, account} | with_entries(select(.value != null))' "${1:-$here/src/roster.json}")
    flush
    echo "roster sent in $parts message(s)"
    ;;
  photo)
    [[ $# -ge 2 ]] || { echo "usage: photo <bot> <image-file>" >&2; exit 1; }
    command -v convert >/dev/null || { echo "photo needs ImageMagick (convert)" >&2; exit 1; }
    b64="$(convert "$2" -resize 64x64^ -gravity center -extent 64x64 -strip -quality 70 jpg:- | base64 | tr -d '\n')"
    send "{\"looks\":{$(js "$1"):{\"shape\":\"photo\",\"photo\":\"data:image/jpeg;base64,$b64\"}}}"
    ;;
  raw)
    [[ $# -ge 1 && -n "${1:-}" ]] || { echo "usage: raw <json>" >&2; exit 1; }
    send "$1"
    ;;
  *)
    sed -n '2,20p' "$0"
    exit 1
    ;;
esac
