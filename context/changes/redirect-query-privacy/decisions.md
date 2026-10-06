# Decisions: redirect-query-privacy

## 2026-10-06 Roadmap placement

- **Question:** where does backlog B-01 go?
- **Options:** roadmap foundation slice; stay in backlog.
- **Choice:** F-09 `redirect-query-privacy`, prerequisites none, PRD refs NFR (privacy), status `proposed`; B-01 moved to backlog Done with a pointer. Not added as a prerequisite of S-06/S-07 (listed under Unlocks only).
- **Evidence:** owner approval 2026-10-06 (orchestrator prompt); `context/foundation/backlog.md` B-01 (P1).
- **Decided-by:** orchestrator

## 2026-10-06 Research without sub-agents

- **Question:** dispatch research sub-agents?
- **Options:** up to 2; none.
- **Choice:** none. One grep over `src/` and `scripts/` located every redirect and query read; the rest was reading 6 files.
- **Evidence:** `research.md` scope paragraph.
- **Decided-by:** worker

## 2026-10-06 Plan decisions (pre-answered)

- **Question:** carrier, what moves, `?reminders=`, `?code=`, Workers Logs check (research Open Questions 1-5).
- **Options:** flash cookie or URL fragment; slug only or slug plus codes; keep or move `?reminders=`; change or accept `?code=`; block on the log check or not.
- **Choice:** (1) short-lived `HttpOnly` flash cookie (`SameSite=Lax`, `Path=/dashboard`, `Max-Age` 60 s, cleared on read); (2) only the slug moves, `saved`/`error` codes stay in the query; (3) `?reminders=on|off` stays; (4) `?code=` accepted as residual (single-use PKCE code, URL shape set by Supabase), no change; (5) whether Workers Logs keeps the query string stays unverified (B-01 human check) and does not block.
- **Evidence:** `research.md` §4 (no client scripts in the app; row error state is server-rendered), §2 audit table.
- **Decided-by:** orchestrator

## 2026-10-06 Plan shape

- **Question:** complexity, question budget, phase split.
- **Options:** —
- **Choice:** LOW; 0 questions (all decisions pre-answered); 2 phases: (1) flash cookie + unit tests + smoke, (2) docs and the browser check. Roadmap status flip skipped (worker protocol).
- **Evidence:** change touches 1 endpoint, 1 page, 1 component comment, 1 new helper, smoke, README.
- **Decided-by:** worker

## 2026-10-06 Clearing the flash cookie

- **Question:** `Astro.cookies.delete()` or `set(name, "", { maxAge: 0 })`?
- **Options:** delete (emits `Expires=1970`, no `Max-Age`); set with `maxAge: 0`.
- **Choice:** set with `maxAge: 0` and the same options as the set, from one helper, so the path always matches and the smoke cookie jar (`scripts/smoke.mjs:35-42`, drops a cookie only on `max-age=0`) stays unchanged.
- **Evidence:** `node_modules/astro/dist/core/cookies/cookies.js:46-58` (Astro 7.3.2).
- **Decided-by:** worker
