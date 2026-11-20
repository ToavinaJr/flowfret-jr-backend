# Audit frontend (React, Vite, TypeScript)

## Résultats des vérifications exécutées

| Commande (dans `frontend/`) | Résultat |
|---|---|
| `npx tsc -b` | **0 erreur** |
| `npx eslint .` | 682 fichiers : **14 erreurs, 1 141 avertissements**. Tout vient de `films/` (14 / 1 139) ; `src/` : **0 erreur, 2 avertissements** (`react-refresh/only-export-components`, `react-hooks/exhaustive-deps`) |
| `npx vitest run` | 66 fichiers, 214 tests : **207 réussis, 7 en échec** (TEST-02) |
| `npx vite build` | Réussi ; plus gros fragments : `CapoSelect` 384 kB (gzip 42 kB), `index` 378 kB (gzip 122 kB) |
| `bun audit` | 4 avis *moderate* (`@vitest/mocker`, `glob`, `minimatch`), tous en dépendances de développement |
| Playwright (`test:e2e`) | **Non exécuté** (5 fichiers, 14 scénarios) |

## Architecture React

- 280 fichiers source, 66 fichiers de tests. Organisation : `pages/` (36), `components/` par domaine (`features/music`, `playlists`, `feed`, `chat`, `settings`, `skeletons`…), `hooks/` (33), `services/` (47 clients d'API), `contexts/` (8), `admin/` (espace dédié chargé à la demande).
- **Séparation UI / logique** : bonne. Les appels réseau sont dans `services/*Api.ts`, la logique de lecture dans `usePlaybackEngine`, `useYouTubeController`, `useSpotifyController`, `useVocalRemoval`, `usePlaybackPersistence`.
- **Contextes** : `PlaybackProvider` placé au-dessus du routeur interne (le lecteur survit à la navigation), `AuthProvider`, `CapoProvider`, `ThemeProvider`. Pas de prop drilling problématique constaté.
- **Code splitting** : toutes les pages et l'espace admin sont en `lazy()` (`App.tsx`) ; le lecteur persistant aussi.
- **Fichiers volumineux** (ARCH-01) : `TeachingPage.tsx` 1 242 lignes, `ChatPage.tsx` 657, `AdminEntityManagerPage.tsx` 560, `usePlaybackEngine.ts` 510.

## TypeScript

- `tsconfig.app.json` : `strict: true`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`. Cible ES2020 (alerte locale rencontrée dans un test qui utilise `Array.prototype.at`, corrigée depuis car `tsc -b` est à 0 erreur).
- **0** occurrence de `: any`, `as any`, `<any>`, `@ts-ignore`, `@ts-expect-error`. **1** `eslint-disable` dans `src`.
- Les types d'API sont recopiés à la main (`types/*.ts`), sans génération depuis le schéma GraphQL (ARCH-02). La vérification croisée a confirmé l'existence des 114 champs racine, pas de leurs sous-champs.

## Gestion des données et de l'authentification

- `graphqlClient.ts` : délai d'expiration de 15 s, une seule nouvelle tentative après rafraîchissement, déduplication intra-onglet (`refreshPromise`).
- Le jeton d'accès est **en mémoire** ; seul le cookie `HttpOnly` de refresh persiste. `localStorage` ne contient que thème, langue, position de fenêtres, taille de police des paroles et la session de lecture (`fretflow.playback.session.v1`).
- **FUNC-01** : `refreshAccessToken` efface la session sur **toute** réponse non-OK (`graphqlClient.ts:56-59`), y compris 429 et 5xx, et n'est pas coordonné entre onglets.
- `React Query` : `NotificationBadge` interroge toutes les 15 s avec `refetchOnWindowFocus` ; `NotificationsPage` aussi. Cohérent avec une fonction de temps réel sans WebSocket pour les notifications.

## Interface et expérience

- **Responsive** : navigation réorganisée par intention (barre mobile à 5 entrées, barre latérale groupée, barre d'outils partagée) ; lecteur en grille responsive vérifié par captures à 320–1440 px lors du chantier du 2026-11-12/18 (hors du présent audit).
- **Accessibilité** : lien « aller au contenu », régions et groupes nommés, `aria-label` sur les boutons-icônes, infobulles, focus visibles. Pas d'audit automatisé (axe) exécuté.
- **Retours** : squelettes de chargement par page, états vides, `toast` (sonner).
- **Internationalisation** : 1 937 lignes par langue, 1 658 clés. **I18N-01** : 2 clés mal rangées (`music.recentSearches`, `music.clearRecentSearches` absentes du français).
- **Tests périmés** : `navigation.test.ts` et `MenuPage.test.tsx` référencent encore « Playlists » alors que la navigation expose « Bibliothèque ».

## Performance

- Bundles raisonnables (voir tableau), routes à la demande, `vendor-react`, `vendor-query`, `vendor-i18n`, `vendor-motion` séparés.
- `framer-motion` (125 kB) chargé en fragment propre.
- Aucune mesure de re-rendus ni de mémoire réalisée.

## Sécurité frontend

- **0** `dangerouslySetInnerHTML`, `innerHTML`, `eval`. **0** `console.*` en code de production.
- CSP dans `vercel.json` : `default-src 'self'`, `script-src 'self'` + Google et Spotify, `frame-ancestors 'none'`, `object-src 'none'`, `upgrade-insecure-requests`, HSTS préchargé, `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Permissions-Policy` limitant le micro à `self`. `style-src 'unsafe-inline'` est le seul assouplissement notable (Tailwind / styles dynamiques).
- Routes protégées (`AuthGate`, `AdminRoute`) : confort d'interface uniquement ; l'autorisation réelle est côté serveur (vérifiée, voir `BACKEND-AUDIT.md`).
- Les iframes Spotify et YouTube sont déclarées dans `frame-src`.

## Dépôt

- **REPO-01** : `films/` (519 fichiers), un `.mp4` à la racine et `test-results/` sont suivis par git.
- **CI-01** : `eslint.config.js` n'ignore que `dist` : le lint de `films/` casse la CI.
- `frontend/.github/workflows/ci.yml` : un seul job (`bun audit`, puis `bun run validate`), Bun 1.4.4 et actions épinglées par SHA. Pas de test E2E en CI.
