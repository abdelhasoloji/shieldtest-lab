# Serveur : Target (victime UDP)

**Source** : `target/receiver.mjs` (129 lignes) · **Fabrique** : `createTarget(env)` (`target/receiver.mjs:11`)
**Tests** : `test/amplification.test.mjs`, `test/closed-loop.test.mjs`, `test/fuzz-caps.test.mjs`

## Rôle

Puits UDP passif et instrumenté. Il **mesure seulement** ce qui arrive
(paquets, octets, PPS/BPS moyens) et **ne répond jamais**, donc il ne peut
participer à aucune chaîne de réflexion (`target/receiver.mjs:4-6`). Le socket
n'a qu'un handler `message` qui incrémente des compteurs (`target/receiver.mjs:39-42`) ;
aucune émission n'existe dans le fichier.

## Écoute

| Élément | Valeur par défaut | Variable | Source |
| --- | --- | --- | --- |
| Protocole | UDP (`dgram` udp4) | — | `target/receiver.mjs:16` |
| Host d'écoute | `0.0.0.0` | `LISTEN_HOST` | `target/receiver.mjs:12` |
| Port d'écoute | `9002` | `LISTEN_PORT` | `target/receiver.mjs:13` |
| Port métriques | `0` (désactivé) | `METRICS_PORT` | `target/receiver.mjs:14` |

`METRICS_PORT=0` désactive l'endpoint HTTP de métriques
(`target/receiver.mjs:14,76`). En Compose, le service `lab-target` fixe
`LISTEN_PORT: 9002` et `METRICS_PORT: 9102` (`docker-compose.yml:20-21`), IP
`192.168.100.99` (`docker-compose.yml:24`).

## Endpoints HTTP (si `METRICS_PORT > 0`)

Un serveur HTTP séparé est démarré sur `METRICS_PORT` (`target/receiver.mjs:76-92`).

| Méthode | Chemin | Réponse | Source |
| --- | --- | --- | --- |
| GET | `/metrics` | Texte Prometheus `text/plain; version=0.0.4` | `target/receiver.mjs:79-81` |
| GET | `/telemetry` | JSON `{ nicRxMbps }` | `target/receiver.mjs:82-86` |
| (autre) | * | `404` | `target/receiver.mjs:87-90` |

Le chemin est extrait sans la query string (`target/receiver.mjs:78`).

### `/telemetry`

Retourne `{ nicRxMbps: avgBps / 1e6 }` (`target/receiver.mjs:67-69`). Sert au
connecteur *pull* `TARGET_TELEMETRY` du plan de contrôle pour corréler la charge
hôte à un run (`target/receiver.mjs:62-65,82-84`). Seul `nicRxMbps` est modélisé ;
les autres compteurs hôte ne le sont pas (`target/receiver.mjs:64-65`). Forme du
JSON verrouillée par le test « target /telemetry JSON matches the
target-telemetry connector shape » (`test/closed-loop.test.mjs`).

## Métriques Prometheus exposées

Toutes relevées dans `renderMetrics()` (`target/receiver.mjs:44-60`).

| Métrique | Type | Signification | Source |
| --- | --- | --- | --- |
| `shieldtest_target_packets_total` | counter | Paquets reçus | `target/receiver.mjs:46-48` |
| `shieldtest_target_bytes_total` | counter | Octets reçus | `target/receiver.mjs:49-51` |
| `shieldtest_target_avg_pps` | gauge | Paquets/s moyens depuis le démarrage | `target/receiver.mjs:52-54` |
| `shieldtest_target_avg_bps` | gauge | Bits/s moyens depuis le démarrage | `target/receiver.mjs:55-57` |

`avgPps` et `avgBps` divisent par un temps écoulé plancher de 1 s
(`target/receiver.mjs:30,34`). `avgBps` compte en **bits** (`bytes * 8`,
`target/receiver.mjs:35`).

## Flux de données

Entrée : datagrammes UDP sur `LISTEN_PORT`. Traitement : incrément
`packets`/`bytes` (`target/receiver.mjs:39-42`). Sortie : **aucune** vers le
réseau ; uniquement lecture via `/metrics` et `/telemetry`, plus un log JSON
`target.metrics` toutes les 5 s en exécution directe (`target/receiver.mjs:115-125`).

## Sécurité (propriétés du code)

- **Ne répond jamais** : pas d'appel `socket.send` dans le fichier — ne peut pas
  réfléchir de trafic (`target/receiver.mjs:4-6,39-42`).
- Pas de garde d'adresse ici car il n'émet pas ; la protection anti-spoof porte
  sur les émetteurs (reflector, scrubber, generator).

## Cycle de vie

- `start(onReady)` : `bind` du socket, log `target.ready`, démarrage optionnel du
  serveur de métriques (`target/receiver.mjs:71-95`).
- `stop(done)` : ferme socket et serveur de métriques, callback quand tout est
  fermé (`target/receiver.mjs:98-106`).
- Auto-démarrage si lancé directement, avec `SIGTERM`/`SIGINT` → `stop`
  (`target/receiver.mjs:111-129`).
- API retournée : `{ start, stop, metrics, renderMetrics, telemetryJson }`
  (`target/receiver.mjs:108`).

## Topologie Compose

Service `lab-target`, image `shieldtest-lab-target:latest`, `restart:
unless-stopped`, IP fixe `192.168.100.99`, réseau `shieldtest_lab`
(`internal: true`) (`docker-compose.yml:14-24,115-121`).
