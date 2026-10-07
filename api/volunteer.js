/**
 * POST /api/volunteer
 *
 * Appends one signup row to the volunteer spreadsheet's "Submissions" tab,
 * and (optionally) forwards the JSON to VOLUNTEER_WEBHOOK_URL.
 *
 * Body (JSON):
 *   firstName*  lastName  email*  phone
 *   capacity[]          — selected "how can you help" options
 *   newsletter (bool)   — "Send me the newsletter"
 *   houseDistrict  senateDistrict  county  city  precinctName  precinctId
 *   addressInput  sourceUrl
 *
 * If House/Senate are missing but an address is given (someone hit
 * "Volunteer" before looking up), the districts are resolved server-side, so
 * every row carries House + Senate.
 *
 * Columns are written BY HEADER NAME, not position: organizers can reorder,
 * rename-in-case ("First Name" = "FirstName"), or add their own columns
 * (left blank). A blank tab gets DEFAULT_HEADERS; a tab missing House,
 * Senate, County or City gets those headers added at the end.
 */

const config                       = require('../lib/config');
const { appendRow, readRange, updateRange } = require('../lib/sheets');
const { lookupDistricts }          = require('../lib/geo');
const { createHmac }               = require('crypto');

const DEFAULT_HEADERS = [
  'Created', 'FirstName', 'LastName', 'Email', 'Phone',
  'House', 'Senate', 'County', 'City', 'Precinct',
  'Capacity', 'Address', 'Newsletter', 'Status', 'DateContacted', 'Notes', 'SourceURL',
];
const REQUIRED_HEADERS = ['House', 'Senate', 'County', 'City'];

const norm = h => String(h || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Header (normalized) → payload key. Legacy columns from the old 3-step
// funnel (TopIssues, Congress, SchoolBoard, …) simply stay blank.
const HEADER_MAP = {
  created: 'created', timestamp: 'created', date: 'created',
  firstname: 'firstName', first: 'firstName',
  lastname: 'lastName', last: 'lastName',
  email: 'email', phone: 'phone',
  house: 'house', housedistrict: 'house',
  senate: 'senate', senatedistrict: 'senate',
  county: 'county', city: 'city', town: 'city',
  precinct: 'precinct',
  capacity: 'capacity', howcanyouhelp: 'capacity',
  address: 'address', newsletter: 'newsletter',
  status: 'status', sourceurl: 'sourceUrl', source: 'sourceUrl',
};

let _headers = { value: null, exp: 0 };
const HEADER_CACHE_MS = 5 * 60 * 1000;

async function getHeaders() {
  const now = Date.now();
  if (_headers.value && _headers.exp > now) return _headers.value;

  const { volunteerId, submissionsTab } = config.sheets;
  let headers = ((await readRange(volunteerId, `${submissionsTab}!1:1`))[0] || []).map(h => String(h || '').trim());
  while (headers.length && !headers[headers.length - 1]) headers.pop();

  if (!headers.length) {
    headers = DEFAULT_HEADERS.slice();
    await updateRange(volunteerId, `${submissionsTab}!A1`, [headers]);
  } else {
    const have    = new Set(headers.map(norm));
    const missing = REQUIRED_HEADERS.filter(h => !have.has(norm(h)));
    if (missing.length) {
      // Write only the new header cells, after the last existing column
      const start = colLetter(headers.length);
      await updateRange(volunteerId, `${submissionsTab}!${start}1`, [missing]);
      headers = headers.concat(missing);
    }
  }
  _headers = { value: headers, exp: now + HEADER_CACHE_MS };
  return headers;
}

function colLetter(i) {           // 0 → A, 26 → AA
  let s = '';
  for (i += 1; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
  return s;
}

function validate(body) {
  const errors = [];
  if (!body.firstName?.trim()) errors.push('firstName is required');
  if (!body.email?.trim())     errors.push('email is required');
  if (body.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())) {
    errors.push('email is invalid');
  }
  return errors;
}

function joinList(v) {
  if (Array.isArray(v)) return v.filter(Boolean).join(', ');
  return v ? String(v) : '';
}

function timestamp() {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: config.client.timezone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date()).replace(',', '');
  } catch {
    return new Date().toISOString();
  }
}

async function withRetry(fn, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      await new Promise(r => setTimeout(r, 300 * (i + 1)));
    }
  }
  throw lastErr;
}

async function forwardWebhook(payload) {
  if (!config.volunteer.webhookUrl) return;
  try {
    const body = JSON.stringify(payload);
    const headers = { 'Content-Type': 'application/json' };
    if (config.volunteer.webhookSecret) {
      const sig = createHmac('sha256', config.volunteer.webhookSecret).update(body).digest('hex');
      headers['X-Webhook-Signature'] = `sha256=${sig}`;
    }
    await fetch(config.volunteer.webhookUrl, { method: 'POST', headers, body });
  } catch (err) {
    console.error('[volunteer] webhook forward failed:', err.message);
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!config.sheets.volunteerId) {
    return res.status(500).json({ error: 'VOLUNTEER_SHEET_ID is not configured.' });
  }

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const errors = validate(body);
  if (errors.length) return res.status(400).json({ error: errors.join('; ') });

  const payload = {
    created:     timestamp(),
    firstName:   body.firstName.trim(),
    lastName:    body.lastName?.trim() || '',
    email:       body.email.trim().toLowerCase(),
    phone:       body.phone?.trim() || '',
    house:       body.houseDistrict  ? String(body.houseDistrict)  : '',
    senate:      body.senateDistrict ? String(body.senateDistrict) : '',
    county:      body.county || '',
    city:        body.city || '',
    precinct:    body.precinctName || body.precinctId || '',
    capacity:    joinList(body.capacity),
    address:     body.addressInput?.trim() || '',
    newsletter:  body.newsletter ? 'TRUE' : 'FALSE',
    status:      'New',
    sourceUrl:   body.sourceUrl || '',
  };

  // No districts from the page → resolve from the address. Best effort: a
  // failed lookup still saves the signup (organizers can fill it in).
  if ((!payload.house || !payload.senate) && payload.address) {
    try {
      const d = await lookupDistricts(payload.address);
      if (d) {
        payload.house    = payload.house    || d.house;
        payload.senate   = payload.senate   || d.senate;
        payload.county   = payload.county   || d.county;
        payload.city     = payload.city     || d.city;
        payload.precinct = payload.precinct || d.precinctId;
      }
    } catch (err) {
      console.error('[volunteer] district lookup failed:', err.message);
    }
  }

  try {
    const headers = await withRetry(getHeaders);
    const row = headers.map(h => payload[HEADER_MAP[norm(h)]] ?? '');
    await withRetry(() => appendRow(config.sheets.volunteerId, config.sheets.submissionsTab, row));
    // Fire-and-forget secondary destination
    forwardWebhook(payload);
    return res.status(200).json({ success: true, message: 'Thank you! Your information has been submitted.' });
  } catch (err) {
    console.error('[volunteer] append failed:', err.message);
    return res.status(500).json({ error: 'Could not save your information. Please try again.' });
  }
};
