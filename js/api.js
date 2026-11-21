/* Fallback data source for destinations without built-in verified rules.
 * Talks to the proxy in worker/worker.js (never directly to RapidAPI, so no key in the browser),
 * and turns the API response into the same result shape the rules engine produces.
 */
(function () {
  const safeUrl = (u) => {
    try { const x = new URL(String(u)); return x.protocol === "https:" || x.protocol === "http:" ? x.href : ""; }
    catch { return ""; }
  };
  const txt = (v) => (v == null ? "" : String(v).trim());

  function statusFrom(rule) {
    const n = txt(rule && rule.name).toLowerCase();
    const c = txt(rule && rule.color).toLowerCase();
    if (/visa[\s-]*free|visa not required|no visa|freedom of movement/.test(n)) return "free";
    if (/on arrival/.test(n)) return "voa";
    if (/\beta\b|electronic travel|esta|travel authori[sz]ation|e-?ta\b/.test(n)) return "eta";
    if (/e-?visa|electronic visa|online visa/.test(n)) return "evisa";
    if (/required|embassy|consulate/.test(n)) return "visa";
    if (/not admitted|refused|banned|suspend/.test(n)) return "banned";
    return { green: "free", blue: "evisa", yellow: "voa", red: "visa" }[c] || "check";
  }

  // Pure function: API JSON -> VisaCheck result. Exported for tests.
  function normalize(json, { purpose = "tourism", destName = "" } = {}) {
    const d = (json && (json.data || json)) || {};
    const rules = d.visa_rules || {};
    const primary = rules.primary_rule || {};
    const secondary = rules.secondary_rule || null;
    const exception = rules.exception_rule || null;
    const reg = d.mandatory_registration || null;
    const validity = txt(d.destination && d.destination.passport_validity);
    const embassy = safeUrl(d.destination && d.destination.embassy_url);

    let status = statusFrom(primary);
    const options = [primary, secondary].filter((r) => r && txt(r.name)).map((r) => ({
      name: txt(r.name), duration: txt(r.duration), url: safeUrl(r.link)
    }));

    const item = (t, d2, url) => ({ t, d: d2 || "", url: url || "" });
    const needsApplication = ["visa", "evisa", "eta"].includes(status);
    const checklist = [item("Valid passport", validity || "Valid for your whole stay. Many countries ask for 6 months.")];
    if (needsApplication) checklist.push(item("Passport photo", "To the destination's photo specification."));
    checklist.push(item("Return or onward ticket", d.return_ticket ? "Required at entry." : "Recommended. Airlines may ask for it."));
    checklist.push(item("Accommodation details", "Hotel booking or your host's address."));
    if (needsApplication || d.funds_requirement) checklist.push(item("Proof of funds", d.funds_requirement ? "May be checked at the border." : "Recent bank statements."));
    if (status === "visa") checklist.push(item("Proof of ties at home", "Employment letter, study enrolment, property or family ties."));
    if (d.yellowfever_vaccination_requirement) checklist.push(item("Yellow fever vaccination certificate", txt(d.yellowfever_vaccination_requirement) === "true" || d.yellowfever_vaccination_requirement === true ? "Required." : txt(d.yellowfever_vaccination_requirement)));
    if (d.polio_vaccination_requirement) checklist.push(item("Polio vaccination certificate", "May be required."));
    checklist.push(item("Travel medical insurance", "Strongly recommended."));
    if (reg && txt(reg.name)) checklist.push(item(txt(reg.name), "Mandatory registration before arrival.", safeUrl(reg.link)));
    options.forEach((o, i) => { if (i === 0 && needsApplication) checklist.push(item(`Apply: ${o.name}`, o.duration, o.url)); });

    const links = [];
    options.forEach((o) => o.url && links.push([`${o.name} (official)`, o.url]));
    if (reg && safeUrl(reg.link)) links.push([txt(reg.name) || "Registration", safeUrl(reg.link)]);
    if (embassy) links.push(["Embassy or immigration site", embassy]);

    const notes = [];
    if (exception && txt(exception.full_text)) notes.push(txt(exception.full_text));
    if (secondary && txt(secondary.name)) notes.push(`Also possible: ${txt(secondary.name)}${txt(secondary.duration) ? ` (${txt(secondary.duration)})` : ""}.`);

    const result = {
      status,
      stay: options[0] ? options[0].duration : "",
      summary: summaryFor(status, txt(primary.name), destName),
      auth: needsApplication && options[0] ? { name: options[0].name, fee: "", time: "", url: options[0].url } : null,
      checklist, notes, warn: [], links, source: "api"
    };

    if (purpose === "study" || purpose === "work") {
      result.status = "permit";
      result.summary = `${purpose === "study" ? "Studying" : "Working"} in ${destName || "this country"} needs a specific long-stay visa or permit. The data below covers short visits only, so confirm the right category with the embassy.`;
      result.auth = null;
      result.checklist.push(item(purpose === "study" ? "Admission letter from the school" : "Job offer or work contract", "Usually needed before applying."));
    }
    return result;
  }

  function summaryFor(status, name, dest) {
    const where = dest || "this destination";
    switch (status) {
      case "free": return `No visa needed for short visits to ${where}${name ? ` (${name})` : ""}.`;
      case "voa": return `You can get a visa on arrival in ${where}${name ? ` (${name})` : ""}.`;
      case "eta": return `Apply online for ${name || "a travel authorisation"} before you travel.`;
      case "evisa": return `Apply online for ${name || "an eVisa"} before you travel.`;
      case "visa": return `You need ${name || "a visa"} before you travel to ${where}.`;
      case "banned": return `Entry to ${where} is currently restricted for this passport.`;
      default: return `We couldn't read a clear answer. Check the official links.`;
    }
  }

  async function check(passport, destination, opts = {}) {
    const cfg = window.VISACHECK_CONFIG || {};
    if (!cfg.apiProxyUrl) throw Object.assign(new Error("No API configured"), { code: "NO_API" });
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), cfg.apiTimeoutMs || 12000);
    if (opts.signal) opts.signal.addEventListener("abort", () => ctrl.abort(), { once: true });
    try {
      const res = await fetch(cfg.apiProxyUrl.replace(/\/$/, "") + "/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passport, destination }),
        signal: ctrl.signal
      });
      if (res.status === 429) throw Object.assign(new Error("Too many requests. Try again in a minute."), { code: "RATE" });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || data.error) throw Object.assign(new Error((data && data.message) || `Service error (${res.status})`), { code: "HTTP" });
      return normalize(data, opts);
    } catch (e) {
      if (e.name === "AbortError" && opts.signal && opts.signal.aborted) throw Object.assign(new Error("Cancelled"), { code: "ABORT" });
      if (e.name === "AbortError") throw Object.assign(new Error("The lookup timed out."), { code: "TIMEOUT" });
      throw e;
    } finally { clearTimeout(timer); }
  }

  window.VISA_API = { check, normalize, statusFrom, safeUrl };
})();
