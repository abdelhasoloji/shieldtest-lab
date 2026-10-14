# Synthetic bench ↔ ShieldTester

The control plane owns authorization, campaign/assessment history and versioned DRS reports. This bench owns registered synthetic scenarios, their local execution and artifacts. It does not receive arbitrary host/rate/port commands.

## Dispatch and artifacts

`runner.mjs` calls `POST /api/bench/runs/next/claim`, executes the returned named scenario and posts `POST /api/bench/runs/:id/result`. `BENCH_API_URL`, dedicated `BENCH_RUNNER_TOKEN` and runner identity are protected operator configuration. Missing configuration fails closed. Errors are preserved as errors, not a successful verdict.

The scrubber's `GET /protection` provides source and detection/mitigation times. The target's `GET /telemetry` provides `nicRxMbps`. Optional control-plane providers consume these summaries; a configured endpoint does not establish four independent DRS instrument roles or full functional evidence.

The mirror contract is [Ddostester/docs/cross-repo-contract.md](https://github.com/abdelhasoloji/Ddostester/blob/main/docs/cross-repo-contract.md). Its DRS attachment route archives completed bench results as diagnostics. A bench artifact cannot automatically PASS a standard vector. Imported independent proof remains labelled collector-import; hash integrity is not physical attestation.

## Measurement meaning

The official DRS 3.00.00 reference, scoring engine and interpretation profile live in the control repository. Reports distinguish software simulation, synthetic laboratory and measured evaluation. Actual received load, physical/virtual clients, observed addresses, injection point, represented/missing dimensions and calibration must remain explicit. No synthetic accounting multiplier is applied.

L3 artifacts from dry-run/namespace-sim remain simulation diagnostics; the real backend is disabled. These modules do not enable a control-plane spoofing emitter. The three IoT HTTP workers are a separate control-repository path and share one observed public egress source.

## Scope and credentials

The synthetic bench retains its private/loopback guard and internal Compose network. ShieldTester separately supports bounded HTTP tests to explicitly authorized public or private origins. Credentials/private keys remain outside both repositories; a Git update does not renew them or deploy a service. See [current setup](current-setup.md).
