# Monitoring (opt-in `monitoring` compose profile)

Turns the bench's already-emitted Prometheus metrics into a live Grafana
dashboard. It is **opt-in** (nothing starts unless you pass
`--profile monitoring`) and **isolation-preserving**: Prometheus joins the
internal lab network to scrape, and **no data-plane port is published** — only
the Prometheus/Grafana web UIs are published on `127.0.0.1`.

## Why

The bench serves `/metrics` on the reflector (`:9101`), target (`:9102`) and
scrubber (`:9105`), but nothing scraped them, so amplification factor, collateral
and detection delay never reached a dashboard. This profile closes that gap.

## Run

```bash
npm run up                                   # bench: target + reflector
docker compose up -d lab-scrubber            # (optional) mitigation node
docker compose --profile monitoring up -d    # Prometheus + Grafana

# UIs are on 127.0.0.1 only — reach them by SSH tunnel, never a public port:
ssh -L 3000:127.0.0.1:3000 -L 9090:127.0.0.1:9090 <vps>
# Grafana http://127.0.0.1:3000 (admin / $GRAFANA_ADMIN_PASSWORD, default "admin")
```

Tear down (keeps the TSDB/Grafana volumes; add `-v` to drop them):

```bash
docker compose --profile monitoring down
```

## What's provisioned

- **Datasource** — Prometheus (`grafana/provisioning/datasources/`), uid
  `shieldtest-prometheus`.
- **Dashboard** — *WEDOS ShieldTest — Network Lab*
  (`grafana/dashboards/shieldtest-lab.json`): BAP, packet amplification,
  scrubber mitigation/ceiling, collateral, target throughput, reflector byte
  rate, detection delay.
- **Scrape config** — `prometheus/prometheus.yml` (job `shieldtest-lab`, one
  target per component).
- **Alerting rules** — `prometheus/alerts.yml`, loaded via `rule_files`.

Every metric name used is one the code actually emits
(`target/receiver.mjs`, `synthetic-reflector/server.mjs`, `scrubber/server.mjs`).

## Alerting rules

| Alert | Fires when |
| --- | --- |
| `LabTargetDown` | a metrics endpoint is unscrapable for 1m (`up == 0`) |
| `ReflectorNearAmplificationCap` | `shieldtest_reflector_bap > 45` (cap 50) |
| `TargetNearPpsCap` | `shieldtest_target_avg_pps > 450` (cap 500) |
| `ScrubberHighCollateral` | `shieldtest_scrubber_collateral_pct > 20` |
| `ScrubberSlowDetection` | `shieldtest_scrubber_detection_delay_seconds > 5` |
| `ScrubberSustainedMitigation` | `shieldtest_scrubber_mitigating == 1` for 5m |

## Verify (smoke test)

`bash deploy/monitoring/smoke.sh` brings up target + reflector + Prometheus,
drives one bounded burst, asserts Prometheus scrapes the lab metrics
(`up == 1`) and the reflector reports a non-zero amplification, then tears
everything down. Needs a running Docker daemon; it is also run in CI.

## Safety

- Nothing starts without `--profile monitoring`; the default `up` is unchanged.
- Prometheus scrapes over the internal `internal: true` lab net; no data-plane
  port is published, only loopback UI ports.
- `no-new-privileges` on both containers; state in named volumes.
