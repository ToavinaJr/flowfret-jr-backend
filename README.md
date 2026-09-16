# backend-guitare-app

NestJS GraphQL API for FretFlow (auth, social CRUD, music search).

## Setup

```bash
cp .env.example .env.development
# fill DATABASE_URL, JWT_SECRET, AUDIUS_*, GENIUS_ACCESS_TOKEN
npm install
docker compose up -d
npm run prisma:deploy
npm run start:dev
```

Package manager in use: **npm** (`package-lock.json`).

## Environment

See `.env.example`. Active music search and streaming require:

- `AUDIUS_API_KEY`
- `AUDIUS_API_SECRET`
- `AUDIUS_ACCESS_TOKEN`

Set `MUSIC_PROVIDER` to `AUDIUS`, `YOUTUBE`, or `SPOTIFY` to select the
search/player source. The value is case-insensitive. When the variable is
missing, empty, or unsupported, the backend uses `AUDIUS`.

The inactive YouTube provider is retained for possible future use and accepts:

- `YOUTUBE_API_KEY`
- `GENIUS_ACCESS_TOKEN`

The inactive Spotify provider is also retained and accepts:

- `SPOTIFY_CLIENT_ID`
- `SPOTIFY_CLIENT_SECRET`

Never commit real secrets.

## Music search

- Audius track search → streamable MP3 URL → integrated web player
- Genius `/search` enriches each track when the match score is high enough
- No Prisma persistence in V1

### Example query

```graphql
query SearchMusic($query: String!, $limit: Int!) {
  searchMusic(query: $query, limit: $limit) {
    total
    tracks {
      audiusId
      title
      imageUrl
      audiusUrl
      streamUrl
      genre
      geniusUrl
      geniusMatchScore
      durationMs
      artists {
        id
        name
      }
    }
  }
}
```

Variables:

```json
{ "query": "bohemian rhapsody", "limit": 10 }
```

### Tests

```bash
npm test -- audius.service.spec spotify.service.spec youtube.service.spec genius.service.spec music.service.spec
npm run lint
npm run build
```

## Known limitations

- Search results are limited to 10 per request.
- Only streamable Audius tracks are returned to the player.
- Genius matching is heuristic and optional.

## Asynchronous synchronized lyrics

### Architecture

The API creates durable `Transcription` records in PostgreSQL and enqueues deterministic BullMQ jobs in Redis. A separate NestJS worker keeps a Python `faster-whisper` process alive, downloads a fresh Audius stream, converts it with FFmpeg, and emits word-timestamped segments progressively. Redis Pub/Sub carries events from the worker to authenticated SSE clients. Completed segments and UTF-8 LRC content are cached by Audius track ID, requested language (`auto` when omitted), Whisper model, and engine version. Signed stream URLs are never cache keys.

The initial player waits for `TRANSCRIPTION_INITIAL_BUFFER_SECONDS` (or the whole track when shorter). It then starts audio at zero and uses only `HTMLAudioElement.currentTime` to select lyrics. The worker continues in the background. If available lyrics are exhausted, playback pauses and resumes after the configured ahead buffer is restored.

### Prerequisites

- Node.js 22 and npm
- PostgreSQL 16
- Redis 7
- Python 3.11+
- FFmpeg and ffprobe on `PATH`
- `pip install -r workers/transcription/requirements.txt`

For CPU deployments, `small` with `int8` is the default. The first model load downloads model files and may require several GB of disk/RAM. Docker persists the Hugging Face cache in `whisper_models`. To use Azure OpenAI Whisper instead, set `LLM_PROVIDER=azure`, configure `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, and `AZURE_OPENAI_DEPLOYMENT` to an Azure Whisper deployment. `gpt-35-turbo` cannot process audio and must not be used for this setting. Azure processing returns the transcription after the complete audio upload, so progressive segments are emitted only after the Azure response.

### Configuration

Copy `.env.example` and configure `DATABASE_URL`, Audius credentials, Redis, Whisper, buffer, download, and allowed-host settings. Keep `TRANSCRIPTION_CONCURRENCY=1` for the persistent single-model Python bridge. Add `VITE_LYRICS_SYNC_OFFSET_MS=0` to the frontend environment; positive values advance lyric highlighting.

### Local launch

```bash
docker compose up -d db redis
npm install
npm run prisma:generate
npm run prisma:deploy
npm run build
npm run start:dev
```

In another terminal:

```bash
pip install -r workers/transcription/requirements.txt
npm run start:worker
```

Or launch the complete backend infrastructure:

```bash
docker compose up --build
```

The API and worker are separate services; restarting the worker does not stop HTTP traffic.

### Render deployment

`start:render` starts only the HTTP API. Configure Render's **Pre-Deploy Command** as `npx prisma migrate deploy` so migrations run once before the new web instance starts. The start command must remain `npm run start:render` (or `node dist/main.js`). The API cannot process transcription jobs by itself. Create the background worker from `render.yaml` (Render Dashboard **Blueprints > New Blueprint Instance**) or create a Background Worker manually with `Dockerfile.worker`.

Set a randomly generated `JWT_SECRET` of at least 32 characters in Render for the web service and worker. Copy the exact same `DATABASE_URL`, `JWT_SECRET`, `REDIS_HOST`, `REDIS_PORT`, `REDIS_USERNAME`, `REDIS_PASSWORD`, `REDIS_TLS`, and Audius variables from the web service to the worker. The API and worker must point to the same PostgreSQL database and Redis instance. A worker is a paid Render service; keep at least the `standard` plan for the `small` Whisper model. After deployment, its logs must contain `TranscriptionsWorkerModule dependencies initialized` and the BullMQ worker must remain running.

For Neon or another hosted PostgreSQL service, use the pooled URL in `DATABASE_URL` for the application and set `DIRECT_DATABASE_URL` to the provider's direct, non-pooler URL. Prisma migrations use `DIRECT_DATABASE_URL` to avoid advisory-lock timeouts through a transaction pooler. Run the migration in one service only; do not run `prisma migrate deploy` concurrently in the web service and transcription worker.

### VPS deployment

On an Ubuntu VPS, install Docker and Git, then deploy the repository with the local API, PostgreSQL, Redis, and transcription worker:

```bash
mkdir -p ~/apps
cd ~/apps
git clone https://github.com/ToavinaJr/backend-guitare-app.git
cd backend-guitare-app
cp .env.example .env
nano .env
```

Set a long random `POSTGRES_PASSWORD`, production `JWT_SECRET`, Audius credentials, and Azure transcription settings in `.env`:

```env
LLM_PROVIDER=azure
AZURE_OPENAI_ENDPOINT=https://<resource>.openai.azure.com
AZURE_OPENAI_API_KEY=<secret>
AZURE_OPENAI_DEPLOYMENT=whisper
AZURE_OPENAI_API_VERSION=2024-06-01
```

The deployment compose file keeps PostgreSQL and Redis private and exposes the API on port `3000`. Start the dependencies, apply migrations once, then start the API and worker:

```bash
docker compose up -d db redis
docker compose run --rm backend npx prisma migrate deploy
docker compose up -d --build backend transcription-worker
docker compose logs -f transcription-worker
```

The worker log must contain `worker.ready`. The API queue diagnostics must report `workerCount: 1` or higher. Do not expose ports `5434` or `6379` publicly; use a reverse proxy such as Nginx or Caddy for HTTPS on the API port.

The frontend receives the canonical `https://api.audius.co/v1/tracks/:id/stream` URL. It retries that endpoint when an Audius storage node is temporarily unreachable; signed storage-node URLs are never persisted or returned as the durable player URL.

### REST endpoints

All endpoints use the existing JWT Bearer authentication.

- `POST /api/transcriptions` — create or reuse a compatible transcription
- `GET /api/transcriptions/:id` — retrieve durable current state
- `GET /api/transcriptions/:id/events` — authenticated SSE stream
- `GET /api/transcriptions/:id/lrc` — download completed LRC
- `POST /api/transcriptions/:id/retry` — retry a failed job within the attempt limit

SSE event names are `transcription.pending`, `transcription.processing`, `transcription.progress`, `transcription.segment`, `transcription.ready-to-play`, `transcription.completed`, `transcription.failed`, and `transcription.heartbeat`. Reconnecting clients first receive a PostgreSQL snapshot, then Redis events. The frontend uses a streamed `fetch` because native `EventSource` cannot send the existing Bearer header.

### Audius and download security

The worker asks `AudiusService` for a fresh stream URL by track ID before processing. Downloads require HTTPS and an allowlisted Audius hostname. Every DNS result and redirect is checked; private, loopback, link-local, reserved, and non-global addresses are rejected. Content type, declared and actual size, redirect count, and timeouts are limited. FFmpeg only receives a server-generated local path. Signed URLs, temporary paths, and credentials are excluded from structured logs.

### Manual verification

First playback: select a never-transcribed Audius track, press Play, verify that audio stays at zero while progress/segments arrive, wait for `ready-to-play`, verify synchronized playback, click a lyric line to seek, wait for completion, then download LRC.

Second playback: select the same track and model/language, press Play, verify immediate cached lyrics and confirm that BullMQ does not receive another job.

### Tests

```bash
npm test -- --runInBand
python -m unittest discover -s workers/transcription/tests -v
npm run build
```

The frontend is tested and launched from `../flowfret-jr` with `npm test` and `npm run dev`.
