# ShieldTest Lab — isolated synthetic UDP-amplification bench

A closed research lab that reproduces the **traffic shape and measurement
problem** of UDP amplification for defensive study. It was extracted from the
[WEDOS ShieldTest](https://github.com/abdelhasoloji/ddostester) control plane so
the boundary is **structural, not conventional**: the defensive control plane
contains no attack vector at all, and this offensive-shaped bench lives, runs and
is governed entirely on its own — never near production.

> **This is a measurement model, not an amplifier.** Its safety rests on
> concrete, code-level properties (enforced by the tests in `test/`):
>
> - **No source-IP spoofing** — ordinary UDP sockets; the reflection target is
>   fixed by configuration, never read from a packet's source address, so it
>   cannot reflect off third parties (the defining trait of a real reflection
>   attack).
> - **No real reflector protocols** — the protocol is a synthetic JSON message.
>   No DNS/NTP/SSDP/memcached service is implemented; the named profiles
>   (`generic`/`dns`/`ssdp`/`ntp`/`memcached`) are only byte/packet **shape**
>   presets used to study detection per traffic profile.
> - **Hard caps** on byte factor, response size, packet factor, generator PPS and
>   duration; oversized requests are clamped.
> - **Network isolation** — the Compose network is `internal: true` (no
>   Docker-managed Internet egress) with **no published host ports**, and the
>   host guard (`lib/net-guard.mjs`) refuses any address outside the lab's
>   RFC1918 `/24`.
>
> It must **never** be attached to a production or public network, and running
> its components outside the isolated lab network is unsupported.

## Components

| Piece                          | What it does                                                        |
| ------------------------------ | ------------------------------------------------------------------- |
| `target/receiver.mjs`          | Instrumented victim; exposes Prometheus text metrics.               |
| `synthetic-reflector/server.mjs` | Synthetic (JSON) reflector — amplifies a request by a bounded factor toward the fixed target. |
| `scrubber/server.mjs`          | Optional mitigation node: detects and filters over a PPS threshold. |
| `generator/generate.mjs`       | Load generator (synthetic amplification requests, or benign `legit`). |
| `lib/net-guard.mjs`            | Refuses any destination outside the lab CIDR (defense in depth).    |
| `profiles.mjs` · `scenarios.mjs` · `run-scenario.mjs` | Traffic-shape presets and the scenario runner.       |

## Run it (on an isolated bench only)

```bash
# 1) Bring up the target (+ reflector, + optional scrubber)
docker compose up -d lab-target lab-reflector
#    add the scrubber and route through it to study detection/mitigation:
#    LAB_REFLECTOR_TARGET=192.168.100.60 docker compose up -d lab-target lab-scrubber lab-reflector

# 2) Fire one bounded synthetic burst (shape presets via env)
PROFILE=dns PPS=20 DURATION_SEC=10 docker compose run --rm lab-generator

# 3) Tear down
docker compose down
```

Safety-invariant tests (no Docker needed):

```bash
npm test        # node --test "test/*.test.mjs"
```

## Relationship to ShieldTest

The two connect **only through a read-only, governed contract** — never a live
attack path. The bench (or its operator) produces a **verdict / metrics summary**
(amplification factor, detection delay, mitigation efficacy, collateral) that
ShieldTest **ingests read-only** for its resilience assessment, exactly as
described in ShieldTest's `docs/drs-validation-policy.md`. ShieldTest never opens
a raw or amplification socket; this repo never touches the production network.

## License / use

Internal WEDOS defensive research. See `docs/network-lab.md` for the full design
and safety rationale.
