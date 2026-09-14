# Confinement preflight & certificate

Before a spoofed run, `l3/confinement.mjs` runs a **local preflight** over an
injected set of probes and produces a frozen **`ConfinementCertificate`** with a
final **GO / NO_GO** decision. The certificate travels with the verdict to
Ddostester.

Fail-closed by construction: a **missing** probe object or a **missing** probe
throws; a probe that **throws at runtime** fails its check (never GO). The whole
preflight runs under `node --test` with fakes — no root, no network, no Docker.

## Checks (all must pass for GO)

| Check id | NO_GO when… |
|---|---|
| `no-default-route` | the test interface has a default route |
| `no-internet-reach` | the test interface can reach the Internet |
| `destination-attached` | the destination is not directly attached to the lab network on the test interface |
| `destination-matches-target` | the observed destination ≠ the scenario's `targetId` IP |
| `test-iface-not-management` | the test interface is the management interface |
| `docker-network-internal` | the Docker network is not `internal: true` |
| `watchdog-active` | the kill-switch watchdog is not active |
| `capture-ready` | the capture mechanism is not ready |
| `previous-state-clean` | the previous run's state was not cleaned |
| `no-active-spoof-campaign` | another spoofed campaign is already active |

## Certificate shape (`shieldtest.l3.confinement-certificate/v1`)

```jsonc
{
  "kind": "shieldtest.l3.confinement-certificate/v1",
  "timestamp": "ISO-8601",
  "interfaces": { "test": "lab-veth-a", "management": "mgmt0" },
  "routes": { "testInterfaceHasDefaultRoute": false },
  "sourcePool": "documentation-pool-a",
  "destination": { "targetId": "synthetic-target-a", "ip": "192.168.100.99", "port": 9002 },
  "limits": { "pps": 100, "durationSec": 10, "packetSize": 128 },
  "profile": "udp-spoofed-constant",
  "digest": "<sha256 of the approved profile>",
  "dockerNetwork": "shieldtest_lab",
  "checks": [ { "id": "...", "ok": true, "detail": "..." } ],
  "decision": "GO"
}
```

## Real probes

`l3/system-probes.mjs` provides the **real** read-only host adapter (routes,
Docker network). It is **separate**, uses `execFile` with argv arrays (**no
shell**, names validated against a strict charset), is **never imported by the
tests or run in CI**, and only ever READS system state. An operator injects it
explicitly when running a real campaign; the tests always inject fakes.
