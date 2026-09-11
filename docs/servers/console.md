# Serveur : Console (UI web loopback)

**Source** : `console/server.mjs` (184 lignes) · **Fabrique** : `createConsole(env)` (`console/server.mjs:35`)
**Page** : `console/ui.mjs` (exporte `PAGE`) · **Tests** : `test/console.test.mjs`

## Rôle

Console de contrôle **loopback uniquement** pour le lab (`console/server.mjs:6-15`).
Elle exécute des scénarios bornés **en processus** (pas de sous-processus réseau)
et les diffuse en direct. La **seule** chose qu'un client peut demander est un
scénario **nommé et allowlisté** : aucun host, port, cible, débit ou durée n'est
accepté depuis le réseau, donc la console ne peut pas devenir un lanceur de
trafic générique (`console/server.mjs:12-15`).

## Écoute

| Élément | Défaut | Variable | Source |
| --- | --- | --- | --- |
| Protocole | HTTP | — | `console/server.mjs:159` |
| Host d'écoute | `127.0.0.1` | `LAB_CONSOLE_HOST` | `console/server.mjs:36` |
| Port d'écoute | `9110` | `LAB_CONSOLE_PORT` | `console/server.mjs:37` |
| Autoriser non-loopback | `false` | `LAB_CONSOLE_ALLOW_NONLOOPBACK` (`=1`) | `console/server.mjs:38` |

Lancement : `npm run console` → `node console/server.mjs` (`package.json`).

## Garde loopback

Hosts loopback reconnus : `127.0.0.1`, `::1`, `localhost` (`console/server.mjs:17`).
Un host non-loopback est **refusé** (throw) sauf si
`LAB_CONSOLE_ALLOW_NONLOOPBACK=1` (`console/server.mjs:40-45`) ; même autorisé, un
avertissement bruyant `console.warn` est émis (`console/server.mjs:46-54`). Test
« refuses a non-loopback bind unless explicitly allowed » (`test/console.test.mjs`).

## Endpoints HTTP

Routage dans `onRequest` (`console/server.mjs:136-156`).

| Méthode | Chemin | Réponse | Source |
| --- | --- | --- | --- |
| GET | `/` ou `/index.html` | HTML (`PAGE`) | `console/server.mjs:139-142` |
| GET | `/api/health` | `{ ok:true, scenarios:N }` | `console/server.mjs:143-145` |
| GET | `/api/scenarios` | Liste des scénarios décrits | `console/server.mjs:146-148` |
| GET | `/api/run-stream?scenario=NAME` | SSE (`text/event-stream`) | `console/server.mjs:149-151` |
| POST | `/api/run` | JSON (résumé du run) | `console/server.mjs:152-154` |
| (autre) | * | `404 { error:'not found' }` | `console/server.mjs:155` |

### `/api/scenarios`

Retourne `scenarioNames().map(describe)` (`console/server.mjs:146-147`).
`describe()` ne renvoie que des champs **non secrets** : nom, résumé, usage
scrubber, stratégie, présence de trafic légitime, nombre de générateurs, profils
(`console/server.mjs:19-33`).

### `/api/run-stream` (SSE)

`handleRunStream` (`console/server.mjs:64-107`) :
- scénario inconnu → événement SSE `error` puis fin (`console/server.mjs:65-73`) ;
- un seul run à la fois : si occupé, `error` « a run is already in progress »
  (`console/server.mjs:57,79-82`) ;
- diffuse des événements `sample` par snapshot puis `done` avec le résumé/verdict
  (`console/server.mjs:96-99`).

Le front-end consomme ce flux via `EventSource('./api/run-stream?...')`
(`console/ui.mjs:279`) et liste les scénarios via `fetch('./api/scenarios')`
(`console/ui.mjs:300`). Test « SSE run-stream emits samples then a done event
carrying the verdict » (`test/console.test.mjs`).

### `POST /api/run`

`handleRunPost` (`console/server.mjs:109-134`) :
- corps limité à 4096 octets → `413` au-delà (`console/server.mjs:113`) ;
- JSON invalide → `400` (`console/server.mjs:118-119`) ;
- scénario absent ou hors allowlist → `400` « scenario must be one of the named
  scenarios » (`console/server.mjs:121-123`) ;
- run concurrent → `409` (`console/server.mjs:124`) ;
- succès → `200` avec le résumé, erreur d'exécution → `500`
  (`console/server.mjs:126-133`).

Test « POST /api/run rejects anything but a named scenario (no arbitrary target) »
(`test/console.test.mjs`).

## Sécurité (propriétés du code)

- **Loopback par défaut**, non-loopback refusé sauf opt-in explicite
  (`console/server.mjs:40-45`).
- **Entrée réduite à un nom allowlisté** : aucune cible/débit/durée depuis le
  réseau (`console/server.mjs:12-14,121-123`).
- **Un run à la fois**, garde `busy` (`console/server.mjs:57,79,124`).
- Corps POST plafonné à 4 Ko (`console/server.mjs:113`).

## Cycle de vie

`start` crée le serveur HTTP, log `console.ready` avec l'URL
(`console/server.mjs:158-167`). `stop` ferme le serveur (`console/server.mjs:169-172`).
Auto-démarrage + signaux si lancé directement (`console/server.mjs:177-184`). API :
`{ start, stop }` (`console/server.mjs:174`).

## Topologie

Pas de service dans `docker-compose.yml` : la console tourne en pur Node sur
l'hôte, à joindre par tunnel SSH, jamais publiquement (`console/ui.mjs:125`,
`README.md`). Elle exécute les scénarios in-process via `runScenario`
(`console/server.mjs:2,96,127`).
