# Synthetic laboratory documentation

Reconciled on 14 October 2026. Start with [current setup and operational scope](current-setup.md) and [cross-repository contract](cross-repo-contract.md). The HTTP Kubernetes fleet and official DRS engine live in the control repository, not here.

| Topic | Reference |
| --- | --- |
| Network model | [Network lab](network-lab.md), [ports/network](reference/ports-and-network.md) |
| Components | [Server index](servers/README.md), target, reflector, scrubber, console and runner entries |
| Configuration and measurements | [Environment](reference/environment.md), [HTTP endpoints](reference/http-endpoints.md), [metrics](reference/metrics.md) |
| Experimental simulation subsystem | [L3 architecture](spoofing-architecture.md), [threat model](spoofing-threat-model.md), [preflight](confinement-preflight.md), [stop](emergency-stop.md) |
| Verification and doc provenance | [Coverage methodology](COVERAGE.md), [contributor instructions](../AGENTS.md) |

References describe source contracts, not live deployment qualification. The current setup records the separately observed deployed source. DRS limits, independent evidence requirements and missing Kusa/infrastructure integrations are explicit in the mirror control documentation.
