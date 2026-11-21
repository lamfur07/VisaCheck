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
  [["CA"], "MX", "tourism", [], "free", "Canada to Mexico"]
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
