// Run with: node tests/api.test.js
// Tests the API response normaliser with realistic and hostile payloads (no network needed).
const path = require("path");
global.window = global;
require(path.join(__dirname, "../js/api.js"));
const { normalize, statusFrom, safeUrl } = window.VISA_API;

let fail = 0;
const t = (label, cond) => { console.log(`${cond ? "PASS" : "FAIL"}  ${label}`); if (!cond) fail++; };

t("visa free name", statusFrom({ name: "Visa-free" }) === "free");
t("visa on arrival", statusFrom({ name: "Visa on arrival", color: "yellow" }) === "voa");
t("eTA", statusFrom({ name: "eTA" }) === "eta");
t("eVisa", statusFrom({ name: "eVisa", color: "blue" }) === "evisa");
t("visa required", statusFrom({ name: "Visa required", color: "red" }) === "visa");
t("colour fallback", statusFrom({ name: "Something", color: "green" }) === "free");
t("unknown is check", statusFrom({}) === "check");

t("blocks javascript: urls", safeUrl("javascript:alert(1)") === "");
t("blocks data: urls", safeUrl("data:text/html,hi") === "");
t("keeps https", safeUrl("https://example.gov/visa") === "https://example.gov/visa");

const sample = {
  data: {
    destination: { passport_validity: "6 months", embassy_url: "https://embassy.example.gov" },
    visa_rules: {
      primary_rule: { name: "eVisa", duration: "30 days", color: "blue", link: "https://evisa.example.gov" },
      secondary_rule: { name: "Visa on arrival", duration: "15 days", color: "yellow", link: "javascript:alert(1)" },
      exception_rule: { full_text: "Holders of a valid US visa may get a visa on arrival." }
    },
    mandatory_registration: { name: "Arrival card", link: "https://arrival.example.gov" },
    yellowfever_vaccination_requirement: true,
    return_ticket: true
  }
};
const r = normalize(sample, { destName: "Testland" });
t("status evisa", r.status === "evisa");
t("stay from primary", r.stay === "30 days");
t("auth link kept", r.auth && r.auth.url === "https://evisa.example.gov/");
t("unsafe secondary link dropped", !r.links.some(([, u]) => u.startsWith("javascript")));
t("exception becomes note", r.notes.some((n) => n.includes("US visa")));
t("yellow fever in checklist", r.checklist.some((i) => /yellow fever/i.test(i.t)));
t("registration in checklist", r.checklist.some((i) => i.t === "Arrival card"));
t("passport validity used", r.checklist[0].d === "6 months");

const study = normalize(sample, { purpose: "study", destName: "Testland" });
t("study becomes permit", study.status === "permit" && study.auth === null);

const free = normalize({ data: { visa_rules: { primary_rule: { name: "Visa free", duration: "90 days", color: "green" } } } });
t("visa free has no photo/forms", free.status === "free" && !free.checklist.some((i) => /photo|Apply/.test(i.t)));

// Hostile / empty payloads must not throw.
for (const bad of [null, undefined, {}, { data: null }, { data: { visa_rules: null } }, "oops", 42, { data: { visa_rules: { primary_rule: { name: 123 } } } }]) {
  let ok = true;
  try { const x = normalize(bad); ok = typeof x.status === "string" && Array.isArray(x.checklist); } catch (e) { ok = false; }
  t(`survives payload ${JSON.stringify(bad)}`, ok);
}

console.log(fail ? `\n${fail} failure(s)` : "\nAll passed");
process.exit(fail ? 1 : 0);
