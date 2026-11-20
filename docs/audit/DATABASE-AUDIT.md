# Audit de la base de données

**Aucune requête, migration ni suppression n'a été lancée.** L'analyse porte sur `backend/prisma/schema.prisma` (1 137 lignes), les 38 migrations et le code d'accès. Aucune connexion à une base réelle n'a été faite.

## Schéma

| Mesure | Valeur |
|---|---:|
| Modèles | 43 |
| Énumérations | 31 |
| Migrations | 38 (`20260923…` à `20261116…`) + `migration_lock.toml` |
| Index (`@@index`) | 86 |
| Contraintes d'unicité (`@@unique` / `@unique`) | 29 |
| Relations `onDelete: Cascade` | 40 |
| Relations `onDelete: Restrict` | 18 |
| SGBD | PostgreSQL 16 (image `postgres:16-alpine`), client `@prisma/adapter-pg` |

Domaines : utilisateurs et jetons (`User`, `RefreshToken`, `PasswordResetToken`, `EmailVerificationToken`), social (`Post`, `Comment`, `PostLike`, `PostReport`, `Friendship`, mentions, pièces jointes), chat (`Conversation`, `ConversationParticipant`, `ChatMessage`, `MessageAttachment`), musique (`CatalogTrack`, `ListeningHistory`, `ListeningHistoryEvent`, `MusicSearch*`, `Playlist*`), IA (`Transcription`, `TranscriptionAccess`, `AudioStem`, `ChordTranscription`, `LyricsOverride`, `LyricsReport`), pédagogie (`InstructorProfile`, `TeachingCourse`, `TeachingEnrollment`, `TeachingLesson`, `TeachingMaterial`, `LessonAttendance`, `TeachingLessonReminder`), transverses (`Upload`, `Notification`, `AuditLog`, `ContactMessage`).

## Points positifs

- **Index adaptés aux requêtes** : paires `(clé étrangère, createdAt desc)` sur les listes (`posts`, `chat_messages` : `(conversationId, isDeleted, createdAt desc, id desc)`), `@@index([expiresAt])` sur les jetons, `@@index([provider, trackId])` sur les caches.
- **Unicité fonctionnelle** : clé de cache de transcription `(provider, trackId, requestedLanguage, model, engineVersion)` ; cache de stems `(provider, trackId, engineVersion)` ; `refresh_tokens.token_hash`, `users.email/username/google_id`.
- **Suppression logique** (`isDeleted`, `deletedAt`) généralisée : les suppressions de comptes et de contenus ne détruisent pas l'historique. `Restrict` protège les auteurs de messages.
- **Fuseaux horaires** : `Timestamptz(6)` partout.
- **Intégrité sous concurrence** : mises à jour d'ordre avec champ `version`, verrous transactionnels pour quotas et membres de chat, isolation `Serializable` pour les inscriptions aux cours (`teaching-lessons.resolver.ts` `withSerializable`) et la sécurité d'administration, compteurs en transaction avec décrément gardé.
- **Délais et connexions** : `connectionTimeoutMillis` configurable, pool `DATABASE_POOL_MAX` (5 par défaut), erreur `503` explicite quand la base ne répond pas à temps pour les transcriptions.
- **Migrations versionnées** et appliquées avant la validation en CI (`bun run prisma:deploy`).

## Risques et constats

| ID | Niveau | Constat |
|---|---|---|
| DB-01 | LOW | Aucune purge des jetons expirés ou révoqués (`refresh_tokens`, `password_reset_tokens`, `email_verification_tokens`) : la recherche de `deleteMany` n'a rien trouvé, seulement des `updateMany` de révocation. Croissance sans borne, lente. |
| DB-02 | LOW | `start:render` exécute `scripts/recover-known-migration.mjs` : en cas d'erreur `P3009` sur la migration `20260923180000_transcription_provider`, il la marque `rolled-back` puis rejoue `migrate deploy`. Contournement ponctuel resté dans le chemin de démarrage de production ; à retirer une fois la base saine. |
| DB-03 | INFO | `User.status` a pour valeur par défaut `PENDING` dans le schéma, mais `register` écrit `ACTIVE` explicitement : incohérence entre le modèle et le comportement (voir SEC-02). |
| DB-04 | INFO | Cascades larges : supprimer **physiquement** un utilisateur supprime en cascade ses messages, publications, playlists, etc. (40 `Cascade`). L'application utilise la suppression logique ; un `DELETE` manuel est donc destructeur. |
| DB-05 | INFO | Une transcription partagée (`TranscriptionAccess`) n'a pas de propriétaire unique : la suppression d'un utilisateur ne supprime pas la transcription partagée. Choix cohérent avec un cache partagé (voir SEC-03 pour le risque d'intégrité). |
| OPS-01 | INFO | **Aucune sauvegarde ni procédure de restauration documentée** (aucune occurrence de `pg_dump` ou de « backup » dans README, docs, deploy, compose, render). Si la base est gérée (Render, Neon, etc.), la politique de sauvegarde du fournisseur est à vérifier et à consigner. |

## Données orphelines et incohérences

Non mesurées : aucune requête n'a été exécutée. Les contraintes de clés étrangères avec `Cascade`/`Restrict` limitent structurellement les orphelins ; les champs `String` sans relation (par exemple `Upload.storagePath`, `Transcription.trackId`) restent à surveiller. `UploadCleanupService` (`cleanupPending`) compense les échecs de suppression Cloudinary.

## Environnements

- Local : `docker-compose.yml` (PostgreSQL lié à `127.0.0.1:5434`, volume nommé), mot de passe obligatoire (`POSTGRES_PASSWORD` sans valeur par défaut).
- CI : PostgreSQL 16 éphémère avec identifiants de test.
- Production : `DATABASE_URL` / `DIRECT_DATABASE_URL` fournis par l'environnement (`render.yaml`, `docker-compose.vps.yml`).

## Recommandations

1. Tâche de purge des jetons expirés (DB-01), au moins hebdomadaire.
2. Documenter et tester une restauration (OPS-01).
3. Retirer le script de récupération de migration dès que possible (DB-02).
4. Ajouter un test d'intégration PostgreSQL pour la concurrence des quotas et des membres de chat (le plan du 2026-11-18 le mentionne encore comme « à faire »).
