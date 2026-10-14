# Spoofed L3/L4 mode — architecture

Scope: experimental L3 dry-run/namespace simulation only; no real packet backend is enabled. These subsystem controls do not restrict the separate authorized HTTP Fleet. See [current setup](current-setup.md).

Experimental, heavily-gated subsystem that models **L3/L4 attacks with falsified
source IPs** inside the closed lab **only**. It never emits spoofed traffic to
the Internet, an arbitrary destination, or from the management network.

> **V1 emits no real spoofed packet.** The runnable backends are `dry-run`
> (nothing) and `namespace-sim` (an in-process functional model). A real
> raw-packet backend (`trex`) is registered but **disabled** and cannot run
> without a dedicated hardened container, a real confinement proof, and WEDOS
> vSwitch/hypervisor authorization.

## Separation of duties (unchanged)

- **VPS1 / Ddostester** — control, RBAC, approval, scheduling, limits, results.
  Generates bounded authorized HTTP; never opens a raw/spoofing socket.
- **VPS2 / shieldtest-lab** — generation & measurement. The spoofing emitter
  lives here and nowhere else.
- **Synthetic target** — a fixed private address (`synthetic-target-a`).
- **Protection under test** — the scrubber, between generator and target.

## Module map (`l3/`)

| Module | Role |
|---|---|
| `lib/source-pool.mjs` | Frozen registry of allowed **spoofed-source** pools (numeric u32 ranges; RFC 5737 + a lab-reserved /24 + loopback for tests). Hard deny-list for cloud-metadata/link-local/multicast/DNS/the real service net. |
| `l3/registry.mjs` | Pre-registered **targets** (exact private IP + its interface) and **interfaces** (management flagged). Re-exports profiles. |
| `l3/profiles.mjs` | The four V1 profiles with **absolute, env-immutable caps** under one global ceiling; usage reason, expected metrics, tiny defaults. |
| `l3/scenario-model.mjs` | Strict, fail-closed validator: references registered objects only; any raw IP/host/URL/CIDR/interface/command/path field is rejected. |
| `l3/digest.mjs` | Canonical JSON + `profileDigest` (binds an approval to an exact profile version). |
| `l3/config-lock.mjs` | **Lock 1** — every configuration condition must hold. |
| `l3/confinement.mjs` | **Lock 2** — preflight over injected probes → a `ConfinementCertificate` (GO/NO_GO). |
| `l3/egress-guard.mjs` | **Lock 3** — default-DROP policy + classifier + counters; a system adapter that is a no-op unless an executor is injected. |
| `l3/campaign-token.mjs` | Local signed authorization (HMAC, expiry, exact params, anti-replay nonce). |
| `l3/kill-switch.mjs` | Independent supervisor with an absolute timeout. |
| `l3/run-registry.mjs` | Single active spoofed campaign at a time. |
| `l3/backends/` | `{ preflight, emit, stop }` backends: `dry-run`, `namespace-sim`, disabled `trex`. |
| `l3/orchestrator.mjs` | The guarded run: Lock 1 → token → claim → Lock 2 → kill-switch-supervised backend → verdict. Fail-closed at each gate. |
| `l3/verdict.mjs` | Read-only **class-C** `l3-spoof` verdict + SHA-256 capture hash. |
| `console/spoof-panel.mjs` | Read-only "SPOOFED LAB MODE" console panel (escaped output, no IP entry). |

## Run flow

```
scenario (validated) + signed token
        │
   Lock 1 config-lock ──▶ BLOCKED_BY_CONFIG
        │
   local token verify ──▶ BLOCKED_BY_TOKEN
        │
   single-campaign claim ──▶ BLOCKED_BY_CONCURRENCY
        │
   Lock 2 confinement preflight ──▶ BLOCKED_BY_PREFLIGHT (NO_GO)
        │
   kill-switch armed (absolute timeout) ─┐
        │                                │ trips → stop backend + close policy
   backend.run (dry-run | namespace-sim) ┘
        │
   verdict (class C, kind l3-spoof) ─▶ read-only to Ddostester
        │
   release single-campaign slot (always)
```

## What real operation still needs from WEDOS

Real spoofed emission depends on WEDOS **authorizing spoofing at the vSwitch /
hypervisor**. The software never attempts to bypass that filter. Until a real
confinement proof exists on the actual infrastructure, this subsystem is **not
production-ready** and emits nothing.
