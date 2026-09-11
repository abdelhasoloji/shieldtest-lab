# Serveur : Scrubber (nœud de mitigation)

**Source** : `scrubber/server.mjs` (287 lignes) · **Fabrique** : `createScrubber(env)` (`scrubber/server.mjs:18`)
**Tests** : `test/scrubber.test.mjs`, `test/mitigation-strategies.test.mjs`, `test/closed-loop.test.mjs`

## Rôle

Nœud de mitigation synthétique placé **entre le reflector et le target**
(`scrubber/server.mjs:5-11`). Il mesure le débit entrant et, une fois un seuil
tenu au-delà d'un délai de détection, engage la mitigation : il ne **transfère**
que jusqu'à un plafond borné et **jette** l'excès. Il mesure le problème
détection/mitigation (délai, charge résiduelle, dommage collatéral sur le trafic
légitime) ; il n'émet aucun trafic propre au-delà du transfert, et uniquement
vers une cible privée/loopback (`scrubber/server.mjs:8-11`).

## Écoute

| Élément | Défaut | Variable | Source |
| --- | --- | --- | --- |
| Protocole | UDP (udp4) | — | `scrubber/server.mjs:64,236` |
| Host d'écoute | `0.0.0.0` | `LISTEN_HOST` | `scrubber/server.mjs:19` |
| Port d'écoute | `9005` | `LISTEN_PORT` | `scrubber/server.mjs:20` |
| Cible (host) | `192.168.100.99` | `TARGET_HOST` | `scrubber/server.mjs:21` |
| Cible (port) | `9002` | `TARGET_PORT` | `scrubber/server.mjs:22` |
| Port métriques | `0` (désactivé) | `METRICS_PORT` | `scrubber/server.mjs:26` |

En Compose (`lab-scrubber`) : `LISTEN_PORT 9005`, `METRICS_PORT 9105`,
`TARGET_HOST 192.168.100.99`, `LAB_CIDR_PREFIX 192.168.100.`, IP `192.168.100.60`
(`docker-compose.yml:29-47`).

## Paramètres de mitigation et validation

Toute valeur hors borne **jette** (`scrubber/server.mjs:39-59`).

| Variable | Défaut | Borne | Effet | Source |
| --- | --- | --- | --- | --- |
| `THRESHOLD_PPS` | `100` | 1–100000 | Seuil de PPS déclenchant la détection | `scrubber/server.mjs:23,43-45` |
| `CEILING_PPS` | `50` | 0–`THRESHOLD_PPS` | Plafond de transfert sous mitigation | `scrubber/server.mjs:24,46-48` |
| `DETECTION_DELAY_SEC` | `3` | 0–60 | Secondes de dépassement soutenu avant d'engager | `scrubber/server.mjs:25,49-55` |
| `STRATEGY` | `ceiling` | `ceiling`\|`blocklist`\|`adaptive` | Politique de délestage | `scrubber/server.mjs:37,56-59` |

`ADAPT_STEP_PPS` est dérivé : `max(1, round((THRESHOLD-CEILING)/4))`
(`scrubber/server.mjs:62`).

## Stratégies de mitigation

Toutes bornées et **drop-only** (le scrubber n'émet jamais de trafic propre)
(`scrubber/server.mjs:27-36`). Logique dans `ingest()` (`scrubber/server.mjs:101-125`).

- **`ceiling`** (défaut) — transfère jusqu'à `CEILING_PPS`/s, jette le reste quel
  que soit le type ; le légitime pris dans l'excès est collatéral
  (`scrubber/server.mjs:30-31,121-123`).
- **`blocklist`** — classificateur idéal : transfère tout paquet légitime, jette
  tout paquet classé attaque (~0 collatéral) (`scrubber/server.mjs:32-33,114-116`).
- **`adaptive`** — part de `CEILING_PPS` et relève le plafond effectif vers
  `THRESHOLD` quand du collatéral apparaît, le fait décroître sinon
  (`scrubber/server.mjs:34-36,117-120,141-147`).

Classification : un paquet est « attaque » si son champ JSON `type` vaut
`shieldtest.synthetic-amplification` (`scrubber/server.mjs:16,101-111`) ; JSON
opaque ou illisible → traité comme attaque (`scrubber/server.mjs:108-110`).

## Boucle temporelle (`tick`, 1 s)

`tick()` (`scrubber/server.mjs:128-151`), planifié chaque seconde
(`scrubber/server.mjs:241`) :
- compte le dépassement soutenu ; engage la mitigation quand
  `overThresholdSince > DETECTION_DELAY_SEC` et enregistre le délai mesuré
  (`scrubber/server.mjs:130-135`) ;
- un creux sous le seuil casse le compteur de dépassement, mais la mitigation
  reste **verrouillée** une fois engagée (`scrubber/server.mjs:136-138`) ;
- en `adaptive`, ajuste `effectiveCeiling` dans `[CEILING, THRESHOLD]`
  (`scrubber/server.mjs:141-147`) ;
- remet à zéro les compteurs de fenêtre (`scrubber/server.mjs:148-150`).

Tests : « engages mitigation after the detection delay and records it »
(`test/scrubber.test.mjs`) ; stratégies dans `test/mitigation-strategies.test.mjs`.

## Métriques Prometheus exposées

`renderMetrics()` (`scrubber/server.mjs:186-217`) :

| Métrique | Type | Source |
| --- | --- | --- |
| `shieldtest_scrubber_received_total` | counter | `scrubber/server.mjs:188-190` |
| `shieldtest_scrubber_forwarded_total` | counter | `scrubber/server.mjs:191-193` |
| `shieldtest_scrubber_dropped_total` | counter | `scrubber/server.mjs:194-196` |
| `shieldtest_scrubber_dropped_legit_total` | counter | `scrubber/server.mjs:197-199` |
| `shieldtest_scrubber_mitigating` | gauge (1/0) | `scrubber/server.mjs:200-202` |
| `shieldtest_scrubber_detection_delay_seconds` | gauge | `scrubber/server.mjs:203-205` |
| `shieldtest_scrubber_collateral_pct` | gauge | `scrubber/server.mjs:178-183,206-208` |
| `shieldtest_scrubber_effective_ceiling_pps` | gauge | `scrubber/server.mjs:209-211` |
| `shieldtest_scrubber_strategy{strategy="..."}` | gauge (=1) | `scrubber/server.mjs:212-214` |

## Endpoints HTTP

| Méthode | Chemin | Réponse | Source |
| --- | --- | --- | --- |
| GET | `/metrics` | Prometheus texte | `scrubber/server.mjs:246-248` |
| GET | `/protection` | JSON (voir ci-dessous) | `scrubber/server.mjs:249-253` |
| (autre) | * | `404` | `scrubber/server.mjs:254-257` |

### `/protection`

`protectionJson()` (`scrubber/server.mjs:224-232`) retourne
`{ detectionTimeSec, mitigationTimeSec, strategy, source: 'lab-scrubber' }` ;
`mitigationTimeSec` vaut 0 tant que la mitigation n'est pas engagée. Alimente le
connecteur *pull* `PROTECTION_METRICS_URL` du plan de contrôle pour un WRS mesuré
(`scrubber/server.mjs:219-223,250-251`). Ne jette jamais (`scrubber/server.mjs:223`).
Forme verrouillée par « scrubber /protection JSON matches the measured-WRS
connector shape » (`test/closed-loop.test.mjs`).

## Flux de données

Entrée : UDP sur `LISTEN_PORT`. Décision `ingest()` par paquet ; si `forward`,
`output.send` vers `TARGET_HOST:TARGET_PORT` (`scrubber/server.mjs:237-238`).
Sortie réseau : uniquement des paquets **transférés** (jamais générés).

## Sécurité (propriétés du code)

- **Garde d'adresse dur** sur la cible : `assertLabAddressInPrefix(TARGET_HOST,
  LAB_CIDR_PREFIX, 'TARGET_HOST')` (`scrubber/server.mjs:39`, `lib/net-guard.mjs:41-48`).
  Test « rejects a public forwarding target (hard gate) and a bad ceiling »
  (`test/scrubber.test.mjs`).
- **Drop-only** : aucune génération de trafic, seulement transfert ou rejet
  (`scrubber/server.mjs:84-98`).

## Cycle de vie

`start` crée le socket d'entrée, arme le ticker 1 s (unref), démarre les
métriques optionnelles (`scrubber/server.mjs:235-263`). `stop` arrête le ticker et
ferme sockets/métriques (`scrubber/server.mjs:265-275`). API : `{ start, stop,
ingest, tick, metrics, renderMetrics, protectionJson, strategy }`
(`scrubber/server.mjs:277`). `ingest`/`tick` sont exposés pour piloter la
comptabilité de façon déterministe en test, sans vrais sockets
(`scrubber/server.mjs:13-14`).

## Topologie Compose

Service `lab-scrubber`, IP `192.168.100.60`, `depends_on: [lab-target]`. Il
n'entre dans le chemin que si `LAB_REFLECTOR_TARGET=192.168.100.60` est posé côté
reflector ; sinon il tourne à vide (`docker-compose.yml:26-47,59-61`).
