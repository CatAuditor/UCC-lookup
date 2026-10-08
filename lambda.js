/**
 * AWS Lambda entry point (Function URL, payload v2) for the /api/* routes.
 *
 * Wraps each Lambda event in the small req/res surface the Vercel-style
 * handlers in api/ use (req.method/query/body, res.status/json/setHeader/end),
 * so the same files run on Vercel and on AWS unchanged.
 *
 * Secrets: when SECRET_ID is set, the secret's JSON (UGRC_API_KEY,
 * GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_KEY, ...) is loaded
 * into process.env once per cold start, BEFORE the handlers (and
 * lib/config.js, which reads env at require time) are loaded.
 */

const ROUTES = ['candidates', 'config', 'geocode', 'precinct', 'volunteer'];
let ready = null;

async function loadSecrets() {
  if (!process.env.SECRET_ID) return;
  // AWS SDK v3 ships with the Node.js Lambda runtime — no bundling needed
  const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
  const out = await new SecretsManagerClient({}).send(new GetSecretValueCommand({ SecretId: process.env.SECRET_ID }));
  for (const [k, v] of Object.entries(JSON.parse(out.SecretString || '{}'))) {
    if (!process.env[k]) process.env[k] = String(v);
  }
}

exports.handler = async (event) => {
  if (!ready) ready = loadSecrets();
  await ready;

  const method = event.requestContext?.http?.method || 'GET';
  const route = (event.rawPath || '').replace(/\/+$/, '').split('/').pop();
  if (!ROUTES.includes(route)) {
    return { statusCode: 404, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Not found' }) };
  }

  let body = event.body || '';
  if (event.isBase64Encoded) body = Buffer.from(body, 'base64').toString('utf8');
  if (/json/i.test(event.headers?.['content-type'] || '') && body) {
    try { body = JSON.parse(body); } catch { /* handler reports invalid JSON */ }
  }

  const req = { method, query: event.queryStringParameters || {}, headers: event.headers || {}, body };
  const result = { statusCode: 200, headers: {}, body: '' };
  const res = {
    setHeader(k, v) { result.headers[k] = String(v); return res; },
    status(code) { result.statusCode = code; return res; },
    json(obj) { result.headers['Content-Type'] = 'application/json'; result.body = JSON.stringify(obj); return res; },
    end(text = '') { result.body = String(text); return res; },
    send(text = '') { result.body = typeof text === 'string' ? text : JSON.stringify(text); return res; },
  };

  try {
    await require(`./api/${route}`)(req, res);
  } catch (err) {
    console.error(`[lambda] ${route} failed:`, err.message);
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Server error' }) };
  }
  return result;
};
