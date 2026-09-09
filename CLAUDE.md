# CLAUDE.md — ShieldTest Lab (isolated mitigation bench)

Guide for agents/contributors working on this repository.

## What this project is

A **closed synthetic UDP-amplification measurement lab**, extracted from the
[WEDOS ShieldTest](https://github.com/abdelhasoloji/ddostester) control plane so
the boundary is **structural, not conventional**. It reproduces the *traffic
shape and measurement problem* of UDP amplification for **defensive** study —
it is a **measurement model, not an amplifier**. Its **telemetry / verdict
artifacts feed the WRS** (WEDOS Resilience Score) in the control plane,
**read-only**, through the governed contract in ShieldTest's
`docs/drs-validation-policy.md` (UDP amplification = class C).

Stack: Node ≥ 22 (ESM `.mjs`), Docker Compose (isolated `internal` network),
Prometheus text metrics, a loopback web console.

## Safety by construction (never weaken)

- **No source-IP spoofing** — ordinary UDP sockets; reflection target is fixed by
  config, never read from a packet's source address.
- **No real reflector protocols** — synthetic JSON message; profiles
  (`generic`/`dns`/`ssdp`/`ntp`/`memcached`) are only byte/packet **shape** presets.
- **Hard caps** on byte/packet factor, response size, generator PPS, duration.
- **Network isolation** — Compose network `internal: true`, no published host
  ports; `lib/net-guard.mjs` refuses any destination outside the lab's RFC1918
  `/24`. The console binds **loopback only**.
- Safety invariants are enforced by `test/*.test.mjs` — keep them green.

## Install / run / test

Prerequisites: **Node ≥ 22**, **Docker + Compose** (for the target/reflector/
scrubber/generator services). No install step beyond Node for the pure-Node
paths (tests, console, scenarios).

```bash
# Install
npm install                      # (no runtime deps; installs are minimal)

# Run — Docker bench (isolated network only)
npm run up                       # docker compose up -d lab-target lab-reflector
PROFILE=dns PPS=20 DURATION_SEC=10 npm run burst   # one bounded synthetic burst
npm run down                     # tear down

# Run — pure-Node (no Docker)
npm run console                  # loopback console → http://127.0.0.1:9110 (SSH tunnel only)
npm run scenario -- multi-profile-mix     # run a named, allowlisted scenario
npm run verdict  -- adaptive-mitigation   # run + print the read-only verdict artifact

# Governed dispatch runner (claims authorized runs from the control plane)
BENCH_API_URL=https://shieldtest.internal BENCH_RUNNER_TOKEN=<token> \
RUNNER_ID=lab-runner-1 npm run runner      # RUNNER_ONCE=1 for a single job

# Test
npm test                         # node --test "test/*.test.mjs" (safety invariants)
```

## Golden rule — no out-of-allowlist load generation

**Never generate load — from any tool, scenario, or the generator — against
anything that is not on the lab's allowlist.** The only thing the console/runner
accept from the wire is a **named, allowlisted scenario** — never an arbitrary
host, port, rate, or duration. `lib/net-guard.mjs` refuses any destination
outside the lab CIDR; do not bypass or widen it. **Never** attach these
components to a production or public network, and never run them outside the
isolated lab network. This is the same non-negotiable boundary stated in the
control plane's `CLAUDE.md`.

## Certificates (mTLS) — `~/shieldtest-pki`

The mTLS PKI (CA, client bundles) lives **outside every repo**, in
`~/shieldtest-pki`, and is **never committed**. Do not copy private key material
into the repo, logs, or issues.

## Relationship to ShieldTest

The two connect **only through a read-only, governed contract** — never a live
attack path. This bench produces a **verdict / metrics summary** (amplification
factor, detection delay, mitigation efficacy, collateral); ShieldTest **ingests
it read-only** for its resilience assessment. ShieldTest never opens a raw or
amplification socket; this repo never touches the production network. Full design
and rationale: `docs/network-lab.md`.

## Conventions

- ESM `.mjs`, Node ≥ 22, comments in English.
- Safety caps and the net-guard CIDR are the source of truth — never edit them to
  make a run "work"; fix the run instead.
- Every change: `npm test` must pass (the invariant suite is the safety net).
