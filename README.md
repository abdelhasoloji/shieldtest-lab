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
| `profiles.mjs` · `scenarios.mjs` · `run-scenario.mjs` | Traffic-shape presets and the scenario runner (single- or multi-vector). |
| `verdict.mjs`                  | Turns a run into a read-only, class-C verdict artifact (see below). |
| `console/`                     | Loopback web console: pick a bounded scenario, watch it live, read its verdict. |

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

## Console (loopback web UI)

A small web console runs the bounded scenarios in-process over loopback and shows
each one live — byte/packet amplification, target throughput, and (when a scrubber
is in the path) detection delay, collateral and dropped counts — then renders the
run's verdict artifact.

```bash
npm run console         # serves http://127.0.0.1:9110 — reach it over an SSH tunnel, never publicly
```

Safety by construction: the console **binds a loopback host only** (a non-loopback
bind is refused unless `LAB_CONSOLE_ALLOW_NONLOOPBACK=1` is set on an isolated
network), and the only thing a client can ask for is a **named, allowlisted
scenario** — no target, host, port or rate is ever accepted from the wire, so it
cannot become a general-purpose traffic launcher.

## Scenarios, shapes & mitigation strategies

```bash
npm run scenario -- multi-profile-mix     # run a named scenario, print the summary
npm run verdict  -- adaptive-mitigation   # run and print just the verdict artifact
```

Scenarios (`scenarios.mjs`) are bounded configs wired by `run-scenario.mjs`. They
cover rate **shapes** (`constant` / `ramp` / `wave` / `burst`), **multi-vector
combos** (several synthetic profiles fired together, with a per-profile
amplification breakdown), and the scrubber's **mitigation strategies**:

- `ceiling` — forward up to a fixed pps, drop the rest (blunt rate cap);
- `blocklist` — forward every legitimate packet, drop attack-classified ones
  (ideal signature filter → ~0 collateral);
- `adaptive` — start at the floor and raise the ceiling toward the threshold when
  mitigation harms legitimate traffic, decay it back down when it does not.

## Verdict artifact (read-only, class C)

`verdict.mjs` maps a run to a small JSON artifact — amplification factor, packet
amplification, detection delay, mitigation strategy/efficacy, collateral and an
outcome. **Boundary note:** UDP amplification is **class C** ("network bench") in
ShieldTest's `drs-validation-policy.md`; the control plane's `/api/drs-validations`
records **class A/B only** and rejects class C. So this verdict is standalone,
read-only evidence (attach it to a report, diff two runs, or scrape the same
numbers from Prometheus) — it is **never** posted as a class-A/B verdict.

## Governed dispatch runner

The ShieldTest control plane can centralize the bench behind its CISO role
(record-and-dispatch): a CISO records an authorized run request in the app, and
**this runner** — running here, outside the control plane — claims it, executes
the scenario in the lab, and posts a read-only class-C verdict back. The control
plane never emits the traffic.

```bash
BENCH_API_URL=https://shieldtest.internal \
BENCH_RUNNER_TOKEN=<same token as the control plane> \
RUNNER_ID=lab-runner-1 \
npm run runner            # poll-claim-execute-report loop (RUNNER_ONCE=1 for one job)
```

The runner only ever receives an **allowlisted scenario name** and a lab-target
label from the governed queue — never an arbitrary host, rate or duration. It
fails closed without `BENCH_API_URL` and `BENCH_RUNNER_TOKEN`. See ShieldTest's
`docs/drs-validation-policy.md` §8.

## Experimental: spoofed L3/L4 mode (`l3/`, no real emission in V1)

A heavily-gated subsystem models **L3/L4 attacks with falsified source IPs**
inside the closed lab **only** — never toward the Internet, an arbitrary
destination, or from the management network. It is off by default and, in **V1,
emits no real packet**: the runnable backends are `dry-run` (nothing) and
`namespace-sim` (an in-process functional model). A real raw-packet backend is
registered but **disabled** and cannot run without a dedicated hardened
container, a real confinement proof, and **WEDOS vSwitch/hypervisor
authorization** (which the software never bypasses).

It is guarded by a **triple lock** (configuration, a confinement preflight →
GO/NO_GO certificate, and an independent default-DROP egress guard), a **local
signed campaign token** (HMAC + expiry + exact-parameter match + anti-replay
nonce) on top of the control-plane approval, an **independent kill switch** with
an absolute timeout, frozen registries (sources / targets / interfaces /
profiles with absolute caps), a **single** active spoofed campaign, and a
**finite** duration with mandatory auto-stop. Its verdict is a read-only,
class-C `l3-spoof` artifact.

Design & safety: [`docs/spoofing-architecture.md`](docs/spoofing-architecture.md),
[`docs/spoofing-threat-model.md`](docs/spoofing-threat-model.md),
[`docs/confinement-preflight.md`](docs/confinement-preflight.md),
[`docs/emergency-stop.md`](docs/emergency-stop.md).

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
