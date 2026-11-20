# Audit Docker et DevOps

## Vérifications exécutées

| Commande | Résultat |
|---|---|
| `docker compose -f docker-compose.yml config -q` (avec `POSTGRES_PASSWORD` factice) | Valide (code 0) |
| idem avec la surcharge `docker-compose.vps.yml` (`DATABASE_URL` factice) | Valide |
| `docker info` | Moteur Docker 25.0.3 disponible |
| `docker build` des 3 images | **Non exécuté** (installation de PyTorch et d'ONNX, volumineuse). Le plan du 2026-11-18 indique d'ailleurs que le build stems reste à valider |
| `trivy`, `hadolint`, `gitleaks` | Non installés |

## Dockerfiles (`backend/`)

| Image | Base | Construction | Utilisateur | Healthcheck |
|---|---|---|---|---|
| `Dockerfile` (API) | `oven/bun:1.4.4` → `node:22-bookworm-slim` | multi-étapes, `bun install --frozen-lockfile`, `bun prune --production` | `node` | oui (`fetch http://127.0.0.1:3000/`) |
| `Dockerfile.worker` (transcription) | idem + `ffmpeg` | multi-étapes | `node` | **non** |
| `Dockerfile.stems` | idem + `ffmpeg`, torch CPU, audio-separator | multi-étapes, `--chown` | `node` | **non** |

Points positifs : versions de base épinglées, multi-étapes, aucun root à l'exécution, `NODE_ENV=production`, caches `apt` supprimés, `--no-cache-dir`.

Constats :
- **DOCKER-02** : workers sans healthcheck ni système de fichiers en lecture seule ; `pip --break-system-packages` (acceptable en conteneur, à noter).
- **SEC-10** : `.dockerignore` exclut `.env*`, `node_modules`, `dist`, `.venv`, mais **pas** `youtube-cookies.txt`, `coverage`, `test`, `.git` ; avec `COPY . .` dans l'étape de build, le fichier de cookies se retrouve dans les couches de l'étape de build (absentes de l'image finale, mais présentes dans le cache local de construction).
- **Node 22 en image, Node 24 en local** (`@types/node` 24) : écart d'environnement.

## Docker Compose

Services : `db` (PostgreSQL 16), `redis` (7, AOF), `backend`, `pot-provider`, `transcription-worker`, `stems-worker`.

Bonnes pratiques constatées :
- `security_opt: no-new-privileges`, `cap_drop: [ALL]`, `init: true` sur backend et workers.
- Limites `mem_limit` / `cpus` (768 Mo / 1 CPU pour l'API, 2 Go / 2 CPU pour les workers).
- Ports de la base, de Redis et de l'API **liés à `127.0.0.1`** ; `pot-provider` non publié.
- `depends_on` avec `service_healthy` pour la base et Redis ; `restart: unless-stopped`.
- Mot de passe PostgreSQL **obligatoire** (`${POSTGRES_PASSWORD:?…}`) ; cookie YouTube monté en lecture seule en VPS (`/etc/secrets/…`, `create_host_path: false`).
- Volumes nommés pour modèles et fichiers temporaires.

Constats :
- **SEC-11** : `env_file: .env` identique pour l'API et les deux workers : les workers reçoivent SendGrid, Google, Cloudinary dont ils n'ont pas l'usage.
- **SEC-13** : image `brainicism/bgutil-ytdlp-pot-provider` sans tag ni digest ; elle peut changer à chaque `pull`.
- **DOCKER-02** : seul `backend` possède un `healthcheck` ; `depends_on: pot-provider` en `service_started` seulement.
- Redis sans mot de passe : acceptable car interne et lié à la boucle locale ; à renforcer si exposé.
- **DOCKER-01** : aucun service ni image pour le worker d'accords.

## Déploiement

- **Frontend** : Vercel (`vercel.json` : en-têtes de sécurité, cache immuable sur `/assets/`, réécriture SPA).
- **Backend** : `render.yaml` ne décrit que le **worker de transcription** (disque de 10 Go pour le cache du modèle) ; le service web est donc défini hors du fichier (tableau de bord) : non vérifiable ici. Option VPS : `docker-compose.vps.yml` + `deploy/Caddyfile.example` (Caddy en frontal, compression, TLS automatique).
- Migrations : `start:render` lance `recover-known-migration.mjs` (DB-02) avant `start:prod`.

## Environnements

Séparation par fichiers `.env.<NODE_ENV>[.local]` (`getEnvironmentFilePaths`, `prisma.config.ts`) et variables d'hébergeur. `validate-environment.ts` durcit la production (secret JWT, URL HTTPS, origines). Aucune fuite entre environnements constatée. Les fichiers `backend/.env*` réels ne sont **pas suivis** (`git ls-files` ne remonte que `.env.example`).

## CI/CD

**Les deux dépôts ont leur propre CI** (`backend/.github/workflows/ci.yml`, `frontend/.github/workflows/ci.yml`) ; le fichier `guitare/.github/workflows/ci.yml` à la racine est orphelin (CI-03).

| Étape | Backend | Frontend |
|---|---|---|
| Actions épinglées par SHA, `permissions: contents: read` | oui | oui |
| Bun 1.4.4 fixé, installation figée | oui | oui |
| `bun audit --audit-level=high` | oui, **échoue aujourd'hui** (SEC-01) | oui, passe (4 *moderate*) |
| Lint, typecheck, build, tests | oui (`validate`) | oui (`validate`), **échoue** (CI-01, TEST-02) |
| PostgreSQL + Redis de service, migrations | oui | — |
| E2E | `test:e2e` | **non** (Playwright non lancé) |
| `pip-audit` | oui (sauf `workers/chords`) | — |
| Tests Python | transcription et stems | — |
| Build Docker, scan d'image, scan de secrets, SAST | **non** | non |
| Déploiement, retour arrière | non décrit dans la CI (via hébergeurs) | non décrit |

Écart de configuration à signaler : l'étape « Audit Python » installe `pip-audit` sans version.

## Recommandations

1. Rendre la CI verte (SEC-01, CI-01, TEST-02, TEST-04).
2. Ajouter une étape `docker build` (avec cache) et un scan `trivy` ; ajouter `gitleaks`.
3. Supprimer `guitare/.github/` (CI-03) et décider où vit `docs/` (racine non versionnée).
4. Healthchecks et `read_only` pour les workers ; fichiers d'environnement par service ; épingler `pot-provider`.
5. Documenter la sauvegarde et la restauration (OPS-01).
