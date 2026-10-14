# Serveur : Scrubber (nœud de mitigation)

**Source** : `scrubber/server.mjs` (287 lignes) · **Fabrique** : `createScrubber(env)` (`scrubber/server.mjs`)
**Tests** : `test/scrubber.test.mjs`, `test/mitigation-strategies.test.mjs`, `test/closed-loop.test.mjs`

## Rôle

Nœud de mitigation synthétique placé **entre le reflector et le target**
(`scrubber/server.mjs`). Il mesure le débit entrant et, une fois un seuil
tenu au-delà d'un délai de détection, engage la mitigation : il ne **transfère**
que jusqu'à un plafond borné et **jette** l'excès. Il mesure le problème
détection/mitigation (délai, charge résiduelle, dommage collatéral sur le trafic
légitime) ; il n'émet aucun trafic propre au-delà du transfert, et uniquement
vers une cible privée/loopback (`scrubber/server.mjs`).

## Écoute

| Élément | Défaut | Variable | Source |
| --- | --- | --- | --- |
| Protocole | UDP (udp4) | — | `scrubber/server.mjs` |
| Host d'écoute | `0.0.0.0` | `LISTEN_HOST` | `scrubber/server.mjs` |
| Port d'écoute | `9005` | `LISTEN_PORT` | `scrubber/server.mjs` |
| Cible (host) | `192.168.100.99` | `TARGET_HOST` | `scrubber/server.mjs` |
| Cible (port) | `9002` | `TARGET_PORT` | `scrubber/server.mjs` |
| Port métriques | `0` (désactivé) | `METRICS_PORT` | `scrubber/server.mjs` |

En Compose (`lab-scrubber`) : `LISTEN_PORT 9005`, `METRICS_PORT 9105`,
`TARGET_HOST 192.168.100.99`, `LAB_CIDR_PREFIX 192.168.100.`, IP `192.168.100.60`
(`docker-compose.yml`).

## Paramètres de mitigation et validation

Toute valeur hors borne **jette** (`scrubber/server.mjs`).

| Variable | Défaut | Borne | Effet | Source |
| --- | --- | --- | --- | --- |
| `THRESHOLD_PPS` | `100` | 1–100000 | Seuil de PPS déclenchant la détection | `scrubber/server.mjs` |
| `CEILING_PPS` | `50` | 0–`THRESHOLD_PPS` | Plafond de transfert sous mitigation | `scrubber/server.mjs` |
| `DETECTION_DELAY_SEC` | `3` | 0–60 | Secondes de dépassement soutenu avant d'engager | `scrubber/server.mjs` |
| `STRATEGY` | `ceiling` | `ceiling`\|`blocklist`\|`adaptive` | Politique de délestage | `scrubber/server.mjs` |

`ADAPT_STEP_PPS` est dérivé : `max(1, round((THRESHOLD-CEILING)/4))`
(`scrubber/server.mjs`).

## Stratégies de mitigation

Toutes bornées et **drop-only** (le scrubber n'émet jamais de trafic propre)
(`scrubber/server.mjs`). Logique dans `ingest()` (`scrubber/server.mjs`).

- **`ceiling`** (défaut) — transfère jusqu'à `CEILING_PPS`/s, jette le reste quel
  que soit le type ; le légitime pris dans l'excès est collatéral
  (`scrubber/server.mjs`).
- **`blocklist`** — classificateur idéal : transfère tout paquet légitime, jette
  tout paquet classé attaque (~0 collatéral) (`scrubber/server.mjs`).
- **`adaptive`** — part de `CEILING_PPS` et relève le plafond effectif vers
  `THRESHOLD` quand du collatéral apparaît, le fait décroître sinon
  (`scrubber/server.mjs`).

Classification : un paquet est « attaque » si son champ JSON `type` vaut
`shieldtest.synthetic-amplification` (`scrubber/server.mjs`) ; JSON
opaque ou illisible → traité comme attaque (`scrubber/server.mjs`).

## Boucle temporelle (`tick`, 1 s)

`tick()` (`scrubber/server.mjs`), planifié chaque seconde
(`scrubber/server.mjs`) :
- compte le dépassement soutenu ; engage la mitigation quand
  `overThresholdSince > DETECTION_DELAY_SEC` et enregistre le délai mesuré
  (`scrubber/server.mjs`) ;
- un creux sous le seuil casse le compteur de dépassement, mais la mitigation
  reste **verrouillée** une fois engagée (`scrubber/server.mjs`) ;
- en `adaptive`, ajuste `effectiveCeiling` dans `[CEILING, THRESHOLD]`
  (`scrubber/server.mjs`) ;
- remet à zéro les compteurs de fenêtre (`scrubber/server.mjs`).

Tests : « engages mitigation after the detection delay and records it »
(`test/scrubber.test.mjs`) ; stratégies dans `test/mitigation-strategies.test.mjs`.

## Métriques Prometheus exposées

`renderMetrics()` (`scrubber/server.mjs`) :

| Métrique | Type | Source |
| --- | --- | --- |
| `shieldtest_scrubber_received_total` | counter | `scrubber/server.mjs` |
| `shieldtest_scrubber_forwarded_total` | counter | `scrubber/server.mjs` |
| `shieldtest_scrubber_dropped_total` | counter | `scrubber/server.mjs` |
| `shieldtest_scrubber_dropped_legit_total` | counter | `scrubber/server.mjs` |
| `shieldtest_scrubber_mitigating` | gauge (1/0) | `scrubber/server.mjs` |
| `shieldtest_scrubber_detection_delay_seconds` | gauge | `scrubber/server.mjs` |
| `shieldtest_scrubber_collateral_pct` | gauge | `scrubber/server.mjs` |
| `shieldtest_scrubber_effective_ceiling_pps` | gauge | `scrubber/server.mjs` |
| `shieldtest_scrubber_strategy{strategy="..."}` | gauge (=1) | `scrubber/server.mjs` |

## Endpoints HTTP

| Méthode | Chemin | Réponse | Source |
| --- | --- | --- | --- |
| GET | `/metrics` | Prometheus texte | `scrubber/server.mjs` |
| GET | `/protection` | JSON (voir ci-dessous) | `scrubber/server.mjs` |
| (autre) | * | `404` | `scrubber/server.mjs` |

### `/protection`

`protectionJson()` (`scrubber/server.mjs`) retourne
`{ detectionTimeSec, mitigationTimeSec, strategy, source: 'lab-scrubber' }` ;
`mitigationTimeSec` vaut 0 tant que la mitigation n'est pas engagée. Alimente le
connecteur *pull* `PROTECTION_METRICS_URL` du plan de contrôle pour un WRS mesuré
(`scrubber/server.mjs`). Ne jette jamais (`scrubber/server.mjs`).
Forme verrouillée par « scrubber /protection JSON matches the measured-WRS
connector shape » (`test/closed-loop.test.mjs`).

## Flux de données

Entrée : UDP sur `LISTEN_PORT`. Décision `ingest()` par paquet ; si `forward`,
`output.send` vers `TARGET_HOST:TARGET_PORT` (`scrubber/server.mjs`).
Sortie réseau : uniquement des paquets **transférés** (jamais générés).

## Sécurité (propriétés du code)

- **Garde d'adresse dur** sur la cible : `assertLabAddressInPrefix(TARGET_HOST,
  LAB_CIDR_PREFIX, 'TARGET_HOST')` (`scrubber/server.mjs`, `lib/net-guard.mjs`).
  Test « rejects a public forwarding target (hard gate) and a bad ceiling »
  (`test/scrubber.test.mjs`).
- **Drop-only** : aucune génération de trafic, seulement transfert ou rejet
  (`scrubber/server.mjs`).

## Cycle de vie

`start` crée le socket d'entrée, arme le ticker 1 s (unref), démarre les
métriques optionnelles (`scrubber/server.mjs`). `stop` arrête le ticker et
ferme sockets/métriques (`scrubber/server.mjs`). API : `{ start, stop,
ingest, tick, metrics, renderMetrics, protectionJson, strategy }`
(`scrubber/server.mjs`). `ingest`/`tick` sont exposés pour piloter la
comptabilité de façon déterministe en test, sans vrais sockets
(`scrubber/server.mjs`).

## Topologie Compose

Service `lab-scrubber`, IP `192.168.100.60`, `depends_on: [lab-target]`. Il
n'entre dans le chemin que si `LAB_REFLECTOR_TARGET=192.168.100.60` est posé côté
reflector ; sinon il tourne à vide (`docker-compose.yml`).
