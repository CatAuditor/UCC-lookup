#!/usr/bin/env python3
"""
build_sheet.py — builds the full Candidates tab from four sources.

  1. le.utah.gov/data/legislators.json   — sitting House + Senate members (email,
                                           phone, photo). Incumbent base layer.
  2. LG Candidate-Filing-2026.xlsx        — every 2026 filer; rows with Status
                                           "Election Candidate" are on the Nov ballot.
  3. data/legislature_contacts.csv        — harvested emails/websites for
                                           legislative challengers (keyed by
                                           DistrictType + District + Name).
  4. data/county_officials.csv            — county commission/council incumbents
     data/city_officials.csv                + 2026 county candidates, and city/town
                                           mayors + council members. Already in
                                           sheet schema; copied through.

Writes data/candidates_sheet.csv (import into the sheet by hand) and
data/candidates_values.json (for scripts/push_candidates.js).

Usage:  python3 scripts/build_sheet.py [--xlsx path/to/local.xlsx]
Deps:   openpyxl
"""
import csv, io, json, os, re, subprocess, sys
try:
    import openpyxl
except ImportError:
    sys.exit("Need openpyxl:  pip install openpyxl")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
LEG_URL  = "https://le.utah.gov/data/legislators.json"
# The LG moves this file between uploads folders; check vote.utah.gov/2026-candidate-filings/
XLSX_URL = "https://vote.utah.gov/wp-content/uploads/2026/06/Candidate-Filing-2026.xlsx"

COLS = ["Name", "Office", "DistrictType", "District", "Party", "Incumbent", "Status",
        "PhotoURL", "Bio", "Website", "OfficialURL", "Email", "Phone", "Facebook",
        "Instagram", "X", "VolunteerURL", "DonateURL", "TopIssues", "Active", "Order"]
PARTY = {"R": "Republican", "D": "Democratic"}
NOT_UP = "INCUMBENT — not on 2026 ballot"


def fetch(url):
    # curl, not urllib: python.org builds on macOS ship without CA certs
    return subprocess.run(["curl", "-sfL", "-A", "Mozilla/5.0 (Macintosh) Chrome/128.0", url],
                          check=True, capture_output=True).stdout


def surname(name):
    parts = re.sub(r'"[^"]*"|\([^)]*\)', " ", name).replace(",", " ").split()
    parts = [p for p in parts if p.lower().strip(".") not in ("jr", "sr", "ii", "iii", "iv")]
    return re.sub(r"[^a-z]", "", parts[-1].lower()) if parts else ""


def nice_case(upper):
    """CLAUDIA BIGLER → Claudia Bigler; keeps Mc/O' and quoted nicknames sane."""
    def word(w):
        w = w.capitalize()
        w = re.sub(r"^(Mc)([a-z])", lambda m: m.group(1) + m.group(2).upper(), w)
        w = re.sub(r"([-'\"])([a-z])", lambda m: m.group(1) + m.group(2).upper(), w)
        return w
    return " ".join(word(w) for w in upper.split())


def read_csv(name):
    path = os.path.join(DATA, name)
    if not os.path.exists(path):
        return []
    with open(path, newline="", encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def legislature(xlsx_bytes):
    legs = json.loads(fetch(LEG_URL))["legislators"]
    inc = {}   # (type, district) -> legislator
    for l in legs:
        t = "house" if l["house"] == "H" else "senate"
        inc[(t, str(int(l["district"])))] = l

    ws = openpyxl.load_workbook(io.BytesIO(xlsx_bytes)).active
    running = {}   # (type, district) -> [(name, party)]
    for row in ws.iter_rows(values_only=True):
        name, office, party, status = (list(row) + [None] * 4)[:4]
        if status != "Election Candidate" or not office:
            continue
        m = re.match(r"State (House|Senate) District (\d+)", str(office))
        if m:
            running.setdefault((m.group(1).lower(), m.group(2)), []).append((nice_case(str(name)), party or ""))

    # Campaign contacts (email/site/socials) from party sheets or harvesting.
    # Match by surname, else by party when that party has one nominee there.
    contacts = read_csv("legislature_contacts.csv")

    def contact_for(t, d, name, party):
        here = [c for c in contacts if c["DistrictType"] == t and c["District"] == d]
        same = [c for c in here if surname(c["Name"]) == surname(name)]
        if not same:
            same = [c for c in here if c.get("Party") == party]
            same = same if len(same) == 1 and sum(1 for n, p in running.get((t, d), []) if p == party) == 1 else []
        return same[0] if same else {}

    CONTACT_FIELDS = ("Website", "Facebook", "Instagram", "X", "DonateURL")

    rows = []
    for t, n_seats in (("senate", 29), ("house", 75)):
        label = "Utah Senate" if t == "senate" else "Utah House"
        for d in map(str, range(1, n_seats + 1)):
            office = f"{label} District {d}"
            l = inc.get((t, d))
            cands = running.get((t, d), [])
            inc_running = l and any(surname(c[0]) == surname(l["formatName"]) for c in cands)
            if l:
                official = (f"https://house.utleg.gov/rep/{l['id']}/" if t == "house"
                            else f"https://senate.utah.gov/sen/{l['id']}/")
                c = contact_for(t, d, l["formatName"], PARTY.get(l["party"], l["party"])) if inc_running else {}
                rows.append({
                    "Name": l["formatName"], "Office": office, "DistrictType": t, "District": d,
                    "Party": PARTY.get(l["party"], l["party"]), "Incumbent": "TRUE",
                    "Status": "GENERAL" if inc_running else NOT_UP,
                    "PhotoURL": l.get("image", ""), "OfficialURL": official,
                    "Email": l.get("email", ""), "Phone": l.get("cell") or l.get("workPhone", ""),
                    "Facebook": l.get("facebook", ""), "Instagram": l.get("instagram", ""), "X": l.get("twitter", ""),
                    "Active": "TRUE", "Order": "1",
                    # Campaign site/socials win over the legislature's (often blank) ones;
                    # the official @le.utah.gov email stays
                    **{k: c[k] for k in CONTACT_FIELDS if c.get(k)},
                })
            for name, party in cands:
                if l and surname(name) == surname(l["formatName"]):
                    continue   # incumbent already listed
                c = contact_for(t, d, name, party)
                rows.append({
                    "Name": name, "Office": office, "DistrictType": t, "District": d,   # ballot spelling
                    "Party": party, "Incumbent": "FALSE", "Status": "GENERAL",
                    "Email": c.get("Email", ""), "Active": "TRUE", "Order": "2",
                    **{k: c[k] for k in CONTACT_FIELDS if c.get(k)},
                })
    return rows


def main():
    xlsx = None
    if "--xlsx" in sys.argv:
        xlsx = open(sys.argv[sys.argv.index("--xlsx") + 1], "rb").read()
    rows = legislature(xlsx or fetch(XLSX_URL))
    n_leg = len(rows)
    for f in ("county_officials.csv", "city_officials.csv"):
        rows += [{k: r.get(k, "") for k in COLS} for r in read_csv(f) if r.get("Name")]

    grid = [COLS] + [[str(r.get(k, "") or "") for k in COLS] for r in rows]
    with open(os.path.join(DATA, "candidates_sheet.csv"), "w", newline="") as f:
        csv.writer(f).writerows(grid)
    with open(os.path.join(DATA, "candidates_values.json"), "w") as f:
        json.dump(grid, f)

    by = {}
    for r in rows:
        by[r["DistrictType"]] = by.get(r["DistrictType"], 0) + 1
    emails = sum(1 for r in rows if r.get("Email"))
    print(f"{len(rows)} rows ({n_leg} legislature) by type {by}; {emails} with email")


if __name__ == "__main__":
    main()
