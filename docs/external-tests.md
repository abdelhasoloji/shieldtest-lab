# External authorized resilience tests (governed)

The synthetic lab (`lib/net-guard.mjs`) can never leave RFC1918/loopback. This
path is the **opposite and separate** one: real, over-the-wire resilience tests
launched from the control panel against a **proven-authorized** target. Its
whole design is that it is **structurally incapable of hitting anything but an
authorized target** — "only bank.cz is accepted" is a property of the system,
not a config string.

## The authorization gate (safety core)

`lib/target-guard.mjs` is the external analogue of the net-guard. A test can only
reach a host that is:

1. **in the registry** (`external/targets.authorized.json`, git-ignored; see
   `targets.authorized.example.json`). An empty/missing registry authorizes
   **nothing** — fail-closed.
2. **not expired** and **inside its authorized window** (`assertAuthorizedTarget`).
3. **proven under the owner's control right now** — a live DNS-TXT token at
   `_shieldtest.<host>` (`verifyControl`). Remove the token to revoke instantly.

Every requested intensity is clamped to the target's `caps` **and** to absolute
ceilings in the vector module (`external/rapid-reset.mjs` → `HARD`). There is no
env var that widens any of this.

## Registry entry

```json
{
  "host": "bank.cz",
  "kind": "wedos-test",
  "authorizationRef": "INTERNAL-TEST-WEDOS",
  "verification": { "method": "dns-txt", "name": "_shieldtest.bank.cz", "token": "<provisioned>" },
  "window": "always",
  "expiresAt": null,
  "caps": { "maxRps": 200, "maxStreams": 2000, "maxDurationSec": 60, "maxConcurrency": 64 }
}
```

## Vectors (from Ivan's PoCs, governed)

| Vector | Module | Status |
| --- | --- | --- |
| `http2-rapid-reset` | `external/rapid-reset.mjs` | implemented (CVE-2023-44487 shape) |
| `http2-madeyoureset` | — | planned |
| `tcp-syn-pressure` | (synthetic in-lab today) | planned external |
| `l7-request-rate` | — | planned |

App-layer exploit PoCs (SQLi, request smuggling, cache poisoning) are **not**
load vectors and are out of scope for this dispatch.

## Dispatch (what the control panel invokes)

`external/run-external.mjs` is the governed entry. **Dry-run is the default**: it
proves authorization (registry + window + live DNS-TXT) and prints the effective
capped plan, but sends **no traffic**. Only `DRY_RUN=0` executes.

```bash
# 1. dry-run: prove authorization, see the capped plan, send nothing
AUTHORIZED_TARGETS_FILE=external/targets.authorized.json \
TARGET=bank.cz PROFILE=http2-rapid-reset \
RPS=100 STREAMS=1000 DURATION_SEC=30 \
node external/run-external.mjs

# 2. execute (only inside the authorized window, with the token live)
DRY_RUN=0 AUTHORIZED_TARGETS_FILE=... TARGET=bank.cz ... node external/run-external.mjs
```

It emits a read-only verdict (`external/verdict.mjs`,
`shieldtest.external.verdict/v1`) with the resilience outcome (`ABSORBED`,
`MITIGATED_GOAWAY`, `DEGRADED`, `INCONCLUSIVE`). It does **not** assert a DRS
letter class — the control plane maps that per `drs-validation-policy`.

## Control-panel UX (contract)

- Target is a **dropdown of authorized hosts only** — no free-text host field.
- Operator picks a vector + a **bounded** intensity, sees the caps and the
  window, types an explicit confirmation, then dry-run → execute.
- Live dashboard reuses the monitoring stack; a prominent **ABORT / kill-switch**
  stops a run.
- Every run is audit-logged with its `authorizationRef`.

The control plane records the authorized run and serves it; the external runner
claims it, **re-checks the gate and re-verifies domain control**, clamps to caps,
runs, and posts the verdict back — the same governed shape as the synthetic
runner (`runner.mjs`), never an arbitrary host/rate/duration off the wire.

## Safety rails (non-negotiable)

- Fail-closed everywhere: no registry, no target, no live token, outside window → refuse.
- Caps + absolute ceilings; no source spoofing; known egress.
- Dry-run default; explicit `DRY_RUN=0` to fire.
- Ramp + circuit-breaker and target-owner/SOC notification are operational
  requirements before running against a live service (see the control-plane side).
- Invariants are locked by `test/target-guard.test.mjs`,
  `test/external-rapid-reset.test.mjs`, `test/external-verdict.test.mjs`.
