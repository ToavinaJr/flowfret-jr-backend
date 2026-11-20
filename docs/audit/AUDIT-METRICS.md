# Tableau de bord de l'audit

> Les notes ci-dessous sont un **jugement argumenté** fondé sur les observations et vérifications de cet audit. Elles ne constituent ni une certification de sécurité, ni une garantie de qualité. La confiance est faible pour les domaines non mesurés (performance, Python, charge).

## Critères de criticité

| Niveau | Critère appliqué |
|---|---|
| CRITICAL | Compromission, perte de données ou contournement d'authentification **démontré** |
| HIGH | Problème majeur de sécurité ou de fiabilité, ou blocage de la chaîne de livraison, avec preuve |
| MEDIUM | Défaut significatif de qualité, d'intégrité, de couverture ou de fonctionnalité, avec preuve |
| LOW | Mauvaise pratique ou défaut limité en impact |
| INFO | Constat ou recommandation sans défaut démontré |

Les avis automatisés classés « critical » (`proxy-addr`, `handlebars`) ont été **reclassés** : le premier concerne une configuration non utilisée (`trust proxy` par nombre de sauts), le second n'est pas présent dans l'image de production.

## Anomalies

| Niveau | Nombre | Identifiants |
|---|---:|---|
| CRITICAL | 0 | — |
| HIGH | 2 | SEC-01, CI-01 |
| MEDIUM | 10 | SEC-02, SEC-03, FUNC-01, FUNC-02, DOCKER-01, TEST-01, TEST-04, REPO-01, I18N-01, TEST-02 |
| LOW | 20 | SEC-04 à SEC-14, DB-01, DB-02, DOCKER-02, BUILD-01, QUAL-01, I18N-02, ARCH-01, ARCH-02, ARCH-03 |
| INFO | 7 | CI-02, CI-03, OPS-01, PERF-01, DB-03, DB-04, DB-05 |
| **Total** | **39** | |

## Notes par domaine (sur 100)

| Domaine | Note | Justification |
|---|---:|---|
| Architecture | 78 | Couches nettes, modules cohérents, garde-fous globaux ; retranchements pour fichiers volumineux, surface inutilisée (44 opérations), état en mémoire |
| Frontend | 80 | TypeScript strict, 0 `any`, 0 erreur de lint dans `src`, CSP, accessibilité de base, découpage par route ; retranchements pour 7 tests en échec, FUNC-01, `TeachingPage` de 1 242 lignes |
| Backend | 74 | Validation et quotas rigoureux, transactions, limitation de débit ; retranchements pour couverture 53,7 % / 31,1 % (fonctions), 4 tests en échec, `noImplicitAny` désactivé, dépendances vulnérables |
| Python | 62 | Appels de processus sûrs, limites de ressources ; retranchements pour `pickle`, tests minces, outils de qualité non exécutés, versions non épinglées |
| Sécurité | 68 | Contrôles solides (jetons hachés, `Origin`, RBAC, SSRF) ; retranchements pour SEC-01 (HIGH), SEC-02 et SEC-03 (MEDIUM), absence de DAST et de scan de secrets sur l'historique |
| Base de données | 80 | Index et contraintes adaptés, suppression logique, concurrence maîtrisée ; retranchements pour absence de purge, de sauvegarde documentée, script de migration de contournement ; base non inspectée |
| Docker et DevOps | 70 | Conteneurs durcis, actions épinglées, `pip-audit` ; retranchements pour CI rouge, pas de scan d'image, worker d'accords absent, secrets partagés |
| Tests | 55 | Nombreux tests orientés comportement ; retranchements pour 11 échecs, 31 % de fonctions couvertes, résolveurs à 0 %, pas d'E2E en CI |
| Performance | 70 | Découpage de code, bundles raisonnables ; aucune mesure de charge ni de profilage (confiance faible) |
| Maintenabilité | 72 | Lisible et cohérent ; dette : gros fichiers, contrat GraphQL manuel, lint local bruité |
| Fonctionnalités | 80 | 16 / 25 implémentées et vérifiées par code et tests, 4 partielles, 5 non vérifiables, 0 cassée avérée |
| **Moyenne** | **72** | |

## Vérifications exécutées

| # | Commande | Où | Résultat |
|---|---|---|---|
| 1 | `npx tsc --noEmit` | backend | 0 erreur |
| 2 | `npx eslint "{src,apps,libs,test}/**/*.ts"` | backend | 221 erreurs (220 fins de ligne), 0 avertissement |
| 3 | `npx jest --coverage` | backend | 412 / 416 réussis, 4 échecs ; 91 suites dont 4 en échec ; couverture 53,65 % |
| 4 | `bun audit` | backend | 44 avis (3 / 21 / 18 / 2) |
| 5 | `npx tsc -b` | frontend | 0 erreur |
| 6 | `npx eslint .` | frontend | 14 erreurs, 1 141 avertissements (`src/` : 0 / 2) |
| 7 | `npx vitest run` | frontend | 207 / 214 réussis, 7 échecs |
| 8 | `npx vite build` | frontend | Réussi |
| 9 | `bun audit` | frontend | 4 avis modérés |
| 10 | `python -m unittest discover -s tests` | 3 workers | 26 tests, tous réussis |
| 11 | `docker compose config -q` | backend, base et surcharge VPS | Valide |
| 12 | Recherche de motifs de secrets (expressions régulières) | `src`, `*.yml`, `.github` | 0 occurrence |
| 13 | Corrélation des opérations GraphQL frontend / backend | scripts d'analyse | 114 utilisées, 0 manquante ; 44 non utilisées |
| 14 | Comptage des fichiers, lignes, index, relations | dépôt | voir `PROJECT-ARCHITECTURE.md` |

## Vérifications non exécutées

| Vérification | Motif |
|---|---|
| `pip-audit`, `ruff`, `mypy`, `bandit`, `gitleaks`, `trivy`, `pytest` | Outils absents de l'environnement |
| Backend `test:e2e` | Requiert PostgreSQL et Redis |
| Frontend `test:e2e` (Playwright) | Non lancé ; serveur de développement et données nécessaires |
| `docker build` des images | Coût (PyTorch, ONNX) ; non requis pour l'audit statique |
| Application réelle, fournisseurs externes, base de données | Hors périmètre de l'audit statique |
| Historique git complet (secrets) | Pas de `gitleaks` ; seule la liste des fichiers suivis a été contrôlée |
| `npm audit` | Remplacé par `bun audit` (le projet utilise `bun.lock`) |

## Couverture backend (instructions)

| Module | Couverture |
|---|---:|
| `common` | 70,4 % |
| `playlists` | 67,3 % |
| `auth` | 64,7 % |
| `transcriptions` | 64,5 % |
| `notifications` | 61,8 % |
| `stems` | 60,9 % |
| `friendships` | 60,2 % |
| `integrations` | 58,6 % |
| `admin` | 57,6 % |
| `comments` | 53,5 % |
| `posts` | 53,4 % |
| `teaching` | 35,6 % |
| `chat` | 31,0 % |
| `uploads` | 28,4 % |
| `chord-transcriptions` | 10,3 % |
| **Total** | **53,65 %** |

## Indicateurs de dépôt

| Indicateur | Backend | Frontend |
|---|---|---|
| Fichiers source / tests | 271 / 91 | 280 / 66 |
| Commits | 255 (`master`) | 296 (`main`) |
| Taille du dépôt compressé | non mesurée | 3,26 Mio (`git count-objects`) |
| Modèles / migrations / index | 43 / 38 / 86 | — |
| Routes de page (`App.tsx`) | — | 48 balises `Route` |
| Opérations GraphQL | ≈ 170 déclarations (88 mutations) | 114 champs racine utilisés |
| Routes REST | 32 (8 contrôleurs) | — |
| Clés i18n | — | 1 658 par langue (2 mal rangées) |
