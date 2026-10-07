/**
 * push_candidates.js — replace the Candidates tab with a values.json 2D array.
 *
 * One-off admin tool (NOT part of the app). Loads .env, authenticates as the
 * service account via lib/sheets.js, CLEARS the Candidates tab, then writes the
 * full grid. Requires the SA to have EDITOR access on the candidate sheet
 * (default share is Viewer — grant Editor first or this 403s).
 *
 * Usage:  node scripts/push_candidates.js <path-to-values.json>
 */
const fs = require('fs');
const path = require('path');

// ---- load env file into process.env (no dotenv dependency) ----
// Default is the repo .env; override with ENV_FILE for e.g. a `vercel env pull` output.
const envPath = process.env.ENV_FILE || path.join(__dirname, '..', '.env');
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const s = line.trim();
  if (!s || s.startsWith('#')) continue;
  const eq = s.indexOf('=');
  if (eq < 0) continue;
  const key = s.slice(0, eq).trim();
  let val = s.slice(eq + 1).trim();
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1);
  }
  if (!(key in process.env)) process.env[key] = val;   // literal \n kept; config normalizes
}

const config = require('../lib/config');
const { getAccessToken } = require('../lib/sheets');

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';

async function main() {
  const valuesPath = process.argv[2];
  if (!valuesPath) throw new Error('Usage: node scripts/push_candidates.js <values.json>');
  const values = JSON.parse(fs.readFileSync(valuesPath, 'utf8'));

  const id  = config.sheets.candidateId;
  const tab = config.sheets.candidateTab;
  if (!id) throw new Error('CANDIDATE_SHEET_ID not set');
  console.log(`Target: sheet ${id}, tab "${tab}" — ${values.length} rows x ${values[0].length} cols`);

  const token = await getAccessToken();
  const auth = { Authorization: `Bearer ${token}` };

  // 1. clear the whole tab
  let res = await fetch(`${SHEETS_API}/${id}/values/${encodeURIComponent(tab)}:clear`, {
    method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: '{}',
  });
  if (!res.ok) throw new Error(`clear failed: ${res.status} ${await res.text()}`);
  console.log('cleared tab');

  // 2. write the grid starting at A1 (RAW keeps TRUE/@handles/etc. as literal strings)
  res = await fetch(`${SHEETS_API}/${id}/values/${encodeURIComponent(tab + '!A1')}?valueInputOption=RAW`, {
    method: 'PUT', headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ range: `${tab}!A1`, majorDimension: 'ROWS', values }),
  });
  if (!res.ok) throw new Error(`update failed: ${res.status} ${await res.text()}`);
  const out = await res.json();
  console.log(`wrote ${out.updatedRows} rows, ${out.updatedColumns} cols, ${out.updatedCells} cells ✓`);
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
