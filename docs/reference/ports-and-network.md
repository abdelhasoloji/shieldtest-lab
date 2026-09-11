# Référence : ports & réseau

Toutes les valeurs sont tirées du code (`*.mjs`) et de `docker-compose.yml`.
« Défaut code » = valeur si aucune variable d'env ; « Compose » = valeur imposée
par le service dans `docker-compose.yml`.

## Ports d'écoute

| Serveur | Protocole | Port (défaut code) | Port métriques (défaut code) | Port Compose | Métriques Compose | Source code |
| --- | --- | --- | --- | --- | --- | --- |
| Target | UDP | `9002` | `0` (off) | `9002` | `9102` | `target/receiver.mjs:13-14` · `docker-compose.yml:20-21` |
| Reflector | UDP | `9001` | `0` (off) | `9001` | `9101` | `synthetic-reflector/server.mjs:27,33` · `docker-compose.yml:57-58` |
| Scrubber | UDP | `9005` | `0` (off) | `9005` | `9105` | `scrubber/server.mjs:20,26` · `docker-compose.yml:37-38` |
| TCP target | TCP | `9003` | `0` (off) | non défini | non défini | `tcp-target/receiver.mjs:15-16` |
| Console | HTTP | `9110` | s/o | non défini | s/o | `console/server.mjs:37` |
| Runner | — (client sortant) | s/o | s/o | s/o | s/o | `runner.mjs` |

Le port métriques `0` **désactive** l'endpoint HTTP correspondant
(`target/receiver.mjs:14`, `synthetic-reflector/server.mjs:33`,
`scrubber/server.mjs:26`, `tcp-target/receiver.mjs:16`).

## Adresses IP (réseau Compose)

Réseau `shieldtest_lab`, sous-réseau `192.168.100.0/24`, `internal: true` (aucune
sortie Internet gérée par Docker), **aucun port hôte publié**
(`docker-compose.yml:115-121`).

| Service | IPv4 fixe | Rôle | Source |
| --- | --- | --- | --- |
| `lab-target` | `192.168.100.99` | Victime UDP | `docker-compose.yml:22-24` |
| `lab-scrubber` | `192.168.100.60` | Mitigation (optionnel) | `docker-compose.yml:45-47` |
| `lab-reflector` | `192.168.100.50` | Réflecteur | `docker-compose.yml:67-69` |
| `lab-generator` | `192.168.100.10` | Émetteur (attaque) | `docker-compose.yml:91-93` |
| `lab-legit` | `192.168.100.11` | Émetteur (trafic légitime) | `docker-compose.yml:111-113` |

## Chemin du trafic

- **Par défaut** : `lab-generator` → `lab-reflector` (`192.168.100.50:9001`) →
  `lab-target` (`192.168.100.99:9002`) (`docker-compose.yml:61,77-78`).
- **À travers le scrubber** : poser `LAB_REFLECTOR_TARGET=192.168.100.60` route
  le reflector vers `lab-scrubber:9005`, qui transfère (borné) vers le target
  (`docker-compose.yml:26-28,59-61`, `scrubber/server.mjs:21-22`).
- **Trafic légitime** : `lab-legit` émet en `MODE: legit` vers le scrubber
  (`192.168.100.60:9005`) pour mesurer le collatéral (`docker-compose.yml:95-106`).

## Garde d'adresse (défense en profondeur)

`lib/net-guard.mjs` refuse toute destination hors IPv4 privée/loopback (RFC1918
ou `127/8`) et ne peut être élargi par config (`lib/net-guard.mjs:11-24,41-48`).
Appliqué par le reflector (`synthetic-reflector/server.mjs:37`), le scrubber
(`scrubber/server.mjs:39`) et le generator (`generator/generate.mjs:55`).
