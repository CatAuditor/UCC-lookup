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

// "123 Main St, Provo UT 84601" → { street, zone } for the UGRC geocoder
function parseAddress(raw) {
  raw = raw.trim();

  const zipMatch = raw.match(/\b(\d{5})\b/);
  if (zipMatch) {
    const zip    = zipMatch[1];
    const street = raw
      .replace(/,?\s*[A-Z]{2}\s+\d{5}/, '')
      .replace(/,?\s*\d{5}/, '')
      .trim();
    return { street, zone: zip };
  }

  const parts = raw.split(',').map(s => s.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const zone = parts[1].replace(/\s+[A-Z]{2}$/, '').trim();
    return { street: parts[0], zone };
  }

  const words = raw.split(/\s+/);
  if (words.length >= 3) {
    return { street: words.slice(0, -1).join(' '), zone: words[words.length - 1] };
  }

  return { street: raw, zone: 'Utah' };
}

// Raw UGRC geocoder response ({ status, result, message }) for an address
async function ugrcGeocode(address) {
  const { street, zone } = parseAddress(address);
  const url = `https://api.mapserv.utah.gov/api/v1/geocode/` +
    `${encodeURIComponent(street)}/${encodeURIComponent(zone)}` +
    `?apiKey=${config.ugrcApiKey}&spatialReference=4326`;
  return (await fetch(url, { headers: { Referer: config.ugrcReferer } })).json();
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
