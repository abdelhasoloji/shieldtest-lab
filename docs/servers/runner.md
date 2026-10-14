# Serveur : Runner (dispatch gouverné)

**Source** : `runner.mjs` (119 lignes) · **Tests** : `test/runner.test.mjs`

## Rôle

Exécuteur isolé du dispatch de classe C de ShieldTest (`runner.mjs`). C'est
le **seul** composant qui émet du trafic d'amplification synthétique, et il tourne
**en dehors** du plan de contrôle : le plan de contrôle enregistre une demande de
run autorisée par le CISO et la sert ici ; ce runner la réclame, exécute le
scénario nommé en processus sur loopback (le lab), et **reposte un verdict de
classe C en lecture seule** (`runner.mjs`). Il ne reçoit qu'un **nom de
scénario allowlisté** et un label de cible, jamais un host/débit/durée arbitraire
(`runner.mjs`).

> Ce n'est pas un serveur qui écoute : c'est un **client HTTP sortant** qui
> interroge le plan de contrôle en boucle (poll-claim-execute-report). Aucun port
> d'écoute.

## Configuration (env)

`configFromEnv` (`runner.mjs`) :

| Variable | Défaut | Effet | Source |
| --- | --- | --- | --- |
| `BENCH_API_URL` | — (requis) | Base d'URL du plan de contrôle, slash final retiré | `runner.mjs` |
| `BENCH_RUNNER_TOKEN` | — (requis) | Jeton Bearer d'authentification | `runner.mjs` |
| `RUNNER_ID` | `lab-runner-<pid>` | Identifiant du runner | `runner.mjs` |
| `POLL_INTERVAL_MS` | `5000` (plancher 1000) | Intervalle de poll | `runner.mjs` |
| `RUNNER_ONCE` | `0` | `=1` : un seul job puis sortie | `runner.mjs` |

**Fail-closed** : sans `BENCH_API_URL` **et** `BENCH_RUNNER_TOKEN`, la config
jette et le runner ne fait rien (`runner.mjs`). Test « configFromEnv fails
closed without endpoint + token » (`test/runner.test.mjs`).

## Contrat HTTP avec le plan de contrôle

Toutes les requêtes portent `Authorization: Bearer <token>` et
`content-type: application/json` (`runner.mjs`).

| Appel | Méthode + endpoint | Comportement | Source |
| --- | --- | --- | --- |
| Réclamer le prochain run | `POST {apiUrl}/api/bench/runs/next/claim` | `204` → file vide (`null`) ; non-2xx → throw | `runner.mjs` |
| Poster le résultat | `POST {apiUrl}/api/bench/runs/{id}/result` | corps `{ verdict }` ou `{ error }` | `runner.mjs` |

## Boucle de traitement

`processOne` (`runner.mjs`) :
1. réclame un run ; `null` si la file est vide (`runner.mjs`) ;
2. exécute `runScenario(run.scenario)` (injectable en test) (`runner.mjs`) ;
3. construit le verdict en le taguant `labTarget` et `runner`, puis le poste
   (`runner.mjs`) ;
4. en cas d'erreur d'exécution, poste `{ error }` au lieu du verdict
   (`runner.mjs`).

`main` (`runner.mjs`) boucle poll-claim-execute-report jusqu'à `SIGTERM`/
`SIGINT` ou, en mode `RUNNER_ONCE=1`, après un job (`runner.mjs`). Une
erreur de traitement est loguée et la boucle attend `pollMs` avant de reprendre
(`runner.mjs`).

Tests : « processOne executes a claimed run and posts a verdict (labTarget +
runner tagged) », « processOne reports an execution error back to the control
plane », « processOne returns null when the queue is empty (204) »
(`test/runner.test.mjs`).

## Sécurité (propriétés du code)

- **Fail-closed** sans endpoint + jeton (`runner.mjs`).
- **Entrée réduite au nom de scénario** fourni par la file gouvernée ; aucun
  host/débit/durée arbitraire (`runner.mjs`).
- Le trafic reste borné par les caps du lab, puisque l'exécution passe par
  `runScenario` → scénarios allowlistés (`runner.mjs`).

## Lancement

`npm run runner` → `node runner.mjs` (`package.json`), typiquement :

```bash
BENCH_API_URL=https://shieldtest.internal \
BENCH_RUNNER_TOKEN=<jeton> \
RUNNER_ID=lab-runner-1 \
npm run runner            # RUNNER_ONCE=1 pour un seul job
```

API exportée (pour tests/intégration) : `{ claimNext, postResult, processOne,
configFromEnv }` (`runner.mjs`).
