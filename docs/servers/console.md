# Serveur : Console (UI web loopback)

**Source** : `console/server.mjs` (184 lignes) · **Fabrique** : `createConsole(env)` (`console/server.mjs`)
**Page** : `console/ui.mjs` (exporte `PAGE`) · **Tests** : `test/console.test.mjs`

## Rôle

Console de contrôle **loopback uniquement** pour le lab (`console/server.mjs`).
Elle exécute des scénarios bornés **en processus** (pas de sous-processus réseau)
et les diffuse en direct. La **seule** chose qu'un client peut demander est un
scénario **nommé et allowlisté** : aucun host, port, cible, débit ou durée n'est
accepté depuis le réseau, donc la console ne peut pas devenir un lanceur de
trafic générique (`console/server.mjs`).

## Écoute

| Élément | Défaut | Variable | Source |
| --- | --- | --- | --- |
| Protocole | HTTP | — | `console/server.mjs` |
| Host d'écoute | `127.0.0.1` | `LAB_CONSOLE_HOST` | `console/server.mjs` |
| Port d'écoute | `9110` | `LAB_CONSOLE_PORT` | `console/server.mjs` |
| Autoriser non-loopback | `false` | `LAB_CONSOLE_ALLOW_NONLOOPBACK` (`=1`) | `console/server.mjs` |

Lancement : `npm run console` → `node console/server.mjs` (`package.json`).

## Garde loopback

Hosts loopback reconnus : `127.0.0.1`, `::1`, `localhost` (`console/server.mjs`).
Un host non-loopback est **refusé** (throw) sauf si
`LAB_CONSOLE_ALLOW_NONLOOPBACK=1` (`console/server.mjs`) ; même autorisé, un
avertissement bruyant `console.warn` est émis (`console/server.mjs`). Test
« refuses a non-loopback bind unless explicitly allowed » (`test/console.test.mjs`).

## Endpoints HTTP

Routage dans `onRequest` (`console/server.mjs`).

| Méthode | Chemin | Réponse | Source |
| --- | --- | --- | --- |
| GET | `/` ou `/index.html` | HTML (`PAGE`) | `console/server.mjs` |
| GET | `/api/health` | `{ ok:true, scenarios:N }` | `console/server.mjs` |
| GET | `/api/scenarios` | Liste des scénarios décrits | `console/server.mjs` |
| GET | `/api/run-stream?scenario=NAME` | SSE (`text/event-stream`) | `console/server.mjs` |
| POST | `/api/run` | JSON (résumé du run) | `console/server.mjs` |
| (autre) | * | `404 { error:'not found' }` | `console/server.mjs` |

### `/api/scenarios`

Retourne `scenarioNames().map(describe)` (`console/server.mjs`).
`describe()` ne renvoie que des champs **non secrets** : nom, résumé, usage
scrubber, stratégie, présence de trafic légitime, nombre de générateurs, profils
(`console/server.mjs`).

### `/api/run-stream` (SSE)

`handleRunStream` (`console/server.mjs`) :
- scénario inconnu → événement SSE `error` puis fin (`console/server.mjs`) ;
- un seul run à la fois : si occupé, `error` « a run is already in progress »
  (`console/server.mjs`) ;
- diffuse des événements `sample` par snapshot puis `done` avec le résumé/verdict
  (`console/server.mjs`).

Le front-end consomme ce flux via `EventSource('./api/run-stream?...')`
(`console/ui.mjs`) et liste les scénarios via `fetch('./api/scenarios')`
(`console/ui.mjs`). Test « SSE run-stream emits samples then a done event
carrying the verdict » (`test/console.test.mjs`).

### `POST /api/run`

`handleRunPost` (`console/server.mjs`) :
- corps limité à 4096 octets → `413` au-delà (`console/server.mjs`) ;
- JSON invalide → `400` (`console/server.mjs`) ;
- scénario absent ou hors allowlist → `400` « scenario must be one of the named
  scenarios » (`console/server.mjs`) ;
- run concurrent → `409` (`console/server.mjs`) ;
- succès → `200` avec le résumé, erreur d'exécution → `500`
  (`console/server.mjs`).

Test « POST /api/run rejects anything but a named scenario (no arbitrary target) »
(`test/console.test.mjs`).

## Sécurité (propriétés du code)

- **Loopback par défaut**, non-loopback refusé sauf opt-in explicite
  (`console/server.mjs`).
- **Entrée réduite à un nom allowlisté** : aucune cible/débit/durée depuis le
  réseau (`console/server.mjs`).
- **Un run à la fois**, garde `busy` (`console/server.mjs`).
- Corps POST plafonné à 4 Ko (`console/server.mjs`).

## Cycle de vie

`start` crée le serveur HTTP, log `console.ready` avec l'URL
(`console/server.mjs`). `stop` ferme le serveur (`console/server.mjs`).
Auto-démarrage + signaux si lancé directement (`console/server.mjs`). API :
`{ start, stop }` (`console/server.mjs`).

## Topologie

Pas de service dans `docker-compose.yml` : la console tourne en pur Node sur
l'hôte, à joindre par tunnel SSH, jamais publiquement (`console/ui.mjs`,
`README.md`). Elle exécute les scénarios in-process via `runScenario`
(`console/server.mjs`).
