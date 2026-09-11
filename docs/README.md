# Documentation — ShieldTest Lab

Point d'entrée de la doc du banc. Toute la doc serveurs est **ancrée au code**
(chaque valeur citée en `fichier:ligne`) ; la méthode est décrite dans
[`COVERAGE.md`](COVERAGE.md).

## Serveurs (détail par processus)

- [Index des serveurs](servers/README.md)
- [Target (victime UDP)](servers/target.md)
- [Synthetic reflector](servers/synthetic-reflector.md)
- [Scrubber (mitigation)](servers/scrubber.md)
- [TCP target (victime TCP)](servers/tcp-target.md)
- [Console (UI loopback)](servers/console.md)
- [Runner (dispatch gouverné)](servers/runner.md)

## Références transverses

- [Ports & réseau](reference/ports-and-network.md)
- [Variables d'environnement](reference/environment.md)
- [Endpoints HTTP](reference/http-endpoints.md)
- [Métriques Prometheus](reference/metrics.md)

## Conception & sûreté

- [Network lab — design & rationale de sûreté](network-lab.md)
- [Contrat inter-dépôts (banc ↔ plan de contrôle)](cross-repo-contract.md)
- [Couverture & méthode de la doc](COVERAGE.md)

## Voir aussi

- `../README.md` — vue d'ensemble et démarrage rapide.
- `../CLAUDE.md` — guide contributeurs/agents et règles de sûreté.
