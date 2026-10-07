# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Read `HANDOFF.md` first** — it is the single source of truth for project status, the data model, the full env-var list, and the deploy checklist. This file covers only what you need to work in the code.

## What this is

A geo-personalized civic-engagement funnel on top of a precinct-lookup map. Address in → precinct + legislative districts + that voter's candidates out → volunteer signup captured to a Google Sheet. Design goal: organizers run everything from **two Google Sheets** — no database, no admin UI, no CMS. Deploy = a static page + serverless functions on Vercel.

## Commands

```bash
npm run build          # runs build.js — see the gotcha below
node --check <file>    # syntax-check an API/lib file (the project's only "test")
```

There is **no test runner, linter, or dev server**. Vercel serves `index.html` statically and runs `/api/*.js` as serverless functions; to exercise APIs locally use `vercel dev` (Vercel CLI) with a populated `.env`. Verification is done via `node --check` on each file in `api/` and `lib/`.

## Critical build gotcha

`build.js` reads `index.html`, replaces `%%PLACEHOLDER%%` tokens with env values, and **writes the result back over `index.html` in place** (it is not a separate output file). Running `npm run build` locally therefore **destroys the tokens in the source file** and bakes in whatever env you had. On Vercel this is fine (fresh checkout each deploy), but **do not run the build locally and commit the result.** If tokens ever go missing from `index.html`, restore it from git. There are 11 `%%...%%` tokens; `build.js` fails hard if `UGRC_API_KEY` is unset (the server-side geocode proxy needs it).

## Architecture

```
Browser (static index.html — Leaflet + vanilla JS, no framework)
  ├─ address → GET /api/geocode (server proxy to UGRC; key never reaches the browser)
  ├─ lat/lng → ArcGIS FeatureServers (client-side) → precinct + House + Senate + county + city
  ├─ GET  /api/candidates?houseDistrict=..&senateDistrict=..&county=..&city=..
  ├─ GET  /api/config           → { issues[], capacity[] }; the form uses capacity only
  └─ POST /api/volunteer        → appends a signup row to the Submissions tab
                                  (resolves House/Senate from the address via lib/geo.js if missing)
        api/*  →  lib/sheets.js  →  Google Sheets API (service-account JWT)
                  lib/config.js  →  all env-var config
```

Two hard rules that shape everything:

1. **Config is env-vars-only, funneled through `lib/config.js`.** Nothing client-specific is hardcoded. Adding a new client = new Vercel project + new env vars + two new sheets, **zero code changes**. Resist hardcoding client specifics (state names, districts, ArcGIS URLs, branding) — thread them through `lib/config.js` and, if they reach the frontend, through a `%%TOKEN%%` in `build.js`. **`lib/config.js` defaults and `build.js` defaults must stay in sync** (both currently default to Utah).

2. **Zero npm runtime dependencies.** `lib/sheets.js` signs the Google OAuth JWT with Node's built-in `crypto` — do not pull in `googleapis` or a JWT library. It caches the access token in-module and exposes `readRange` / `appendRow` / `rowsToObjects`.

## Scope (UCC lean rebuild, 2026-10-06)

Offices shown: **Utah House, Utah Senate, county commission/council, city/town mayor + council** — nothing else. `DistrictType` ∈ `house | senate | county | city`. Congress, school board and county-wide offices (sheriff, clerk, …) were removed on purpose; don't add them back without asking. Candidate data is built by `scripts/build_sheet.py` (see HANDOFF §7).

## Data flow specifics

- **Sheets are read by header name, not column position** — code maps rows to objects via `rowsToObjects`, so organizers can reorder columns. `api/volunteer.js` also writes `Submissions` **by header name** (normalized: "First Name" = "FirstName"), auto-adding `House`/`Senate`/`County`/`City` headers if missing.
- **Candidate district matching is an exact string compare** between the sheet's `District` cell and the value ArcGIS returns (e.g. `10`). Format mismatches (`10` vs `HD-10`) silently drop candidates.
- `api/candidates.js` and `api/config.js` use CDN + ~60s in-memory caching; `api/volunteer.js` retries the append up to 3x and can optionally forward each signup to a webhook (HMAC-SHA256 signed if a secret is set).
- `?embed=1` renders the iframe/Squarespace embed variant (hides some chrome). See `EMBED.md`.

## Secrets

`.env` is gitignored (as is `pitch/` and `.claude/`); only `.env.example` is tracked. The Google service-account private key is stored in the `GOOGLE_SERVICE_ACCOUNT_KEY` env var with literal `\n`; `lib/config.js` normalizes `\n`→newlines. Per HANDOFF, an earlier key was exposed in chat and must be rotated before go-live.
