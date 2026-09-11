# Référence des serveurs — ShieldTest Lab

Documentation détaillée de chaque processus (« serveur ») du banc. Chaque fiche
est **ancrée au code source** : toute valeur (port, variable d'env, endpoint,
plafond, métrique) est citée en `fichier:ligne` et vérifiée dans le code, jamais
rédigée de mémoire. Quand le code ne précise pas une chose, la fiche l'écrit
explicitement (« non spécifié dans le code ») plutôt que d'inventer une valeur.

> Méthode et périmètre de vérification : voir [`../COVERAGE.md`](../COVERAGE.md).

## Les serveurs

| Serveur | Protocole d'écoute | Port défaut | Métriques | Source | Fiche |
| --- | --- | --- | --- | --- | --- |
| Target (victime UDP) | UDP | `9002` | `9102` (compose) | `target/receiver.mjs` | [target.md](target.md) |
| Synthetic reflector | UDP | `9001` | `9101` (compose) | `synthetic-reflector/server.mjs` | [synthetic-reflector.md](synthetic-reflector.md) |
| Scrubber (mitigation) | UDP | `9005` | `9105` (compose) | `scrubber/server.mjs` | [scrubber.md](scrubber.md) |
| TCP target (victime TCP) | TCP | `9003` | non défini en compose | `tcp-target/receiver.mjs` | [tcp-target.md](tcp-target.md) |
| Console (UI loopback) | HTTP | `9110` | s/o | `console/server.mjs` | [console.md](console.md) |
| Runner (dispatch gouverné) | client HTTP sortant | s/o | s/o | `runner.mjs` | [runner.md](runner.md) |

Le **generator** (`generator/generate.mjs`) et le **tcp-generator**
(`tcp-generator/generate.mjs`) sont des clients (émetteurs), pas des serveurs ;
ils sont décrits dans les fiches Target/Reflector et TCP target comme sources de
trafic, et détaillés côté variables d'env dans
[`../reference/environment.md`](../reference/environment.md).

## Tables transverses

- [Ports & réseau](../reference/ports-and-network.md) — matrice ports / IP Compose / réseau isolé.
- [Variables d'environnement](../reference/environment.md) — catalogue complet avec défauts et bornes.
- [Endpoints HTTP](../reference/http-endpoints.md) — routes exposées par chaque serveur.
- [Métriques Prometheus](../reference/metrics.md) — noms `shieldtest_*` réels relevés dans le code.

## Garde-fou commun : `lib/net-guard.mjs`

Trois serveurs/clients qui émettent de l'UDP (reflector, scrubber, generator)
passent leur adresse de destination par `assertLabAddressInPrefix`
(`lib/net-guard.mjs:41`). Ce garde n'accepte qu'une IPv4 privée/loopback
(RFC1918 ou `127/8`, `lib/net-guard.mjs:11-24`) et ne peut **pas** être élargi
par configuration : un préfixe `LAB_CIDR_PREFIX` vide ou absent laisse le garde
dur en place (`lib/net-guard.mjs:44`). Détail dans chaque fiche, section
« Sécurité ».
