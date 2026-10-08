/**
 * Server-side address → districts lookup (UGRC geocoder + ArcGIS point
 * queries). Used by /api/precinct and by /api/volunteer when a signup arrives
 * without districts (someone volunteered before doing a lookup).
 */

const config = require('./config');

const COUNTIES = {
  1:'Beaver',2:'Box Elder',3:'Cache',4:'Carbon',5:'Daggett',6:'Davis',
  7:'Duchesne',8:'Emery',9:'Garfield',10:'Grand',11:'Iron',12:'Juab',
  13:'Kane',14:'Millard',15:'Morgan',16:'Piute',17:'Rich',18:'Salt Lake',
  19:'San Juan',20:'Sanpete',21:'Sevier',22:'Summit',23:'Tooele',
  24:'Uintah',25:'Utah',26:'Wasatch',27:'Washington',28:'Wayne',29:'Weber'
};
const countyName = id => COUNTIES[parseInt(id, 10)] || null;

const PLACES = require('./places');

const norm = s => String(s).toLowerCase()
  .replace(/\bsaint\b/g, 'st').replace(/\bmount\b/g, 'mt').replace(/[.,]/g, ' ')
  .replace(/\s+/g, ' ').trim();
const ALIASES = { 'slc': 'Salt Lake City', 'wvc': 'West Valley City', 'st george': 'St. George' };
// Longest names first so "West Valley City" wins over "City"-style partials
const PLACE_KEYS = PLACES.map(p => [norm(p), p]).sort((a, b) => b[0].length - a[0].length);

/**
 * Free-text Utah address → { street, zip, city, parts } with the clutter
 * removed (unit numbers, ", UT", "USA"). Handles commas or none:
 *   "1234 East 4500 South, Salt Lake City, UT 84117"
 *   "350 N State St Salt Lake City"   "86 S 200 E Saint George UT"
 */
function parseAddress(raw) {
  let s = String(raw).replace(/\s+/g, ' ').trim()
    .replace(/,?\s*(usa|united states( of america)?)\.?$/i, '');
  const zipM = s.match(/\b(8[45]\d{3})(-\d{4})?\b/);
  const zip = zipM ? zipM[1] : '';
  if (zipM) s = s.replace(zipM[0], ' ');
  s = s.replace(/[,\s]+(ut|utah)\.?[,\s]*$/i, '')                       // trailing state
       .replace(/\s*(#|\b(apt|apartment|unit|ste|suite|lot|spc|space|bldg|building)\b\.?)\s*[\w-]+/ig, ' ')
       .replace(/\s+,/g, ',').replace(/,+\s*$/, '').replace(/\s+/g, ' ').trim();

  const parts = s.split(',').map(p => p.trim()).filter(Boolean);
  let street = parts[0] || s, city = parts[1] || '';
  if (parts.length === 1) {                       // no commas: peel a known place off the end
    const n = norm(street);
    const hit = PLACE_KEYS.find(([k]) => n.endsWith(' ' + k));
    const alias = Object.keys(ALIASES).find(k => n.endsWith(' ' + k));
    if (hit || alias) {
      const words = (hit ? hit[0] : alias).split(' ').length;
      city = hit ? hit[1] : ALIASES[alias];
      street = street.split(' ').slice(0, -words).join(' ');
    }
  }
  if (ALIASES[norm(city)]) city = ALIASES[norm(city)];
  return { street, zip, city, zone: zip || city || 'Utah' };
}

// Raw UGRC geocoder response ({ status, result, message }). Tries street+ZIP,
// then street+city — UGRC needs one or the other as the "zone".
async function ugrcGeocode(address) {
  const { street, zip, city } = parseAddress(address);
  const zones = [...new Set([zip, city].filter(Boolean))];
  if (!zones.length) return { status: 400, message: 'Add your city or ZIP code (e.g. "123 Main St, Provo").' };
  let last;
  for (const zone of zones) {
    const url = `https://api.mapserv.utah.gov/api/v1/geocode/` +
      `${encodeURIComponent(street)}/${encodeURIComponent(zone)}` +
      `?apiKey=${config.ugrcApiKey}&spatialReference=4326`;
    last = await (await fetch(url, { headers: { Referer: config.ugrcReferer } })).json();
    if (last.status === 200 && last.result) return last;
  }
  return last;
}

async function geocode(address) {
  const json = await ugrcGeocode(address);
  if (json.status !== 200 || !json.result) return null;
  return { lng: json.result.location.x, lat: json.result.location.y };
}

async function pointAttrs(serviceUrl, lng, lat, outFields) {
  const params = new URLSearchParams({
    geometry: `${lng},${lat}`, geometryType: 'esriGeometryPoint', inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects', outFields, returnGeometry: 'false', f: 'json',
  });
  const json = await (await fetch(`${serviceUrl}?${params}`)).json();
  return json.features?.[0]?.attributes || null;
}

/** Address → { house, senate, county, city, precinctId } or null if not found. */
async function lookupDistricts(address) {
  const pt = await geocode(address);
  if (!pt) return null;
  const [prec, house, senate, muni] = await Promise.all([
    pointAttrs(config.arcgis.precinct,     pt.lng, pt.lat, 'PrecinctID,CountyID'),
    pointAttrs(config.arcgis.house,        pt.lng, pt.lat, 'DIST'),
    pointAttrs(config.arcgis.senate,       pt.lng, pt.lat, 'DIST'),
    pointAttrs(config.arcgis.municipality, pt.lng, pt.lat, 'NAME'),
  ]);
  return {
    house:      house?.DIST != null ? String(house.DIST) : '',
    senate:     senate?.DIST != null ? String(senate.DIST) : '',
    county:     countyName(prec?.CountyID) || '',
    city:       muni?.NAME ? muni.NAME.trim() : '',
    precinctId: prec?.PrecinctID || '',
  };
}

module.exports = { parseAddress, ugrcGeocode, geocode, lookupDistricts, countyName };
