# Référence : variables d'environnement

Catalogue complet des variables lues par le code, avec défaut, bornes validées et
source. Une valeur hors borne fait **jeter** le composant au démarrage (sauf
mention contraire).

## Target (`target/receiver.mjs`)

| Variable | Défaut | Effet | Source |
| --- | --- | --- | --- |
| `LISTEN_HOST` | `0.0.0.0` | Host d'écoute UDP | `target/receiver.mjs` |
| `LISTEN_PORT` | `9002` | Port d'écoute UDP | `target/receiver.mjs` |
| `METRICS_PORT` | `0` | Port HTTP métriques (`0` = off) | `target/receiver.mjs` |

## Reflector (`synthetic-reflector/server.mjs`)

| Variable | Défaut | Borne | Source |
| --- | --- | --- | --- |
| `LISTEN_HOST` | `0.0.0.0` | — | `synthetic-reflector/server.mjs` |
| `LISTEN_PORT` | `9001` | — | `synthetic-reflector/server.mjs` |
| `TARGET_HOST` | `192.168.100.99` | IPv4 privée/loopback (garde dur) | `synthetic-reflector/server.mjs` |
| `TARGET_PORT` | `9002` | 1024–65535, entier | `synthetic-reflector/server.mjs` |
| `MAX_FACTOR` | `50` | 1–100 | `synthetic-reflector/server.mjs` |
| `MAX_RESPONSE_BYTES` | `8192` | 64–65507 | `synthetic-reflector/server.mjs` |
| `MAX_PACKET_FACTOR` | `10` | 1–100 | `synthetic-reflector/server.mjs` |
| `METRICS_PORT` | `0` | `0` = off | `synthetic-reflector/server.mjs` |
| `LAB_CIDR_PREFIX` | (absent) | Restreint (jamais n'élargit) le garde | `synthetic-reflector/server.mjs`, `lib/net-guard.mjs` |

## Scrubber (`scrubber/server.mjs`)

| Variable | Défaut | Borne | Source |
| --- | --- | --- | --- |
| `LISTEN_HOST` | `0.0.0.0` | — | `scrubber/server.mjs` |
| `LISTEN_PORT` | `9005` | — | `scrubber/server.mjs` |
| `TARGET_HOST` | `192.168.100.99` | IPv4 privée/loopback (garde dur) | `scrubber/server.mjs` |
| `TARGET_PORT` | `9002` | 1024–65535, entier | `scrubber/server.mjs` |
| `THRESHOLD_PPS` | `100` | 1–100000 | `scrubber/server.mjs` |
| `CEILING_PPS` | `50` | 0–`THRESHOLD_PPS` | `scrubber/server.mjs` |
| `DETECTION_DELAY_SEC` | `3` | 0–60 | `scrubber/server.mjs` |
| `METRICS_PORT` | `0` | `0` = off | `scrubber/server.mjs` |
| `STRATEGY` | `ceiling` | `ceiling`\|`blocklist`\|`adaptive` | `scrubber/server.mjs` |
| `LAB_CIDR_PREFIX` | (absent) | Restreint le garde | `scrubber/server.mjs` |

## TCP target (`tcp-target/receiver.mjs`)

| Variable | Défaut | Borne | Source |
| --- | --- | --- | --- |
| `LISTEN_HOST` | `0.0.0.0` | — | `tcp-target/receiver.mjs` |
| `LISTEN_PORT` | `9003` | — | `tcp-target/receiver.mjs` |
| `METRICS_PORT` | `0` | `0` = off | `tcp-target/receiver.mjs` |
| `CAPACITY` | `200` | 1–100000 | `tcp-target/receiver.mjs` |

## Console (`console/server.mjs`)

| Variable | Défaut | Effet | Source |
| --- | --- | --- | --- |
| `LAB_CONSOLE_HOST` | `127.0.0.1` | Host d'écoute (loopback attendu) | `console/server.mjs` |
| `LAB_CONSOLE_PORT` | `9110` | Port HTTP | `console/server.mjs` |
| `LAB_CONSOLE_ALLOW_NONLOOPBACK` | (absent) | `=1` autorise un bind non-loopback | `console/server.mjs` |

## Generator (`generator/generate.mjs`) — client UDP

| Variable | Défaut | Borne | Source |
| --- | --- | --- | --- |
| `REFLECTOR_HOST` | `192.168.100.50` | IPv4 privée/loopback (garde dur) | `generator/generate.mjs` |
| `REFLECTOR_PORT` | `9001` | — | `generator/generate.mjs` |
| `PROFILE` | `generic` | allowlist `generic/dns/ssdp/ntp/memcached` | `generator/generate.mjs` |
| `PPS` | `20` | 1–`MAX_PPS` | `generator/generate.mjs` |
| `DURATION_SEC` | `10` | 1–`MAX_DURATION_SEC` | `generator/generate.mjs` |
| `MAX_PPS` | `500` | plafond dur du PPS | `generator/generate.mjs` |
| `MAX_DURATION_SEC` | `60` | plafond dur de durée | `generator/generate.mjs` |
| `MAX_PACKET_FACTOR` | `10` | plafond du packet factor | `generator/generate.mjs` |
| `SHAPE` | `constant` | `constant`\|`ramp`\|`wave`\|`burst` | `generator/generate.mjs` |
| `MODE` | `attack` | `legit` = trafic bénin non amplifié | `generator/generate.mjs` |
| `FACTOR` | preset du profil | 1–100 | `generator/generate.mjs` |
| `PACKET_FACTOR` | preset du profil | 1–`MAX_PACKET_FACTOR` | `generator/generate.mjs` |
| `LAB_CIDR_PREFIX` | (absent) | Restreint le garde | `generator/generate.mjs` |

## Runner (`runner.mjs`) — client HTTP

| Variable | Défaut | Effet | Source |
| --- | --- | --- | --- |
| `BENCH_API_URL` | — (requis) | Base d'URL du plan de contrôle | `runner.mjs` |
| `BENCH_RUNNER_TOKEN` | — (requis) | Jeton Bearer | `runner.mjs` |
| `RUNNER_ID` | `lab-runner-<pid>` | Identifiant du runner | `runner.mjs` |
| `POLL_INTERVAL_MS` | `5000` (plancher 1000) | Intervalle de poll | `runner.mjs` |
| `RUNNER_ONCE` | `0` | `=1` : un seul job | `runner.mjs` |

## Variables Compose (surcharges `${...:-défaut}`)

Ces variables d'hôte paramètrent les services sans toucher au code
(`docker-compose.yml`). Extrait :

| Variable hôte | Défaut | Cible | Source |
| --- | --- | --- | --- |
| `LAB_REFLECTOR_TARGET` | `192.168.100.99` | `TARGET_HOST` du reflector | `docker-compose.yml` |
| `LAB_REFLECTOR_TARGET_PORT` | `9002` | `TARGET_PORT` du reflector | `docker-compose.yml` |
| `LAB_MAX_FACTOR` | `50` | `MAX_FACTOR` | `docker-compose.yml` |
| `LAB_MAX_RESPONSE_BYTES` | `8192` | `MAX_RESPONSE_BYTES` | `docker-compose.yml` |
| `LAB_MAX_PACKET_FACTOR` | `10` | `MAX_PACKET_FACTOR` | `docker-compose.yml` |
| `LAB_THRESHOLD_PPS` | `100` | `THRESHOLD_PPS` | `docker-compose.yml` |
| `LAB_CEILING_PPS` | `50` | `CEILING_PPS` | `docker-compose.yml` |
| `LAB_DETECTION_DELAY_SEC` | `3` | `DETECTION_DELAY_SEC` | `docker-compose.yml` |
| `LAB_MAX_PPS` | `500` | `MAX_PPS` | `docker-compose.yml` |
| `LAB_MAX_DURATION_SEC` | `60` | `MAX_DURATION_SEC` | `docker-compose.yml` |
| `LAB_LEGIT_PPS` | `10` | `PPS` du service légitime | `docker-compose.yml` |
| `PROFILE`/`FACTOR`/`PACKET_FACTOR`/`PPS`/`SHAPE`/`DURATION_SEC` | voir compose | generator | `docker-compose.yml` |
