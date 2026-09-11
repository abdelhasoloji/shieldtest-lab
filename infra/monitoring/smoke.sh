#!/usr/bin/env bash
# End-to-end smoke test for the opt-in observability overlay.
#
# Brings up the target + reflector on the isolated lab network and Prometheus on
# top of them, drives one bounded synthetic burst, and asserts that:
#   1. Prometheus successfully scrapes the lab metrics endpoints (up == 1), and
#   2. the reflector reports a non-zero byte amplification (the burst was seen).
# Always tears everything down (including volumes) on exit.
#
# Usage (needs a running Docker daemon):  bash infra/monitoring/smoke.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
BASE="-f docker-compose.yml"
OVERLAY="-f infra/monitoring/docker-compose.metrics.yml"
PROM="http://127.0.0.1:9090"

cleanup() {
  echo "==> teardown"
  # shellcheck disable=SC2086
  docker compose $BASE $OVERLAY down -v --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT

q() { # query Prometheus instant vector, print the first sample value or empty
  curl -fsS --get "$PROM/api/v1/query" --data-urlencode "query=$1" \
    | python3 -c 'import sys,json; r=json.load(sys.stdin)["data"]["result"]; print(r[0]["value"][1] if r else "")'
}

echo "==> build + up target/reflector (internal lab net)"
# shellcheck disable=SC2086
docker compose $BASE up -d --build lab-target lab-reflector

echo "==> up prometheus (joins the internal net to scrape)"
# shellcheck disable=SC2086
docker compose $BASE $OVERLAY up -d --build lab-prometheus

echo "==> drive one bounded synthetic burst (dns shape, 5s)"
# shellcheck disable=SC2086
PROFILE=dns PPS=20 DURATION_SEC=5 docker compose $BASE run --rm --build lab-generator

echo "==> wait for Prometheus to scrape"
 up_reflector=""; up_target=""
for _ in $(seq 1 20); do
  sleep 2
  up_reflector="$(q 'up{job="lab-reflector"}' || true)"
  up_target="$(q 'up{job="lab-target"}' || true)"
  [ "$up_reflector" = "1" ] && [ "$up_target" = "1" ] && break
done

bap="$(q 'shieldtest_reflector_bap' || true)"

echo "----------------------------------------"
echo "up{lab-reflector} = ${up_reflector:-<none>}"
echo "up{lab-target}    = ${up_target:-<none>}"
echo "reflector_bap     = ${bap:-<none>}"
echo "----------------------------------------"

fail=0
[ "$up_reflector" = "1" ] || { echo "FAIL: reflector not scraped up"; fail=1; }
[ "$up_target" = "1" ]    || { echo "FAIL: target not scraped up"; fail=1; }
awk "BEGIN{exit !(${bap:-0} > 0)}" || { echo "FAIL: reflector_bap not > 0"; fail=1; }

if [ "$fail" = "0" ]; then echo "PASS: observability overlay scrapes live lab metrics"; else exit 1; fi
