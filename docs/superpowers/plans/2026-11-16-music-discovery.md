# Music Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add genre-based discovery to personalized music recommendations using only genres actually returned by the configured provider.

**Architecture:** Keep the existing provider-neutral track search and recommendation API. Add pure helpers to derive available genre filters from recommendation tracks, then let the recommendations page filter those tracks and build playback queues from the visible results. Do not create album or artist entities from track metadata.

**Tech Stack:** React, TypeScript, React Query, react-i18next, Vitest, Testing Library, NestJS provider adapters (existing).

**Spec:** `backend/docs/music-product-gap-analysis-and-spec-batches.md`, Lot 3.

## Global Constraints

- Render only metadata actually received from provider APIs; no synthetic album or artist catalog.
- The current search contract returns tracks only and uses one configured provider per deployment.
- Audius tracks return genre metadata; Spotify track and YouTube video adapters currently return `genre: null`.
- User-visible labels and empty/unsupported states must be translated in English and French.
- Recommendations continue to use the existing favorites and listening-history signals and must not include tracks already played or saved.

## Review Focus

- Missing, blank, or whitespace genre metadata yields no fabricated filter; covered by `getRecommendationGenres` tests and page empty-metadata test.
- Genre values differing only by case do not produce duplicate filters; covered by helper test.
- Selecting a genre filters both visible tracks and the playback queue; covered by recommendations page test.
- A provider with no genre metadata still shows all recommendation tracks and explains why genre filtering is unavailable; covered by page test.
- No recommendation results retain the existing personalized empty state; covered by page test.

## Provider capability decision

Spotify's current Search API can return track, album, and artist result groups, with `offset` pagination, but FlowFret currently calls track search only and normalizes its GraphQL contract to tracks. Audius documents track, user, playlist, and album search, while the current adapter calls track search and provides track genre metadata. YouTube search returns video/channel/playlist resource types; FlowFret specifically searches embeddable music-topic videos and maps each video channel to the display artist. This tranche keeps the existing cross-provider track contract and exposes only actual genre values when present. Dedicated artist/album pages are deferred until FlowFret chooses a provider-aware catalog contract.

## Tasks

### Task 1: Derive genre options and filtered recommendation tracks

**Files:**
- Create: `frontend/src/components/features/music/recommendation-genres.ts`
- Test: `frontend/src/components/features/music/recommendation-genres.test.ts`

**Interfaces:**
- `getRecommendationGenres(tracks: MusicTrack[]): string[]` returns unique non-empty provider genre labels, case-insensitively deduplicated and alphabetically sorted.
- `filterRecommendationsByGenre(tracks: MusicTrack[], genre: string | null): MusicTrack[]` returns all tracks for a null selection or tracks matching the selected genre case-insensitively.

- [x] Write tests for missing metadata, duplicate labels ignoring case, sorted options, no filter, and case-insensitive filtering.
- [x] Run `npm.cmd test -- --run src/components/features/music/recommendation-genres.test.ts` and confirm the missing module causes the expected failure.
- [x] Implement the two pure helpers using `MusicTrack.genre` only.
- [x] Run the focused test and confirm it passes.

### Task 2: Add genre controls and explicit provider-metadata state

**Files:**
- Modify: `frontend/src/pages/RecommendationsPage.tsx`
- Modify: `frontend/src/i18n/locales/fr/translation.json`
- Modify: `frontend/src/i18n/locales/en/translation.json`
- Test: `frontend/src/pages/RecommendationsPage.test.tsx`

**Interfaces:**
- The page offers an “All genres” option and one option per actual genre in the returned recommendations.
- Selecting an option filters the list and playback queue to the same tracks.
- When no track has genre metadata, the page displays an explanatory note and leaves all tracks visible.
- When the active genre has no results, the page provides an accessible empty state and allows clearing the filter.

- [x] Add page tests for filtering and queue alignment, unavailable genre metadata, and no recommendations.
- [x] Run the focused page test and confirm it fails for missing controls/behavior.
- [x] Add stateful genre controls, filtered queue construction, and translated labels/states.
- [x] Run focused helper and page tests; run frontend typecheck and lint for touched files.

### Task 3: Record the provider-aware scope and implementation state

**Files:**
- Modify: `backend/docs/music-product-gap-analysis-and-spec-batches.md`

- [x] Record the provider capability decision, the genre-filter tranche, the tests run, and the deferred artist/album catalog contract.
- [x] Re-read the Lot 3 acceptance criteria and identify remaining work explicitly.

**Verification completed:** 6 focused tests pass; frontend typecheck, targeted ESLint, and production build pass. No browser-based responsive inspection was performed.
