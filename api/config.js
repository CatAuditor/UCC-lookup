/**
 * GET /api/config
 *
 * Returns the dynamic funnel options organizers maintain in the volunteer
 * spreadsheet's "Config" tab. Edit a cell, the form updates within ~60s.
 *
 * Config tab layout (row 1 = headers):
 *   Issues   | Capacity
 *   Housing  | Knock doors
 *   Climate  | Make calls
 *   ...      | ...
 *
 * The two columns are independent lists; blank cells are ignored.
 */

const config = require('../lib/config');
const { readRange, rowsToObjects } = require('../lib/sheets');

let _cache = { data: null, exp: 0 };
const CACHE_MS = 60 * 1000;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  if (!config.sheets.volunteerId) {
    return res.status(500).json({ error: 'VOLUNTEER_SHEET_ID is not configured.' });
  }

  const now = Date.now();
  if (_cache.data && _cache.exp > now) return res.status(200).json(_cache.data);

  try {
    const values = await readRange(config.sheets.volunteerId, `${config.sheets.configTab}!A:B`);
    const objs = rowsToObjects(values);

    const issues   = objs.map(o => (o.Issues   || '').trim()).filter(Boolean);
    const capacity = objs.map(o => (o.Capacity || '').trim()).filter(Boolean);

    const data = { success: true, issues, capacity };
    _cache = { data, exp: now + CACHE_MS };
    return res.status(200).json(data);
  } catch (err) {
    console.error('[config] error:', err.message);
    return res.status(500).json({ error: 'Failed to load options.' });
  }
};
