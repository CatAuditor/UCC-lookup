/**
 * Client configuration — all values come from environment variables.
 * To deploy for a new client, create a new Vercel project and set these vars.
 */

const ARCGIS_BASE = process.env.ARCGIS_BASE ||
  'https://services1.arcgis.com/99lidPhWCzftIe9K/ArcGIS/rest/services';

module.exports = {
  // Geocoding
  ugrcApiKey: process.env.UGRC_API_KEY,
  ugrcReferer: process.env.UGRC_REFERER || 'https://precinctlookuptool.vercel.app/',

  // ArcGIS feature services
  arcgis: {
    base:           ARCGIS_BASE,
    precinct:       `${ARCGIS_BASE}/${process.env.PRECINCT_SVC_PATH    || 'VistaBallotAreas/FeatureServer/0/query'}`,
    house:          `${ARCGIS_BASE}/${process.env.HOUSE_SVC_PATH       || 'UtahHouseDistricts2022to2032/FeatureServer/0/query'}`,
    senate:         `${ARCGIS_BASE}/${process.env.SENATE_SVC_PATH      || 'UtahSenateDistricts2022to2032/FeatureServer/0/query'}`,
    congress:       `${ARCGIS_BASE}/${process.env.CONGRESS_SVC_PATH    || 'political_us_congress_districts_2026_to_2032/FeatureServer/0/query'}`,
    schoolBoard:    `${ARCGIS_BASE}/${process.env.SCHOOL_BOARD_SVC_PATH    || 'UtahSchoolBoardDistricts2022to2032/FeatureServer/0/query'}`,
    schoolDistrict: `${ARCGIS_BASE}/${process.env.SCHOOL_DISTRICT_SVC_PATH || 'UtahSchoolDistrictBoundaries/FeatureServer/0/query'}`,
    municipality:   `${ARCGIS_BASE}/${process.env.MUNI_SVC_PATH            || 'UtahMunicipalBoundaries/FeatureServer/0/query'}`,
  },

  // Branding / geography
  client: {
    name:       process.env.CLIENT_NAME       || 'Utah Civic Compact',
    state:      process.env.CLIENT_STATE      || 'Utah',
    stateAbbr:  process.env.CLIENT_STATE_ABBR || 'UT',
    // Nominatim bounding box: west,south,east,north
    geoViewbox: process.env.CLIENT_GEO_VIEWBOX || '-114.05,36.99,-109.04,42.00',
    mapCenterLat: parseFloat(process.env.CLIENT_MAP_CENTER_LAT || '39.5'),
    mapCenterLng: parseFloat(process.env.CLIENT_MAP_CENTER_LNG || '-111.5'),
    mapZoom:      parseInt(process.env.CLIENT_MAP_ZOOM || '7', 10),
    // Timezone for the "Created" timestamp written to the volunteer sheet
    timezone:     process.env.CLIENT_TIMEZONE || 'America/Denver',
  },

  // Google service account (signs Sheets API requests)
  google: {
    clientEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    // Env vars store the PEM with literal "\n" — normalize to real newlines
    privateKey:  (process.env.GOOGLE_SERVICE_ACCOUNT_KEY || '').replace(/\\n/g, '\n'),
  },

  // Google Sheets (organizer-facing data source + sink)
  sheets: {
    candidateId:    process.env.CANDIDATE_SHEET_ID,
    volunteerId:    process.env.VOLUNTEER_SHEET_ID,
    candidateTab:   process.env.CANDIDATE_TAB             || 'Candidates',
    configTab:      process.env.VOLUNTEER_CONFIG_TAB      || 'Config',
    submissionsTab: process.env.VOLUNTEER_SUBMISSIONS_TAB || 'Submissions',
  },

  // Optional extra volunteer destination (in addition to the sheet)
  volunteer: {
    // POST JSON to this URL on every signup (Zapier / Make / custom endpoint)
    webhookUrl:    process.env.VOLUNTEER_WEBHOOK_URL    || null,
    // Optional HMAC-SHA256 secret — adds X-Webhook-Signature header so the
    // receiving endpoint can verify the payload came from this app
    webhookSecret: process.env.VOLUNTEER_WEBHOOK_SECRET || null,
  },
};
