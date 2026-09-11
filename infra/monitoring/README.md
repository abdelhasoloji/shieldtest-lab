# Observability overlay (opt-in)

Turns the bench's already-emitted Prometheus metrics into a live Grafana
dashboard. It is **opt-in** and **isolation-preserving**: the base
`docker-compose.yml` and its `internal: true` guarantee are untouched, and **no
data-plane port is published**. Prometheus joins the internal lab network to
scrape, and only the Prometheus/Grafana **web UIs** are published on `127.0.0.1`.

## Why

The base bench serves `/metrics` on the reflector (`:9101`), target (`:9102`)
and scrubber (`:9105`), but nothing scrapes them — so amplification factor,
collateral and detection delay never reach a dashboard. This overlay closes that
gap.

## Run

```bash
# 1. bring the bench up (add lab-scrubber to see mitigation panels)
docker compose up -d lab-target lab-reflector

# 2. bring up the observability stack
docker compose -f docker-compose.yml \
  -f infra/monitoring/docker-compose.metrics.yml up -d lab-prometheus lab-grafana

# 3. reach Grafana over a loopback SSH tunnel (never expose it publicly)
ssh -L 3000:127.0.0.1:3000 <vps>     # open http://127.0.0.1:3000  (admin / admin)
ssh -L 9090:127.0.0.1:9090 <vps>     # Prometheus, if you want raw queries
```

Tear down (keeps TSDB/Grafana volumes):

```bash
docker compose -f docker-compose.yml \
  -f infra/monitoring/docker-compose.metrics.yml down
```

## What's provisioned

- **Datasource** — Prometheus (`grafana/provisioning/datasources/`), uid
  `shieldtest-prometheus`.
- **Dashboard** — *ShieldTest Lab — overview*
  (`grafana/dashboards/shieldtest-lab.json`): BAP, packet amplification,
  scrubber state, collateral %, target ingress rate, reflector bytes in/out,
  scrubber forwarded-vs-dropped, detection delay.
- **Scrape config** — `prometheus.yml`, targeting the fixed lab IPs.

Every metric name in the dashboard is one the code actually emits
(`target/receiver.mjs`, `synthetic-reflector/server.mjs`, `scrubber/server.mjs`).

## Relationship to the VPS monitoring

This is the in-repo, reproducible version of the observability stack. The VPS may
also run Prometheus/Grafana natively; this overlay is for local runs and as the
source of truth for the dashboard JSON and scrape config.

## Safety

- No change to the base compose or the `internal: true` data-plane network.
- No data-plane port published; only loopback UI ports.
- `no-new-privileges` on both containers; TSDB/Grafana state in named volumes.
