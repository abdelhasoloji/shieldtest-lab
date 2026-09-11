#!/usr/bin/env bash
# End-to-end smoke test for the opt-in `monitoring` compose profile.
#
# Brings up target + reflector (on the isolated lab net) and Prometheus (via the
# `monitoring` profile), drives one bounded synthetic burst, and asserts that:
#   1. Prometheus scrapes the lab metrics endpoints (up == 1), and
#   2. the reflector reports a non-zero byte amplification (the burst was seen).
# Always tears everything down (including volumes) on exit.
#
# Usage (needs a running Docker daemon):  bash deploy/monitoring/smoke.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
PROM="http://127.0.0.1:9090"

cleanup() {
  echo "==> teardown"
  docker compose --profile monitoring down -v --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT

q() { # instant query -> first sample value, or empty
  curl -fsS --get "$PROM/api/v1/query" --data-urlencode "query=$1" \
    | python3 -c 'import sys,json; r=json.load(sys.stdin)["data"]["result"]; print(r[0]["value"][1] if r else "")'
}

echo "==> build + up target/reflector (internal lab net)"
docker compose up -d --build lab-target lab-reflector

echo "==> up prometheus (monitoring profile; joins the internal net to scrape)"
docker compose --profile monitoring up -d --build lab-prometheus

echo "==> drive one bounded synthetic burst (dns shape, 5s)"
PROFILE=dns PPS=20 DURATION_SEC=5 docker compose run --rm --build lab-generator

echo "==> wait for Prometheus to scrape"
up_reflector=""; up_target=""
for _ in $(seq 1 20); do
  sleep 2
  up_reflector="$(q 'up{component="reflector"}' || true)"
  up_target="$(q 'up{component="target"}' || true)"
  [ "$up_reflector" = "1" ] && [ "$up_target" = "1" ] && break
done

bap="$(q 'shieldtest_reflector_bap' || true)"

echo "----------------------------------------"
echo "up{reflector} = ${up_reflector:-<none>}"
echo "up{target}    = ${up_target:-<none>}"
echo "reflector_bap = ${bap:-<none>}"
echo "----------------------------------------"

fail=0
[ "$up_reflector" = "1" ] || { echo "FAIL: reflector not scraped up"; fail=1; }
[ "$up_target" = "1" ]    || { echo "FAIL: target not scraped up"; fail=1; }
awk "BEGIN{exit !(${bap:-0} > 0)}" || { echo "FAIL: reflector_bap not > 0"; fail=1; }

if [ "$fail" = "0" ]; then echo "PASS: monitoring profile scrapes live lab metrics"; else exit 1; fi
