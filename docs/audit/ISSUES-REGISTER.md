# Registre des anomalies

Audit réalisé le 2026-11-19 sur `backend/` (NestJS, Prisma, workers Python) et `frontend/` (React, Vite). **Aucun fichier de code n'a été modifié.** Les preuves citent un fichier, une commande ou un résultat de test réellement observé.

## Légende

- **Confirmé** : reproduit ou lu directement dans le code / la sortie d'un outil.
- **Risque** : conditions d'exploitation non démontrées.
- Criticité : CRITICAL, HIGH, MEDIUM, LOW, INFO (voir `AUDIT-METRICS.md` pour les critères).
- Complexité : S (< 2 h), M (< 1 j), L (> 1 j).

Aucune anomalie CRITICAL n'est confirmée. Les avis « critical » des outils (proxy-addr, handlebars) sont déclassés avec justification (SEC-01, SEC-12).

## Synthèse

| Niveau | Nombre |
|---|---:|
| CRITICAL | 0 |
| HIGH | 2 |
| MEDIUM | 10 |
| LOW | 20 |
| INFO | 7 |
| **Total** | **39** |

## HIGH

### SEC-01 — Dépendances de production vulnérables (backend)
- **Statut** : confirmé (vulnérabilités) / risque (atteignabilité).
- **Domaine** : sécurité, chaîne d'approvisionnement.
- **Emplacement** : `backend/bun.lock`, `backend/package.json`.
- **Preuve** : `bun audit` (backend) → `44 vulnerabilities (3 critical, 21 high, 18 moderate, 2 low)`. Chemins de production :
  - `axios@1.19.0` (via `@nestjs/axios`, `@sendgrid/mail`) : 7 avis *high* (SSRF par redirection, ReDoS, pollution de prototype), corrigés en `>=1.20.0`.
  - `follow-redirects@1.16.0` : 3 avis *high* (fuite d'en-têtes d'identification) ; corrigés en `>=1.16.2`.
  - `body-parser@2.3.0` : DoS (corps compressé), corrigé en `>=2.4.0`.
  - `undici@7.30.0` via `cheerio` : 4 avis *high*, corrigés en `>=7.30.1`.
  - `proxy-addr@2.0.7` : avis classé *critical* (usurpation d'IP via sous-réseau IPv4-mappé IPv6), corrigé en `>=2.0.8`.
- **Justification de la criticité** : plusieurs avis *high* sont sur le chemin d'exécution de production. Le seul avis *critical* applicable (`proxy-addr`) concerne une configuration par sous-réseau. `main.ts` utilise `trust proxy` à `1` (nombre de sauts), donc l'exploitation n'est pas démontrée. HIGH plutôt que CRITICAL.
- **Conséquence** : la CI backend exécute `bun audit --audit-level=high` (`backend/.github/workflows/ci.yml`), donc elle échoue à cette étape et masque tous les signaux suivants. Le plan du 2026-11-18 signalait déjà 25 avis ; le total est passé à 44.
- **Correction** : `bun audit fix`, puis relancer l'audit ; mettre à jour `axios`, `cheerio`, `@nestjs/platform-express` / `@apollo/server` pour tirer `body-parser`, `proxy-addr`.
- **Complexité** : M. **Dépendances** : tests de non-régression sur les appels HTTP sortants (Audius, LRCLIB, Genius, SendGrid, Cloudinary).

### CI-01 — La CI du frontend échoue structurellement
- **Statut** : confirmé (reproduit localement).
- **Emplacement** : `frontend/eslint.config.js:8` (`ignores: ["dist"]`), `frontend/package.json` (`validate`), `frontend/.github/workflows/ci.yml`.
- **Preuve** : `eslint .` produit **14 erreurs et 1141 avertissements**, dont 14 et 1139 viennent de `films/` (projet vidéo Remotion, 519 fichiers suivis par git). `frontend/src` seul : 0 erreur, 2 avertissements. Le test `bun run validate` enchaîne typecheck, lint, tests, build : il échoue au lint, puis aux 7 tests en échec (TEST-02).
- **Conséquence** : la CI est rouge pour une raison étrangère au produit ; une vraie régression passe inaperçue.
- **Correction** : ignorer `films/**` dans ESLint (ou extraire `films/` dans son propre dépôt, voir REPO-01).
- **Complexité** : S.


## MEDIUM

### SEC-02 — E-mail non vérifié à l'inscription ; flux de vérification mort
- **Statut** : confirmé.
- **Emplacement** : `backend/src/auth/auth.service.ts:70-87`, `auth.service.ts:51-62`.
- **Preuve** : `register()` crée l'utilisateur avec `status: UserStatus.ACTIVE` et renvoie directement une session. `UserStatus.PENDING` n'est jamais créé (une seule occurrence, dans la branche « compte existant »). `verifyEmail` / `resendVerificationEmail` et l'écran frontend « vérifier l'e-mail » sont inatteignables.
- **Scénario** : un tiers s'inscrit avec l'adresse d'une victime. La victime ne peut plus s'inscrire (erreur générique) et le compte contient un mot de passe choisi par l'attaquant.
- **Atténuation constatée** : la connexion Google ne rattache pas un compte existant par e-mail (`google-auth.service.ts:52-96` rejette), ce qui exclut le « pre-hijacking » par Google. La réinitialisation de mot de passe part vers l'adresse réelle.
- **Correction** : créer les comptes en `PENDING` et activer après vérification, ou retirer le code mort.
- **Complexité** : M.

### SEC-03 — Cache de transcription Spotify empoisonnable
- **Statut** : confirmé (code), exploitation non rejouée.
- **Emplacement** : `backend/src/transcriptions/transcription-audio-source.service.ts:35-45`, `transcriptions.repository.ts` (`findCompatible`), `transcription-workflow.service.ts` (`createOrGet`).
- **Preuve** : pour `SPOTIFY`, l'URL fournie par le client est acceptée si l'hôte est dans une liste blanche, sans lien avec `trackId`. Le cache est indexé par `(provider, trackId, langue, modèle, moteur)` et partagé : l'utilisateur suivant reçoit la transcription déjà créée.
- **Conséquence** : un utilisateur peut associer l'audio d'un morceau A au `trackId` d'un morceau B ; tous les autres voient les paroles erronées.
- **Correction** : dériver l'URL côté serveur depuis `trackId`, ou stocker/valider une empreinte de la source.
- **Complexité** : M.

### FUNC-01 — Déconnexion et perte de lecture sur échec transitoire du refresh
- **Statut** : confirmé (lecture du code).
- **Emplacement** : `frontend/src/services/graphqlClient.ts:56-59`, `backend/src/auth/auth-session.service.ts:61-67`.
- **Preuve** : `if (!response.ok || body.errors?.length || !session) { clearAuthSession(); return false; }` : toute réponse non-OK (429, 5xx, démarrage à froid) efface la session. Le jeton de refresh est à usage unique ; deux onglets qui rafraîchissent en même temps font échouer le second (`Refresh token has already been used.`).
- **Conséquence** : déconnexion inattendue ; `clearAuthSession` déclenche `clearPlaybackSession` et arrête la musique.
- **Correction** : n'effacer la session que sur 401 explicite ; sérialiser le refresh entre onglets (`navigator.locks`).
- **Complexité** : M.

### FUNC-02 — Collaboration sur les playlists : backend seul
- **Statut** : confirmé.
- **Preuve** : 6 opérations GraphQL (`setPlaylistCollaborator`, `revokePlaylistCollaborator`, `playlistCollaborators`, `myPlaylistInvitations`, `acceptPlaylistInvitation`, `declinePlaylistInvitation`) et 2 migrations (`20261116…`) n'ont aucun appelant dans `frontend/src`.
- **Conséquence** : fonctionnalité annoncée par le schéma mais inutilisable ; surface d'attaque sans valeur produit.
- **Correction** : implémenter l'interface ou retirer les opérations.
- **Complexité** : L.

### DOCKER-01 — Analyse d'accords non déployable avec les images fournies
- **Statut** : confirmé.
- **Preuve** : aucune occurrence de « chords » dans `Dockerfile*`, `docker-compose*.yml`, `render.yaml`. Les dépendances `workers/chords/requirements.txt` (torch, librosa, beat-this) ne sont installées dans aucune image. `ChordAnalysisConfigService.onModuleInit` exige des fichiers de modèles et `CHORD_ANALYSIS_ENABLED=true`.
- **Conséquence** : la fonction est activable en local seulement ; en conteneur elle échoue au démarrage si activée.
- **Correction** : ajouter une image/étape dédiée ou documenter l'exclusion.
- **Complexité** : M.

### TEST-01 — Couverture backend faible sur les points d'entrée
- **Statut** : confirmé.
- **Preuve** : `jest --coverage` → statements 53,65 %, branches 49,52 %, fonctions 31,09 %. Par module : chat 31,0 %, uploads 28,4 %, teaching 35,6 %, chord-transcriptions 10,3 %. Résolveurs et contrôleurs à 0 % : `chat.resolver`, `uploads.resolver`, `music.resolver`, `user-relations.resolver`, `lyrics.controller`, `chord-analysis.service`.
- **Conséquence** : les décorateurs d'autorisation (`@Roles`, `@Public`, `@RateLimits`) ne sont pas testés sur ces points d'entrée.
- **Complexité** : L.

### TEST-04 — 4 tests backend en échec
- **Statut** : confirmé.
- **Preuve** : `Test Suites: 4 failed, 87 passed`, `Tests: 4 failed, 412 passed` : `AppController › should return "Hello World!"`, `GeniusLyricsProvider › scrapes lyrics lines…`, `ListeningHistoryService › upserts a user track…`, `TeachingResolver workspace queries › exposes reserved seats…`.
- **Correction** : le premier est un test obsolète du gabarit Nest ; analyser les trois autres.
- **Complexité** : S à M.

### REPO-01 — Artéfacts et médias suivis dans le dépôt frontend
- **Statut** : corrigé.
- **Preuve** : les fichiers du projet vidéo et les résultats Playwright sont retirés de l’index Git; `/test-results/` est ignoré dans `.gitignore`.
- **Conséquence** : clone allégé et aucun artefact vidéo généré conservé dans le dépôt.
- **Complexité** : S.

### I18N-01 — Clés de traduction FR/EN incohérentes
- **Statut** : confirmé.
- **Emplacement** : `frontend/src/components/features/music/MusicSearchForm.tsx:75-89`.
- **Preuve** : `music.recentSearches` et `music.clearRecentSearches` n'existent qu'en anglais ; en français elles sont déclarées sous `admin.*`. Écart de clés : 2 seulement sur 1658.
- **Conséquence** : en français, la zone « recherches récentes » affiche les clés brutes.
- **Complexité** : S.

### TEST-02 — Tests frontend en échec (7 sur 214)
- **Statut** : confirmé.
- **Preuve** : `vitest run` → `Test Files 3 failed | 63 passed (66)`, `Tests 7 failed | 207 passed (214)`.
  - `FloatingMediaWindow.test.tsx` : 5 échecs (positionnement de fenêtre, `expected 296 to be less than 0`).
  - `constants/navigation.test.ts` et `pages/MenuPage.test.tsx` : 2 échecs, **tests périmés** après le remplacement de « Playlists » par « Bibliothèque » (`/library`).
- **Justification MEDIUM** : n'affecte pas directement le fonctionnement ou la sécurité, mais rend la CI permanente rouge avec CI-01.
- **Conséquence** : la suite n'est plus un filet de sécurité fiable (échec permanent toléré).
- **Correction** : mettre à jour les 2 tests de navigation ; analyser les 5 tests `FloatingMediaWindow` (régression de code ou de test).
- **Complexité** : S à M.

## LOW

| ID | Titre | Emplacement et preuve | Correction | Cplx |
|---|---|---|---|---|
| SEC-04 | Pas de détection de réutilisation du jeton de refresh | `auth-session.service.ts:61-67` : un jeton déjà utilisé est refusé mais la famille n'est pas révoquée | Révoquer tous les jetons de l'utilisateur à la réutilisation | M |
| SEC-05 | `torch.load(weights_only=False)` sur un modèle téléchargé | `workers/chords/analyze.py:35`, `setup_models.py` (téléchargement GitHub à révision fixée, sans somme de contrôle) | Vérifier un sha256 ; `weights_only=True` si possible | S |
| SEC-06 | Temps de réponse différent si l'utilisateur n'existe pas | `auth.service.ts` `login()` : retour avant `bcrypt.compare` quand `!user?.passwordHash` ; limité à 10 essais / 15 min | Comparer à un hash factice | S |
| SEC-07 | 28 mutations sans `@RateLimit` | post-interactions 8, teaching 17 (7+6+3+1), profiles 3, notifications 2, uploads (admin) 3, users 1, audit-logs 1 | Politique de débit par défaut | M |
| SEC-08 | `recordActivity` non limité (écriture illimitée dans `audit_logs`) | `audit-logs.resolver.ts` : action figée à `TRACK_LISTENED` mais aucun plafond | Limiter ou agréger | S |
| SEC-09 | Chat WebSocket sans limite par événement | `chat.gateway.ts` : `chat:join` fait une requête BDD à chaque appel ; statut du compte vérifié seulement à la connexion ; `allowedOrigins` statique mutable | Limiter les événements, état injecté | M |
| SEC-10 | Fichier de cookies YouTube réel sur disque | `backend/youtube-cookies.txt` (7 734 octets, domaines google.com / youtube.com) ; ignoré par `backend/.gitignore`, non suivi (`git ls-files`) ; **non exclu** par `.dockerignore` | Exclure du contexte Docker ; faire pivoter le compte si exposé | S |
| SEC-11 | Secrets transmis à tous les conteneurs | `docker-compose.yml` : `env_file: .env` pour backend, transcription-worker et stems-worker (SendGrid, Google, Cloudinary inutiles aux workers) | Fichiers d'environnement par service | S |
| SEC-12 | Avis « critical » `handlebars` (dev uniquement) | `ts-jest > handlebars` ; absent de l'image de production (`bun prune --production`) | Mettre à jour `ts-jest` | S |
| SEC-13 | Images et paquets non épinglés | `docker-compose.yml` : `brainicism/bgutil-ytdlp-pot-provider` sans tag ni digest ; `requirements.youtube.txt` : `bgutil-ytdlp-pot-provider` sans version ; `workers/chords` en plages | Épingler tag/digest et versions | S |
| SEC-14 | 44 opérations GraphQL non utilisées par le frontend | 158 opérations nommées détectées, 114 utilisées ; les 44 restantes (`users`, `uploads`, `createUpload`, `updateMe`…) sont protégées par rôle ou propriétaire mais élargissent la surface | Supprimer ou désactiver | M |
| DB-01 | Jetons expirés jamais purgés | `refresh_tokens`, `password_reset_tokens`, `email_verification_tokens` : seul `updateMany` (révocation) trouvé, aucun `deleteMany` ni tâche planifiée | Tâche de purge | S |
| DB-02 | Récupération de migration codée en dur dans le démarrage de production | `scripts/recover-known-migration.mjs` (lancé par `start:render`) : sur erreur `P3009` pour `20260923180000_transcription_provider`, marque `rolled-back` puis rejoue `migrate deploy` | Retirer une fois la base saine | S |
| DOCKER-02 | Workers sans healthcheck ni système de fichiers en lecture seule | `docker-compose.yml` : seul `backend` a un `healthcheck` ; `pip --break-system-packages` dans les Dockerfile | Ajouter healthcheck, `read_only`, `tmpfs` | S |
| BUILD-01 | TypeScript backend non strict | `backend/tsconfig.json` : `noImplicitAny: false`, `strictBindCallApply: false` ; contredit `AGENT.md` (« TypeScript strict ») | Activer progressivement | L |
| QUAL-01 | 221 erreurs de lint locales (fins de ligne) | 220 erreurs `prettier/prettier` + 1 `no-unnecessary-type-assertion` dans 7 fichiers ; `git ls-files --eol` : `transcription-workflow.service.ts` en `w/mixed` ; `core.autocrlf=true`, pas de `.gitattributes` | Ajouter `.gitattributes` / `.editorconfig` | S |
| I18N-02 | Texte corrompu (mojibake) dans des messages serveur | `playlist-items-command.service.ts:79,131`, `transcription-capacity.service.ts:20` (`dÃ©jÃ `, `saturÃ©e`) | Corriger l'encodage | S |
| ARCH-01 | Fichiers volumineux | `TeachingPage.tsx` 1 242 lignes ; `teaching.resolver.ts` 899 ; `chat.service.ts` 674 ; `ChatPage.tsx` 657 ; `teaching-lessons.resolver.ts` 652 ; `uploads.controller.ts` 589 | Découper par responsabilité | L |
| ARCH-02 | Contrat GraphQL écrit à la main côté client | 114 champs racine en chaînes `query …` sans génération de types (`services/*.ts`) ; les champs racine existent tous côté backend (vérifié), les champs imbriqués non | Génération de types depuis le schéma | L |
| ARCH-03 | État en mémoire de processus | `chord-analysis.service.ts` : drapeau `busy` et cache `Map` ; `ChatGateway.allowedOrigins` statique | Externaliser (Redis) si plusieurs instances | M |

## INFO

| ID | Constat | Preuve |
|---|---|---|
| CI-03 | Fichier de CI orphelin à la racine | `guitare/.github/workflows/ci.yml` : racine non versionnée (pas de `.git`), utilise `npm ci` et `package-lock.json` absents, actions non épinglées. Les vraies CI sont `backend/.github` et `frontend/.github` (actions épinglées par SHA, Bun 1.4.4). À supprimer. |
| CI-02 | Lacunes de la CI | Pas de build Docker, pas de scan de conteneur / secrets / SAST, pas de tests `workers/chords`, pas d'E2E Playwright frontend |
| OPS-01 | Pas de sauvegarde / restauration documentée | Aucune occurrence de `pg_dump` ni de « backup » dans README, docs, deploy, compose, render |
| PERF-01 | Taille des bundles acceptable | Build : `index-*.js` 378 kB (gzip 122 kB), `CapoSelect-*.js` 384 kB (gzip 42 kB) ; routes chargées à la demande (`lazy`) |
| DB-03 | `User.status` vaut `PENDING` par défaut dans le schéma mais `register` écrit `ACTIVE` | `schema.prisma` (modèle `User`) et `auth.service.ts:80` ; lié à SEC-02 |
| DB-04 | Cascades larges : une suppression physique d'utilisateur est destructrice | 40 relations `onDelete: Cascade` ; l'application utilise la suppression logique (`isDeleted`) |
| DB-05 | Transcription partagée sans propriétaire unique | `TranscriptionAccess` donne l'accès par utilisateur ; supprimer un compte ne supprime pas la transcription (cohérent avec un cache partagé, voir SEC-03) |

## Points vérifiés sans anomalie

Voir `SECURITY-AUDIT.md` § « Contrôles positifs ».
