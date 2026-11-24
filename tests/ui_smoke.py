"""Browser smoke test. Needs Python Playwright + Chromium:
    pip install playwright && playwright install chromium
    python tests/ui_smoke.py [--shots DIR]
Covers verified rules, the API fallback (mocked proxy), errors, XSS safety, and mobile layout.
"""
import json, pathlib, sys
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
BASE = (ROOT / "index.html").as_uri()
SHOTS = pathlib.Path(sys.argv[sys.argv.index("--shots") + 1]) if "--shots" in sys.argv else None
CHROME = next((a.split("=", 1)[1] for a in sys.argv if a.startswith("--chrome=")), None)
fails = []

def check(label, cond):
    print(("PASS  " if cond else "FAIL  ") + label)
    if not cond: fails.append(label)

MOCK = {"data": {
    "destination": {"passport_validity": "6 months", "embassy_url": "https://embassy.example.gov"},
    "visa_rules": {"primary_rule": {"name": "eVisa <img src=x onerror=window.__xss=1>", "duration": "30 days", "color": "blue", "link": "https://evisa.example.gov"},
                   "exception_rule": {"full_text": "<script>window.__xss=1</script>US visa holders get VOA."}},
    "yellowfever_vaccination_requirement": True}}

def with_proxy(page, mode):
    def cfg(route):
        route.fulfill(content_type="application/javascript", body='window.VISACHECK_CONFIG={apiProxyUrl:"https://proxy.test",apiTimeoutMs:3000};')
    page.route("**/js/config.js", cfg)
    def api(route):
        if mode == "ok": route.fulfill(status=200, content_type="application/json", body=json.dumps(MOCK), headers={"Access-Control-Allow-Origin": "*"})
        elif mode == "500": route.fulfill(status=500, content_type="application/json", body='{"error":true}', headers={"Access-Control-Allow-Origin": "*"})
        else: route.abort()
    page.route("https://proxy.test/**", api)

with sync_playwright() as p:
    b = p.chromium.launch(**({"executable_path": CHROME} if CHROME else {}))
    errors = []
    def page(w=1200, h=900):
        pg = b.new_page(viewport={"width": w, "height": h})
        pg.on("pageerror", lambda e: errors.append(str(e)))
        return pg

    # 1. Verified flow through the real UI
    pg = page()
    pg.goto(BASE)
    pg.fill("#natInput", "india"); pg.keyboard.press("Enter")
    pg.fill("#natInput", "united kingdom"); pg.keyboard.press("Enter")
    pg.click('#destQuick [data-dest="US"]')
    pg.click('[data-p="tourism"]')
    if SHOTS: pg.screenshot(path=str(SHOTS / "1-form.png"), full_page=True)
    pg.click("#checkBtn"); pg.wait_for_selector(".verdict")
    check("verified: best passport is UK with ESTA", "ESTA" in pg.inner_text(".verdict") and "United Kingdom" in pg.inner_text(".verdict"))
    check("verified: comparison shown", pg.locator(".cmp").count() == 2)
    check("verified: pillars rendered", pg.locator(".pillar").count() >= 3)
    pg.locator(".pillar input").first.check()
    check("checklist progress updates", "1 of" in pg.inner_text("#progLabel"))
    if SHOTS: pg.screenshot(path=str(SHOTS / "2-result.png"), full_page=True)

    # 1b. Dropdowns list every country (no cap)
    pg = page(); pg.goto(BASE); pg.click("#destInput")
    total = pg.evaluate("window.COUNTRIES.length")
    check(f"destination list shows all {total} countries", pg.locator("#destList li[data-code]").count() == total)
    pg.click("#natInput")
    check("passport list shows all countries", pg.locator("#natList li[data-code]").count() == total)
    pg.fill("#destInput", "zimb"); 
    check("search finds Zimbabwe", "Zimbabwe" in pg.inner_text("#destList"))

    # 2. Validation
    pg = page(); pg.goto(BASE); pg.click("#checkBtn")
    check("validation: needs passport", "passport" in pg.inner_text("#formError"))
    pg.fill("#natInput", "india"); pg.keyboard.press("Enter"); pg.click("#checkBtn")
    check("validation: needs destination", "going" in pg.inner_text("#formError"))

    # 3. Docs change outcome (India + US visa -> Mexico)
    pg = page(); pg.goto(BASE + "#n=IN&d=MX&p=tourism&doc=visa:US"); pg.wait_for_selector(".verdict")
    check("docs: US visa removes Mexico visa", "No visa needed" in pg.inner_text(".verdict"))

    # 4. Hostile hash is ignored safely
    pg = page(); pg.goto(BASE + "#n=<script>,ZZ,IN&d=<img>&p=evil&doc=x"); pg.wait_for_timeout(300)
    check("bad hash: no crash, nothing run", pg.locator(".verdict").count() == 0 and pg.locator(".chip").count() == 1)

    # 5. Unverified destination without proxy
    pg = page()
    pg.route("**/js/config.js", lambda r: r.fulfill(content_type="application/javascript", body='window.VISACHECK_CONFIG={apiProxyUrl:""};'))
    pg.goto(BASE + "#n=US&d=VN&p=tourism"); pg.wait_for_selector(".verdict")
    check("no proxy: honest fallback", "don't have verified rules" in pg.inner_text(".verdict"))

    # 6. Unverified destination with mocked proxy, including XSS attempt
    pg = page(); with_proxy(pg, "ok"); pg.goto(BASE + "#n=IN,GB&d=VN&p=tourism"); pg.wait_for_selector(".verdict")
    check("api: verdict rendered", "eVisa" in pg.inner_text(".verdict"))
    check("api: XSS not executed", pg.evaluate("window.__xss") is None)
    check("api: yellow fever item shown", "Yellow fever" in pg.inner_text("#checklistCard"))
    if SHOTS: pg.screenshot(path=str(SHOTS / "3-api.png"), full_page=True)

    # 6b. Live cross-check on verified destinations
    pg = page(); with_proxy(pg, "ok"); pg.goto(BASE + "#n=GB&d=US&p=tourism"); pg.wait_for_selector(".live.ok", timeout=5000)
    check("live check: ESTA vs eVisa counts as agreement", pg.locator(".live.ok").count() == 1)
    pg = page(); with_proxy(pg, "ok"); pg.goto(BASE + "#n=IN&d=US&p=tourism"); pg.wait_for_selector(".live-diff", timeout=5000)
    check("live check: disagreement shows warning", "may have changed" in pg.inner_text(".live-diff"))
    pg = page(); with_proxy(pg, "down"); pg.goto(BASE + "#n=GB&d=US&p=tourism"); pg.wait_for_selector(".live.off", timeout=5000)
    check("live check: API down keeps verified result", "ESTA" in pg.inner_text(".verdict"))
    pg = page(); with_proxy(pg, "ok"); pg.goto(BASE + "#n=IN&d=US&p=tourism&doc=pr:US"); pg.wait_for_timeout(800)
    check("live check: skipped for residence-based result", pg.locator("#liveCheck").count() == 0)

    # 6c. Verified destination that can't confirm a case falls back to a clear live answer
    pg = page(); with_proxy(pg, "ok"); pg.goto(BASE + "#n=PK&d=BH&p=tourism"); pg.wait_for_selector(".verdict")
    v = pg.inner_text(".verdict")
    check("gap fill: live answer instead of 'check'", "eVisa" in v and "Confirm with the official source" not in v)
    check("gap fill: labelled as live data", "Live data" in v)
    pg = page(); with_proxy(pg, "down"); pg.goto(BASE + "#n=PK&d=BH&p=tourism"); pg.wait_for_selector(".verdict")
    check("gap fill: API down keeps official 'check' result", "evisa.gov.bh" in pg.inner_text(".verdict"))

    # 7. API errors
    pg = page(); with_proxy(pg, "500"); pg.goto(BASE + "#n=IN&d=VN&p=tourism"); pg.wait_for_selector(".verdict")
    check("api 500: friendly error + retry", pg.locator("#retryBtn").count() == 1)
    pg = page(); with_proxy(pg, "down"); pg.goto(BASE + "#n=IN&d=VN&p=tourism"); pg.wait_for_selector(".verdict")
    check("api offline: friendly error", "couldn't load" in pg.inner_text(".verdict"))

    # 8. Citizen of destination
    pg = page(); pg.goto(BASE + "#n=FR,IN&d=FR&p=tourism"); pg.wait_for_selector(".verdict")
    check("citizen detected", "Welcome home" in pg.inner_text(".verdict"))

    # 9. Mobile + light theme
    pg = page(390, 844); pg.goto(BASE + "#n=NG&d=DE&p=tourism"); pg.wait_for_selector(".verdict")
    check("mobile: no horizontal overflow", pg.evaluate("document.documentElement.scrollWidth <= window.innerWidth"))
    pg.click("#themeBtn")
    check("theme toggles", pg.evaluate("document.documentElement.dataset.theme") == "light")
    if SHOTS: pg.screenshot(path=str(SHOTS / "4-mobile-light.png"), full_page=True)

    check("no page errors", not errors)
    if errors: print("\n".join(errors))
    b.close()

print(f"\n{len(fails)} failure(s)" if fails else "\nAll passed")
sys.exit(1 if fails else 0)
