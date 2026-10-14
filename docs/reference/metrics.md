# Référence : métriques Prometheus

Tous les noms `shieldtest_*` réellement émis par le code, relevés dans les
fonctions `renderMetrics()`. Exposition au format texte Prometheus
`version=0.0.4`, sur `METRICS_PORT` de chaque serveur.

## Target (`target/receiver.mjs`)

| Métrique | Type | Signification |
| --- | --- | --- |
| `shieldtest_target_packets_total` | counter | Paquets reçus |
| `shieldtest_target_bytes_total` | counter | Octets reçus |
| `shieldtest_target_avg_pps` | gauge | Paquets/s moyens depuis le démarrage |
| `shieldtest_target_avg_bps` | gauge | Bits/s moyens depuis le démarrage |

## Reflector (`synthetic-reflector/server.mjs`)

Globales :

| Métrique | Type | Signification |
| --- | --- | --- |
| `shieldtest_reflector_requests_total` | counter | Requêtes reçues |
| `shieldtest_reflector_input_bytes_total` | counter | Octets reçus |
| `shieldtest_reflector_output_packets_total` | counter | Paquets émis vers la cible |
| `shieldtest_reflector_output_bytes_total` | counter | Octets émis vers la cible |
| `shieldtest_reflector_bap` | gauge | Facteur d'amplification d'octets (output/input) |
| `shieldtest_reflector_packet_amplification` | gauge | Amplification de paquets (output/requests) |

Par profil (label `{profile="..."}`, borné à l'allowlist ∪ `other`) :

| Métrique | Type |
| --- | --- |
| `shieldtest_reflector_profile_requests_total` | counter |
| `shieldtest_reflector_profile_input_bytes_total` | counter |
| `shieldtest_reflector_profile_output_packets_total` | counter |
| `shieldtest_reflector_profile_output_bytes_total` | counter |

## Scrubber (`scrubber/server.mjs`)

| Métrique | Type | Signification |
| --- | --- | --- |
| `shieldtest_scrubber_received_total` | counter | Paquets reçus |
| `shieldtest_scrubber_forwarded_total` | counter | Paquets transférés à la cible |
| `shieldtest_scrubber_dropped_total` | counter | Paquets jetés par la mitigation |
| `shieldtest_scrubber_dropped_legit_total` | counter | Paquets légitimes jetés (collatéral) |
| `shieldtest_scrubber_mitigating` | gauge | Mitigation engagée (1/0) |
| `shieldtest_scrubber_detection_delay_seconds` | gauge | Délai mesuré avant engagement |
| `shieldtest_scrubber_collateral_pct` | gauge | Part des paquets jetés qui étaient légitimes |
| `shieldtest_scrubber_effective_ceiling_pps` | gauge | Plafond de transfert courant (bougé par `adaptive`) |
| `shieldtest_scrubber_strategy{strategy="..."}` | gauge | Stratégie active (=1 pour le label actif) |

## TCP target (`tcp-target/receiver.mjs`)

| Métrique | Type | Signification |
| --- | --- | --- |
| `shieldtest_tcp_target_accepted_total` | counter | Connexions acceptées |
| `shieldtest_tcp_target_refused_total` | counter | Connexions délestées (table pleine) |
| `shieldtest_tcp_target_concurrent_peak` | gauge | Pic de connexions simultanées |
| `shieldtest_tcp_target_saturation_pct` | gauge | Part des connexions offertes délestées |

> `avgCps` existe dans l'objet `metrics` du TCP target mais n'est **pas** exposé
> en Prometheus (`tcp-target/receiver.mjs`).

## Console / Runner

Aucune métrique Prometheus : la console expose du JSON applicatif
(`/api/health`, `/api/scenarios`) et le runner est un client sortant.
