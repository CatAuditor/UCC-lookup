/**
 * GET /api/geocode?address=<free-text Utah address>
 *
 * Server-side proxy to the UGRC geocoder so the API key never ships to the
 * browser and works from any domain (the key's referrer allow-list is matched
 * by UGRC_REFERER, sent from here). Returns UGRC's JSON unchanged:
 *   { status: 200, result: { location: { x, y }, inputAddress, score, ... } }
 *   or { status: 4xx, message }.
 */

const config = require('../lib/config');
const { ugrcGeocode } = require('../lib/geo');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');   // addresses are personal; don't cache at the edge
  if (req.method !== 'GET') return res.status(405).json({ status: 405, message: 'Method not allowed' });

  const address = String(req.query.address || '').trim();
  if (!address) return res.status(400).json({ status: 400, message: 'Please enter an address.' });
  if (!config.ugrcApiKey) return res.status(500).json({ status: 500, message: 'UGRC_API_KEY is not configured.' });

  try {
    const json = await ugrcGeocode(address);
    return res.status(200).json(json);
  } catch (err) {
    console.error('[geocode] error:', err.message);
    return res.status(502).json({ status: 502, message: 'Address lookup is unavailable. Please try again.' });
  }
};
