# Référence : endpoints HTTP

Tous les endpoints HTTP exposés par un serveur du lab, relevés dans le code.
Les serveurs UDP/TCP n'exposent de HTTP que lorsque `METRICS_PORT > 0`.

## Target — sur `METRICS_PORT`

| Méthode | Chemin | Type de réponse | Source |
| --- | --- | --- | --- |
| GET | `/metrics` | `text/plain; version=0.0.4` | `target/receiver.mjs` |
| GET | `/telemetry` | `application/json` `{ nicRxMbps }` | `target/receiver.mjs` |
| * | (autre) | `404` | `target/receiver.mjs` |

## Reflector — sur `METRICS_PORT`

| Méthode | Chemin | Type de réponse | Source |
| --- | --- | --- | --- |
| GET | `/metrics` | `text/plain; version=0.0.4` | `synthetic-reflector/server.mjs` |
| * | (autre) | `404` | `synthetic-reflector/server.mjs` |

## Scrubber — sur `METRICS_PORT`

| Méthode | Chemin | Type de réponse | Source |
| --- | --- | --- | --- |
| GET | `/metrics` | `text/plain; version=0.0.4` | `scrubber/server.mjs` |
| GET | `/protection` | `application/json` `{ detectionTimeSec, mitigationTimeSec, strategy, source }` | `scrubber/server.mjs` |
| * | (autre) | `404` | `scrubber/server.mjs` |

## TCP target — sur `METRICS_PORT`

| Méthode | Chemin | Type de réponse | Source |
| --- | --- | --- | --- |
| GET | `/metrics` | `text/plain; version=0.0.4` | `tcp-target/receiver.mjs` |
| * | (autre) | `404` | `tcp-target/receiver.mjs` |

## Console — sur `LAB_CONSOLE_PORT` (loopback)

| Méthode | Chemin | Type de réponse | Source |
| --- | --- | --- | --- |
| GET | `/` ou `/index.html` | `text/html; charset=utf-8` (page) | `console/server.mjs` |
| GET | `/api/health` | JSON `{ ok, scenarios }` | `console/server.mjs` |
| GET | `/api/scenarios` | JSON (liste décrite) | `console/server.mjs` |
| GET | `/api/run-stream?scenario=NAME` | SSE `text/event-stream` (`sample`/`done`/`error`) | `console/server.mjs` |
| POST | `/api/run` | JSON (résumé du run) | `console/server.mjs` |
| * | (autre) | `404 { error:'not found' }` | `console/server.mjs` |

## Runner — client HTTP sortant (n'expose rien)

Le runner **appelle** le plan de contrôle, il n'écoute pas.

| Méthode | Endpoint appelé | Rôle | Source |
| --- | --- | --- | --- |
| POST | `{BENCH_API_URL}/api/bench/runs/next/claim` | Réclamer le prochain run (`204` = vide) | `runner.mjs` |
| POST | `{BENCH_API_URL}/api/bench/runs/{id}/result` | Poster le verdict ou l'erreur | `runner.mjs` |

## Connecteurs *pull* du plan de contrôle

Deux endpoints JSON sont conçus pour être consommés en lecture seule par le plan
de contrôle ShieldTest :

- `/telemetry` du target → connecteur `TARGET_TELEMETRY` (`target/receiver.mjs`).
- `/protection` du scrubber → connecteur `PROTECTION_METRICS_URL`, alimente un WRS
  mesuré (`scrubber/server.mjs`).

Leurs formes JSON sont verrouillées par des tests (`test/closed-loop.test.mjs`).
