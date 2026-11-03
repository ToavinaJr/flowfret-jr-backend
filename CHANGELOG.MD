# Changelog

## 2026-11-02 — Vocal removal reliability

- Match Demucs CPU threads to the worker quota with validated `AUDIO_STEMS_CPU_THREADS` (default: 2).
- Stream inference progress and sanitized error details instead of suppressing subprocess output.
- Terminate the subprocess tree on the outer watchdog and reject workers that exit without a result.
- Stop automatic retries for duration/size violations and separation timeouts; retain transient-error retries.
- Recover BullMQ stalled work without accepting completed or failed cache entries.
- Apply the stems duration limit to its YouTube extraction while retaining the existing limit for other callers.
- Clean local separation outputs when storage fails; reset progress on retries.
- Add regression tests, a reproducible real-audio validation script, and Python worker coverage in CI.
- Set runtime image ownership during COPY to avoid an expensive recursive chown during rebuilds.

## 2026-09-24

- Hardened refresh/logout origin checks, GraphQL complexity, upload validation and provider-error sanitization.
- Removed client-controlled actor IDs from authenticated business mutations.
- Added request-scoped relation loaders and policy-based object authorization.
- Split playlist, music, auth account and transcription responsibilities into focused services.
- Added provider-neutral playlists, genres and provider-aware transcriptions.
- Added session management, password change and safe account deletion.
- Added production migrations for playlists, track genres and transcription providers.
- Expanded the backend suite to 172 passing tests.
