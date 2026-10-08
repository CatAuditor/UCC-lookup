/**
 * setup_sheet.js — turn a blank Google Sheet into the app's data store.
 *
 * Creates (if missing) the Candidates, Config and Submissions tabs, loads
 * data/candidates_values.json into Candidates, writes the "How can you help?"
 * options into Config and the header row into Submissions. Safe to re-run:
 * Candidates is replaced; Config is replaced; Submissions keeps its rows and
 * only gets a header if row 1 is empty.
 *
 * The service account can't create sheets, so first: create a blank sheet,
 * Share → the service-account email → Editor.
 *
 * Usage:  node scripts/setup_sheet.js <sheet-id-or-url>
 * Env:    GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_KEY from .env
 *         (or ENV_FILE=path), same as scripts/push_candidates.js.
 */
const fs = require('fs');
const path = require('path');

const envPath = process.env.ENV_FILE || path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const s = line.trim();
    if (!s || s.startsWith('#') || !s.includes('=')) continue;
    const key = s.slice(0, s.indexOf('=')).trim();
    let val = s.slice(s.indexOf('=') + 1).trim().replace(/^(['"])(.*)\1$/, '$2');
    if (!(key in process.env)) process.env[key] = val;
  }
}

const { getAccessToken } = require('../lib/sheets');
const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';

const CAPACITY = ['Organize a town hall about ALPR', 'Social Media', 'Investigations', 'Host a fundraiser'];
const SUBMISSIONS_HEADER = ['Created', 'FirstName', 'LastName', 'Email', 'Phone', 'House', 'Senate',
  'County', 'City', 'Precinct', 'Capacity', 'Address', 'Newsletter', 'Status', 'DateContacted',
  'Notes', 'SourceURL'];

async function call(method, url, body) {
  const token = await getAccessToken();
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${url.split('?')[0]} → ${res.status} ${await res.text()}`);
  return res.json();
}

async function main() {
  const arg = process.argv[2] || '';
  const id = (arg.match(/\/d\/([\w-]+)/) || [])[1] || arg;
  if (!id) throw new Error('Usage: node scripts/setup_sheet.js <sheet-id-or-url>');

  const meta = await call('GET', `${SHEETS_API}/${id}?fields=properties.title,sheets.properties`);
  const have = new Map(meta.sheets.map(s => [s.properties.title, s.properties.sheetId]));
  console.log(`Sheet "${meta.properties.title}" — tabs: ${[...have.keys()].join(', ')}`);

  // 1. Missing tabs, header rows frozen
  const add = ['Candidates', 'Config', 'Submissions'].filter(t => !have.has(t));
  if (add.length) {
    const r = await call('POST', `${SHEETS_API}/${id}:batchUpdate`, {
      requests: add.map(title => ({ addSheet: { properties: { title, gridProperties: { frozenRowCount: 1 } } } })),
    });
    r.replies.forEach(x => have.set(x.addSheet.properties.title, x.addSheet.properties.sheetId));
    console.log('added tabs:', add.join(', '));
  }
  // Drop the default empty tab a new sheet comes with
  const blank = ['Sheet1'].filter(t => have.has(t));
  const requests = ['Candidates', 'Config', 'Submissions'].map(t => ({
    updateSheetProperties: { properties: { sheetId: have.get(t), gridProperties: { frozenRowCount: 1 } }, fields: 'gridProperties.frozenRowCount' },
  }));
  blank.forEach(t => requests.push({ deleteSheet: { sheetId: have.get(t) } }));
  await call('POST', `${SHEETS_API}/${id}:batchUpdate`, { requests });

  // 2. Candidates (replace)
  const values = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'candidates_values.json'), 'utf8'));
  await call('POST', `${SHEETS_API}/${id}/values/${encodeURIComponent('Candidates')}:clear`, {});
  const w = await call('PUT', `${SHEETS_API}/${id}/values/${encodeURIComponent('Candidates!A1')}?valueInputOption=RAW`, { values });
  console.log(`Candidates: ${w.updatedRows} rows`);

  // 3. Config (replace)
  await call('POST', `${SHEETS_API}/${id}/values/${encodeURIComponent('Config')}:clear`, {});
  await call('PUT', `${SHEETS_API}/${id}/values/${encodeURIComponent('Config!A1')}?valueInputOption=RAW`, {
    values: [['Capacity'], ...CAPACITY.map(c => [c])],
  });
  console.log(`Config: ${CAPACITY.length} "How can you help?" options`);

  // 4. Submissions header (only if empty — never touch existing signups)
  const head = await call('GET', `${SHEETS_API}/${id}/values/${encodeURIComponent('Submissions!1:1')}`);
  if (!(head.values && head.values[0] && head.values[0].length)) {
    await call('PUT', `${SHEETS_API}/${id}/values/${encodeURIComponent('Submissions!A1')}?valueInputOption=RAW`, { values: [SUBMISSIONS_HEADER] });
    console.log('Submissions: header written');
  } else {
    console.log('Submissions: header already present, left as-is');
  }
  console.log(`Done. Set CANDIDATE_SHEET_ID and VOLUNTEER_SHEET_ID to ${id}`);
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
