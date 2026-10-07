# Precinct Tool — Project Handoff & Status

_Last updated: 2026-10-06. This is the single source of truth for where the
project stands, how it works, and what's left. Read this first._

## 0. 2026-10-06 — UCC lean rebuild (branch `ucc-lean`)

Scope cut to what the Utah Civic Compact needs: **Utah House, Utah Senate,
county commission/council, city/town mayor + council** — candidates and
incumbents, with emails. Removed: Congress, State School Board, local school
district, county-wide offices (sheriff, clerk, …), their map layers, and the
3-step funnel. Sections 3–12 below are older and describe the pre-cut app where
they disagree with this section.

- **City lookup:** the address lookup now also queries UGRC
  `UtahMunicipalBoundaries` (261 cities/towns/metro townships) → `city`.
- **Volunteer form:** one screen (name, email, phone, optional "how can you
  help" chips, newsletter opt-in). A **Volunteer** button sits next to the
  search box; if someone uses it before looking up, the form asks for their
  address and `/api/volunteer` resolves House/Senate/county/city server-side
  (`lib/geo.js`). Submissions are written **by header name**; House, Senate,
  County and City columns are added automatically if missing.
- **Map key:** collapsible; starts collapsed in the bottom-left on phones.
- **Bug fixed:** server-side geocoding (`/api/precinct`) was failing in prod —
  the UGRC key only allows referrer `precinctlookuptool.vercel.app`, but the
  code defaulted to the Utah Dem site. Default changed; `UGRC_REFERER` env var
  still overrides.
- **Data:** `scripts/build_sheet.py` builds the whole Candidates tab:
  legislature from `le.utah.gov` + the LG filing xlsx (190 certified Nov 2026
  House/Senate candidates), plus `data/county_officials.csv` and
  `data/city_officials.csv` (harvested from county/city websites). Old CSVs and
  dead pipeline scripts moved to `data/legacy/` / deleted.
- **Data as of 2026-10-07:** 1,792 rows — 220 legislature (212 with email),
  183 county commission/council incumbents + certified Nov 2026 candidates
  across all 29 counties, 1,389 mayors/council members across all 257
  municipalities (118 places with at least one email; 12 tiny towns fall back
  to a single "Mayor & Council" card linking the town site / Utah Public
  Notice page). Harvested by agents from official county/city pages, clerk
  certifications and PMN notices; every row's **`Source`** column in
  `data/county_officials.csv` / `data/city_officials.csv` says where it came
  from and flags anything uncertain (search-only rosters, handwritten emails,
  inferred seat letters). Spot-check those before relying on them.
- **Note:** Utah municipal elections are odd-year, so city rows are all
  incumbents (no 2026 city candidates). County commission/council seats are on
  the 2026 ballot.
- Sub-county / sub-city districts (e.g. SL County Council District 3, SLC
  Council District 5) have no statewide GIS layer, so a voter sees the whole
  county commission/council and whole city council, labeled by seat.

---

## 1. What this is

A geo-personalized civic-engagement funnel built on top of a precinct-lookup
map. A voter enters their address and gets:

1. Their **precinct + legislative districts** (house, senate, congress, school
   board, school district) on an interactive map.
2. **Their candidates** — pulled live from a Google Sheet the organizers
   maintain, with photo, bio, contact, social links, and campaign priorities.
3. A **"Get Involved" funnel** — a 3-step modal that captures issue priorities,
   volunteer capacity, and contact info, then writes the lead to a Google Sheet.

The design goal is **maximum flexibility for organizers with minimum moving
parts**: they run everything from two Google Sheets. No database, no admin app,
no custom CMS. Deploy = a static page + a handful of serverless functions on
Vercel.

**One-liner:** address in → precinct + candidates out → volunteer captured to a
spreadsheet organizers already know how to use.

---

## 2. Origin & how we got here

- Forked from the **`UtahDemPrecinctMap`** repo (GitHub: `CatAuditor/UtahDemPrecinctMap`),
  from the `volunteer-funnel` branch at commit `e9e86f6`.
- This folder (`~/Desktop/precinct tool`) is a **clean copy** intended to become
  its **own fresh git repo and its own Vercel project**, so its deployment and
  errors never mix with the live Utah Dem site (which stays on that repo's
  `main`).
- The original map (precinct lookup + district layers) was already built and
  deployed. This project **adds** the candidate + volunteer funnel on top and
  makes everything **per-client configurable** via environment variables.

### Key architecture decision: Google Sheets, not a database
An earlier draft used Neon Postgres + a custom admin UI for candidates. We
**removed it** because:
- Organizers want to live in spreadsheets, not a custom UI.
- The volunteer follow-up "queue" lives in the sheet itself (timestamp +
  Status + DateContacted columns), so a DB wasn't needed for that.
- Fast reads are handled by CDN + in-memory caching; write reliability by retry.
- A separate database was more operational surface (another login, connection
  strings, migrations) than it was worth at this volume.

Result: **one external system (Google Sheets), one service account, zero npm
runtime dependencies** (the Sheets OAuth JWT is signed with Node's built-in
`crypto`).

---

## 3. Current status at a glance

| Area | State |
|---|---|
| Precinct + district lookup + map | ✅ Working (inherited, unchanged) |
| Candidate cards from Google Sheet | ✅ Built + **verified live** (read + district match) |
| Dynamic issue/capacity options (`/api/config`) | ✅ Built + **verified live** |
| 3-step Get Involved funnel + submit | ✅ Built + **`/api/volunteer` verified live** (append + read-back) |
| Volunteer append to Submissions tab | ✅ Built (with retry) + **verified live** |
| iframe / Squarespace embed (`?embed=1`) | ✅ Built |
| Per-client env-var config | ✅ Built |
| Google service account | ⚠️ Created (`precinct-lookup@…`), **key exposed in chat — still must rotate** |
| Google Sheets created & shared | ✅ Done — both created, shared to the SA, populated with headers + sample rows |
| Deployed to its own Vercel project | ✅ Deployed — `precinctlookuptool` (Vercel), all env vars set, protection off |

**Bottom line:** live and working end-to-end as of 2026-07-01. The full Google
Sheets round-trip (auth → read Config/Candidates → append to Submissions →
read-back) was smoke-tested against the real sheets **and** over HTTP — all
green. Remaining real risk items: rotate the exposed key, and the sheets
currently hold **placeholder** candidates/issues (swap for real data).

**Update 2026-07-07 — real 2026 data loaded + county/status support:**
- The Candidates tab now holds **319 real rows** (all 75 House / 29 Senate /
  4 US House / 15 State School Board districts + 35 county officeholders in the
  5 biggest counties), built by `scripts/build_state_candidates.py` (pulls the
  official `le.utah.gov/data/legislators.json` + the LG's Candidate-Filing xlsx)
  and `scripts/build_master.py` (merges `county_incumbents.csv` → pushes via
  `scripts/push_candidates.js`). Rerun the pipeline after **July 20** primary
  certification to auto-resolve the 21 PRIMARY-PENDING races.
- Schema grew: `Party`, `Incumbent`, `Status` columns; `county` DistrictType
  (matched by county name); status badges (Primary pending / Not on 2026 ballot)
  and party/incumbent badges on candidate cards.
- The live Submissions tab gained `SchoolBoard | SchoolDistrict` columns after
  `Congress` (via `scripts/fix_submissions_columns.js`) to match the new
  volunteer.js row order — done BEFORE deploying that code.
- Known data gaps: county challengers (all 164 races), 24 small counties'
  incumbents, local school-board sub-district seats (no GIS layer), website/
  volunteer/donate links on all rows. See the 2026-07-07 audit in the repo chat.

---

## 4. Architecture

```
Browser (static index.html, built by build.js)
  │
  ├── Address → UGRC geocoder → lat/lng
  ├── lat/lng → ArcGIS FeatureServers → precinct + districts (client-side fetch)
  │
  ├── GET /api/candidates?houseDistrict=..&senateDistrict=..   ─┐
  ├── GET /api/config                                           │  Vercel
  └── POST /api/volunteer                                       │  serverless
                                                                │  functions
      /api/*  →  lib/sheets.js  →  Google Sheets API (service acct)
                 lib/config.js  →  all env-var config
```

- **Frontend:** a single static `index.html` (Leaflet map + vanilla JS). No
  framework, no build step beyond `build.js` string-injecting env values into
  `%%PLACEHOLDER%%` tokens.
- **Backend:** Vercel serverless functions in `/api`. Node, CommonJS, `fetch`.
- **Data layer:** Google Sheets via `lib/sheets.js` (service-account auth).
- **Config:** everything client-specific is an env var, read through
  `lib/config.js`. New client = new Vercel project + new env vars, no code change.

---

## 5. End-to-end user flow

1. User loads the page (optionally embedded via iframe with `?embed=1`).
2. Types address → autocomplete (OpenStreetMap Nominatim) → picks one.
3. `findPrecinct()` geocodes via UGRC, then queries ArcGIS for precinct + house
   + senate; draws them on the map; opens the sidebar.
4. Sidebar shows precinct info, districts, and **"Your Candidates"** (fetched
   from `/api/candidates` by district).
5. User clicks **"Get Involved →"** → modal funnel opens:
   - **Step 1** "What issues are your top priority?" — chips from `/api/config`.
   - **Step 2** "How can you help?" — capacity chips from `/api/config`.
   - **Step 3** contact form: first/last/email/phone + two checkboxes
     ("help strengthen civic engagement", "subscribe to newsletter").
6. Submit → `POST /api/volunteer` → row appended to the **Submissions** tab with
   a timestamp and `Status = New`. Success screen shown.

---

## 6. File-by-file

| File | Purpose |
|---|---|
| `index.html` | The whole frontend: map, sidebar, candidate cards, funnel modal. Contains `%%PLACEHOLDER%%` tokens replaced at build time. |
| `build.js` | Replaces `%%…%%` tokens in `index.html` with env values. **Fails the build if `UGRC_API_KEY` is missing.** |
| `api/precinct.js` | (Inherited) Server-side precinct lookup API + HTML embed generator. Uses `lib/config`. |
| `api/candidates.js` | Reads candidate sheet, filters by district, returns shaped JSON. CDN + 60s in-memory cache. |
| `api/config.js` | Returns `{ issues[], capacity[] }` from the volunteer sheet's Config tab. Cached. |
| `api/volunteer.js` | Validates + appends a signup row to Submissions (retry x3); optional webhook forward. |
| `lib/config.js` | Central env-var config: geocoding, ArcGIS URLs, branding/geo, Google account, sheet IDs/tabs, timezone, optional webhook. |
| `lib/sheets.js` | Minimal Google Sheets client: service-account JWT (signed w/ `crypto`), token cache, `readRange` / `appendRow` / `rowsToObjects`. |
| `vercel.json` | Build command + output dir. |
| `.env.example` | Every env var with notes. Copy to `.env` locally / set in Vercel. |
| `EMBED.md` | How to embed via iframe on Squarespace etc. |
| `sheet-templates/` | Importable CSVs (Candidates/Config/Submissions) + import README. |
| `docs.html` | (Inherited) API reference page for `/api/precinct`. |
| `pitch/` | Business pitch/brief (gitignored). Background + roadmap rationale. |

---

## 7. Data model (the two spreadsheets)

### Candidate spreadsheet — tab `Candidates`
Header row (order-independent; code reads by header name):

`Name | Office | DistrictType | District | Party | Incumbent | PhotoURL | Bio |
Website | Email | Phone | Facebook | Instagram | X | VolunteerURL | DonateURL |
TopIssues | Active | Order`

- All offices share this one tab; the app filters a voter's races by
  `DistrictType` + `District`. Group rows by `DistrictType` for readability
  (congress → senate → house → school_board → school_district → county — the
  order the API returns them in too). A new office type is just a new
  `DistrictType` value, no code change.
- `DistrictType` ∈ `senate | house | county | city` since 2026-10-06 (see §0 and
  `sheet-templates/README.md`).
- `District` = the value exactly as GIS returns it: a **number** for
  congress/senate/house/school_board (e.g. `10`); the district **name** for
  `school_district` (e.g. `Granite`); the **county name** for `county` (e.g.
  `Salt Lake`). Name-typed values (`school_district`, `county`) match
  case/whitespace-insensitively.
- `Party` = free text (`Republican`/`Democratic`/`Unaffiliated`/…); rendered as a
  colored pill (blue = D, red = R). Blank is fine.
- `Incumbent` = `TRUE` for the current officeholder; renders an "Incumbent"
  badge. Accepts TRUE/yes/y/1.
- **County-office caveat:** `county` matches the whole county, so county-wide
  offices (sheriff, clerk, attorney, assessor) are exact, but sub-county seats
  (council/commission districts) will over-show to the whole county — same
  sub-district geo gap as local school board. Acceptable for v1.
- `TopIssues` = comma-separated in one cell (e.g. `Education, Housing`).
- `Active` = `TRUE`/`FALSE` (also accepts no/0/n as false).
- `Order` = sort order within a district.
- Share with the service account as **Viewer**.

### Volunteer spreadsheet — tab `Config`
Two independent columns; blank cells ignored:

`Issues | Capacity`

These drive the funnel's Step 1 and Step 2 options. Organizers edit them
anytime; changes appear within ~60s (cache TTL).

### Volunteer spreadsheet — tab `Submissions`
Since 2026-10-06 the app writes **by header name** (any order; extra columns
stay blank). Default header for a new tab:
`Created | FirstName | LastName | Email | Phone | House | Senate | County | City |
Precinct | Capacity | Address | Newsletter | Status | DateContacted | Notes | SourceURL`

Old fixed order (still works — legacy columns just stay blank):

`Created | FirstName | LastName | Email | Phone | TopIssues | Capacity |
Precinct | County | House | Senate | Congress | SchoolBoard | SchoolDistrict |
Address | HelpElect | Newsletter | Status | DateContacted | SourceURL`

- `Created` = timestamp in `CLIENT_TIMEZONE`.
- `Status` = `New` on insert; organizers work the queue from here.
- `DateContacted` = blank; organizers fill it during follow-up.
- Share the volunteer spreadsheet with the service account as **Editor**.

---

## 8. Environment variables

| Var | Required | Notes |
|---|---|---|
| `UGRC_API_KEY` | ✅ | UGRC geocoder key. Build fails without it. |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | ✅ | e.g. `precinct-lookup@precinct-lookup-501120.iam.gserviceaccount.com` |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | ✅ | The `private_key` from the JSON. Paste with literal `\n`, no quotes in Vercel. Code normalizes `\n`→newlines. |
| `CANDIDATE_SHEET_ID` | ✅ | From the candidate sheet URL between `/d/` and `/edit`. |
| `VOLUNTEER_SHEET_ID` | ✅ | From the volunteer sheet URL. |
| `CANDIDATE_TAB` | – | Default `Candidates`. |
| `VOLUNTEER_CONFIG_TAB` | – | Default `Config`. |
| `VOLUNTEER_SUBMISSIONS_TAB` | – | Default `Submissions`. |
| `CLIENT_NAME` | – | Default `Utah Civic Compact`. Shown in header + newsletter checkbox. |
| `CLIENT_STATE` / `CLIENT_STATE_ABBR` | – | Default `Utah` / `UT`. |
| `CLIENT_GEO_VIEWBOX` | – | Nominatim bounding box `w,s,e,n`. |
| `CLIENT_MAP_CENTER_LAT/LNG/ZOOM` | – | Initial map view. |
| `CLIENT_TIMEZONE` | – | Default `America/Denver`. Used for the `Created` timestamp. |
| `ARCGIS_BASE` + `*_SVC_PATH` | – | Override ArcGIS services for a different state. |
| `VOLUNTEER_WEBHOOK_URL` | – | Optional: also POST each signup here (Zapier/Make/custom). |
| `VOLUNTEER_WEBHOOK_SECRET` | – | Optional HMAC-SHA256 signing secret for the webhook. |

---

## 9. Setup / deploy checklist (fresh)

> **Current deployment (2026-07-01):** live on Vercel project `precinctlookuptool`
> (owner `cradcli4-7333`). Prod alias:
> `https://precinctlookuptool-cradcli4-7333s-projects.vercel.app`. GitHub repo
> `CatAuditor/precinctlookuptool` is connected for auto-deploys on push to `main`.
> All required env vars are set (prod/preview/dev); Deployment Protection is off.
> Candidate sheet = file titled **"Candidates/incumbent"** (`1Wmi-xpg…Pu2U`,
> `Candidates` tab); volunteer sheet = file titled **"Volunteer"**
> (`1X5eHi4K…KWEs8`, `Config` + `Submissions` tabs). Both shared to the SA. The
> steps below are the generic recipe for standing up a **new** client from scratch.

1. **Rotate the service-account key** (the earlier one was pasted into a chat).
   Google Cloud → Credentials → the service account → Keys → delete old →
   create new JSON. See §12.
2. **Create the two Google Sheets** by importing `sheet-templates/*.csv`
   (see `sheet-templates/README.md`).
3. **Share** them with the service-account email (candidate = Viewer,
   volunteer = Editor).
4. **New Vercel project** from this repo. Set all required env vars (§8).
5. **Deploy.** Then smoke-test:
   - `GET /api/config` → returns your issue/capacity lists.
   - Do a real address lookup → candidates show → submit funnel → row lands in
     the Submissions tab.
6. Optional: embed on the site via iframe (`?embed=1`, see `EMBED.md`).

---

## 10. Per-client / multi-tenant model

The only client-specific things are **env vars** and **the two sheets**. To add
another state party or client:
- New Vercel project (or new deployment) from the same codebase.
- New service account + two sheets, or reuse a service account shared into new
  sheets.
- Set `CLIENT_*` branding/geo vars and `ARCGIS_*` service paths for that state.

No code changes required. Keep it that way — resist hardcoding client specifics.

---

## 11. What's tested vs. NOT

**Verified:**
- All JS syntax (`node --check`) on every API + lib file.
- `build.js` token injection produces zero leftover `%%…%%`.
- Every `onclick` handler in `index.html` maps to a defined function.
- No secrets in tracked files.
- **Live (2026-07-01):** service-account auth returns a token; `readRange` reads
  the real `Config` and `Candidates` tabs; `appendRow` writes to `Submissions`
  and the row is confirmed on read-back (test rows cleaned up afterward).
- **Live over HTTP** on the deployed site: `GET /api/config`, `GET
  /api/candidates?houseDistrict=10&senateDistrict=5` (district match returns the
  right candidates), and `POST /api/volunteer` all return 200.

**Still NOT tested:**
- The funnel end-to-end in a real browser (address → precinct → candidates →
  modal → submit). APIs are proven; the UI wiring is only code-verified.
- District matching against **real** GIS values — verified only with the
  placeholder sample (`house/10`, `senate/5`). Confirm real candidate `District`
  strings equal exactly what ArcGIS returns when real data is loaded.

---

## 12. Known gaps / TODO / next steps

**Immediate**
- [ ] **Rotate the exposed service-account key** (private key was shared in chat,
      and again in the 2026-07-01 setup session). Update `GOOGLE_SERVICE_ACCOUNT_KEY`
      on Vercel after rotating.
- [x] ~~Create + share the two sheets; wire env vars; first deploy + smoke test.~~
      Done 2026-07-01 — see the sheet IDs in Vercel env vars; both smoke-tested live.
- [ ] Replace the **placeholder** candidate rows (Jane Smith / Bob Lee) and the
      sample issue/capacity lists with real organizer data.
- [ ] Do the browser-level end-to-end pass (only the APIs were smoke-tested).
- [ ] Consider adding a **`/api/health`** endpoint that verifies the service
      account can read both sheets and reports misconfig — makes first-deploy
      debugging one click. (Discussed, not yet built.)

**Small polish**
- [ ] `index.html` footer still has **Utah-specific data-source attribution**
      links — parameterize if going multi-state (hidden in `?embed=1` mode).
- [ ] Candidate `District` matching is an exact string compare for the numeric
      types (house/senate/congress/school_board) — verify the format organizers
      enter matches GIS exactly (e.g. `10` vs `HD-10`). `school_district` is
      matched case/whitespace-insensitively. The GIS `NAME` values were verified
      live (2026-07-01): plain names, **no "School District" suffix** (e.g.
      `GRANITE` → `Granite`, `SALT LAKE CITY` → `Salt Lake City`). The full list
      of 41 valid title-cased names is in `sheet-templates/README.md`.

**Future phases (from the pitch, not yet built)**
- Phase 3 issue matching is partially here (issue capture exists; matching
  captured issues back to candidates/campaigns is future).
- Phase 4 campaign engine (organizer-created campaigns, deep links, QR codes).
- Phase 5 letter writing; Phase 6 phone banking; Phase 7 admin dashboard;
  Phase 8 volunteer impact dashboard. See `pitch/PITCH.md`.

---

## 13. Security notes

- **The service-account private key was pasted into a chat and must be rotated.**
  Until then, treat it as compromised. Its blast radius is limited to sheets
  shared with it, but rotate before going live.
- `.env` is gitignored; never commit real keys. Only `.env.example` (dummy
  placeholder) is tracked.
- The public app exposes only public precinct data. Volunteer submissions are
  write-only into the client's own sheet. The app is intentionally iframe-able;
  there is no admin surface to protect (organizers use Google's own auth on the
  sheets).

## 14. Candidate photo hosting

Photos referenced by `PhotoURL` must be **stable, non-expiring URLs**. Some
county filing systems (e.g. Davis's "candidateinsight" API) serve photos via
Azure Blob SAS-signed URLs that expire same-day — those cannot be used
directly.

**Convention:** download the image, commit it to `candidate-photos/` in this
repo (Vercel serves the whole repo root statically per `vercel.json`), named
`<county-slug>-<candidate-slug>.jpg`, then set `PhotoURL` to
`https://precinctlookuptool-cradcli4-7333s-projects.vercel.app/candidate-photos/<file>`.
Only commit photos for candidates actually present in the candidate data —
don't carry primary-losers' photos as dead weight.
