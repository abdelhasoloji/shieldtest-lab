# Setup and operational scope — 14 October 2026

## Separate laboratories

This repository is the synthetic UDP/TCP bench. The HTTP Kubernetes lab, three persistent IoT workers, site inventory and DRS engine are in [Ddostester](https://github.com/abdelhasoloji/Ddostester). Both use the lab VPS today but are separate execution paths.

Read-only observation on `31.31.74.187`: `shieldtest-lab-runner` active, deployed `/opt/shieldtest-lab` commit `eb0aa26`. The HTTP lab uses K3s `v1.37.1+k3s1` inside k3d container `k3d-ddostester-linux-lab-server-0`, namespace `ddostester-lab`, ten Pods including three IoT workers. A repository push does not establish that a new synthetic bench release was deployed.

## Actual network rules

Compose's `shieldtest_lab` network is internal, subnet `192.168.100.0/24`. Target `.99`, reflector `.50`, scrubber `.60`, generator `.10` and legitimate client `.11` are private lab addresses. Core synthetic services publish no host ports. The optional monitoring profile publishes **loopback-only** Prometheus `9090` and Grafana `3000` ports on a separate monitoring bridge; do not describe that profile as having no host ports at all.

The standalone `lib/net-guard.mjs` accepts RFC1918 and IPv4 loopback addresses; `LAB_CIDR_PREFIX` may narrow that set and cannot widen it. It is not intrinsically a single-/24 validator. Compose supplies the chosen lab prefix. Console defaults to loopback `9110`; code has an explicit non-loopback lab option, which is not public deployment qualification.

Authorized public HTTP targets are supported by the **separate control-plane Fleet** with its allowlist/origin/account policy. That fact does not turn the synthetic bench into an arbitrary public amplification generator.

## Defaults and configuration

| Component | Current default | Where to verify |
| --- | --- | --- |
| Generator | 500 PPS ceiling, 60-second ceiling, packet factor 10 | `generator/generate.mjs`, Compose environment |
| Reflector | factor 50, response 8192 bytes, packet factor 10 | `synthetic-reflector/server.mjs`, Compose environment |
| Console | loopback 9110, registered names only | `console/server.mjs` |
| Metrics | component HTTP ports enabled by Compose, standalone default off | [Ports](reference/ports-and-network.md) |
| Runner | requires endpoint/token, polls named approved scenarios | `runner.mjs` |

Generator/component ceilings are configurable values validated by their code; not every named MAX variable is an immutable universal ceiling. The reflector validates its own upper bounds. Existing fixed scenario budgets remain authoritative for scenario dispatch. Describing defaults honestly does not qualify higher rates or authorize external destinations.

## DRS and qualification

Bench counters and verdicts are experimental evidence. The control plane archives DRS 3.00.00 and has three modes; full-standard physical adapters, independent entry/origin collectors, functional journeys, Kusa and multisite capacity remain unqualified. L3 has dry-run/namespace simulation backends, not real packet emission.

No public reflector is part of the architecture. Actual received traffic is never multiplied for scoring. Preserve configuration/source identity, injected versus received counters, telemetry gaps, represented dimensions, baseline/recovery and calibration. See [cross-repository contract](cross-repo-contract.md).
