# Documentation coverage and verification

Current documentation separates source contracts, dated runtime observations and independently qualified measurements. Component references cover target, synthetic reflector, scrubber, TCP target, console, runner, environment, ports, endpoints and metrics. `docs/current-setup.md` records deployed source identity independently from repository main.

Verify values against named source files and `docker-compose.yml`; avoid fragile copied line numbers and old test-count claims. `npm test` exercises Node contracts, scenario/console truthfulness, guards, counters and simulation boundaries. Syntax and both Compose renders are additional gates. CI has a Docker observability smoke job; passing source tests alone is not proof that images were deployed or a scenario was executed.

The DRS reference and scorer live in the companion control repository. These docs do not claim full-standard capacity, Kusa integration, 5,000 active workers, public-source diversity or certification. Any undocumented/missing independent proof stays unqualified.
