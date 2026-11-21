/**
 * VisaCheck API proxy (Cloudflare Worker).
 *
 * Keeps your RapidAPI key on the server. The browser calls this worker,
 * the worker calls RapidAPI with the secret key.
 *
 * Setup:
 *   npm i -g wrangler
 *   wrangler secret put RAPIDAPI_KEY        # paste your NEW (rotated) key
 *   wrangler deploy
 * Then put the worker URL in js/config.js (apiProxyUrl).
 *
 * Set ALLOWED_ORIGINS in wrangler.toml to your site's origin(s), comma separated.
 */
const API_HOST = "visa-requirement.p.rapidapi.com";
const CACHE_SECONDS = 60 * 60 * 12; // visa rules don't change hourly; saves your quota

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
    const corsOrigin = allowed.length === 0 || allowed.includes(origin) ? origin || "*" : "";
    const cors = {
      "Access-Control-Allow-Origin": corsOrigin || "null",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin"
    };
    const json = (body, status = 200, extra = {}) =>
      new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...cors, ...extra } });

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (!corsOrigin) return json({ error: true, message: "Origin not allowed" }, 403);

    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "/check") return json({ error: true, message: "Not found" }, 404);
    if (!env.RAPIDAPI_KEY) return json({ error: true, message: "Server not configured" }, 500);

    let body;
    try { body = await request.json(); } catch { return json({ error: true, message: "Invalid JSON" }, 400); }
    const passport = String(body.passport || "").toUpperCase();
    const destination = String(body.destination || "").toUpperCase();
    if (!/^[A-Z]{2}$/.test(passport) || !/^[A-Z]{2}$/.test(destination)) {
      return json({ error: true, message: "passport and destination must be 2-letter country codes" }, 400);
    }

    // Edge cache keyed on the pair, so repeat lookups don't spend API calls.
    const cache = caches.default;
    const cacheKey = new Request(`https://visacheck-cache/${passport}-${destination}`);
    const hit = await cache.match(cacheKey);
    if (hit) {
      const data = await hit.json();
      return json(data, 200, { "X-Cache": "HIT" });
    }

    let upstream;
    try {
      upstream = await fetch(`https://${API_HOST}/v2/visa/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-RapidAPI-Key": env.RAPIDAPI_KEY, "X-RapidAPI-Host": API_HOST },
        body: JSON.stringify({ passport, destination })
      });
    } catch {
      return json({ error: true, message: "Upstream unreachable" }, 502);
    }
    if (upstream.status === 429) return json({ error: true, message: "Rate limited, try again shortly" }, 429);
    if (!upstream.ok) return json({ error: true, message: `Upstream error ${upstream.status}` }, 502);

    const data = await upstream.json();
    ctx.waitUntil(cache.put(cacheKey, new Response(JSON.stringify(data), { headers: { "Cache-Control": `max-age=${CACHE_SECONDS}` } })));
    return json(data, 200, { "X-Cache": "MISS" });
  }
};
