# Audit de sécurité

Référentiels utilisés : OWASP Top 10 (2021) et OWASP ASVS pour la lecture. **Aucun test d'intrusion dynamique** (DAST) n'a été réalisé ; l'application n'a pas été lancée. Les valeurs de secrets ne sont jamais reproduites dans ce rapport.

## Synthèse des risques

| ID | Niveau | Catégorie OWASP | Titre |
|---|---|---|---|
| SEC-01 | HIGH | A06 Composants vulnérables | Dépendances de production vulnérables (44 avis dont 3 critical, 21 high) |
| SEC-02 | MEDIUM | A07 Identification et authentification | E-mail non vérifié à l'inscription |
| SEC-03 | MEDIUM | A04 Conception non sécurisée | Cache de transcription Spotify empoisonnable |
| SEC-04 | LOW | A07 | Pas de détection de réutilisation du jeton de refresh |
| SEC-05 | LOW | A08 Intégrité des données et logiciels | `torch.load(weights_only=False)` sur modèle téléchargé sans somme de contrôle |
| SEC-06 | LOW | A07 | Différence de temps de réponse à la connexion |
| SEC-07 | LOW | A04 | 28 mutations sans limitation de débit |
| SEC-08 | LOW | A04 | `recordActivity` sans plafond |
| SEC-09 | LOW | A04 | WebSocket sans limite par événement |
| SEC-10 | LOW | A05 Mauvaise configuration | Fichier de cookies YouTube réel sur disque, non exclu du contexte Docker |
| SEC-11 | LOW | A05 | Secrets distribués à tous les conteneurs |
| SEC-12 | LOW | A06 | Avis *critical* `handlebars` (développement seulement) |
| SEC-13 | LOW | A08 | Images et paquets non épinglés |
| SEC-14 | LOW | A05 | 44 opérations GraphQL non utilisées (surface) |

Les détails, preuves et corrections sont dans `ISSUES-REGISTER.md`.

## Secrets et données sensibles

- **Aucun secret dans le code** : recherche d'expressions (`sk_live`, clés AWS/Google/SendGrid/Slack, clés privées PEM) dans `backend/src`, `frontend/src`, les `*.yml`, `render.yaml`, `.github` : **0 occurrence**.
- `git ls-files` (backend et frontend) : seul `.env.example` est suivi parmi les fichiers sensibles. Les fichiers `backend/.env`, `backend/.env.development*`, `frontend/.env.development*` et `backend/youtube-cookies.txt` existent **localement** et sont ignorés par `.gitignore`.
- `backend/.env` contient ≈ 60 variables dont des secrets (Audius, Cloudinary, Genius, Google, SendGrid, Spotify, YouTube, JWT, mot de passe PostgreSQL). Valeurs non reproduites.
- `backend/youtube-cookies.txt` (7 734 octets) : jar de cookies de session Google/YouTube (13 entrées `.google.com`, 23 `.youtube.com`, 7 `accounts.google.com`). Ces cookies valent des identifiants. **Historique git non fouillé** (pas de `gitleaks` ; seule la liste des fichiers suivis a été contrôlée). Si le fichier a pu être poussé un jour, faire pivoter la session du compte concerné.
- Aucun secret n'est journalisé (revue des journaux structurés ; aucun `console.*`).

## Authentification et sessions (ASVS V2, V3)

Positif :
- Jeton d'accès HS256 de 15 minutes, algorithme imposé, expiration vérifiée, statut du compte relu à chaque requête.
- Refresh : jeton opaque aléatoire, haché (SHA-256) en base, rotation à usage unique dans une transaction, cookie `HttpOnly`, `Secure` et `SameSite=None` en production, chemin restreint à `/graphql`.
- **Protection CSRF du refresh** : en-tête `Origin` obligatoire en production et comparé à une liste blanche (`refresh-origin.ts`, tests avec origines hostiles `https://evil.example`, `example.com.attacker.test`).
- Limitation de débit des routes d'authentification : `login` 10 / 15 min, `register` 5 / min + 20 / h, `refreshSession` 60 / 15 min, réinitialisation 3 ou 5 / h, avec `failClosed` (la requête est refusée si Redis est indisponible).
- Réponses génériques (`GENERIC_CREDENTIALS_ERROR`, `GENERIC_REGISTRATION_ERROR`) : pas d'énumération par message.
- Google : audience du jeton vérifiée, `email_verified` exigé, jamais de rattachement implicite à un compte e-mail existant.
- Changement de mot de passe et réinitialisation : révocation des sessions.

À corriger : SEC-02, SEC-04, SEC-06 ; FUNC-01 côté client.

## Contrôle d'accès (A01)

- Garde global par défaut : toute opération est authentifiée sauf `@Public()` explicite (17 occurrences recensées et revues).
- IDOR : pour les écritures par identifiant, la propriété ou la participation est vérifiée avant modification (playlists, publications, profils, conversations). Les opérations d'administration sont en `@Roles(ADMIN)` (34 occurrences) ; `UploadsResolver` est réservé aux administrateurs au niveau de la classe.
- `recordActivity` n'accepte qu'une action figée (`TRACK_LISTENED`) : pas de falsification du journal d'audit.
- Éditeur d'entités administrateur : champs en liste blanche ; l'entité `USER` ne permet que `email` et `username`.
- Réserve : l'autorisation par propriétaire est testée surtout côté services ; les résolveurs et contrôleurs sont peu couverts (TEST-01).

## Entrées, injections, fichiers (A03, A08)

- `ValidationPipe` global (`whitelist`, `forbidNonWhitelisted`, `transform`) ; DTO avec contraintes de longueur, d'URL HTTPS, d'énumération.
- GraphQL : limites de profondeur, champs, alias, complexité ; corps JSON limité ; introspection coupée en production ; `csrfPrevention` activé.
- Prisma paramétré : pas d'injection SQL détectée.
- Téléversements : liste blanche de types, **vérification de la signature binaire**, taille maximale, quota utilisateur sous verrou, concurrence plafonnée, stockage externe (Cloudinary), en-têtes de téléchargement sûrs.
- Processus enfants : arguments en tableau, jamais de shell (`spawn`, `execFile`, `subprocess.run` avec liste).
- XSS : aucun `dangerouslySetInnerHTML` ; CSP stricte côté Vercel.

## SSRF (A10)

- Tononkira : durcissement du 2026-11-18 (hôte HTTPS exact, DNS public épinglé, redirections coupées, taille plafonnée).
- Pages de paroles : vérification d'adresse (`lyrics-page-safety.ts`, résolution DNS).
- Transcription Spotify : liste d'hôtes (`p.scdn.co`, …) **mais URL non liée au `trackId`** (SEC-03).
- Dépendance `axios` à mettre à jour : plusieurs avis visent des contournements SSRF par redirection (SEC-01).

## Configuration, conteneurs, chaîne d'approvisionnement (A05, A06, A08)

- Production : `JWT_SECRET` ≥ 32 caractères, `APP_URL` en HTTPS et CORS contrôlés au démarrage.
- Conteneurs : non-root, `cap_drop: ALL`, `no-new-privileges`, ports internes liés à `127.0.0.1` (voir `DOCKER-DEVOPS-AUDIT.md`).
- Actions GitHub épinglées par SHA, `permissions: contents: read`, `dependency-review` absent du dépôt réel (présent seulement dans le fichier orphelin de la racine).
- `bun audit` et `pip-audit` en CI (hors `workers/chords`).

## En-têtes HTTP

API : `helmet()` par défaut. Frontend (`vercel.json`) : CSP, HSTS (`max-age=63072000; includeSubDomains; preload`), `X-Content-Type-Options`, `Referrer-Policy: strict-origin-when-cross-origin`, `Cross-Origin-Opener-Policy: same-origin-allow-popups`, `X-Frame-Options: DENY`, `Permissions-Policy`.

## Résultats d'`audit` de dépendances

| Projet | Total | Critical | High | Moderate | Low |
|---|---:|---:|---:|---:|---:|
| Backend (`bun audit`) | 44 | 3 | 21 | 18 | 2 |
| Frontend (`bun audit`) | 4 | 0 | 0 | 4 | 0 |

Chemins de production du backend : `axios@1.19.0`, `follow-redirects@1.16.0`, `body-parser@2.3.0`, `undici@7.30.0` (via `cheerio`), `proxy-addr@2.0.7`, `qs@6.16.0` (modéré). Chemins de développement : `handlebars@4.7.9` (via `ts-jest`, 2 critical), `brace-expansion`, `minimatch`.

## Contrôles non réalisés

DAST, test de charge, fuzzing GraphQL, analyse de l'historique git à la recherche de secrets, scan d'images Docker, `bandit` sur Python.

## Contrôles positifs (liste de référence)

Validation d'entrée stricte, listes blanches (CORS, hôtes audio, types de fichiers, champs administrateur), jetons hachés, cookie `HttpOnly`/`Secure`, vérification d'`Origin`, limitation de débit à échec fermé, quotas, suppression logique, journal d'audit, aucune injection de HTML, aucun secret dans le code, conteneurs durcis.
