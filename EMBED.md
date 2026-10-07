# Embedding the Precinct Tool (Squarespace & other sites)

The app is designed to be dropped into any existing website via an `<iframe>`.
The tool's own domain serves the iframe, so all address lookups, candidate
loading, and volunteer signups work the same whether standalone or embedded —
there are no cross-origin or cookie issues to configure.

## Embed mode

Add `?embed=1` to the URL to hide the big header and footer, leaving a clean
search + map + sidebar widget that fits the host site's own branding.

| URL parameter | Effect |
|---|---|
| `?embed=1`   | Hide both header and footer |
| `?header=0`  | Hide only the header |
| `?footer=0`  | Hide only the footer |

## Squarespace (recommended: Code Block)

1. Edit the page → **Add Block** → **Code**.
2. Paste the snippet below (replace the domain with your deployment URL).
3. Save. On Squarespace, Code Blocks require a Business plan or higher.

```html
<iframe
  src="https://YOUR-DEPLOYMENT.vercel.app/?embed=1"
  title="Find Your Precinct"
  width="100%"
  height="760"
  style="border:0; border-radius:10px; overflow:hidden;"
  loading="lazy"
  referrerpolicy="no-referrer-when-downgrade">
</iframe>
```

**Notes for Squarespace specifically:**
- Use a **Code Block**, not the "Embed" block — the Embed block is for oEmbed
  providers and will not render a raw iframe reliably.
- A **fixed height** is correct here. This is a map widget, not a long
  document — it has its own internal scrolling (map pans, sidebar scrolls), so
  it should not auto-grow. `760` works well on desktop; `620`–`700` is fine on
  pages with a narrow content column.
- Squarespace serves over HTTPS, and the deployment is HTTPS, so there is no
  mixed-content warning.

## Plain HTML (any other site)

Same iframe snippet works anywhere:

```html
<iframe src="https://YOUR-DEPLOYMENT.vercel.app/?embed=1"
        width="100%" height="760" style="border:0"></iframe>
```

## Security / framing policy

- The **app** (`index.html`) is intentionally frameable from any site so each
  client can embed it on their own domain. It only exposes public precinct data,
  and volunteer submissions are write-only into the client's own Google Sheet.
- To restrict the app to a single client domain instead of allowing all sites,
  add a `Content-Security-Policy: frame-ancestors https://theirsite.com` header
  for `/index.html` in `vercel.json`. Left open by default since the data is
  public and clients embed on their own sites.
