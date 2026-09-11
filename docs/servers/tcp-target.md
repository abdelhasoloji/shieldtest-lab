# Serveur : TCP target (victime TCP)

**Source** : `tcp-target/receiver.mjs` (134 lignes) · **Fabrique** : `createTcpTarget(env)` (`tcp-target/receiver.mjs:13`)
**Tests** : `test/tcp.test.mjs`

## Rôle

Victime TCP instrumentée. Modélise la pression sur la **table d'états / file
d'acceptation** d'un flood de connexions TCP, **sans usurpation** : les
connexions viennent de sources réelles du CIDR du lab
(`tcp-target/receiver.mjs:4-8`). Au-delà de `CAPACITY` connexions simultanées, il
délestte les nouvelles (modèle d'une table d'états pleine), pour mesurer la
détection/mitigation de l'épuisement de connexions (`tcp-target/receiver.mjs:6-8`).

## Écoute

| Élément | Défaut | Variable | Source |
| --- | --- | --- | --- |
| Protocole | TCP (`net.createServer`) | — | `tcp-target/receiver.mjs:31` |
| Host d'écoute | `0.0.0.0` | `LISTEN_HOST` | `tcp-target/receiver.mjs:14` |
| Port d'écoute | `9003` | `LISTEN_PORT` | `tcp-target/receiver.mjs:15` |
| Port métriques | `0` (désactivé) | `METRICS_PORT` | `tcp-target/receiver.mjs:16` |
| Capacité | `200` | `CAPACITY` | `tcp-target/receiver.mjs:17` |

`CAPACITY` est validé 1–100000, sinon throw (`tcp-target/receiver.mjs:19-21`).

> Ce serveur **n'a pas de service dédié** dans `docker-compose.yml` ; il est
> exercé par les tests et par le scénario TCP (`tcp_synflood`) via
> `run-scenario.mjs`. En Compose, aucun `METRICS_PORT`/IP ne lui est assigné
> (non spécifié dans le fichier compose actuel).

## Comportement de saturation

`net.createServer` (`tcp-target/receiver.mjs:31-48`) :
- si `concurrent >= CAPACITY`, la connexion est **détruite** et comptée `refused`
  (`tcp-target/receiver.mjs:32-37`) ;
- sinon `accepted++`, suivi du pic de simultanéité, ajout au set `open`
  (`tcp-target/receiver.mjs:38-41`) ;
- `close`/`error` décrémentent la simultanéité (`tcp-target/receiver.mjs:42-46`) ;
- les données reçues sont drainées ; le générateur garde les connexions
  inactives (`tcp-target/receiver.mjs:47`).

Test « tcp target sheds connections once the state table is full (saturation
measured) » (`test/tcp.test.mjs`).

## Métriques Prometheus exposées

`renderMetrics()` (`tcp-target/receiver.mjs:74-90`) :

| Métrique | Type | Source |
| --- | --- | --- |
| `shieldtest_tcp_target_accepted_total` | counter | `tcp-target/receiver.mjs:76-78` |
| `shieldtest_tcp_target_refused_total` | counter | `tcp-target/receiver.mjs:79-81` |
| `shieldtest_tcp_target_concurrent_peak` | gauge | `tcp-target/receiver.mjs:82-84` |
| `shieldtest_tcp_target_saturation_pct` | gauge | `tcp-target/receiver.mjs:63-67,85-87` |

`saturationPct` = `refused / (accepted+refused) * 100`
(`tcp-target/receiver.mjs:63-67`). `avgCps` existe dans l'objet `metrics` mais
n'est **pas** exposé en Prometheus (`tcp-target/receiver.mjs:68-71`).

## Endpoint HTTP

| Méthode | Chemin | Réponse | Source |
| --- | --- | --- | --- |
| GET | `/metrics` | Prometheus texte | `tcp-target/receiver.mjs:98-100` |
| (autre) | * | `404` | `tcp-target/receiver.mjs:101-104` |

## Sécurité (propriétés du code)

- **Pas d'usurpation** : les sources sont réelles, dans le CIDR du lab
  (`tcp-target/receiver.mjs:5-8`). Le garde d'adresse public/privé est appliqué
  côté **émetteur** (`tcp-generator/generate.mjs`), verrouillé par le test
  « tcp-generator refuses a public target (hard no-spoof/lab gate) »
  (`test/tcp.test.mjs`).
- Délestage borné par `CAPACITY` (`tcp-target/receiver.mjs:19-21,32`).

## Cycle de vie

`start` écoute, log `tcp-target.ready` (avec capacité), démarre les métriques
optionnelles (`tcp-target/receiver.mjs:92-109`). `stop` détruit les connexions
ouvertes puis ferme serveur et métriques (`tcp-target/receiver.mjs:112-122`).
Auto-démarrage + signaux si lancé directement (`tcp-target/receiver.mjs:127-134`).
API : `{ start, stop, metrics, renderMetrics }` (`tcp-target/receiver.mjs:124`).
