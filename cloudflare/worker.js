// lookup.utahciviccompact.org → AWS Amplify (the site is hosted on AWS; this
// Worker only exists because the domain's DNS lives in Cloudflare and a
// Workers custom domain gives us the hostname + certificate with no manual
// DNS records). Pure pass-through: method, headers, body and redirects intact.
const ORIGIN = 'main.d3m4sng8iepwnz.amplifyapp.com';

export default {
  async fetch(request) {
    const url = new URL(request.url);
    url.protocol = 'https:';
    url.hostname = ORIGIN;
    url.port = '';
    return fetch(new Request(url, request), { redirect: 'manual' });
  },
};
