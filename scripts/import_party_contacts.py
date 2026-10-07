#!/usr/bin/env python3
"""
import_party_contacts.py — pull PUBLIC campaign contact info for legislative
candidates out of a party's internal tracking sheet into
data/legislature_contacts.csv (which scripts/build_sheet.py merges in).

Only campaign email, website, donate link and social URLs are kept. Home
addresses, phones, finances, tiers and notes in the source sheet are ignored,
and the source file itself stays out of the repo.

Built for the Utah Democratic Party's "Statewide Candidate Contact Info - HD SD
SBOE Candidates" export (first column = HD12 / SD5 / USBOE 4; rows marked
WITHDREW / OUT AT … are skipped). Rows from other sources already in the output
file (e.g. read from LG declarations) are kept; this party's sheet rows are replaced.

Usage:  python3 scripts/import_party_contacts.py <export.csv> [--party Democratic]
"""
import csv, os, re, sys
from urllib.parse import urlparse, parse_qs

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "legislature_contacts.csv")
COLS = ["DistrictType", "District", "Party", "Name", "Email", "Website",
        "Facebook", "Instagram", "X", "DonateURL", "Source"]
EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
URL_RE = re.compile(r"(?:https?://|www\.)\S+|\b[\w-]+\.(?:com|org|net|vote|win|us)\b\S*", re.I)
CAMPAIGN_WORDS = re.compile(r"for|4|vote|elect|campaign|senate|house|hd\d|sd\d", re.I)


def unwrap(url):
    """Google redirect links → their target; add a scheme; strip tracking params."""
    if "google.com/url" in url:
        url = parse_qs(urlparse(url).query).get("q", [url])[0]
    if not url.lower().startswith("http"):
        url = "https://" + url
    return re.sub(r"[?&](utm_\w+|igsh|fbclid|mibextid|rdid|share_url|hl|_r|_t)=[^&]*", "", url).rstrip("?&")


def domain(url):
    return urlparse(url).netloc.lower().removeprefix("www.")


def name_tokens(name):
    return [t for t in re.sub(r"[^a-z ]", " ", name.lower()).split() if len(t) >= 4]


def pick_email(emails, own, website, name):
    """emails = all found; own = those from the candidate's own (first) Email
    column. The later "public" columns have copy-paste mixups, so an address
    found only there must match the website domain or the candidate's name."""
    def score(e):
        local, _, dom = e.lower().partition("@")
        s = 0
        if website and dom == domain(website):
            s += 4
        if any(t in local for t in name_tokens(name)):
            s += 2
        if (e in own or not own) and CAMPAIGN_WORDS.search(local + dom.split(".")[0]):
            s += 1
        return s
    ranked = [e for e in emails if e in own or score(e) >= 2] or emails
    return max(ranked, key=score) if ranked else ""   # max keeps the first on ties


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    party = sys.argv[sys.argv.index("--party") + 1] if "--party" in sys.argv else "Democratic"
    rows = list(csv.reader(open(sys.argv[1], encoding="utf-8-sig")))
    hdr = rows[0]
    col = {h.strip(): i for i, h in reversed(list(enumerate(hdr)))}   # first occurrence wins
    i_name = col["Candidate Name"]
    email_cols = [i for i, h in enumerate(hdr) if h.strip() == "Email"]
    site_cols = [i for i, h in enumerate(hdr) if h.strip() == "Website"]

    out = []
    for r in rows[1:]:
        m = re.match(r"^(HD|SD)\s*(\d+)$", (r[0] if r else "").strip())
        # Nominees, plus late replacements the sheet hasn't marked YES yet;
        # build_sheet.py only uses rows that match someone on the LG ballot list
        out_of_race = re.search(r"WITHDREW|OUT AT|WILL DROP|NO D FILED", " ".join(r[1:3] + r[i_name:i_name + 1]).upper())
        if not m or len(r) <= i_name or not r[i_name].strip() or out_of_race:
            continue
        name = re.sub(r"\s+", " ", r[i_name].replace('""', '"')).strip()
        cells = EMAIL_RE.sub(" ", " ".join(r[i] for i in range(len(r)) if i not in email_cols))
        cells = re.sub(r"(FALSE|TRUE)\b", " ", cells)   # flag cells glued onto URLs
        urls = [unwrap(u) for u in URL_RE.findall(cells)]

        # Website: campaign site from the Website columns. Prefer one naming the
        # candidate (the sheet has copy-paste mixups); skip non-campaign hosts.
        sites = [unwrap(u) for i in site_cols for u in URL_RE.findall(EMAIL_RE.sub(" ", r[i] if i < len(r) else ""))]
        sites = [u for u in sites if not re.search(r"ballotpedia|actblue|instagram|facebook|linktr\.ee|cachechildrenschoir", u)]
        named = [u for u in sites if any(t in domain(u) for t in name_tokens(name))]
        website = (named or sites or [""])[0]

        # Socials: keep only handles that name the candidate, match their
        # website, or are opaque Facebook profile/share links. Drops the
        # sheet's mixups (another candidate's or a business's account).
        site_base = re.sub(r"[^a-z0-9]", "", domain(website).split(".")[0]) if website else ""
        def social(pattern):
            for u in urls:
                if not re.search(pattern, domain(u)):
                    continue
                handle = re.sub(r"[^a-z0-9]", "", urlparse(u).path.lower())
                if (any(t in handle for t in name_tokens(name)) or (site_base and site_base in handle)
                        or re.search(r"profile\.php|/share/|/people/", u)):
                    return u
            return ""

        emails, own = [], EMAIL_RE.findall(r[email_cols[0]] if email_cols[0] < len(r) else "")
        for i in email_cols:
            for e in EMAIL_RE.findall(r[i] if i < len(r) else ""):
                if e.lower() not in (x.lower() for x in emails):
                    emails.append(e)
        out.append({
            "DistrictType": "house" if m.group(1) == "HD" else "senate",
            "District": str(int(m.group(2))), "Party": party, "Name": name,
            "Email": pick_email(emails, own, website, name), "Website": website,
            "Facebook": social(r"facebook\.com"), "Instagram": social(r"instagram\.com"),
            "X": social(r"^(x|twitter)\.com"),
            "DonateURL": next((u for u in urls if "actblue.com" in u), ""),
            "Source": f"{party} party contact sheet",
        })

    keep = []
    if os.path.exists(OUT):
        keep = [r for r in csv.DictReader(open(OUT)) if r["Source"] != f"{party} party contact sheet"]
    with open(OUT, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=COLS)
        w.writeheader()
        w.writerows(keep + out)
    print(f"{len(out)} {party} candidates → {OUT} ({sum(1 for o in out if o['Email'])} with email)")


if __name__ == "__main__":
    main()
