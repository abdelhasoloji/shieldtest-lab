# Serveur : Synthetic reflector (réflecteur synthétique)

**Source** : `synthetic-reflector/server.mjs` (238 lignes) · **Fabrique** : `createReflector(env)` (`synthetic-reflector/server.mjs:25`)
**Tests** : `test/amplification.test.mjs`, `test/fuzz-caps.test.mjs`

## Rôle

Reproduit la **forme de trafic** d'un amplificateur UDP pour que la détection et
la mitigation soient mesurables (`synthetic-reflector/server.mjs:17-20`). Ce
n'est **pas** un vrai service DNS/NTP/SSDP/memcached et il ne parle jamais à
un tel service (`synthetic-reflector/server.mjs:18-19`). Le protocole est un
message **JSON synthétique** ; le champ `profile` ne sert qu'à ventiler les
métriques par forme (`synthetic-reflector/server.mjs:19-20`).

## Écoute

| Élément | Défaut | Variable | Source |
| --- | --- | --- | --- |
| Protocole | UDP (udp4), sockets `input`/`output` séparés | — | `synthetic-reflector/server.mjs:55-56` |
| Host d'écoute | `0.0.0.0` | `LISTEN_HOST` | `synthetic-reflector/server.mjs:26` |
| Port d'écoute | `9001` | `LISTEN_PORT` | `synthetic-reflector/server.mjs:27` |
| Cible (host) | `192.168.100.99` | `TARGET_HOST` | `synthetic-reflector/server.mjs:28` |
| Cible (port) | `9002` | `TARGET_PORT` | `synthetic-reflector/server.mjs:29` |
| Port métriques | `0` (désactivé) | `METRICS_PORT` | `synthetic-reflector/server.mjs:33` |

En Compose (`lab-reflector`) : `LISTEN_PORT 9001`, `METRICS_PORT 9101`,
`TARGET_HOST` = `${LAB_REFLECTOR_TARGET:-192.168.100.99}`, `LAB_CIDR_PREFIX
192.168.100.`, IP `192.168.100.50` (`docker-compose.yml:49-69`). Pointer
`LAB_REFLECTOR_TARGET=192.168.100.60` route le trafic **à travers le scrubber**
(`docker-compose.yml:59-61`).

## Plafonds (hard caps) et validation

Lus à la construction, avec bornes vérifiées ; toute valeur hors borne **jette**
(`synthetic-reflector/server.mjs:30-53`).

| Variable | Défaut | Borne acceptée | Effet | Source |
| --- | --- | --- | --- | --- |
| `MAX_FACTOR` | `50` | 1–100 | Facteur d'amplification d'octets max | `synthetic-reflector/server.mjs:30,41-43` |
| `MAX_RESPONSE_BYTES` | `8192` | 64–65507 | Taille max d'une réponse | `synthetic-reflector/server.mjs:31,44-50` |
| `MAX_PACKET_FACTOR` | `10` | 1–100 | Nombre max de réponses par requête | `synthetic-reflector/server.mjs:32,51-53` |
| `TARGET_PORT` | `9002` | 1024–65535, entier | Port UDP non privilégié | `synthetic-reflector/server.mjs:29,38-40` |

## Traitement d'une requête

`parseRequest` (`synthetic-reflector/server.mjs:85-98`) :
- lit `factor` et `packetFactor` du JSON, chacun borné `[1, MAX_*]` par
  `Math.min/Math.max/Math.floor` (`synthetic-reflector/server.mjs:88-92`) ;
- `profile` passé par `sanitizeProfileLabel` → jamais hors allowlist
  (`synthetic-reflector/server.mjs:93`, `profiles.mjs:35-37`) ;
- JSON invalide → `{ factor:1, packetFactor:1, profile:'other' }`
  (`synthetic-reflector/server.mjs:95-97`).

Émission (`synthetic-reflector/server.mjs:100-121`) :
- octets demandés = `max(len, floor(len*factor))`, puis **clampés** à
  `MAX_RESPONSE_BYTES` (`synthetic-reflector/server.mjs:107-108`) ;
- charge déterministe : buffer rempli d'octets `0x57` (`synthetic-reflector/server.mjs:109`) ;
- envoie `packetFactor` réponses vers `TARGET_HOST:TARGET_PORT` **fixe**
  (`synthetic-reflector/server.mjs:111-120`).

Le test « reflector clamps a maliciously oversized request »
(`test/fuzz-caps.test.mjs`) verrouille le clamp.

## Métriques Prometheus exposées

Globales (`synthetic-reflector/server.mjs:123-142`) :

| Métrique | Type | Source |
| --- | --- | --- |
| `shieldtest_reflector_requests_total` | counter | `synthetic-reflector/server.mjs:125-127` |
| `shieldtest_reflector_input_bytes_total` | counter | `synthetic-reflector/server.mjs:128-130` |
| `shieldtest_reflector_output_packets_total` | counter | `synthetic-reflector/server.mjs:131-133` |
| `shieldtest_reflector_output_bytes_total` | counter | `synthetic-reflector/server.mjs:134-136` |
| `shieldtest_reflector_bap` | gauge (output/input octets) | `synthetic-reflector/server.mjs:64-66,137-139` |
| `shieldtest_reflector_packet_amplification` | gauge (output/requests) | `synthetic-reflector/server.mjs:67-69,140-142` |

Par profil, labellisées `{profile="..."}` (`synthetic-reflector/server.mjs:143-169`) :
`shieldtest_reflector_profile_requests_total`,
`_profile_input_bytes_total`, `_profile_output_packets_total`,
`_profile_output_bytes_total`. La cardinalité des labels est bornée à l'allowlist
∪ `{other}` (`synthetic-reflector/server.mjs:72-83`, `profiles.mjs:24-37`).

## Endpoint HTTP

| Méthode | Chemin | Réponse | Source |
| --- | --- | --- | --- |
| GET | `/metrics` | Prometheus texte | `synthetic-reflector/server.mjs:189-191` |
| (autre) | * | `404` | `synthetic-reflector/server.mjs:192-195` |

À la différence du target, le reflector ne compare pas le chemin nu à la query
(`req.url === '/metrics'`, `synthetic-reflector/server.mjs:189`). Pas d'endpoint
`/telemetry` ici.

## Sécurité (propriétés du code)

- **Pas d'usurpation d'IP source** : la cible est fixée par env, jamais lue dans
  l'adresse source du paquet (`synthetic-reflector/server.mjs:10-11,112`).
- **Garde d'adresse dur** : `assertLabAddressInPrefix(TARGET_HOST, LAB_CIDR_PREFIX,
  'TARGET_HOST')` à la construction — IPv4 privée/loopback obligatoire, non
  élargissable (`synthetic-reflector/server.mjs:35-37`, `lib/net-guard.mjs:41-48`).
  Test « reflector rejects a public target (hard private-range gate) »
  (`test/fuzz-caps.test.mjs`).
- **Amplification bornée** : octets par `MAX_RESPONSE_BYTES`, paquets par
  `MAX_PACKET_FACTOR` (`synthetic-reflector/server.mjs:12-13,107-111`).

## Cycle de vie

`start` bind `input`, log `reflector.ready` (avec cible et plafonds), démarre le
serveur de métriques optionnel (`synthetic-reflector/server.mjs:174-201`).
`stop` ferme `input`, `output` et métriques (`synthetic-reflector/server.mjs:203-212`).
Auto-démarrage + signaux si lancé directement (`synthetic-reflector/server.mjs:217-238`).
API : `{ start, stop, metrics, byProfile, renderMetrics }` (`synthetic-reflector/server.mjs:214`).

## Profils synthétiques (formes)

Définis dans `profiles.mjs:14-20`. Valeurs = **formes de trafic**, toujours
reclampées par les caps du reflector à l'exécution (`profiles.mjs:6-8`).

| Profil | `factor` | `packetFactor` | `referenceBap` (réel, comparaison) | Source |
| --- | --- | --- | --- | --- |
| `generic` | 10 | 1 | 10 | `profiles.mjs:15` |
| `dns` | 40 | 1 | 54 | `profiles.mjs:16` |
| `ssdp` | 30 | 1 | 31 | `profiles.mjs:17` |
| `ntp` | 100 | 6 | 557 | `profiles.mjs:18` |
| `memcached` | 100 | 10 | 10000 | `profiles.mjs:19` |

`referenceBap` est un chiffre réel documenté (US-CERT TA14-017, rapports
memcached publics) gardé pour comparaison ; le BAP **effectif** est celui qui
survit aux caps (`profiles.mjs:10-12`).
