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
npm test -- audius.service.spec spotify.service.spec youtube.service.spec genius.service.spec music.service.spec
npm run lint
npm run build
```

## Known limitations

- Search results are limited to 10 per request.
- Only streamable Audius tracks are returned to the player.
- Genius matching is heuristic and optional.
