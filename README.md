# ShieldTester synthetic lab

This repository is the separate synthetic network measurement bench paired with [ShieldTester / Ddostester](https://github.com/abdelhasoloji/Ddostester). It models traffic shapes, detection/filtering, legitimate-service impact and measured counters. It is distinct from the three-worker HTTP Kubernetes Fleet, whose manifests and orchestration live in the control repository.

## Components and modes

| Component | Role |
| --- | --- |
| `generator/`, `tcp-generator/` | Bounded synthetic requests and legitimate traffic |
| `synthetic-reflector/` | Synthetic JSON response shapes toward a fixed configured target |
| `scrubber/` | Ceiling, blocklist or adaptive filtering model |
| `target/`, `tcp-target/` | Instrumented recipients and counters |
| `console/` | Local scenario UI and truthful live/result status |
| `runner.mjs` | Claims approved named scenarios and posts artifacts to ShieldTester |
| `l3/` | Experimental dry-run/namespace simulation; real packet backend disabled |

Node >=22, ESM, no runtime npm dependencies; Docker Compose for the isolated service stack. Tests and in-process scenario fixtures use Node. Names such as dns/ntp/ssdp are synthetic shape presets, not implementations of public reflector protocols.

## Setup and verification

```sh
npm test
# Validate resource configuration without starting services:
docker compose config -q
docker compose --profile monitoring config -q
# Optional local UI; starting it does not itself run a scenario:
npm run console
```

The console defaults to `127.0.0.1:9110`; use a protected tunnel for remote access. Registered scenario names, component bounds and the address guard define execution. [Network/setup](docs/current-setup.md) documents the actual rules and configurable defaults; it does not impose a blanket restriction on ShieldTester's separate authorized public HTTP campaigns.

## DRS meaning

ShieldTester supports engine validation, synthetic-laboratory and measured-evaluation modes. This bench supplies experimental artifacts and actual received counters. A synthetic factor never multiplies a received throughput measurement. Virtual clients and declared source pools do not establish independently observed Internet sources.

The official DRS 3.00.00 catalogue and calculation engine belong to the control repository. Bench attachments remain diagnostic and cannot automatically PASS a DRS vector. Complete measured conclusions require independently qualified entry/origin/user/generator observations, functional journeys, calibration and recovery. No Red Button certification is issued.

[Documentation](docs/README.md) · [Cross-repository contract](docs/cross-repo-contract.md) · [Contributor instructions](AGENTS.md).
