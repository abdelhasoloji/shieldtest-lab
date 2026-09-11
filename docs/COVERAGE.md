# Couverture & méthode de la documentation serveurs

Ce document explique **comment** la doc des serveurs a été produite et **ce qui
est / n'est pas** couvert, pour qu'un lecteur puisse faire confiance à chaque
affirmation ou la re-vérifier en une commande.

## Méthode anti-hallucination

1. **Tout est ancré au code.** Chaque valeur (port, variable d'env, endpoint,
   plafond, métrique) est citée en `fichier:ligne` et provient d'une lecture du
   code source, jamais de mémoire.
2. **Valeurs extraites, pas rédigées.** Les tableaux ont été construits à partir
   de `grep`/lecture directe des fichiers, puis relus.
3. **Vérification croisée avec les tests.** Un invariant de sécurité n'est
   présenté comme garanti que s'il correspond à un test nommé. La suite
   `node --test "test/*.test.mjs"` passe **51/51** (exécutée le 2026-09-11,
   Node v26.8.1).
4. **Aucune extrapolation.** Ce que le code ne dit pas est marqué « non spécifié
   dans le code » plutôt que deviné.

## Sources vérifiées

| Fichier | Rôle | Lu intégralement |
| --- | --- | --- |
| `target/receiver.mjs` | Target UDP | oui |
| `synthetic-reflector/server.mjs` | Reflector | oui |
| `scrubber/server.mjs` | Scrubber | oui |
| `tcp-target/receiver.mjs` | TCP target | oui |
| `console/server.mjs` | Console | oui |
| `runner.mjs` | Runner | oui |
| `generator/generate.mjs` | Generator (client) | oui |
| `profiles.mjs` | Profils synthétiques | oui |
| `lib/net-guard.mjs` | Garde d'adresse | oui |
| `docker-compose.yml` | Topologie | oui |
| `test/*.test.mjs` | Noms de tests, imports | oui (noms + imports) |

## Invariants de sécurité → test qui les verrouille

| Invariant | Test (fichier) |
| --- | --- |
| Garde d'adresse rejette une IP publique | `assertLabAddress throws for public addresses` (`test/net-guard.test.mjs`) |
| Un préfixe vide n'ouvre pas le garde | `an EMPTY lab prefix cannot open the gate to a public IP` (`test/net-guard.test.mjs`) |
| Reflector rejette une cible publique | `reflector rejects a public target (hard private-range gate)` (`test/fuzz-caps.test.mjs`) |
| Reflector clampe une requête surdimensionnée | `reflector clamps a maliciously oversized request` (`test/fuzz-caps.test.mjs`) |
| Caps tiennent sous fuzzing | `caps hold under fuzzed caps and adversarial requests` (`test/fuzz-caps.test.mjs`) |
| Scrubber rejette une cible publique + mauvais ceiling | `rejects a public forwarding target (hard gate) and a bad ceiling` (`test/scrubber.test.mjs`) |
| Scrubber engage la mitigation après le délai | `engages mitigation after the detection delay and records it` (`test/scrubber.test.mjs`) |
| Stratégies blocklist/adaptive | `test/mitigation-strategies.test.mjs` |
| TCP target délestte à saturation | `tcp target sheds connections once the state table is full` (`test/tcp.test.mjs`) |
| TCP generator rejette une cible publique | `tcp-generator refuses a public target` (`test/tcp.test.mjs`) |
| Console refuse un bind non-loopback | `refuses a non-loopback bind unless explicitly allowed` (`test/console.test.mjs`) |
| Console n'accepte qu'un scénario nommé | `POST /api/run rejects anything but a named scenario` (`test/console.test.mjs`) |
| Runner fail-closed sans endpoint+token | `configFromEnv fails closed without endpoint + token` (`test/runner.test.mjs`) |
| Generator rejette un reflector public / profil inconnu | `generator rejects a public reflector`, `generator rejects an unknown profile` (`test/generator.test.mjs`) |
| Formes JSON des connecteurs pull | `target /telemetry ...`, `scrubber /protection ...` (`test/closed-loop.test.mjs`) |

## Points « non spécifiés dans le code » (pas d'invention)

- **TCP target sans service Compose** : `tcp-target/receiver.mjs` n'a pas d'entrée
  dans `docker-compose.yml` ; aucun `METRICS_PORT`/IP ne lui est assigné en
  Compose. Il est exercé par les tests et le scénario `tcp_synflood`.
- **Console sans service Compose** : la console tourne en pur Node sur l'hôte, pas
  comme conteneur.
- **`avgCps` du TCP target** : présent dans l'objet `metrics`
  (`tcp-target/receiver.mjs:68-71`) mais **non exposé** en Prometheus.
- **Métriques désactivées par défaut** : `METRICS_PORT` vaut `0` par défaut dans
  le code de chaque serveur UDP/TCP ; ce sont les valeurs Compose (`9101/9102/
  9105`) qui les activent.

## Écarts code ↔ code (nuances relevées, non des bugs)

- Le **reflector** teste `req.url === '/metrics'` sans retirer la query string
  (`synthetic-reflector/server.mjs:189`), alors que target, scrubber et TCP target
  comparent le **chemin** après `split('?')[0]` (`target/receiver.mjs:78`,
  `scrubber/server.mjs:245`, `tcp-target/receiver.mjs:98`). Une requête
  `/metrics?x=1` renverrait donc 404 sur le reflector uniquement. Fait observé,
  pas corrigé.

## Contrat inter-dépôts (désormais documenté)

Le lien vers le plan de contrôle `Ddostester`, auparavant simplement référencé,
est maintenant documenté et **vérifié des deux côtés** dans
[`cross-repo-contract.md`](cross-repo-contract.md) : endpoints du runner
(`app.ts:1047-1118` côté plan de contrôle ↔ `runner.mjs:22-38` ici) et
connecteurs pull (`/protection`, `/telemetry` ici ↔ `PollProtectionProvider` /
`PollTargetTelemetryProvider` côté plan de contrôle). Les fiches serveur du plan
de contrôle sont dans `Ddostester/docs/servers/`.

## Comment re-vérifier

```bash
npm test                      # 51/51 attendus
grep -rnE "LISTEN_PORT|METRICS_PORT|process.env" .   # revoir ports & env
```

Chaque fiche cite ses lignes ; ouvrir le fichier source à la ligne indiquée
confirme la valeur.
