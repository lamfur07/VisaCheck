# VisaCheck

Find out if you need a visa, eTA or eVisa, and get a clear document checklist with official links only.

## Features

* **Multiple passports**: add every nationality you hold. VisaCheck ranks them and picks the easiest for your trip.
* **Residence permits and visas**: a US Green Card, Canada PR, Schengen residence or a valid US/UK/Schengen visa can remove visa requirements (Mexico, Canada eTA, UAE visa on arrival, Schengen airport transit and more).
* **Purpose aware**: tourism, business, transit, study, work.
* **Verified rules** for 15 popular destinations (US, Canada, UK, France, Germany, Italy, Spain, Netherlands, Portugal, Greece, Switzerland, Australia, Japan, UAE, Mexico), checked against official sources.
* **Every other country** through the Visa Requirement API (RapidAPI), called via a private proxy so the API key never reaches the browser.
* **5-pillar checklist**: Identity, Financial, Purpose & intent, Health & security, Filing. Items are tailored to the trip, tickable, saved on the device, copyable and printable.
* **Shareable results** (state in the URL), dark and light themes, keyboard accessible, mobile friendly.

## Run locally

No build step:

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

Without a proxy configured, the verified destinations work fully and other countries show an honest "check the official source" result.

## Enable all countries (API proxy)

The RapidAPI key must stay secret, so the browser calls a tiny Cloudflare Worker that adds the key server side.

1. **Rotate your old RapidAPI key** (it was committed publicly in an earlier version): RapidAPI → Apps → your app → Security → regenerate.
2. Deploy the worker:
   ```bash
   cd worker
   npm i -g wrangler
   wrangler login
   wrangler secret put RAPIDAPI_KEY     # paste the NEW key
   wrangler deploy
   ```
3. Edit `ALLOWED_ORIGINS` in `worker/wrangler.toml` to your site's URL(s) and redeploy.
4. Put the worker URL in `js/config.js`:
   ```js
   apiProxyUrl: "https://visacheck-proxy.<your-subdomain>.workers.dev"
   ```

The worker validates input, only accepts your origins, and caches each country pair for 12 hours to save quota.

## Deploy the site

GitHub Pages: Settings → Pages → Deploy from branch → `main` / root.

## Tests

```bash
node tests/rules.test.js      # 42 real scenarios + ~15,000 combination sweep
node tests/api.test.js        # API parsing, unsafe links, hostile payloads
python tests/ui_smoke.py      # browser test: flows, errors, XSS, mobile (needs Playwright)
```

All three run automatically on every push (GitHub Actions).

## Project structure

```
index.html            Page
css/styles.css        Dark + light themes, responsive, print styles
js/config.js          Public settings (proxy URL). Never put keys here.
js/countries.js       Country list and flag helper
js/rules.js           Verified visa rules + engine
js/api.js             API fallback client + response normaliser
js/app.js             UI
worker/               Cloudflare Worker proxy for the API key
tests/                Node and browser tests
```

## Adding a verified destination

In `js/rules.js`, add an object with `id`, `name`, `flag`, `links` and `evaluate(nat, ctx)` returning `{ status, summary, stay, auth, checklist, warn, notes }`, then add it to `DESTINATIONS`. Schengen countries need one line: `schengen(code, name, flag, portalUrl)`.

## Sources (checked November 2026)

US Visa Waiver Program and Proclamation 10998 (travel.state.gov) · Canada eTA lists (canada.ca) · UK ETA national list and April 2026 fees (gov.uk) · EU Regulation 2018/1806 Annex II, EES, ETIAS status (europa.eu) · Australia ETA/eVisitor (homeaffairs.gov.au) · Japan visa exemptions (mofa.go.jp) · UAE visa on arrival (ICP/GDRFA) · Mexico exemptions (SRE/INM).

## Disclaimer

A guide, not legal advice. Airlines and border officers make the final decision. Always confirm on the official links.
