# backend-guitare-app

NestJS GraphQL API for FretFlow (auth, social CRUD, music search).

## Setup

```bash
cp .env.example .env.development
# fill DATABASE_URL, JWT_SECRET, SPOTIFY_*, GENIUS_*
npm install
docker compose up -d
npm run prisma:deploy
npm run start:dev
```

Package manager in use: **npm** (`package-lock.json`).

## Environment

See `.env.example`. Music search requires:

- `SPOTIFY_CLIENT_ID`
- `SPOTIFY_CLIENT_SECRET`
- `GENIUS_ACCESS_TOKEN`

Never commit real secrets.

## Music search

- Spotify Client Credentials → cached app token → `/v1/search?type=track`
- Genius `/search` enriches each track when the match score is high enough
- No Prisma persistence in V1

### Example query

```graphql
query SearchMusic($query: String!, $limit: Int!) {
  searchMusic(query: $query, limit: $limit) {
    total
    tracks {
      spotifyId
      title
      albumName
      imageUrl
      spotifyUrl
      previewUrl
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
npm test -- spotify.service.spec genius.service.spec music.service.spec
npm run lint
npm run build
```

## Known limitations

- Spotify Dev Mode search `limit` max is 10.
- `preview_url` may be null.
- Genius matching is heuristic and optional.
