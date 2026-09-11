# Référence : variables d'environnement

Catalogue complet des variables lues par le code, avec défaut, bornes validées et
source. Une valeur hors borne fait **jeter** le composant au démarrage (sauf
mention contraire).

## Target (`target/receiver.mjs`)

| Variable | Défaut | Effet | Source |
| --- | --- | --- | --- |
| `LISTEN_HOST` | `0.0.0.0` | Host d'écoute UDP | `target/receiver.mjs:12` |
| `LISTEN_PORT` | `9002` | Port d'écoute UDP | `target/receiver.mjs:13` |
| `METRICS_PORT` | `0` | Port HTTP métriques (`0` = off) | `target/receiver.mjs:14` |

## Reflector (`synthetic-reflector/server.mjs`)

| Variable | Défaut | Borne | Source |
| --- | --- | --- | --- |
| `LISTEN_HOST` | `0.0.0.0` | — | `synthetic-reflector/server.mjs:26` |
| `LISTEN_PORT` | `9001` | — | `synthetic-reflector/server.mjs:27` |
| `TARGET_HOST` | `192.168.100.99` | IPv4 privée/loopback (garde dur) | `synthetic-reflector/server.mjs:28,37` |
| `TARGET_PORT` | `9002` | 1024–65535, entier | `synthetic-reflector/server.mjs:29,38-40` |
| `MAX_FACTOR` | `50` | 1–100 | `synthetic-reflector/server.mjs:30,41-43` |
| `MAX_RESPONSE_BYTES` | `8192` | 64–65507 | `synthetic-reflector/server.mjs:31,44-50` |
| `MAX_PACKET_FACTOR` | `10` | 1–100 | `synthetic-reflector/server.mjs:32,51-53` |
| `METRICS_PORT` | `0` | `0` = off | `synthetic-reflector/server.mjs:33` |
| `LAB_CIDR_PREFIX` | (absent) | Restreint (jamais n'élargit) le garde | `synthetic-reflector/server.mjs:37`, `lib/net-guard.mjs:41-46` |

## Scrubber (`scrubber/server.mjs`)

| Variable | Défaut | Borne | Source |
| --- | --- | --- | --- |
| `LISTEN_HOST` | `0.0.0.0` | — | `scrubber/server.mjs:19` |
| `LISTEN_PORT` | `9005` | — | `scrubber/server.mjs:20` |
| `TARGET_HOST` | `192.168.100.99` | IPv4 privée/loopback (garde dur) | `scrubber/server.mjs:21,39` |
| `TARGET_PORT` | `9002` | 1024–65535, entier | `scrubber/server.mjs:22,40-42` |
| `THRESHOLD_PPS` | `100` | 1–100000 | `scrubber/server.mjs:23,43-45` |
| `CEILING_PPS` | `50` | 0–`THRESHOLD_PPS` | `scrubber/server.mjs:24,46-48` |
| `DETECTION_DELAY_SEC` | `3` | 0–60 | `scrubber/server.mjs:25,49-55` |
| `METRICS_PORT` | `0` | `0` = off | `scrubber/server.mjs:26` |
| `STRATEGY` | `ceiling` | `ceiling`\|`blocklist`\|`adaptive` | `scrubber/server.mjs:37,56-59` |
| `LAB_CIDR_PREFIX` | (absent) | Restreint le garde | `scrubber/server.mjs:39` |

## TCP target (`tcp-target/receiver.mjs`)

| Variable | Défaut | Borne | Source |
| --- | --- | --- | --- |
| `LISTEN_HOST` | `0.0.0.0` | — | `tcp-target/receiver.mjs:14` |
| `LISTEN_PORT` | `9003` | — | `tcp-target/receiver.mjs:15` |
| `METRICS_PORT` | `0` | `0` = off | `tcp-target/receiver.mjs:16` |
| `CAPACITY` | `200` | 1–100000 | `tcp-target/receiver.mjs:17,19-21` |

## Console (`console/server.mjs`)

| Variable | Défaut | Effet | Source |
| --- | --- | --- | --- |
| `LAB_CONSOLE_HOST` | `127.0.0.1` | Host d'écoute (loopback attendu) | `console/server.mjs:36` |
| `LAB_CONSOLE_PORT` | `9110` | Port HTTP | `console/server.mjs:37` |
| `LAB_CONSOLE_ALLOW_NONLOOPBACK` | (absent) | `=1` autorise un bind non-loopback | `console/server.mjs:38,40` |

## Generator (`generator/generate.mjs`) — client UDP

| Variable | Défaut | Borne | Source |
| --- | --- | --- | --- |
| `REFLECTOR_HOST` | `192.168.100.50` | IPv4 privée/loopback (garde dur) | `generator/generate.mjs:40,55` |
| `REFLECTOR_PORT` | `9001` | — | `generator/generate.mjs:41` |
| `PROFILE` | `generic` | allowlist `generic/dns/ssdp/ntp/memcached` | `generator/generate.mjs:42,56-58` |
| `PPS` | `20` | 1–`MAX_PPS` | `generator/generate.mjs:43,72-73` |
| `DURATION_SEC` | `10` | 1–`MAX_DURATION_SEC` | `generator/generate.mjs:44,74-76` |
| `MAX_PPS` | `500` | plafond dur du PPS | `generator/generate.mjs:45` |
| `MAX_DURATION_SEC` | `60` | plafond dur de durée | `generator/generate.mjs:46` |
| `MAX_PACKET_FACTOR` | `10` | plafond du packet factor | `generator/generate.mjs:47,69-70` |
| `SHAPE` | `constant` | `constant`\|`ramp`\|`wave`\|`burst` | `generator/generate.mjs:48,59` |
| `MODE` | `attack` | `legit` = trafic bénin non amplifié | `generator/generate.mjs:51,80` |
| `FACTOR` | preset du profil | 1–100 | `generator/generate.mjs:64,67-68` |
| `PACKET_FACTOR` | preset du profil | 1–`MAX_PACKET_FACTOR` | `generator/generate.mjs:65,69-70` |
| `LAB_CIDR_PREFIX` | (absent) | Restreint le garde | `generator/generate.mjs:55` |

## Runner (`runner.mjs`) — client HTTP

| Variable | Défaut | Effet | Source |
| --- | --- | --- | --- |
| `BENCH_API_URL` | — (requis) | Base d'URL du plan de contrôle | `runner.mjs:70,76-78` |
| `BENCH_RUNNER_TOKEN` | — (requis) | Jeton Bearer | `runner.mjs:71,76-78` |
| `RUNNER_ID` | `lab-runner-<pid>` | Identifiant du runner | `runner.mjs:72` |
| `POLL_INTERVAL_MS` | `5000` (plancher 1000) | Intervalle de poll | `runner.mjs:73` |
| `RUNNER_ONCE` | `0` | `=1` : un seul job | `runner.mjs:74` |

## Variables Compose (surcharges `${...:-défaut}`)

Ces variables d'hôte paramètrent les services sans toucher au code
(`docker-compose.yml`). Extrait :

| Variable hôte | Défaut | Cible | Source |
| --- | --- | --- | --- |
| `LAB_REFLECTOR_TARGET` | `192.168.100.99` | `TARGET_HOST` du reflector | `docker-compose.yml:61` |
| `LAB_REFLECTOR_TARGET_PORT` | `9002` | `TARGET_PORT` du reflector | `docker-compose.yml:62` |
| `LAB_MAX_FACTOR` | `50` | `MAX_FACTOR` | `docker-compose.yml:64` |
| `LAB_MAX_RESPONSE_BYTES` | `8192` | `MAX_RESPONSE_BYTES` | `docker-compose.yml:65` |
| `LAB_MAX_PACKET_FACTOR` | `10` | `MAX_PACKET_FACTOR` | `docker-compose.yml:66,90` |
| `LAB_THRESHOLD_PPS` | `100` | `THRESHOLD_PPS` | `docker-compose.yml:42` |
| `LAB_CEILING_PPS` | `50` | `CEILING_PPS` | `docker-compose.yml:43` |
| `LAB_DETECTION_DELAY_SEC` | `3` | `DETECTION_DELAY_SEC` | `docker-compose.yml:44` |
| `LAB_MAX_PPS` | `500` | `MAX_PPS` | `docker-compose.yml:88,109` |
| `LAB_MAX_DURATION_SEC` | `60` | `MAX_DURATION_SEC` | `docker-compose.yml:89,110` |
| `LAB_LEGIT_PPS` | `10` | `PPS` du service légitime | `docker-compose.yml:107` |
| `PROFILE`/`FACTOR`/`PACKET_FACTOR`/`PPS`/`SHAPE`/`DURATION_SEC` | voir compose | generator | `docker-compose.yml:81-90` |
