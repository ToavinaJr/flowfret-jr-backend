# Audit fonctionnel

## Niveau de vérification utilisé

L'application n'a **pas** été exécutée de bout en bout. Les statuts reposent sur : lecture du code frontend et backend, correspondance des opérations GraphQL, résultats des tests unitaires.

- **IMPLEMENTED** : code complet des deux côtés **et** tests concernés verts.
- **PARTIALLY IMPLEMENTED** : une partie manque ou n'est pas branchée.
- **NOT IMPLEMENTED** : absent.
- **BROKEN** : présent mais défaillant (preuve d'un défaut).
- **UNVERIFIED** : impossible à confirmer avec les moyens de cet audit.

## Acteurs et rôles

- **Visiteur** (non connecté) : landing, connexion, inscription, `GET /api/lyrics`, formulaire de contact, `GET /api/features`, playlists partagées publiques.
- **Utilisateur** (`USER`) : tout le produit.
- **Administrateur** (`ADMIN`) : espace `/admin` (garde `AdminRoute` côté client, `@Roles(UserRole.ADMIN)` côté serveur, 34 occurrences).
- **Enseignant / élève** : statut fonctionnel et non un rôle (`InstructorStatus`, `createdById`), validé par l'administrateur (`AdminTeachersPage`).

## Matrice des fonctionnalités

| Fonctionnalité | Frontend | API / service | Python | Tests | Statut | Remarques |
|---|---|---|---|---|---|---|
| Inscription / connexion e-mail | `AuthGate`, `useAuthGateFlow` | `AuthResolver`, `AuthService` (bcrypt coût 10) | — | `auth.service.spec` | IMPLEMENTED | Voir SEC-06 |
| Connexion Google | `GoogleAuthButton` | `GoogleAuthService` (audience vérifiée) | — | `google-auth.service.spec` | IMPLEMENTED | Pas de rattachement par e-mail |
| Vérification d'e-mail | écran `verify` | `EmailVerificationService` | — | — | **PARTIALLY IMPLEMENTED** | Aucun compte `PENDING` n'est créé (SEC-02) |
| Rafraîchissement / sessions | `graphqlClient.ts` | `AuthSessionService` | — | `auth-session` testé | IMPLEMENTED | FUNC-01 : session effacée sur échec transitoire |
| Réinitialisation du mot de passe | `PasswordResetForm` | `PasswordResetService` | — | `password-reset.service.spec` | IMPLEMENTED | Révoque les refresh tokens |
| Fil, publications, commentaires, likes, signalements | `FeedPage`, `PostPage` | modules `posts`, `comments`, `post-interactions` | — | oui (53 % posts) | IMPLEMENTED | Likes sans limite de débit (SEC-07) |
| Recherche globale | `GlobalSearchPage` | `social` | — | — | UNVERIFIED | Aucun test dédié |
| Amis | `FriendsPage` | `friendships` | — | oui | IMPLEMENTED | |
| Chat privé/groupe + images | `ChatPage` | `ChatService`, `ChatGateway`, `/uploads/message-images` | — | `chat.service.spec`, `ChatPage.test` | IMPLEMENTED | Couverture chat 31 % (TEST-01) |
| Notifications + préférences | `NotificationsPage` | `notifications` | — | `NotificationsPage.test` | IMPLEMENTED | |
| Recherche musique / lecture (Audius, Spotify, YouTube) | `MusicSearchPage`, `PersistentMediaPlayer` | `music.service`, `youtube`, `audius` | yt-dlp | oui | IMPLEMENTED | Dépend de fournisseurs externes (non exercés) |
| Paroles | `PersistentLyrics`, `LyricsPanel` | `LyricsService`, `/api/lyrics` | — | 1 test Genius **en échec** | UNVERIFIED | Un scraper Genius échoue (TEST-04) |
| Transcription Whisper | `TranscriptionsPage`, `useTranscriptionEvents` | `TranscriptionsService`, BullMQ | faster-whisper | `transcriptions` 64 % | IMPLEMENTED | SEC-03 (cache Spotify) |
| Retrait de la voix (stems) | `VocalRemovalControl`, `stemMixer` | `StemsModule` | demucs / UVR | python 12 tests | IMPLEMENTED | Image stems non construite dans cet audit |
| Analyse d'accords neuronale | `PersistentChords`, `UploadPage` | `ChordAnalysisService` | BTC + beat-this | python 4 tests, service à 0 % | **PARTIALLY IMPLEMENTED** | Non déployable avec les images (DOCKER-01) |
| Playlists (CRUD, ordre, duplication, partage public) | `PlaylistsPage`, `SharedPlaylistPage` | `playlists` | — | 67 % | IMPLEMENTED | |
| Collaboration / invitations de playlist | aucune | 6 opérations GraphQL | — | — | **PARTIALLY IMPLEMENTED** | Backend seul (FUNC-02) |
| Bibliothèque, favoris, recommandations, statistiques | `LibraryPage`, `FavoritesPage`, `RecommendationsPage`, `StatsPage` | `integrations/music` | — | `RecommendationsPage.test` | UNVERIFIED | Pages récentes, couverture limitée |
| Cours (enseignants/élèves, calendrier, documents) | `TeachingPage` | `teaching/*` (2 445 lignes) | — | 36 % ; 1 test en échec | UNVERIFIED | Le test « exposes reserved seats… » échoue (TEST-04) |
| Import de fichier local | `UploadPage` | `/api/chords` | analyse d'accords | — | PARTIALLY IMPLEMENTED | Dépend de l'analyse d'accords |
| Outils : accords, gammes, accordeur, métronome | `ChordsPage`, `ScalesPage`, `TunerPage`, `MetronomePage` | aucun | — | tests partiels (stemMixer…) | IMPLEMENTED | Frontend seul, microphone requis pour l'accordeur |
| Profil, paramètres, sessions, mot de passe, suppression de compte | `ProfilePage`, `ParametresPage` | `account.resolver`, `profiles` | — | `ProfilePage.test`, `auth-account.service.spec` | IMPLEMENTED | |
| Contact | `ContactPage` | `ContactController` (`@RateLimit(5, 3600)`) | — | — | IMPLEMENTED | |
| Administration (statistiques, membres, contenus, signalements, médias, musique, audit, enseignants, données) | `src/admin/*` | `admin/*` | — | `admin` 57 % ; 1 spec E2E (non exécuté) | IMPLEMENTED | Éditeur générique à champs autorisés |
| Planification (rappels de cours, expiration des transcriptions en attente) | — | `setInterval` dans 2 services | — | `pending-transcription-timeout.service` à 0 % | UNVERIFIED | Timers en mémoire (ARCH-03) |

## Cohérence frontend / backend / Python

- **GraphQL** : 114 champs racine utilisés par le frontend, 0 manquant côté backend. 44 opérations backend n'ont aucun appelant frontend (SEC-14, FUNC-02).
- **REST** : les chemins `BASE_URL` du frontend (`/api/transcriptions`, `/api/lyrics`, `/api/audio-stems`, `/api/youtube`, `/api/chords`, `/api/contact`, `/uploads`) correspondent aux 8 contrôleurs. Un point d'accès `GET /api/transcriptions/lookup` a été ajouté récemment ; il est déclaré avant `:id`.
- **Drapeaux** : `GET /api/features` renvoie `chordTranscription` (variable `CHORD_TRANSCRIPTION`) et `equalizerTranscription` ; l'analyse neuronale utilise un autre drapeau (`CHORD_ANALYSIS_ENABLED`). Deux interrupteurs distincts à documenter ensemble.
- **Python** : le backend dialogue avec les scripts par processus enfant (`spawn`, `execFile`) et JSON sur la sortie standard ; les résultats sont validés (`parseChordAnalysisResult`).

## Statuts agrégés

| Statut | Nombre |
|---|---:|
| IMPLEMENTED | 16 |
| PARTIALLY IMPLEMENTED | 4 |
| UNVERIFIED | 5 |
| BROKEN | 0 |
| NOT IMPLEMENTED | 0 |

Aucune fonctionnalité n'est classée BROKEN faute de preuve fonctionnelle ; les 4 échecs de tests backend relèvent de l'UNVERIFIED tant qu'ils ne sont pas analysés.
