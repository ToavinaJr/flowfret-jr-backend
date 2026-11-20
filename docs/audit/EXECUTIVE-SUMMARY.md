# Synthèse de l'audit — FlowFret

**Date** : 2026-11-19. **Périmètre** : `backend/` (NestJS 11, GraphQL, Prisma 7, workers Python) et `frontend/` (React 18, Vite 8, TypeScript). **Nature** : audit en lecture seule, aucune correction appliquée.

## État général

FlowFret est une plateforme sociale et pédagogique pour guitaristes (lecteur musical, paroles, transcription, séparation voix/instruments, playlists, cours, chat, administration). Le code est **globalement soigné et défensif**, et le chantier de remédiation du 2026-11-18 a déjà traité plusieurs points (SSRF Tononkira, quotas d'upload, verrous du chat, épinglage des actions CI). Les écarts viennent surtout de l'**hygiène de la chaîne de livraison**, pas de failles applicatives béantes.

Niveau de maturité technique : **intermédiaire avancé**. La conception sécurité est bonne ; la CI est rouge et plusieurs tests échouent, ce qui empêche de s'appuyer sur elle.

## Chiffres clés

| Indicateur | Valeur |
|---|---|
| Anomalies | 39 : **0 critique**, 2 élevées, 10 moyennes, 20 faibles, 7 informatives |
| Backend : lint | 221 erreurs locales (220 de fins de ligne) ; CI non concernée |
| Backend : tests | 412 réussis / 4 en échec (416) ; couverture 53,7 % des instructions, 31,1 % des fonctions |
| Frontend : lint `src/` | 0 erreur ; `eslint .` : 14 erreurs venant de `films/` |
| Frontend : tests | 207 réussis / 7 en échec (214) |
| Python : tests | 26 réussis (transcription 10, stems 12, chords 4) |
| Dépendances backend | 44 avis (3 critical, 21 high, 18 moderate, 2 low) ; frontend : 4 moderate |
| Compose | `docker compose config -q` valide (avec et sans surcharge VPS) |

## Réponses aux 13 questions

1. **Comprends-tu l'architecture ?** Oui, cartographiée dans `PROJECT-ARCHITECTURE.md` : un frontend SPA, une API NestJS (GraphQL + REST + Socket.IO), PostgreSQL, Redis/BullMQ et 3 workers Python.
2. **Fonctionnalités réellement implémentées ?** La grande majorité oui (voir `FUNCTIONAL-AUDIT.md`). Exceptions : vérification d'e-mail (code mort), collaboration sur les playlists (backend seul), analyse d'accords neuronale (non déployable en conteneur).
3. **Communications cohérentes ?** Les 114 champs racine GraphQL utilisés par le frontend existent tous côté backend. Les champs imbriqués ne sont pas validés automatiquement (pas de génération de types).
4. **Application sécurisée ?** Bonne base (voir `SECURITY-AUDIT.md` § contrôles positifs) mais **dépendances de production vulnérables** (SEC-01) et quelques défauts moyens (e-mail non vérifié, cache de transcription empoisonnable).
5. **Backend robuste ?** Oui sur la conception (validation stricte, quotas, transactions, limitation de débit). Couverture de tests faible sur les points d'entrée.
6. **Frontend conforme ?** Oui : TypeScript strict, 0 `any`, 0 `console.*`, 0 `dangerouslySetInnerHTML`, jeton d'accès en mémoire. Réserves : tests périmés, fichiers volumineux.
7. **Services Python fiables ?** Tests verts mais minces ; un chargement de modèle par `pickle` (SEC-05) et dépendances partiellement non épinglées.
8. **Docker correctement configuré ?** Bien : utilisateur non-root, `cap_drop: ALL`, `no-new-privileges`, limites mémoire/CPU, ports liés à `127.0.0.1`. Manques : healthchecks des workers, épinglage d'une image, secrets partagés, worker d'accords absent.
9. **Données protégées ?** Mots de passe `bcrypt`, jetons de refresh hachés (SHA-256), cookie `HttpOnly`/`Secure`. Pas de sauvegarde documentée.
10. **Tests suffisants ?** Non : 53,7 % de couverture backend, résolveurs/contrôleurs critiques à 0 %, 11 tests en échec au total.
11. **Déployable en production ?** **Pas en l'état** : la CI doit redevenir verte et SEC-01 doit être corrigé. Les autres points ne bloquent pas.
12. **Risques majeurs ?** SEC-01, CI-01, SEC-02, SEC-03, FUNC-01.
13. **Premières corrections ?** Voir `REMEDIATION-ROADMAP.md` (P0 : SEC-01, CI-01, tests périmés).

## Blocages à la mise en production

1. `bun audit --audit-level=high` échoue : la CI backend ne peut pas passer (SEC-01).
2. La CI frontend échoue (lint de `films/` et 7 tests) : CI-01 et TEST-02.

## Corrections obligatoires

SEC-01, CI-01, TEST-02, TEST-04, SEC-02 (décision produit : vérifier ou retirer), SEC-03.

## Améliorations recommandées

FUNC-01, SEC-07/08/09 (limitation de débit), DOCKER-01/02, TEST-01, DB-01, OPS-01 (sauvegardes), ARCH-01/02.

## Limites de cet audit

- **Application non exécutée** : aucun parcours utilisateur réel, aucun appel à Audius, Spotify, YouTube, LRCLIB, SendGrid, Cloudinary.
- **Non exécuté** : tests E2E Playwright (frontend) et `test:e2e` (backend, requiert PostgreSQL et Redis), build Docker (images lourdes avec PyTorch), base de données.
- **Outils absents** : `pip-audit`, `ruff`, `mypy`, `bandit`, `gitleaks`, `trivy`, `pytest` ne sont pas installés. Substituts : `bun audit`, `python -m unittest`, recherche de motifs de secrets par expressions régulières (aucune occurrence).
- La note chiffrée (voir `AUDIT-METRICS.md`) **n'est ni une certification de sécurité ni une garantie de qualité**.
- Le dossier racine `guitare/` n'est pas un dépôt git (chaque sous-projet a le sien) : `docs/audit/` n'y est donc pas versionné tant qu'il n'est pas copié dans un dépôt.
