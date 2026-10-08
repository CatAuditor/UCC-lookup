const fs = require('fs');

// The page no longer embeds the UGRC key (see api/geocode.js). On Vercel the
// API runs in the same deploy, so fail early if its key is missing; on AWS
// (STATIC_ONLY=1, Amplify) the API is a separate Lambda and needs nothing here.
const required = process.env.STATIC_ONLY ? [] : ['UGRC_API_KEY'];
const missing  = required.filter(k => !process.env[k]);
if (missing.length) {
  console.error(`Error: missing required env vars: ${missing.join(', ')}`);
  process.exit(1);
}

// Default values mirror lib/config.js so the frontend stays in sync
const replacements = {
  '%%ARCGIS_BASE%%':       process.env.ARCGIS_BASE       || 'https://services1.arcgis.com/99lidPhWCzftIe9K/ArcGIS/rest/services',
  '%%PRECINCT_SVC_PATH%%': process.env.PRECINCT_SVC_PATH || 'VistaBallotAreas/FeatureServer/0/query',
  '%%HOUSE_SVC_PATH%%':    process.env.HOUSE_SVC_PATH    || 'UtahHouseDistricts2022to2032/FeatureServer/0/query',
  '%%SENATE_SVC_PATH%%':   process.env.SENATE_SVC_PATH   || 'UtahSenateDistricts2022to2032/FeatureServer/0/query',
  '%%MUNI_SVC_PATH%%':     process.env.MUNI_SVC_PATH     || 'UtahMunicipalBoundaries/FeatureServer/0/query',
  '%%API_BASE%%':          process.env.API_BASE            || '',
  '%%CLIENT_NAME%%':         process.env.CLIENT_NAME         || 'Utah Civic Compact',
  '%%CLIENT_STATE%%':        process.env.CLIENT_STATE        || 'Utah',
  '%%CLIENT_GEO_VIEWBOX%%':  process.env.CLIENT_GEO_VIEWBOX  || '-114.05,36.99,-109.04,42.00',
  '%%CLIENT_MAP_CENTER_LAT%%': process.env.CLIENT_MAP_CENTER_LAT || '39.5',
  '%%CLIENT_MAP_CENTER_LNG%%': process.env.CLIENT_MAP_CENTER_LNG || '-111.5',
  '%%CLIENT_MAP_ZOOM%%':       process.env.CLIENT_MAP_ZOOM      || '7',
};

let html = fs.readFileSync('index.html', 'utf8');
for (const [placeholder, value] of Object.entries(replacements)) {
  html = html.replaceAll(placeholder, value);
}
fs.writeFileSync('index.html', html);

console.log('Build complete — client config injected.');
