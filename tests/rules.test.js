// Run with: node tests/rules.test.js
const path = require("path");
global.window = global;
require(path.join(__dirname, "../js/countries.js"));
require(path.join(__dirname, "../js/rules.js"));
const { evaluateTrip } = window.VISA;

const cases = [
  // [nationalities, destination, purpose, docs, expected status of best, label]
  [["IN"], "US", "tourism", [], "visa", "India to US needs B1/B2"],
  [["GB"], "US", "tourism", [], "eta", "UK to US uses ESTA"],
  [["CA"], "US", "tourism", [], "free", "Canada to US visa free"],
  [["IR"], "US", "tourism", [], "banned", "Iran full ban"],
  [["IR", "DE"], "US", "tourism", [], "eta", "Dual Iran/Germany best is ESTA"],
  [["NG"], "US", "tourism", [], "banned", "Nigeria partial ban on B visas"],
  [["NG"], "US", "work", [], "permit", "Nigeria work visas not suspended"],
  [["TM"], "US", "tourism", [], "visa", "Turkmenistan only immigrant ban"],
  [["IN"], "US", "tourism", ["pr:US"], "resident", "Green card holder"],
  [["IN"], "CA", "tourism", [], "visa", "India to Canada TRV"],
  [["IN"], "CA", "tourism", ["pr:US"], "resident", "US LPR to Canada no eTA"],
  [["MX"], "CA", "tourism", [], "visa", "Mexico without US visa needs TRV"],
  [["MX"], "CA", "tourism", ["visa:US"], "eta", "Mexico with US visa can use eTA"],
  [["FR"], "CA", "tourism", [], "eta", "France to Canada eTA"],
  [["US"], "CA", "tourism", [], "free", "US to Canada free"],
  [["US"], "GB", "tourism", [], "eta", "US to UK ETA"],
  [["IE"], "GB", "work", [], "free", "Irish CTA"],
  [["IN"], "GB", "tourism", [], "visa", "India to UK visitor visa"],
  [["CO"], "GB", "tourism", [], "visa", "Colombia now visa national for UK"],
  [["US"], "FR", "tourism", [], "free", "US to France visa free"],
  [["IN"], "FR", "tourism", [], "visa", "India to France Schengen visa"],
  [["IN"], "FR", "tourism", ["pr:EU"], "resident", "Schengen residence"],
  [["DE"], "FR", "work", [], "free", "EU free movement"],
  [["NG"], "DE", "transit", [], "visa", "Nigeria ATV"],
  [["NG"], "DE", "transit", ["visa:US"], "free", "Nigeria ATV exempt with US visa"],
  [["IN"], "DE", "transit", [], "free", "India airside transit Germany"],
  [["NZ"], "AU", "work", [], "free", "NZ to Australia"],
  [["US"], "AU", "tourism", [], "eta", "US to Australia ETA"],
  [["PL"], "AU", "tourism", [], "eta", "Poland eVisitor"],
  [["IN"], "AU", "tourism", [], "visa", "India subclass 600"],
  [["US"], "JP", "tourism", [], "free", "US to Japan"],
  [["IN"], "JP", "tourism", [], "visa", "India to Japan visa"],
  [["IN"], "AE", "tourism", [], "evisa", "India to UAE eVisa"],
  [["IN"], "AE", "tourism", ["visa:US"], "voa", "India with US visa VOA"],
  [["PH"], "AE", "tourism", ["visa:US"], "evisa", "Philippines needs residence, not visa"],
  [["PH"], "AE", "tourism", ["pr:CA"], "voa", "Philippines with Canada PR"],
  [["GB"], "AE", "tourism", [], "free", "UK to UAE free"],
  [["IN"], "MX", "tourism", [], "visa", "India to Mexico visa"],
  [["IN"], "MX", "tourism", ["visa:US"], "resident", "India with US visa to Mexico"],
  [["IN"], "MX", "tourism", ["pr:CA"], "resident", "India with Canada PR to Mexico"],
  [["ZA"], "MX", "tourism", [], "check", "Unverified nationality falls back to check"],
  [["CA"], "MX", "tourism", [], "free", "Canada to Mexico"],
  // Batch 1 (verified 2026-11-21)
  [["SA"], "BH", "tourism", [], "free", "Saudi (GCC) to Bahrain"],
  [["GB"], "BH", "tourism", [], "evisa", "UK to Bahrain 3-month eVisa"],
  [["IN"], "BH", "tourism", ["pr:AE"], "evisa", "UAE resident to Bahrain GCC-resident eVisa"],
  [["US"], "BH", "tourism", [], "check", "Bahrain official country lists unreadable"],
  [["BD"], "BH", "work", [], "permit", "Bahrain LMRA work permit"],
  [["US"], "IN", "tourism", [], "evisa", "US to India e-Tourist"],
  [["JP"], "IN", "tourism", [], "voa", "Japan to India visa on arrival"],
  [["NP"], "IN", "tourism", [], "free", "Nepal to India"],
  [["MV"], "IN", "tourism", [], "free", "Maldives to India 90 days"],
  [["CN"], "IN", "tourism", [], "visa", "China to India regular visa"],
  [["PK"], "IN", "tourism", [], "visa", "Pakistan to India regular visa"],
  [["BD"], "IN", "business", [], "evisa", "Bangladesh e-Business"],
  [["US"], "TH", "tourism", [], "free", "US to Thailand 30 days"],
  [["KR"], "TH", "tourism", [], "free", "Korea to Thailand bilateral 90"],
  [["RS"], "TH", "tourism", [], "voa", "Serbia to Thailand VOA"],
  [["NG"], "TH", "tourism", [], "evisa", "Nigeria to Thailand e-Visa"],
  [["GB"], "TH", "work", [], "permit", "Thailand work"],
  [["US"], "IE", "tourism", [], "free", "US to Ireland"],
  [["GB"], "IE", "work", [], "free", "UK to Ireland CTA"],
  [["IN"], "IE", "tourism", [], "visa", "India to Ireland visa"],
  [["IN"], "IE", "tourism", ["visa:GB"], "resident", "India with UK visa: visa waiver programme"],
  [["NG"], "IE", "transit", [], "visa", "Nigeria Irish transit visa"],
  [["LC"], "IE", "tourism", [], "visa", "Saint Lucia visa required since June 2026"],
  [["US"], "NZ", "tourism", [], "eta", "US to NZ NZeTA"],
  [["AU"], "NZ", "work", [], "free", "Australia to NZ"],
  [["IN"], "NZ", "tourism", [], "visa", "India to NZ visitor visa"],
  [["IN"], "NZ", "tourism", ["pr:AU"], "eta", "Australian PR to NZ NZeTA"],
  [["KW"], "NZ", "tourism", [], "visa", "Kuwait waiver suspended"],
  [["CN"], "NZ", "transit", [], "eta", "China transit visa waiver"],
  [["US"], "TR", "tourism", [], "free", "US to Türkiye"],
  [["MX"], "TR", "tourism", [], "evisa", "Mexico e-Visa"],
  [["IN"], "TR", "tourism", [], "visa", "India to Türkiye without supporting visa"],
  [["IN"], "TR", "tourism", ["visa:US"], "evisa", "India conditional e-Visa with US visa"],
  [["NG"], "TR", "tourism", [], "visa", "Nigeria mission visa"],
  [["US"], "SG", "tourism", [], "free", "US to Singapore"],
  [["IN"], "SG", "tourism", [], "visa", "India to Singapore visa"],
  [["IN"], "SG", "transit", ["visa:US"], "free", "India VFTF with US visa"],
  [["RU"], "SG", "transit", [], "free", "Russia VFTF"],
  [["GB"], "SG", "work", [], "permit", "Singapore Employment Pass"],
  [["US"], "KR", "tourism", [], "free", "US to Korea, K-ETA exempt to end 2026"],
  [["MX"], "KR", "tourism", [], "eta", "Mexico to Korea K-ETA"],
  [["IN"], "KR", "tourism", [], "visa", "India to Korea visa"],
  [["PH"], "KR", "transit", ["visa:US"], "free", "Philippines third-country transit with US visa"],
  [["NG"], "KR", "transit", ["visa:US"], "check", "Nigeria excluded from transit scheme"],
  [["FR"], "CN", "tourism", [], "free", "France to China 30 days"],
  [["US"], "CN", "tourism", [], "visa", "US to China needs visa"],
  [["US"], "CN", "transit", [], "free", "US 240-hour transit"],
  [["NG"], "CN", "transit", [], "free", "24-hour direct transit"],
  [["IN"], "CN", "work", [], "permit", "China Z visa"],
  [["US"], "SA", "tourism", [], "evisa", "US to Saudi eVisa"],
  [["IN"], "SA", "tourism", [], "visa", "India to Saudi visit visa"],
  [["IN"], "SA", "tourism", ["visa:US"], "evisa", "India with US visa to Saudi"],
  [["NG"], "SA", "tourism", ["pr:GB"], "evisa", "UK resident to Saudi"],
  [["AE"], "SA", "tourism", [], "check", "GCC to Saudi unconfirmed"],
  // Batch 2 (verified 2026-11-22)
  [["US"], "BR", "tourism", [], "evisa", "US to Brazil eVisa"],
  [["GB"], "BR", "tourism", [], "free", "UK to Brazil visa free"],
  [["FR"], "BR", "tourism", [], "free", "EU to Brazil 90/180"],
  [["IN"], "BR", "tourism", ["visa:US"], "visa", "India to Brazil: US visa doesn't help"],
  [["NG"], "BR", "transit", [], "free", "Brazil airside transit"],
  [["JP"], "BR", "tourism", [], "check", "Japan exemption extension unconfirmed"],
  [["CN"], "BR", "tourism", [], "free", "China 30-day exemption 2026"],
  [["DE"], "BR", "work", [], "permit", "Brazil VITEM V"],
  [["US"], "AT", "tourism", [], "free", "US to Austria"],
  [["IN"], "AT", "tourism", [], "visa", "India to Austria Schengen visa"],
  [["IN"], "AT", "transit", [], "check", "Austria national ATV list unconfirmed"],
  [["NG"], "AT", "transit", [], "visa", "Nigeria EU-wide ATV at Austria"],
  [["US"], "BE", "tourism", [], "free", "US to Belgium"],
  [["CN"], "BE", "tourism", [], "visa", "China to Belgium visa"],
  [["IN"], "BE", "tourism", ["pr:EU"], "resident", "Schengen resident to Belgium"],
  [["IN"], "CZ", "transit", [], "visa", "India needs Czech ATV"],
  [["IN"], "CZ", "transit", ["visa:US"], "free", "India Czech ATV exempt with US visa"],
  [["GB"], "CZ", "tourism", [], "free", "UK to Czechia"],
  [["NG"], "CZ", "tourism", [], "visa", "Nigeria to Czechia visa"],
  [["CU"], "PL", "transit", [], "visa", "Cuba needs Polish ATV"],
  [["IN"], "PL", "transit", [], "free", "India airside transit Poland"],
  [["US"], "PL", "tourism", [], "free", "US to Poland"],
  [["IN"], "HU", "transit", [], "free", "India airside transit Hungary"],
  [["IN"], "HU", "tourism", [], "visa", "India to Hungary visa"],
  [["DE"], "HU", "work", [], "free", "EU free movement Hungary"],
  [["US"], "HR", "tourism", [], "free", "US to Croatia"],
  [["IN"], "HR", "tourism", [], "visa", "India to Croatia visa"],
  [["IN"], "HR", "transit", [], "check", "Croatia national ATV unconfirmed"],
  [["SY"], "DK", "transit", [], "visa", "Syria needs Danish ATV"],
  [["IN"], "DK", "transit", [], "free", "India airside transit Denmark"],
  [["IN"], "DK", "study", [], "permit", "Denmark study permit"],
  [["US"], "SE", "tourism", [], "free", "US to Sweden"],
  [["IN"], "SE", "tourism", [], "visa", "India to Sweden visa"],
  [["IN"], "SE", "work", [], "permit", "Sweden work permit"],
  [["TR"], "NO", "transit", [], "visa", "Türkiye needs Norwegian ATV"],
  [["TR"], "NO", "transit", ["visa:US"], "free", "Türkiye Norway ATV exempt with US visa"],
  [["US"], "NO", "tourism", [], "free", "US to Norway"],
  [["SE"], "NO", "work", [], "free", "EEA free movement Norway"]
];

let fail = 0;
for (const [nats, d, p, docs, exp, label] of cases) {
  const { best } = evaluateTrip({ nationalities: nats, destination: d, purpose: p, docs });
  const ok = best.status === exp;
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}  -> ${best.status}${ok ? "" : ` (expected ${exp})`}`);
  if (!best.summary) { fail++; console.log("  missing summary"); }
}

// Every destination x every nationality x every purpose must return a valid status without throwing.
const { DESTINATIONS, STATUS } = window.VISA;
let n = 0;
for (const dst of DESTINATIONS) for (const [c] of window.COUNTRIES) for (const p of ["tourism", "business", "transit", "study", "work"]) {
  const r = dst.evaluate(c, { purpose: p, docs: new Set() });
  if (!STATUS[r.status] || !r.summary) { fail++; console.log("BAD", dst.id, c, p, r.status); }
  n++;
}
console.log(`\nSweep: ${n} combinations checked.`);
console.log(fail ? `\n${fail} failure(s)` : "\nAll passed");
process.exit(fail ? 1 : 0);
