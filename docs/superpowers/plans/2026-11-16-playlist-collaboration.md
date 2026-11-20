# Playlist Collaboration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let playlist owners grant and revoke named viewer/editor access to existing friends.

**Architecture:** Persist collaborator roles on each playlist. Centralize playlist read/write authorization in `PlaylistAccessService`; keep owner-only operations separate and preserve optimistic version checks for reorder. Expose role management and collaborator-aware reads through GraphQL.

**Tech Stack:** NestJS, Prisma, GraphQL, PostgreSQL, Jest.

**Spec:** `docs/superpowers/designs/2026-11-16-playlist-collaboration.md`; roadmap Lot 4 in `backend/docs/music-product-gap-analysis-and-spec-batches.md`.

## Global Constraints

- Backend authorization is authoritative and checked against current database state.
- Collaborators must have an accepted friendship with the owner.
- Owner only: playlist metadata, visibility, delete, grant/revoke collaborator.
- Editor: add/remove/reorder items. Viewer: read only.
- Reorder keeps optimistic version conflict detection.

## Review Focus

- Private playlist access after revoked friendship: deny; cover in access-service tests.
- Viewer write attempt: deny; cover add/remove/reorder access tests.
- Editor reorders against stale version: conflict; retain existing regression.
- Revoked collaborator reads playlist: not found; cover collaborator-aware query.
- Owner always retains access independent of collaborator table rows; cover service tests.

### Task 1: Persist collaborator role and test access policy

**Files:** `backend/prisma/schema.prisma`, new playlist collaborator role/policy service and focused Jest spec.

- [x] Add role/status enums and unique playlist/user collaborator relation with cascade deletion.
- [x] Test owner, active editor, viewer, pending invitation, non-member, and former friend access cases.
- [x] Implement role-aware access service while preserving `requireOwned` for owner-only actions.
- [x] Generate and apply named development migrations using Prisma tooling.

### Task 2: Enforce access in playlist queries and item mutations

**Files:** playlist query/item command services and existing service tests.

- [x] Add failing tests for viewer read/write restrictions, invitation acceptance, and editor mutations.
- [x] Allow accepted collaborators to read private playlists and items.
- [x] Allow editors, but not viewers, to add/remove/reorder tracks.
- [x] Keep owner-only metadata/delete and expected-version reorder behavior.
- [x] Run focused backend tests and typecheck.

### Task 3: Expose collaborator management and query through GraphQL

**Files:** playlist resolver/service/types/DTOs and resolver tests.

- [x] Add owner-only invitation/role and revoke operations, validating active friendship.
- [x] Add collaborator and pending invitation listing.
- [x] Verify resolver always derives actor id from authenticated context.
- [x] Run playlist service/resolver tests and backend checks.

### Task 4: Update lot status and close verification

- [x] Record delivered backend slice and remaining frontend/notification work in roadmap.
- [x] Run final relevant tests, typecheck, targeted lint, and build; record the full-lint baseline failures.

**Remaining for lot completion:** Build the frontend experience for creating, accepting, declining, and revoking invitations; add notifications and multi-account E2E coverage. The full backend lint command reports repository-wide formatting errors; scoped lint is run separately.

**Verification completed:** 26 focused backend tests pass; backend typecheck and build pass; ESLint passes on all touched TypeScript files. A full repository lint run reported 250 formatting errors before the final scoped formatting pass; it was not rerun afterward.
