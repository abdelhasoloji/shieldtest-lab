# Spoofed L3/L4 mode — threat model

Scope: experimental L3 dry-run/namespace simulation only; no real packet backend is enabled. These subsystem controls do not restrict the separate authorized HTTP Fleet. See [current setup](current-setup.md).

Spoofing is a **dangerous capability**, gated by several independent locks (see
`spoofing-architecture.md`). V1 emits **no real spoofed packet** — the risk
surface below is analysed anyway, so the design holds when a real backend is one
day authorized by WEDOS.

## Standing controls

- **Triple lock**: config (Lock 1), confinement preflight → certificate (Lock 2),
  independent default-DROP egress guard (Lock 3).
- **Local signed token** (HMAC + expiry + exact-parameter match + anti-replay
  nonce) on top of the control-plane approval.
- **Independent kill switch** with an absolute timeout.
- **Frozen registries**: sources (numeric ranges), targets, interfaces, profiles
  (absolute caps). No wire input is ever an IP/CIDR/interface/command.
- **Single** active spoofed campaign; **finite** duration; **auto-stop**.

## Scenarios

| # | Threat | Primary mitigation |
|---|---|---|
| 1 | **Operator error** | Registered objects only; strict validator; low defaults; preflight GO/NO_GO. |
| 2 | **Compromised account** | Local signed token required in addition to control-plane approval; nonce is single-use; interface allowlist. |
| 3 | **Malicious profile** | Profiles are frozen with absolute caps under a global ceiling; approval digest must match the exact profile. |
| 4 | **Manipulated destination** | Destination comes only from `targetId` (registered, net-guarded); preflight checks observed dest == target and direct attachment. |
| 5 | **Route added during a test** | Kill-switch trips on destination change / policy escape; egress guard default-DROP; preflight rechecks routes before each run. |
| 6 | **Incomplete restart / dirty state** | Preflight `previous-state-clean` check; single-campaign registry; egress guard guaranteed reset. |
| 7 | **Leaked token** | Short expiry + single-use nonce + exact-parameter binding; the secret and full token are never logged. |
| 8 | **Lost control plane** | Kill-switch `heartbeat-lost` / `parent-died`; absolute timeout ends the run regardless. |
| 9 | **Compromised generator** | Independent egress guard drops any non-conforming packet and counts it; kill-switch `policy-escape`; generator runs as a separate, minimal-capability service. |
| 10 | **Container breakout** | (Future real backend) single `l3-generator` service only; `no-new-privileges`, read-only rootfs, CPU/mem/PID limits, no docker socket/host mounts. |
| 11 | **Kill-switch failure** | The absolute timeout is on a real timer independent of generator timers; the egress guard's default-DROP and the finite duration bound the run even if a trip is missed. |
| 12 | **WEDOS hypervisor anti-spoof filtering** | Expected and correct: real operation **depends on** WEDOS authorizing spoofing at the vSwitch/hypervisor. The software **never** attempts to bypass this filter. |

## The WEDOS dependency (explicit)

Real spoofed traffic only works if WEDOS permits it at the **vSwitch /
hypervisor** for the closed lab. This is a deliberate external control, not a
bug: the lab is **not production-ready** for real emission until a confinement
proof exists on the real infrastructure, and the code must never route around
the hypervisor's anti-spoofing filter.
