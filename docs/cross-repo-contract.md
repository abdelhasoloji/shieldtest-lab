# Contrat inter-dépôts : banc `shieldtest-lab` ↔ plan de contrôle

Les deux dépôts ne se rejoignent **que** par un contrat gouverné, en lecture
seule — **jamais** par un chemin d'attaque en direct. Ce banc est le seul
composant qui émet du trafic synthétique de classe C ; le plan de contrôle ne
touche jamais le réseau de production et n'ouvre aucun socket d'amplification.
Cette fiche décrit le contrat **côté banc** ; la fiche miroir côté plan de
contrôle est dans `Ddostester/docs/cross-repo-contract.md`.

## Les deux dépôts

| Dépôt | Rôle | Remote |
| --- | --- | --- |
| shieldtest-lab (ce dépôt) | Banc synthétique isolé, seul émetteur classe C | `github.com/abdelhasoloji/shieldtest-lab` |
| Ddostester | Plan de contrôle : gouvernance, mesure, scoring | `github.com/abdelhasoloji/Ddostester` |

## Canal 1 — Dispatch gouverné

Le CISO enregistre une demande dans le plan de contrôle ; **ce banc** la réclame,
l'exécute, et reposte un verdict de classe C en lecture seule.

| Étape | Côté banc (ce dépôt) | Côté plan de contrôle |
| --- | --- | --- |
| Réclamation | `runner.mjs:22-27` → `POST {BENCH_API_URL}/api/bench/runs/next/claim` | `app.ts:1047-1054` |
| Exécution | `run-scenario.mjs` (scénario allowlisté, borné) | — |
| Verdict | `runner.mjs:34-38` → `POST .../api/bench/runs/:id/result` | `app.ts:1056-1118` |

- Le runner ne reçoit qu'un **nom de scénario allowlisté** et un label de cible,
  jamais un host/débit/durée (`runner.mjs:9-11`).
- **Fail-closed** sans `BENCH_API_URL` + `BENCH_RUNNER_TOKEN` (`runner.mjs:75-78`).
- Détail : [`servers/runner.md`](servers/runner.md).

## Canal 2 — Métriques exposées (le plan de contrôle lit)

Ce banc expose deux endpoints JSON que le plan de contrôle consomme en pull,
lecture seule.

| Endpoint (ce dépôt) | Renvoie | Consommé par |
| --- | --- | --- |
| scrubber `GET /protection` (`scrubber/server.mjs:249-253`) | `detectionTimeSec, mitigationTimeSec, strategy, source` | `PROTECTION_METRICS_URL` → `PollProtectionProvider` (plan de contrôle) |
| target `GET /telemetry` (`target/receiver.mjs:82-86`) | `nicRxMbps` | `TARGET_TELEMETRY_METRICS_URL` → `PollTargetTelemetryProvider` |

Les formes JSON sont verrouillées ici par
[`test/closed-loop.test.mjs`](../test/closed-loop.test.mjs) (« target /telemetry
JSON matches… », « scrubber /protection JSON matches… »). Détail des endpoints :
[`servers/scrubber.md`](servers/scrubber.md), [`servers/target.md`](servers/target.md).

## Propriétés de sûreté du contrat

- **Ce banc ne touche jamais la production** ; le plan de contrôle n'ouvre jamais
  de socket d'amplification.
- **Lecture seule** : verdict posté (classe C) + métriques lues en pull.
- **Fail-closed** des deux côtés (runner et dispatch).

## Voir aussi

- Fiches serveur du banc : [`servers/`](servers/README.md).
- Politique de classe C : `Ddostester/docs/drs-validation-policy.md`.
- Côté plan de contrôle : `Ddostester/docs/cross-repo-contract.md` et
  `Ddostester/docs/servers/`.
