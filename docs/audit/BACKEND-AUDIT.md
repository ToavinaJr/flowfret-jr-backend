# Audit backend (NestJS, GraphQL, Prisma)

## Résultats des vérifications exécutées

| Commande (dans `backend/`) | Résultat |
|---|---|
| `npx tsc --noEmit` | **0 erreur** |
| `npx eslint "{src,apps,libs,test}/**/*.ts"` | 364 fichiers : **221 erreurs**, 0 avertissement. 220 `prettier/prettier` (fins de ligne), 1 `no-unnecessary-type-assertion`. Fichiers : `transcription-workflow.service.ts` (199), `chord-analysis-*` (19), `app.controller.ts`, `music-search-history.service.ts` (QUAL-01) |
| `npx jest --coverage` | 91 suites, 416 tests : **412 réussis, 4 en échec** ; instructions 53,65 %, branches 49,52 %, fonctions 31,09 %, lignes 54,97 % |
| `bun audit` | **44 avis** : 3 critical, 21 high, 18 moderate, 2 low (SEC-01) |
| `docker compose config -q` (base et surcharge VPS) | Valide |
| `test:e2e` (`backend/test/app.e2e-spec.ts`) | **Non exécuté** : exige PostgreSQL et Redis |

## Architecture NestJS

- 14 modules importés par `AppModule` (dont `PrismaModule`), plus `GraphQLModule`. Fournisseurs globaux dans `AuthModule` : `GqlJwtAuthGuard`, `RolesGuard`, `RateLimitGuard` (`APP_GUARD`).
- Séparation en couches claire : résolveurs minces, services de commande/lecture (`posts-command.service`, `playlist-items-command.service`), politiques (`post-access`, `postPolicy`, `profilePolicy`), présentateurs (`transcription.presenter`), chargeurs par requête (`RequestLoaders`).
- Validation d'environnement au démarrage (`validate-environment.ts`) : booléens, URL, énumérations, entiers positifs ; en production, `JWT_SECRET` ≥ 32 caractères, `APP_URL` en HTTPS, `CORS_ORIGINS` contrôlés. Les 59 variables lues par `config.get` figurent toutes dans `.env.example` (sauf `NODE_ENV`).
- GraphQL : `introspection` coupée en production, requêtes groupées désactivées, `csrfPrevention`, pas de trace de pile, règles de profondeur (12), champs (300), alias (30), complexité (200), corps limité à 64 ko.

## API

- **GraphQL** : ≈170 déclarations `@Query`/`@Mutation` ; 88 mutations. 158 opérations nommées détectées ; 44 ne sont jamais appelées par le frontend (SEC-14).
- **REST** : 8 contrôleurs, 32 routes. Publiques : `GET /` (santé), `GET /api/features`, `GET /api/lyrics`, `POST /api/contact/messages`. Toutes les autres exigent `AuthGuard('jwt')` ou le garde global.
- **`@Public()`** : 17 occurrences au total, dont 13 opérations GraphQL (`register`, `login`, `loginWithGoogle`, `registerWithGoogle`, `verifyEmail`, `resendVerificationEmail`, `requestPasswordReset`, `resetPassword`, `refreshSession`, `logout`, `dbHealth`, 2 lectures de playlists publiques) et 4 routes REST.
- **Ordre des routes** : `GET /api/transcriptions/lookup` est déclaré avant `:id` (sinon « lookup » serait interprété comme identifiant).

## Authentification et autorisation

Contrôles positifs observés :
- HS256 imposé (`jwt.strategy.ts`), expiration vérifiée, jeton d'accès de 15 min, statut du compte relu en base à chaque requête.
- Refresh : jeton opaque de `randomBytes`, **haché en SHA-256**, rotation transactionnelle à usage unique, cookie `HttpOnly`, `Secure` et `SameSite=None` en production, chemin `/graphql`, **en-tête `Origin` vérifié** (`refresh-origin.ts`, avec tests d'origines hostiles).
- Réinitialisation du mot de passe : révoque les jetons de refresh.
- Mots de passe : `bcrypt` coût 10.
- RBAC : `@Roles(UserRole.ADMIN)` sur 34 opérations ; la classe `UploadsResolver` entière est réservée aux administrateurs.
- Écritures par identifiant : la propriété est vérifiée **avant** l'écriture (`requireCanEdit`, `postPolicy.assertCanMutate`, `profilePolicy.assertCanMutate`, `assertParticipant`). Les écritures non scopées (`post-moderation.service`) ne sont atteignables que via des mutations `@Roles(ADMIN)`.
- Éditeur d'entités admin : liste blanche de champs par entité ; l'entité `USER` n'autorise que `email` et `username` (ni rôle ni hash).
- Chat WebSocket : jeton vérifié, compte actif, origine contrôlée, `chat:join` revérifie la participation.

Défauts :
- **SEC-02** : inscription en `ACTIVE` sans vérification d'e-mail.
- **SEC-04** : pas de détection de réutilisation de jeton de refresh.
- **SEC-06** : différence de temps selon l'existence du compte.
- **SEC-09** : pas de limite par événement WebSocket.

## Sécurité applicative

| Sujet | Constat |
|---|---|
| Injection SQL | Prisma paramétré ; aucune requête brute concaténée détectée dans les services lus |
| Mass assignment | `ValidationPipe` en `whitelist` + `forbidNonWhitelisted` ; `delete safeData.status` explicite dans `posts-command.service` |
| SSRF | Tononkira : DNS public épinglé, redirections coupées (corrigé 2026-11-18). Transcription : liste d'hôtes autorisés ; **SEC-03** (URL Spotify non liée au `trackId`) |
| Téléversements | Type MIME en liste blanche, signature binaire vérifiée (`hasValidSignature`), taille, quota par utilisateur sous verrou transactionnel, concurrence limitée (`ConcurrentUploadsInterceptor`), limite de débit |
| Téléchargement | `Content-Disposition` encodé (`filename*=UTF-8''`), `nosniff`, `Cache-Control: private, no-store` |
| CORS / en-têtes | Liste blanche d'origines, `credentials`, `helmet()` par défaut |
| Limitation de débit | Redis, `failClosed` sur les routes sensibles ; **28 mutations non limitées** (SEC-07) |
| Journalisation | Journaux JSON structurés, pas de secrets ; aucun `console.*` |
| Dépendances | **SEC-01** |

## Logique métier et fiabilité

- Transactions explicites et verrous : quotas d'upload, membres de chat, ordre de playlist avec `version` (contrôle de concurrence optimiste), retrait de morceau.
- Compteurs dénormalisés (`likeCount`, `commentCount`) mis à jour dans la même transaction avec décrément gardé (`gt: 0`).
- Files de travail : tentatives configurables, délai d'expiration, profondeur maximale de file, expiration des transcriptions « en attente » (`pending-transcription-timeout.service`).
- Dépassement de délai de base de données : converti en `503` explicite (`TranscriptionsRepository.execute`).
- Minuteurs en mémoire (`setInterval`) pour rappels de cours et expiration : un seul processus doit les porter (ARCH-03).
- Messages d'erreur corrompus (mojibake) dans 3 chaînes serveur (I18N-02).

## TypeScript backend

`tsconfig.json` : `strictNullChecks: true` mais `noImplicitAny: false` et `strictBindCallApply: false` (BUILD-01), en contradiction avec `AGENT.md`. 0 occurrence explicite de `any`, 0 `@ts-ignore`.

## Tests

Couverture par module (instructions) : `common` 70,4 %, `playlists` 67,3 %, `auth` 64,7 %, `transcriptions` 64,5 %, `stems` 60,9 %, `admin` 57,6 %, `integrations` 58,6 %, `posts` 53,4 %, `teaching` 35,6 %, `chat` 31,0 %, `uploads` 28,4 %, `chord-transcriptions` 10,3 %. Voir `TESTING-AUDIT.md`.
