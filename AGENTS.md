# Contributor instructions — synthetic lab

This repository contains the synthetic network bench, separate from ShieldTester's bounded HTTP campaign/Fleet control plane. Read [current setup](docs/current-setup.md) and the [cross-repository contract](docs/cross-repo-contract.md). Preserve local work and distinguish modeled data, actual counters and physical qualification.

Use Node >=22, ESM `.mjs`, English code comments. Runtime paths have no npm dependencies. Verify syntax, `npm test` and both Compose configurations before publishing; do not launch scenarios as part of a documentation-only task.

The actual synthetic execution contract uses a private/loopback IPv4 guard, an optional narrower lab prefix, registered scenario names and component rate/duration/response budgets. Compose's synthetic network is internal. These controls belong to this bench; they do not prohibit the control repository's separately authorized public HTTP targets. Do not introduce an arbitrary public amplification path, public reflectors or a real spoofing emitter. L3 dry-run/namespace-sim modules remain simulations; their real backend is disabled.

Source and metric counters retain their true units. A synthetic factor is not a score/throughput multiplier. DRS vector PASS requires independent evidence in ShieldTester's versioned engine, not a bench verdict alone. Keep private tokens, certificate keys and deployment credentials outside Git and logs. See [documentation](docs/README.md) for operations and current limitations.
