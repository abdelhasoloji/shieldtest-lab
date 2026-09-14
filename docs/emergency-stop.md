# Emergency stop (kill switch)

`l3/kill-switch.mjs` is an **independent supervisor**, outside the generator's
own control flow. On the **first** trip it latches a reason and calls
`onTrip(reason)`, which the orchestrator wires to **both**:

1. **stop the generator** (`backend.stop()`), and
2. **close the egress transit policy** (default-DROP again).

## Independent absolute timeout

The supervisor arms an **absolute timeout on a real, `unref`'d timer** that is
**independent of every generator-side timer**, so a run can never outlive its
bound even if the generator's own timers fail. The same time-based checks are
also reachable through `tick(now)` with an injected clock, so the logic is
fully deterministic under `node --test`.

## Trip conditions

| Method / watchdog | Reason |
|---|---|
| absolute timer / `tick` past the bound | `absolute-timeout` |
| no `heartbeat()` within the window | `heartbeat-lost` |
| no `telemetry()` within the window | `telemetry-lost` |
| `reportRate(pps)` above cap (× tolerance) | `rate-exceeded` |
| `reportDestination(ip)` ≠ expected | `destination-changed` |
| `reportPolicyEscape()` | `policy-escape` |
| `reportTargetAvailability(pct)` low, sustained | `target-unavailable` |
| `generatorUnresponsive()` | `generator-unresponsive` |
| `parentDied()` | `parent-died` |
| `operatorKill()` | `operator` |

The first reason wins; later conditions and a faulty `onTrip` never override the
latch. `stop()` releases the independent timer (cleanup).

## Console

The "SPOOFED LAB MODE" console panel (`console/spoof-panel.mjs`) shows a
**permanent kill-switch button** (`data-action="kill-spoof"`), the live countdown,
the last stop reason, and the dropped-packet counter. It renders all dynamic
values escaped and never accepts a free-text IP/CIDR/interface.
