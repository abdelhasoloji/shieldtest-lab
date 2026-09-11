# Référence : endpoints HTTP

Tous les endpoints HTTP exposés par un serveur du lab, relevés dans le code.
Les serveurs UDP/TCP n'exposent de HTTP que lorsque `METRICS_PORT > 0`.

## Target — sur `METRICS_PORT`

| Méthode | Chemin | Type de réponse | Source |
| --- | --- | --- | --- |
| GET | `/metrics` | `text/plain; version=0.0.4` | `target/receiver.mjs:79-81` |
| GET | `/telemetry` | `application/json` `{ nicRxMbps }` | `target/receiver.mjs:82-86` |
| * | (autre) | `404` | `target/receiver.mjs:87-90` |

## Reflector — sur `METRICS_PORT`

| Méthode | Chemin | Type de réponse | Source |
| --- | --- | --- | --- |
| GET | `/metrics` | `text/plain; version=0.0.4` | `synthetic-reflector/server.mjs:189-191` |
| * | (autre) | `404` | `synthetic-reflector/server.mjs:192-195` |

## Scrubber — sur `METRICS_PORT`

| Méthode | Chemin | Type de réponse | Source |
| --- | --- | --- | --- |
| GET | `/metrics` | `text/plain; version=0.0.4` | `scrubber/server.mjs:246-248` |
| GET | `/protection` | `application/json` `{ detectionTimeSec, mitigationTimeSec, strategy, source }` | `scrubber/server.mjs:249-253` |
| * | (autre) | `404` | `scrubber/server.mjs:254-257` |

## TCP target — sur `METRICS_PORT`

| Méthode | Chemin | Type de réponse | Source |
| --- | --- | --- | --- |
| GET | `/metrics` | `text/plain; version=0.0.4` | `tcp-target/receiver.mjs:98-100` |
| * | (autre) | `404` | `tcp-target/receiver.mjs:101-104` |

## Console — sur `LAB_CONSOLE_PORT` (loopback)

| Méthode | Chemin | Type de réponse | Source |
| --- | --- | --- | --- |
| GET | `/` ou `/index.html` | `text/html; charset=utf-8` (page) | `console/server.mjs:139-142` |
| GET | `/api/health` | JSON `{ ok, scenarios }` | `console/server.mjs:143-145` |
| GET | `/api/scenarios` | JSON (liste décrite) | `console/server.mjs:146-148` |
| GET | `/api/run-stream?scenario=NAME` | SSE `text/event-stream` (`sample`/`done`/`error`) | `console/server.mjs:149-151` |
| POST | `/api/run` | JSON (résumé du run) | `console/server.mjs:152-154` |
| * | (autre) | `404 { error:'not found' }` | `console/server.mjs:155` |

## Runner — client HTTP sortant (n'expose rien)

Le runner **appelle** le plan de contrôle, il n'écoute pas.

| Méthode | Endpoint appelé | Rôle | Source |
| --- | --- | --- | --- |
| POST | `{BENCH_API_URL}/api/bench/runs/next/claim` | Réclamer le prochain run (`204` = vide) | `runner.mjs:22-27` |
| POST | `{BENCH_API_URL}/api/bench/runs/{id}/result` | Poster le verdict ou l'erreur | `runner.mjs:34-38` |

## Connecteurs *pull* du plan de contrôle

Deux endpoints JSON sont conçus pour être consommés en lecture seule par le plan
de contrôle ShieldTest :

- `/telemetry` du target → connecteur `TARGET_TELEMETRY` (`target/receiver.mjs:62-65,82-84`).
- `/protection` du scrubber → connecteur `PROTECTION_METRICS_URL`, alimente un WRS
  mesuré (`scrubber/server.mjs:219-223,250-251`).

Leurs formes JSON sont verrouillées par des tests (`test/closed-loop.test.mjs`).
