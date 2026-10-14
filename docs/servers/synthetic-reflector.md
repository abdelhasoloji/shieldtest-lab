# Serveur : Synthetic reflector (réflecteur synthétique)

**Source** : `synthetic-reflector/server.mjs` (238 lignes) · **Fabrique** : `createReflector(env)` (`synthetic-reflector/server.mjs`)
**Tests** : `test/amplification.test.mjs`, `test/fuzz-caps.test.mjs`

## Rôle

Reproduit la **forme de trafic** d'un amplificateur UDP pour que la détection et
la mitigation soient mesurables (`synthetic-reflector/server.mjs`). Ce
n'est **pas** un vrai service DNS/NTP/SSDP/memcached et il ne parle jamais à
un tel service (`synthetic-reflector/server.mjs`). Le protocole est un
message **JSON synthétique** ; le champ `profile` ne sert qu'à ventiler les
métriques par forme (`synthetic-reflector/server.mjs`).

## Écoute

| Élément | Défaut | Variable | Source |
| --- | --- | --- | --- |
| Protocole | UDP (udp4), sockets `input`/`output` séparés | — | `synthetic-reflector/server.mjs` |
| Host d'écoute | `0.0.0.0` | `LISTEN_HOST` | `synthetic-reflector/server.mjs` |
| Port d'écoute | `9001` | `LISTEN_PORT` | `synthetic-reflector/server.mjs` |
| Cible (host) | `192.168.100.99` | `TARGET_HOST` | `synthetic-reflector/server.mjs` |
| Cible (port) | `9002` | `TARGET_PORT` | `synthetic-reflector/server.mjs` |
| Port métriques | `0` (désactivé) | `METRICS_PORT` | `synthetic-reflector/server.mjs` |

En Compose (`lab-reflector`) : `LISTEN_PORT 9001`, `METRICS_PORT 9101`,
`TARGET_HOST` = `${LAB_REFLECTOR_TARGET:-192.168.100.99}`, `LAB_CIDR_PREFIX
192.168.100.`, IP `192.168.100.50` (`docker-compose.yml`). Pointer
`LAB_REFLECTOR_TARGET=192.168.100.60` route le trafic **à travers le scrubber**
(`docker-compose.yml`).

## Plafonds (hard caps) et validation

Lus à la construction, avec bornes vérifiées ; toute valeur hors borne **jette**
(`synthetic-reflector/server.mjs`).

| Variable | Défaut | Borne acceptée | Effet | Source |
| --- | --- | --- | --- | --- |
| `MAX_FACTOR` | `50` | 1–100 | Facteur d'amplification d'octets max | `synthetic-reflector/server.mjs` |
| `MAX_RESPONSE_BYTES` | `8192` | 64–65507 | Taille max d'une réponse | `synthetic-reflector/server.mjs` |
| `MAX_PACKET_FACTOR` | `10` | 1–100 | Nombre max de réponses par requête | `synthetic-reflector/server.mjs` |
| `TARGET_PORT` | `9002` | 1024–65535, entier | Port UDP non privilégié | `synthetic-reflector/server.mjs` |

## Traitement d'une requête

`parseRequest` (`synthetic-reflector/server.mjs`) :
- lit `factor` et `packetFactor` du JSON, chacun borné `[1, MAX_*]` par
  `Math.min/Math.max/Math.floor` (`synthetic-reflector/server.mjs`) ;
- `profile` passé par `sanitizeProfileLabel` → jamais hors allowlist
  (`synthetic-reflector/server.mjs`, `profiles.mjs`) ;
- JSON invalide → `{ factor:1, packetFactor:1, profile:'other' }`
  (`synthetic-reflector/server.mjs`).

Émission (`synthetic-reflector/server.mjs`) :
- octets demandés = `max(len, floor(len*factor))`, puis **clampés** à
  `MAX_RESPONSE_BYTES` (`synthetic-reflector/server.mjs`) ;
- charge déterministe : buffer rempli d'octets `0x57` (`synthetic-reflector/server.mjs`) ;
- envoie `packetFactor` réponses vers `TARGET_HOST:TARGET_PORT` **fixe**
  (`synthetic-reflector/server.mjs`).

Le test « reflector clamps a maliciously oversized request »
(`test/fuzz-caps.test.mjs`) verrouille le clamp.

## Métriques Prometheus exposées

Globales (`synthetic-reflector/server.mjs`) :

| Métrique | Type | Source |
| --- | --- | --- |
| `shieldtest_reflector_requests_total` | counter | `synthetic-reflector/server.mjs` |
| `shieldtest_reflector_input_bytes_total` | counter | `synthetic-reflector/server.mjs` |
| `shieldtest_reflector_output_packets_total` | counter | `synthetic-reflector/server.mjs` |
| `shieldtest_reflector_output_bytes_total` | counter | `synthetic-reflector/server.mjs` |
| `shieldtest_reflector_bap` | gauge (output/input octets) | `synthetic-reflector/server.mjs` |
| `shieldtest_reflector_packet_amplification` | gauge (output/requests) | `synthetic-reflector/server.mjs` |

Par profil, labellisées `{profile="..."}` (`synthetic-reflector/server.mjs`) :
`shieldtest_reflector_profile_requests_total`,
`_profile_input_bytes_total`, `_profile_output_packets_total`,
`_profile_output_bytes_total`. La cardinalité des labels est bornée à l'allowlist
∪ `{other}` (`synthetic-reflector/server.mjs`, `profiles.mjs`).

## Endpoint HTTP

| Méthode | Chemin | Réponse | Source |
| --- | --- | --- | --- |
| GET | `/metrics` | Prometheus texte | `synthetic-reflector/server.mjs` |
| (autre) | * | `404` | `synthetic-reflector/server.mjs` |

À la différence du target, le reflector ne compare pas le chemin nu à la query
(`req.url === '/metrics'`, `synthetic-reflector/server.mjs`). Pas d'endpoint
`/telemetry` ici.

## Sécurité (propriétés du code)

- **Pas d'usurpation d'IP source** : la cible est fixée par env, jamais lue dans
  l'adresse source du paquet (`synthetic-reflector/server.mjs`).
- **Garde d'adresse dur** : `assertLabAddressInPrefix(TARGET_HOST, LAB_CIDR_PREFIX,
  'TARGET_HOST')` à la construction — IPv4 privée/loopback obligatoire, non
  élargissable (`synthetic-reflector/server.mjs`, `lib/net-guard.mjs`).
  Test « reflector rejects a public target (hard private-range gate) »
  (`test/fuzz-caps.test.mjs`).
- **Amplification bornée** : octets par `MAX_RESPONSE_BYTES`, paquets par
  `MAX_PACKET_FACTOR` (`synthetic-reflector/server.mjs`).

## Cycle de vie

`start` bind `input`, log `reflector.ready` (avec cible et plafonds), démarre le
serveur de métriques optionnel (`synthetic-reflector/server.mjs`).
`stop` ferme `input`, `output` et métriques (`synthetic-reflector/server.mjs`).
Auto-démarrage + signaux si lancé directement (`synthetic-reflector/server.mjs`).
API : `{ start, stop, metrics, byProfile, renderMetrics }` (`synthetic-reflector/server.mjs`).

## Profils synthétiques (formes)

Définis dans `profiles.mjs`. Valeurs = **formes de trafic**, toujours
reclampées par les caps du reflector à l'exécution (`profiles.mjs`).

| Profil | `factor` | `packetFactor` | `referenceBap` (réel, comparaison) | Source |
| --- | --- | --- | --- | --- |
| `generic` | 10 | 1 | 10 | `profiles.mjs` |
| `dns` | 40 | 1 | 54 | `profiles.mjs` |
| `ssdp` | 30 | 1 | 31 | `profiles.mjs` |
| `ntp` | 100 | 6 | 557 | `profiles.mjs` |
| `memcached` | 100 | 10 | 10000 | `profiles.mjs` |

`referenceBap` est un chiffre réel documenté (US-CERT TA14-017, rapports
memcached publics) gardé pour comparaison ; le BAP **effectif** est celui qui
survit aux caps (`profiles.mjs`).
