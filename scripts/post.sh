#!/usr/bin/env bash
# Publish Bot Office messages to your ntfy topic.
#
#   export BOT_OFFICE_TOPIC=your-secret-topic      # same as https://<site>/#your-secret-topic
#
#   scripts/post.sh status "X Writer" working "Drafting tonight's post"
#   scripts/post.sh status "X Writer" waiting_user "Needs your OK to publish"
#   scripts/post.sh status "X Writer" done "Published"
#   scripts/post.sh talk   "SDR" "Closer" "Handing off 3 hot leads"   # SDR walks to Closer's desk
#   scripts/post.sh talk-end "SDR" "Closer"                          # SDR walks back
#   scripts/post.sh usage 37 2026-11-10T00:00:00Z '{"SDR":4.1,"Closer":2.5}'
#   scripts/post.sh cortex 123 '[{"title":"Pricing notes","updated":"2026-11-07T12:00:00Z"}]'
#   scripts/post.sh roster                     # publishes src/roster.json (looks + teams)
#   scripts/post.sh photo "Closer" face.jpg     # round photo avatar (needs ImageMagick)
#   scripts/post.sh raw '{"groups":{"SDR":"Sales"}}'
#
# Requires curl. `roster` also needs jq. Every message body is a single JSON object.
set -euo pipefail

TOPIC="${BOT_OFFICE_TOPIC:-${TOPIC:-}}"
SERVER="${NTFY_SERVER:-https://ntfy.sh}"
if [[ -z "$TOPIC" ]]; then
  echo "Set BOT_OFFICE_TOPIC (your ntfy topic) first." >&2
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

send() {
  curl -fsS -o /dev/null -H "Content-Type: application/json" --data-binary "$1" "$SERVER/$TOPIC"
  echo "sent: $1"
}

cmd="${1:-}"
shift || true
case "$cmd" in
  status)
    [[ $# -ge 2 ]] || { echo "usage: status <bot> <working|done|idle|waiting_user|error> [step]" >&2; exit 1; }
    send "{\"bot\":$(js "$1"),\"status\":$(js "$2"),\"step\":$(js "${3:-}")}"
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
    send "{\"type\":\"usage\",\"total_used_pct\":$1,\"resets_at\":$(js "${2:-}"),\"bots\":${3:-{\}}}"
    ;;
  cortex)
    [[ $# -ge 1 ]] || { echo "usage: cortex <notes> [recent_json_array]" >&2; exit 1; }
    send "{\"cortex\":{\"notes\":$1,\"recent\":${2:-[]}}}"
    ;;
  roster)
    command -v jq >/dev/null || { echo "roster needs jq" >&2; exit 1; }
    here="$(cd "$(dirname "$0")/.." && pwd)"
    send "$(jq -c '{roster: [.[] | {name, id, shape, color, accessory, team}]}' "$here/src/roster.json")"
    ;;
  photo)
    [[ $# -ge 2 ]] || { echo "usage: photo <bot> <image-file>" >&2; exit 1; }
    command -v convert >/dev/null || { echo "photo needs ImageMagick (convert)" >&2; exit 1; }
    b64="$(convert "$2" -resize 64x64^ -gravity center -extent 64x64 -strip -quality 70 jpg:- | base64 | tr -d '\n')"
    send "{\"looks\":{$(js "$1"):{\"shape\":\"photo\",\"photo\":\"data:image/jpeg;base64,$b64\"}}}"
    ;;
  raw)
    send "$1"
    ;;
  *)
    sed -n '2,20p' "$0"
    exit 1
    ;;
esac
