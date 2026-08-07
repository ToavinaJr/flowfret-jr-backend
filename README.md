# backend-guitare-app

NestJS GraphQL API for FretFlow (auth, social CRUD, music search).

## Setup

```bash
cp .env.example .env.development
# fill DATABASE_URL, JWT_SECRET, YOUTUBE_API_KEY, GENIUS_ACCESS_TOKEN
npm install
docker compose up -d
npm run prisma:deploy
npm run start:dev
```

Package manager in use: **npm** (`package-lock.json`).

## Environment

See `.env.example`. Active music search requires:

- `YOUTUBE_API_KEY`
- `GENIUS_ACCESS_TOKEN`

The inactive Spotify provider is retained for possible future use and accepts:

- `SPOTIFY_CLIENT_ID`
- `SPOTIFY_CLIENT_SECRET`

Never commit real secrets.

## Music search

- YouTube Data API v3 `search.list` → `videos.list` for durations
- Genius `/search` enriches each track when the match score is high enough
- No Prisma persistence in V1

### Example query

```graphql
query SearchMusic($query: String!, $limit: Int!) {
  searchMusic(query: $query, limit: $limit) {
    total
    tracks {
      youtubeId
      title
      imageUrl
      youtubeUrl
      geniusUrl
      geniusMatchScore
      durationMs
      artists { id name }
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
npm test -- spotify.service.spec youtube.service.spec genius.service.spec music.service.spec
npm run lint
npm run build
```

## Known limitations

- Search results are limited to 10 per request to control YouTube quota use.
- YouTube does not expose direct audio preview URLs; results link to YouTube.
- Genius matching is heuristic and optional.
