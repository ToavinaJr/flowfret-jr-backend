# Changelog

## 2026-09-24

- Hardened refresh/logout origin checks, GraphQL complexity, upload validation and provider-error sanitization.
- Removed client-controlled actor IDs from authenticated business mutations.
- Added request-scoped relation loaders and policy-based object authorization.
- Split playlist, music, auth account and transcription responsibilities into focused services.
- Added provider-neutral playlists, genres and provider-aware transcriptions.
- Added session management, password change and safe account deletion.
- Added production migrations for playlists, track genres and transcription providers.
- Expanded the backend suite to 172 passing tests.
