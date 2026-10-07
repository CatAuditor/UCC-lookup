# Google Sheet templates

Import these into two Google spreadsheets so the tabs + headers match the code.
Importing a CSV names the new tab after the file, which is exactly what the app
expects (`Candidates`, `Config`, `Submissions`).

## 1. Candidate spreadsheet

1. Create a new Google Sheet. Name it e.g. "Precinct Tool — Candidates".
2. **File → Import → Upload →** `Candidates.csv`.
3. Import location: **Replace current sheet**. (Then rename the tab to `Candidates`
   if it isn't already.)
4. Delete the sample rows once you've added real candidates.
5. Copy its Sheet ID (URL between `/d/` and `/edit`) → `CANDIDATE_SHEET_ID`.

All officials and candidates live in this one tab — the app filters each
voter's races by the `DistrictType` + `District` columns. `scripts/build_sheet.py`
generates the full tab (see HANDOFF §7); organizers can edit it by hand after.

`DistrictType` must be one of: `senate`, `house`, `county`, `city`.
`District` must equal what the map returns for that type:

- `senate` / `house`: the district **number** (e.g. `10`).
- `county`: the **county name** without "County" (e.g. `Salt Lake`).
- `city`: the **city/town name as the UGRC municipal boundary layer spells it**
  (e.g. `Salt Lake City`, `West Valley City`, `St. George`, `Logan`). Metro
  townships (Magna, Kearns, …) are in that layer too.

County and city names match case/whitespace-insensitively. Within a county or
city, rows are grouped by `Office` (e.g. `Commission Seat A`, `Mayor`,
`City Council District 3`) and sorted by `Order`. `Status` starting with
`INCUMBENT — not on 2026 ballot` marks a seat that isn't up this year.
`Active` = TRUE/FALSE. Share this sheet with the service account as **Viewer**.

## 2. Volunteer spreadsheet

1. Create a second Google Sheet. Name it e.g. "Precinct Tool — Volunteers".
2. **File → Import → Upload →** `Config.csv` → **Insert new sheet(s)**.
   Rename that tab to `Config` if needed.
3. **File → Import → Upload →** `Submissions.csv` → **Insert new sheet(s)**.
   Rename that tab to `Submissions` if needed.
4. Delete the default empty "Sheet1".
5. Copy its Sheet ID → `VOLUNTEER_SHEET_ID`.

- **Config** tab: edit the `Capacity` column anytime — the "How can you help?"
  chips on the volunteer form update within ~60s. (`Issues` is no longer used.)
- **Submissions** tab: the app appends signups here, writing **by header name**,
  so you can reorder columns or add your own (e.g. `Notes`, `Assigned To`) and
  they're left blank. An empty tab gets the template headers on the first
  signup; a tab missing `House`, `Senate`, `County` or `City` gets those headers
  added at the end automatically. `Status` fills in as `New`; `DateContacted`
  is yours to fill during follow-up.

Share this sheet with the service account as **Editor** (it writes signups).
