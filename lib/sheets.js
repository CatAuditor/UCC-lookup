/**
 * Minimal Google Sheets API client using a service account.
 * Zero npm dependencies — signs the OAuth JWT with Node's built-in crypto.
 *
 * Setup per client:
 *   1. Create a Google Cloud service account, enable the Sheets API.
 *   2. Download its JSON key; set GOOGLE_SERVICE_ACCOUNT_EMAIL and
 *      GOOGLE_SERVICE_ACCOUNT_KEY (the private_key, with \n escaped).
 *   3. Share both spreadsheets with the service account email (Viewer for the
 *      candidate sheet, Editor for the volunteer sheet).
 */

const crypto = require('crypto');
const config = require('./config');

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

let _token = { value: null, exp: 0 };

function base64url(input) {
  return Buffer.from(input).toString('base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  if (_token.value && _token.exp > now + 60) return _token.value;

  const { clientEmail, privateKey } = config.google;
  if (!clientEmail || !privateKey) {
    throw new Error('Google service account env vars are not set (GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_KEY).');
  }

  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim  = base64url(JSON.stringify({
    iss:   clientEmail,
    scope: SCOPE,
    aud:   TOKEN_URL,
    exp:   now + 3600,
    iat:   now,
  }));
  const signingInput = `${header}.${claim}`;
  const signature = crypto.createSign('RSA-SHA256').update(signingInput).sign(privateKey);
  const jwt = `${signingInput}.${base64url(signature)}`;

  const res = await fetch(TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion:  jwt,
    }),
  });

  if (!res.ok) {
    throw new Error(`Google token request failed: ${res.status} ${await res.text()}`);
  }
  const json = await res.json();
  _token = { value: json.access_token, exp: now + (json.expires_in || 3600) };
  return _token.value;
}

/** Read a range, e.g. readRange(sheetId, 'Candidates!A:Z'). Returns 2D array. */
async function readRange(spreadsheetId, range) {
  const token = await getAccessToken();
  const url = `${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(range)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Sheets read failed: ${res.status} ${await res.text()}`);
  const json = await res.json();
  return json.values || [];
}

/** Append a single row to a tab, e.g. appendRow(sheetId, 'Submissions', [...]). */
async function appendRow(spreadsheetId, tab, row) {
  const token = await getAccessToken();
  const url = `${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(tab)}:append` +
    `?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  const res = await fetch(url, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ values: [row] }),
  });
  if (!res.ok) throw new Error(`Sheets append failed: ${res.status} ${await res.text()}`);
  return res.json();
}

/** Overwrite a range, e.g. updateRange(sheetId, 'Submissions!A1:C1', [[...]]). */
async function updateRange(spreadsheetId, range, values) {
  const token = await getAccessToken();
  const url = `${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`;
  const res = await fetch(url, {
    method:  'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ values }),
  });
  if (!res.ok) throw new Error(`Sheets update failed: ${res.status} ${await res.text()}`);
  return res.json();
}

/** Turn a 2D values array (first row = headers) into objects keyed by trimmed header. */
function rowsToObjects(values) {
  if (!values || !values.length) return [];
  const headers = values[0].map(h => String(h || '').trim());
  return values.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { if (h) obj[h] = row[i] != null ? String(row[i]) : ''; });
    return obj;
  });
}

module.exports = { getAccessToken, readRange, appendRow, updateRange, rowsToObjects };
