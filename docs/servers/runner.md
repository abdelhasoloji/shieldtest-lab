# Serveur : Runner (dispatch gouverné)

**Source** : `runner.mjs` (119 lignes) · **Tests** : `test/runner.test.mjs`

## Rôle

Exécuteur isolé du dispatch de classe C de ShieldTest (`runner.mjs:1-11`). C'est
le **seul** composant qui émet du trafic d'amplification synthétique, et il tourne
**en dehors** du plan de contrôle : le plan de contrôle enregistre une demande de
run autorisée par le CISO et la sert ici ; ce runner la réclame, exécute le
scénario nommé en processus sur loopback (le lab), et **reposte un verdict de
classe C en lecture seule** (`runner.mjs:3-7`). Il ne reçoit qu'un **nom de
scénario allowlisté** et un label de cible, jamais un host/débit/durée arbitraire
(`runner.mjs:9-11`).

> Ce n'est pas un serveur qui écoute : c'est un **client HTTP sortant** qui
> interroge le plan de contrôle en boucle (poll-claim-execute-report). Aucun port
> d'écoute.

## Configuration (env)

`configFromEnv` (`runner.mjs:69-80`) :

| Variable | Défaut | Effet | Source |
| --- | --- | --- | --- |
| `BENCH_API_URL` | — (requis) | Base d'URL du plan de contrôle, slash final retiré | `runner.mjs:70,76-78` |
| `BENCH_RUNNER_TOKEN` | — (requis) | Jeton Bearer d'authentification | `runner.mjs:71,76-78` |
| `RUNNER_ID` | `lab-runner-<pid>` | Identifiant du runner | `runner.mjs:72` |
| `POLL_INTERVAL_MS` | `5000` (plancher 1000) | Intervalle de poll | `runner.mjs:73` |
| `RUNNER_ONCE` | `0` | `=1` : un seul job puis sortie | `runner.mjs:74` |

**Fail-closed** : sans `BENCH_API_URL` **et** `BENCH_RUNNER_TOKEN`, la config
jette et le runner ne fait rien (`runner.mjs:75-78`). Test « configFromEnv fails
closed without endpoint + token » (`test/runner.test.mjs`).

## Contrat HTTP avec le plan de contrôle

Toutes les requêtes portent `Authorization: Bearer <token>` et
`content-type: application/json` (`runner.mjs:15-18`).

| Appel | Méthode + endpoint | Comportement | Source |
| --- | --- | --- | --- |
| Réclamer le prochain run | `POST {apiUrl}/api/bench/runs/next/claim` | `204` → file vide (`null`) ; non-2xx → throw | `runner.mjs:21-30` |
| Poster le résultat | `POST {apiUrl}/api/bench/runs/{id}/result` | corps `{ verdict }` ou `{ error }` | `runner.mjs:33-41` |

## Boucle de traitement

`processOne` (`runner.mjs:48-67`) :
1. réclame un run ; `null` si la file est vide (`runner.mjs:55-56`) ;
2. exécute `runScenario(run.scenario)` (injectable en test) (`runner.mjs:53,58`) ;
3. construit le verdict en le taguant `labTarget` et `runner`, puis le poste
   (`runner.mjs:59-61`) ;
4. en cas d'erreur d'exécution, poste `{ error }` au lieu du verdict
   (`runner.mjs:63-66`).

`main` (`runner.mjs:84-111`) boucle poll-claim-execute-report jusqu'à `SIGTERM`/
`SIGINT` ou, en mode `RUNNER_ONCE=1`, après un job (`runner.mjs:89-110`). Une
erreur de traitement est loguée et la boucle attend `pollMs` avant de reprendre
(`runner.mjs:100-104`).

Tests : « processOne executes a claimed run and posts a verdict (labTarget +
runner tagged) », « processOne reports an execution error back to the control
plane », « processOne returns null when the queue is empty (204) »
(`test/runner.test.mjs`).

## Sécurité (propriétés du code)

- **Fail-closed** sans endpoint + jeton (`runner.mjs:75-78`).
- **Entrée réduite au nom de scénario** fourni par la file gouvernée ; aucun
  host/débit/durée arbitraire (`runner.mjs:9-11,58`).
- Le trafic reste borné par les caps du lab, puisque l'exécution passe par
  `runScenario` → scénarios allowlistés (`runner.mjs:13,58`).

## Lancement

`npm run runner` → `node runner.mjs` (`package.json`), typiquement :

```bash
BENCH_API_URL=https://shieldtest.internal \
BENCH_RUNNER_TOKEN=<jeton> \
RUNNER_ID=lab-runner-1 \
npm run runner            # RUNNER_ONCE=1 pour un seul job
```

API exportée (pour tests/intégration) : `{ claimNext, postResult, processOne,
configFromEnv }` (`runner.mjs:21,33,48,69`).
