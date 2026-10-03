# AGENTS.md

## Project intent

Build the MVP described in `docs/REQUIREMENTS.md` and keep implementation decisions aligned with `docs/ARCHITECTURE.md` and `docs/ROADMAP.md`.

## Working rules

- Keep frontend code under `frontend/` and backend code under `backend/`.
- Implement roadmap steps in order unless a dependency requires a small adjustment.
- Do not add authentication, a database, persistent upload storage, Supabase, or other out-of-scope features for MVP v1.
- Validate uploads independently in both frontend and backend.
- Never use an original filename as a server-side storage path; use server-generated identifiers.
- Do not expose filesystem paths, stack traces, or sensitive implementation details in API responses.
- Keep preview and PNG export normalization behavior consistent.
- Add or update tests for parsing, axis selection, normalization, and error cases when those areas change.
- Keep temporary-file cleanup reliable even when a browser session ends unexpectedly.

## Quality checks

Before considering a change complete, run the relevant formatter, linter, tests, and production build for the area changed. Update documentation when behavior or setup changes.

