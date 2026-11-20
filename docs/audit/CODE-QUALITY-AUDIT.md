# Audit de la qualité du code et de la maintenabilité

## Taille du code

| Projet | Fichiers source (hors tests) | Fichiers de tests |
|---|---:|---:|
| Backend `src/` | 271 | 91 |
| Frontend `src/` | 280 | 66 |
| Workers Python | 11 (≈ 1 380 lignes) | 4 |

Plus gros modules backend (lignes hors tests) : `integrations` 4 685, `admin` 2 983, `transcriptions` 2 954, `teaching` 2 445, `auth` 1 645, `playlists` 1 523, `common` 1 382, `uploads` 1 284, `stems` 1 216, `chat` 1 043.

## Principes d'architecture

| Principe | Évaluation | Preuve |
|---|---|---|
| Séparation des responsabilités | Bonne | Résolveurs minces, services de commande, politiques, présentateurs, chargeurs ; frontend : pages / composants / hooks / services |
| Injection de dépendances | Bonne | Modules Nest ; `RateLimitGuard` crée toutefois lui-même son client Redis (`new Redis(...)`) |
| SRP | Moyenne | Fichiers volumineux concentrant plusieurs responsabilités (ARCH-01) |
| DRY | Bonne | Helpers partagés : quotas (`user-storage-quota`), `AdminListPage`, `ScrollingTrackText`, `NAV_SECTIONS` unique pour tous les menus |
| KISS / YAGNI | Moyenne | 44 opérations GraphQL non utilisées (SEC-14), vérification d'e-mail inatteignable (SEC-02), collaboration de playlists sans interface (FUNC-02) : code construit avant son usage |
| État mutable global | À surveiller | `ChatGateway.allowedOrigins` statique ; caches et drapeaux en mémoire (`ChordAnalysisService`) ; contraire à `AGENT.md` |
| Clean Architecture / DDD | Partielle | Politiques de domaine (`postPolicy`, `profilePolicy`) et services, sans couche domaine pure ; adapté à la taille du projet |

## Mesures de dette technique

| Mesure | Valeur |
|---|---|
| `any` explicite (frontend / backend) | 0 / 0 |
| `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck` | 0 |
| `eslint-disable` (frontend / backend) | 1 / 2 |
| `console.*` en code de production | 0 |
| `TODO` / `FIXME` hors code tiers | 0 (un seul `TODO`, dans `models/btc/utils/hparams.py`) |
| `dangerouslySetInnerHTML` | 0 |
| Dépendances circulaires | non mesurées (pas d'outil installé) |
| Imports et variables inutilisés (frontend) | 0 (`noUnusedLocals`, `noUnusedParameters`) ; backend : lint à 0 règle `no-unused-vars` en erreur |
| Backend TypeScript | non strict : `noImplicitAny: false`, `strictBindCallApply: false` (BUILD-01) |
| Fichiers de plus de 500 lignes (non test) | 10 (`TeachingPage` 1 242, `teaching.resolver` 899, `chat.service` 674, `ChatPage` 657, `teaching-lessons.resolver` 652, `admin.types` 597, `uploads.controller` 589, `AdminEntityManagerPage` 560, `admin-entity.service` 533, `usePlaybackEngine` 510) |

## Maintenabilité

Facilité d'évolution : **bonne dans l'ensemble**. Forces : typage strict côté client, validation d'environnement, nomination cohérente, tests nombreux, journaux structurés, documentation de remédiation tenue à jour (`backend/docs/audit-remediation-plan.md`).

Points faibles :
1. **Fichiers charnières trop gros** : `TeachingPage.tsx` (1 242 lignes, formulaires, listes, calendrier, matériaux dans un composant) et `teaching.resolver.ts` (899).
2. **Contrat GraphQL manuel** : 114 champs racine écrits en chaînes sans génération de types (ARCH-02).
3. **Lint local bruité** : 221 erreurs de fins de ligne sur la machine Windows (`core.autocrlf=true`, pas de `.gitattributes`, `.prettierrc` sans `endOfLine`) ; la CI Linux n'est pas touchée (QUAL-01).
4. **Contenu corrompu** : mojibake dans 3 messages serveur (I18N-02) ; 2 clés i18n mal rangées (I18N-01).
5. **Dépôt frontend alourdi** par des médias et un projet vidéo (REPO-01).
6. **Documentation dispersée** : README racine, deux README, `docs/superpowers`, `backend/docs` ; la racine n'est pas un dépôt git, donc ces documents ne sont pas versionnés avec le code (voir CI-03).
7. **Divergence d'environnement** : Node 22 (image) / Node 24 (poste) ; Bun pour exécuter en production alors que l'image est Node.

## Évolution récente observée

Le projet change vite : navigation réorganisée (« Bibliothèque », « Recommandations », « Statistiques »), nouveaux modules (favoris, collaboration, historique de recherche). Les tests de navigation n'ont pas suivi (TEST-02) : un garde-fou « tests verts avant fusion » rendrait ces dérives visibles immédiatement.

## Recommandations

1. Découper `TeachingPage.tsx` et `teaching.resolver.ts` par sous-domaines (cours, inscriptions, calendrier, matériaux).
2. Ajouter `.gitattributes` (`* text=auto eol=lf`), `.editorconfig` et `endOfLine: "lf"` à Prettier.
3. Générer les types GraphQL (par exemple depuis le schéma auto-généré `autoSchemaFile`).
4. Activer `strict` progressivement côté backend (d'abord `noImplicitAny` module par module).
5. Supprimer ou brancher les opérations et écrans non utilisés.
6. Consigner les décisions d'architecture (ADR) dans le dépôt versionné.
