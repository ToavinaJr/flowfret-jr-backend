# Audit des tests

## Inventaire et résultats

| Niveau | Outil | Volume | Résultat de l'audit |
|---|---|---|---|
| Backend unitaire / service | Jest 30, ts-jest | 91 suites, 416 tests | **412 réussis, 4 en échec** |
| Backend E2E | Jest + supertest (`test/app.e2e-spec.ts`) | 1 fichier | **Non exécuté** (PostgreSQL et Redis requis) |
| Frontend unitaire / composants | Vitest 5, Testing Library, jsdom | 66 fichiers, 214 tests | **207 réussis, 7 en échec** |
| Frontend E2E | Playwright 1.63 | 5 fichiers, 14 scénarios | **Non exécuté** ; non lancé par la CI |
| Python | `unittest` | transcription 10, stems 12, chords 4 = 26 | **26 réussis** |
| Charge, sécurité dynamique, régression visuelle | — | 0 | Absents |

Couverture mesurée (backend uniquement, `jest --coverage`) : instructions 53,65 % (4 918 / 9 166), branches 49,52 %, **fonctions 31,09 %** (657 / 2 113), lignes 54,97 %. La couverture frontend n'est pas mesurée (aucun fournisseur de couverture configuré dans `vitest.config.ts`).

## Échecs observés

| Test | Cause probable | Lien |
|---|---|---|
| `AppController › should return "Hello World!"` | Test de gabarit Nest périmé | TEST-04 |
| `GeniusLyricsProvider › scrapes lyrics lines out of the Genius lyrics containers` | Structure HTML du scraper à vérifier | TEST-04 |
| `ListeningHistoryService › upserts a user track and increments its play count` | À analyser | TEST-04 |
| `TeachingResolver workspace queries › exposes reserved seats without leaking the Prisma count shape` | À analyser | TEST-04 |
| `FloatingMediaWindow` ×5 (glisser, redimensionner, tailles enregistrées) | Mesures de géométrie dans jsdom ; régression de code ou de test à établir | TEST-02 |
| `navigation.test.ts › keeps every previously reachable screen…` | Attend `/playlists` ; la navigation expose désormais `/library` | TEST-02 |
| `MenuPage.test.tsx › lists secondary destinations…` | Attend le lien « Playlists » | TEST-02 |

## Pertinence des tests

Points forts (tests ciblés sur le risque) :
- **Sécurité** : `refresh-origin.spec` (origines hostiles), `rate-limit.guard.spec`, `roles.guard.spec`, `gql-jwt-auth.guard.spec`, `graphql-security.spec`, `http-security.spec`, `validate-environment.spec`, `auth-cookie.utils.spec`, `google-auth.service.spec`, `password-reset.service.spec`.
- **Téléversements** : `uploads.validation.spec`, `cloudinary.service.spec`, `user-storage-quota.spec`, `concurrent-uploads.interceptor.spec`, `upload-cleanup.service.spec`.
- **SSRF et paroles** : `lyrics-page-safety`, providers, `lyrics-search-candidates.util.spec`.
- **Workflows IA** : `transcription-workflow.service.spec`, `transcriptions.processor.spec`, `whisper-bridge.service.spec`, `stems.processor.spec`.
- **Frontend** : lecteur persistant (regroupement, infobulles, volume masqué avec Spotify), paroles de repli, playlists (infobulles, toasts), navigation mobile, moteurs de lecture, stem mixer, client GraphQL.

Lacunes (scénarios critiques non couverts) :

| Zone | Constat | Risque associé |
|---|---|---|
| Résolveurs et contrôleurs | `chat.resolver`, `uploads.resolver`, `music.resolver`, `user-relations.resolver`, `lyrics.controller` : **0 %** | Un `@Roles` ou `@Public` modifié par erreur ne serait pas détecté |
| Chat | 31 % ; pas de test de passerelle contre un vrai Redis/PostgreSQL | Concurrence des membres : le plan du 2026-11-18 indique « test d'intégration concurrente à ajouter » |
| Uploads | 28,4 % ; compensation Cloudinary en cas d'échec de transaction non testée de bout en bout | Fichiers orphelins |
| Chord | `chord-analysis.service` à 0 % ; 4 tests Python | DOCKER-01 |
| Planificateurs | `pending-transcription-timeout.service`, `teaching-lesson-reminders.service` : 0 % | Tâches silencieusement inactives |
| Authentification | Pas de test de réutilisation de jeton ni de refresh concurrent entre onglets | SEC-04, FUNC-01 |
| Cache de transcription | Aucun test du scénario « URL Spotify sans lien avec `trackId` » | SEC-03 |
| Base de données | Aucun test d'intégration réel (tout est simulé) | Régressions de requêtes et de contraintes |
| E2E | Pas en CI | Parcours critiques (connexion → lecture → playlist) non protégés |
| Accessibilité | Aucun test axe | — |
| Python | Tests limités aux fonctions utilitaires | Boucles de transcription et de séparation non couvertes |

## Qualité des tests

- Les tests sont pour la plupart écrits comme des **scénarios de comportement** (assertions sur rôles accessibles, sur les effets d'appel), pas seulement comme du remplissage de couverture.
- Deux tests de navigation sont **devenus périmés** après un changement d'interface sans mise à jour : signe d'un filet qui n'est plus bloquant. Les échecs récurrents sont tolérés (même jeu de 5 échecs `FloatingMediaWindow` observé lors de plusieurs exécutions du chantier précédent).
- La CI backend lance bien `bun run validate` puis les tests E2E ; la CI frontend n'a pas de job E2E.

## Recommandations

1. Rendre la suite verte (TEST-02, TEST-04) avant tout nouvel ajout ; faire échouer la CI sur toute régression.
2. Ajouter des tests de résolveurs vérifiant la présence des gardes (`@Roles`, `@Public`) sur les opérations sensibles.
3. Ajouter un job E2E avec PostgreSQL et Redis éphémères (le backend en possède déjà les services en CI) et un job Playwright pour les 14 scénarios existants.
4. Introduire la couverture côté frontend et un seuil minimal progressif (backend : relever les fonctions de 31 % vers 50 %).
5. Tests de caractérisation pour SEC-03, SEC-04, FUNC-01 avant correction.
