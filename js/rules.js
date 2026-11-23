/* VisaCheck rules data and engine.
 * Every rule here was checked against an official source in November 2026 (dates per destination in `verified`).
 * Rules change often: each result links to the official page so users can confirm.
 */
(function () {
  const S = (str) => new Set(str.trim().split(/\s+/));
  const union = (...sets) => new Set(sets.flatMap((s) => [...s]));

  // ---------- Shared groups ----------
  const EU = S("AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE");
  const EEA_CH = union(EU, S("IS LI NO CH"));
  const GCC = S("BH KW OM QA SA AE");

  // Documents a traveller can hold (residence permits and visas), keyed for the UI.
  const DOCS = {
    residence: [
      ["pr:US", "US Green Card (permanent resident)"],
      ["pr:CA", "Canada permanent resident"],
      ["pr:GB", "UK residence (ILR, BRP or eVisa status)"],
      ["pr:EU", "EU / Schengen residence permit"],
      ["pr:JP", "Japan residence card"],
      ["pr:AU", "Australia permanent or temporary visa (resident)"],
      ["pr:NZ", "New Zealand resident visa"],
      ["pr:SG", "Singapore residence (PR or pass)"],
      ["pr:KR", "South Korea residence"],
      ["pr:PA", "Chile, Colombia or Peru permanent residence"],
      ["pr:AE", "UAE residence visa"]
    ],
    visas: [
      ["visa:US", "Valid US visa (e.g. B1/B2)"],
      ["visa:CA", "Canadian visa (now or in last 10 years)"],
      ["visa:GB", "Valid UK visa"],
      ["visa:SCHENGEN", "Valid Schengen visa"],
      ["visa:JP", "Valid Japan visa"],
      ["visa:AU", "Valid Australia visa"],
      ["visa:NZ", "Valid New Zealand visa"],
      ["visa:SG", "Valid Singapore visa"],
      ["visa:KR", "Valid South Korea visa"]
    ]
  };

  // ---------- Status levels (lower rank = easier) ----------
  const STATUS = {
    citizen:  { rank: 0, label: "You're a citizen", tone: "green" },
    resident: { rank: 1, label: "No visa needed with your documents", tone: "green" },
    free:     { rank: 2, label: "No visa needed", tone: "green" },
    voa:      { rank: 3, label: "Visa on arrival", tone: "teal" },
    eta:      { rank: 4, label: "Online travel authorisation needed", tone: "blue" },
    evisa:    { rank: 5, label: "eVisa (apply online)", tone: "blue" },
    visa:     { rank: 6, label: "Visa required", tone: "amber" },
    permit:   { rank: 6, label: "Visa or permit required", tone: "amber" },
    check:    { rank: 8, label: "Check with the embassy", tone: "grey" },
    banned:   { rank: 9, label: "Entry currently restricted", tone: "red" }
  };

  const has = (ctx, ...keys) => keys.some((k) => ctx.docs.has(k));

  // ---------- Reusable checklist items ----------
  const item = (t, d, url) => ({ t, d, url });
  const common = {
    passport: (rule) => item("Valid passport", rule || "Valid for your whole stay, with at least one blank page."),
    photo: (spec) => item("Passport photo", spec || "Recent, plain background, to the destination's photo spec."),
    funds: () => item("Proof of funds", "Recent bank statements (usually last 3 to 6 months) or a sponsor letter."),
    ticket: () => item("Return or onward ticket", "A booking showing you will leave before your permitted stay ends."),
    stay: () => item("Accommodation details", "Hotel booking or the address of the person hosting you."),
    ties: () => item("Proof of ties at home", "Employment letter, study enrolment, property or family ties."),
    business: () => item("Business invitation letter", "From the company you are visiting: purpose, dates, who pays."),
    insurance: (min) => item("Travel medical insurance", min || "Strongly recommended for the whole trip.")
  };

  function visitorChecklist(o = {}) {
    const list = [common.passport(o.passport)];
    if (o.photo !== false) list.push(common.photo(o.photoSpec));
    if (o.form) list.push(o.form);
    list.push(common.funds(), common.ticket(), common.stay(), common.ties());
    if (o.purpose === "business") list.push(common.business());
    list.push(common.insurance(o.insurance));
    if (o.extra) list.push(...o.extra);
    return list;
  }

  function lightChecklist(o = {}) {
    const list = [common.passport(o.passport)];
    if (o.auth) list.push(o.auth);
    list.push(common.ticket(), common.stay(), common.funds());
    if (o.purpose === "business") list.push(common.business());
    if (o.extra) list.push(...o.extra);
    return list;
  }

  // =====================================================================
  // UNITED STATES
  // =====================================================================
  const US_VWP = S("AD AU AT BE BN CL HR CZ DK EE FI FR DE GR HU IS IE IL IT JP LV LI LT LU MT MC NL NZ NO PL PT QA SM SG SK SI KR ES SE CH TW GB");
  const US_FULL_BAN = S("AF BF MM TD GQ ER HT IR LA LY ML NE CG SL SO SS SD SY YE PS");
  const US_PARTIAL_BAN = S("AO AG BJ BI CI CU DM GA GM MW MR NG SN TZ TG TO VE ZM ZW"); // B, F, M, J and immigrant visas suspended
  // Turkmenistan: only immigrant visas suspended, so visitors follow normal rules.

  const US = {
    id: "US", name: "United States", flag: "🇺🇸", verified: "2026-11-20",
    links: [
      ["Do I need a visa? (travel.state.gov)", "https://travel.state.gov/content/travel/en/us-visas.html"],
      ["Official ESTA application", "https://esta.cbp.dhs.gov/"],
      ["DS-160 visa application", "https://ceac.state.gov/genniv/"]
    ],
    evaluate(nat, ctx) {
      const p = ctx.purpose;
      if (nat === "US") return { status: "citizen", summary: "Enter on your US passport." };
      if (has(ctx, "pr:US")) return {
        status: "resident",
        summary: "As a lawful permanent resident you return on your Green Card. No visa or ESTA needed.",
        checklist: [item("Valid Green Card (Form I-551)", "Or a re-entry permit if you were away more than a year."), common.passport()]
      };
      if (nat === "CA") {
        if (p === "study") return usStudy(nat, ctx, true);
        if (p === "work") return usWork(nat, ctx, true);
        return { status: "free", stay: "Usually up to 6 months", summary: "Canadian citizens don't need a visa or ESTA to visit.", checklist: lightChecklist({ purpose: p, passport: "Valid Canadian passport (or NEXUS/EDL for land and sea)." }) };
      }
      if (US_FULL_BAN.has(nat)) return {
        status: "banned",
        summary: "A presidential proclamation (in force since 1 January 2026) suspends entry and new visas for nationals of this country, with limited exceptions.",
        warn: ["Exceptions include green card holders, some visas issued before the ban, and dual nationals travelling on a passport from a country that is not listed."],
        notes: ["If you hold another nationality, check results for that passport."],
        links: [["Presidential proclamations on entry", "https://travel.state.gov/content/travel/en/News/visas-news.html"]]
      };
      if (US_PARTIAL_BAN.has(nat) && ["tourism", "business", "study"].includes(p)) return {
        status: "banned",
        summary: "Visitor (B1/B2), student (F, M) and exchange (J) visas are suspended for this nationality under the proclamation in force since 1 January 2026.",
        warn: ["Visas issued before 1 January 2026 remain valid. Work visas are not suspended but may be issued with shorter validity."],
        notes: ["If you hold another nationality, check results for that passport."],
        links: [["Visa news and proclamations", "https://travel.state.gov/content/travel/en/News/visas-news.html"]]
      };
      if (p === "study") return usStudy(nat, ctx);
      if (p === "work") return usWork(nat, ctx);
      if (US_VWP.has(nat)) return {
        status: "eta",
        stay: "Up to 90 days per visit",
        auth: { name: "ESTA", fee: "US$40", time: "Apply at least 72 hours before travel", url: "https://esta.cbp.dhs.gov/" },
        summary: p === "transit" ? "Your passport is in the Visa Waiver Program. You need an approved ESTA even to transit, as the US has no airside transit." : "Your passport is in the Visa Waiver Program. Apply for an ESTA online before you fly.",
        checklist: lightChecklist({ purpose: p, passport: "Electronic passport (chip) from your VWP country.",
          auth: item("Approved ESTA", "US$40, valid 2 years or until your passport expires.", "https://esta.cbp.dhs.gov/") }),
        warn: ["You can't use ESTA if you've been to Iran, Iraq, Libya, North Korea, Somalia, Sudan, Syria or Yemen since March 2011 (or Cuba since January 2021), if you're also a Cuban, Iranian, Iraqi, North Korean, Sudanese or Syrian national, or after a US overstay. Apply for a visa instead."],
        notes: ["Use only esta.cbp.dhs.gov. Other sites charge extra."]
      };
      const visaType = p === "transit" ? "C-1 transit visa (or B1/B2)" : "B1/B2 visitor visa";
      return {
        status: "visa",
        stay: "Set by the officer at entry, often up to 6 months",
        auth: { name: visaType, fee: "US$185 application fee", time: "Interview wait times vary by consulate", url: "https://travel.state.gov/content/travel/en/us-visas/tourism-visit/visitor.html" },
        summary: nat === "MX" ? "Mexican citizens need a B1/B2 visa or a Border Crossing Card." : `You need a ${visaType}, with an in-person interview at a US embassy or consulate.`,
        checklist: [
          common.passport("Valid at least 6 months beyond your stay (some countries are exempt from the 6-month rule)."),
          item("DS-160 confirmation page", "Complete the online form first.", "https://ceac.state.gov/genniv/"),
          item("Visa fee receipt", "US$185 MRV fee, paid before booking your interview."),
          common.photo("2x2 inch (51x51 mm), white background, taken in the last 6 months."),
          item("Interview appointment", "Book through your country's official US visa appointment site."),
          common.funds(), common.ties(),
          ...(p === "business" ? [common.business()] : []),
          item("Travel plan", "Dates, purpose, and where you'll stay.")
        ],
        warn: ["A US$250 visa integrity fee was signed into law in 2025 and may be charged when the visa is issued. Check your consulate's fee page."],
        notes: ["Many consulates have long interview waits: apply early."]
      };
    }
  };

  function usStudy(nat, ctx, canadian) {
    return {
      status: canadian ? "permit" : "visa",
      summary: canadian ? "Canadians don't need a visa stamp to study, but do need F-1 student status, granted at the border with your I-20." : "You need an F-1 (academic) or M-1 (vocational) student visa.",
      auth: { name: "F-1 student status", fee: canadian ? "SEVIS fee US$350" : "US$185 visa fee + US$350 SEVIS fee", time: "Apply up to 365 days before your program starts", url: "https://studyinthestates.dhs.gov/" },
      checklist: [
        item("Form I-20", "Issued by your SEVP-certified school after admission."),
        item("SEVIS I-901 fee receipt", "US$350 for F and M students.", "https://www.fmjfee.com/"),
        ...(canadian ? [] : [item("DS-160 and visa interview", "Book an interview at a US consulate.", "https://ceac.state.gov/genniv/")]),
        common.passport("Valid at least 6 months beyond your planned stay."),
        item("Proof you can pay", "Funds covering at least the first year of costs shown on your I-20."),
        item("Admission letter and transcripts", "Plus test scores your school required.")
      ]
    };
  }
  function usWork(nat, ctx, canadian) {
    return {
      status: "permit",
      summary: "Work in the US needs an employer-sponsored visa (e.g. H-1B, L-1, O-1)" + (canadian || nat === "MX" ? ", or TN status under USMCA for listed professions." : "."),
      auth: { name: "Employer petition, then visa", fee: "Varies by category", time: "Months; H-1B uses a yearly lottery", url: "https://travel.state.gov/content/travel/en/us-visas/employment.html" },
      checklist: [
        item("Approved petition (Form I-797)", "Your employer files with USCIS first."),
        ...(canadian ? [item("TN option for Canadians", "Apply at the border with a job offer letter and proof of qualifications.")] : [item("DS-160 and interview", "After the petition is approved.", "https://ceac.state.gov/genniv/")]),
        common.passport(), item("Degree and experience letters", "Matching the role in the petition.")
      ]
    };
  }

  // =====================================================================
  // CANADA
  // =====================================================================
  const CA_ETA = S("AD AU AT BS BB BE GB BN BG CL HR CY CZ DK EE FI FR DE GR HK HU IS IE IL IT JP LV LI LT LU MT MC NL NZ NO PG PL PT QA KR RO SM SG SK SI SB ES SE CH TW AE VA WS");
  const CA_ETA_X = S("AG AR BR CR ID MY MX MA PA PH KN LC VC SC TH TT UY");

  const CA = {
    id: "CA", name: "Canada", flag: "🇨🇦", verified: "2026-11-20",
    links: [
      ["Find out if you need a visa (IRCC)", "https://www.canada.ca/en/immigration-refugees-citizenship/services/visit-canada/entry-requirements-country.html"],
      ["Official eTA application", "https://www.canada.ca/en/immigration-refugees-citizenship/services/visit-canada/eta.html"],
      ["Visitor visa", "https://www.canada.ca/en/immigration-refugees-citizenship/services/visit-canada.html"]
    ],
    evaluate(nat, ctx) {
      const p = ctx.purpose;
      if (nat === "CA") return { status: "citizen", summary: "Travel on your Canadian passport." };
      if (has(ctx, "pr:CA")) return { status: "resident", summary: "Canadian permanent residents need a valid PR card or PR travel document, not a visa or eTA.", checklist: [item("PR card or PR travel document (PRTD)", "Must be valid when you board."), common.passport()] };
      if (p === "study") return caStudy(nat, ctx);
      if (p === "work") return caWork(nat, ctx);
      if (nat === "US") return { status: "free", stay: "Usually up to 6 months", summary: "US citizens don't need a visa or eTA.", checklist: lightChecklist({ purpose: p, passport: "Valid US passport (or NEXUS/EDL for land and sea)." }) };
      if (has(ctx, "pr:US")) return { status: "resident", stay: "Usually up to 6 months", summary: "US green card holders don't need an eTA or visa (any travel mode) since April 2022.", checklist: [common.passport("Valid passport of your nationality."), item("Valid Green Card", "Or other proof of US permanent residence."), common.ticket(), common.funds()] };
      if (has(ctx, "visa:CA")) return { status: "resident", stay: "As granted", summary: "If your Canadian visitor visa is still valid, use it. If it expired, see the result without it.", checklist: [item("Valid Canadian visa in your passport", "Check the expiry date and number of entries.")] };
      const eta = { name: "eTA", fee: "CA$7", time: "Most approved within minutes", url: "https://www.canada.ca/en/immigration-refugees-citizenship/services/visit-canada/eta/apply.html" };
      const etaItem = item("Approved eTA (flying only)", "CA$7, valid 5 years or until passport expiry. Not needed by land or sea.", eta.url);
      if (CA_ETA.has(nat)) {
        const note = nat === "RO" ? ["Romanian citizens need an electronic (chip) passport to use the eTA."] : nat === "IL" ? ["Israeli citizens need a national Israeli passport."] : nat === "TW" ? ["Taiwan passport must include your personal ID number."] : [];
        return { status: "eta", stay: "Usually up to 6 months", auth: eta, summary: p === "transit" ? "You need an eTA to transit through a Canadian airport." : "Visa exempt. You need an eTA to fly to Canada.", checklist: lightChecklist({ purpose: p, auth: etaItem }), notes: ["Only apply on canada.ca. Other sites charge more.", ...note] };
      }
      if (CA_ETA_X.has(nat)) {
        if (has(ctx, "visa:US")) return { status: "eta", stay: "Usually up to 6 months", auth: eta, summary: "Your nationality can use an eTA instead of a visa when flying, because you hold a valid US nonimmigrant visa.", checklist: lightChecklist({ purpose: p, auth: etaItem, extra: [item("Valid US nonimmigrant visa", "Must be valid when you apply.")] }), warn: ["Only for air travel. By land or sea you still need a visitor visa."] };
        return { ...caVisa(p), notes: ["Your nationality could use a CA$7 eTA instead if you hold a valid US nonimmigrant visa or had a Canadian visa in the last 10 years (air travel only)."] };
      }
      return caVisa(p);
    }
  };
  function caVisa(p) {
    return {
      status: "visa",
      stay: "Usually up to 6 months",
      auth: { name: p === "transit" ? "Transit visa (free)" : "Visitor visa (TRV)", fee: p === "transit" ? "No fee" : "CA$100 + CA$85 biometrics", time: "Check IRCC processing times", url: "https://www.canada.ca/en/immigration-refugees-citizenship/services/visit-canada/apply-visitor-visa.html" },
      summary: p === "transit" ? "You need a transit visa, unless you qualify for the Transit Without Visa or China Transit programs (valid US visa, flying to or from the US)." : "You need a visitor visa, applied for online through IRCC.",
      checklist: visitorChecklist({ purpose: p,
        form: item("Online application (IRCC account)", "Includes the visitor visa form and family information.", "https://www.canada.ca/en/immigration-refugees-citizenship/services/application/account.html"),
        extra: [item("Biometrics", "Fingerprints and photo at a Visa Application Centre, CA$85 (valid 10 years).")] })
    };
  }
  function caStudy(nat, ctx) {
    return {
      status: "permit",
      summary: "Programs longer than 6 months need a study permit." + (nat === "US" || has(ctx, "pr:US") ? " US citizens and green card holders can apply at the port of entry." : ""),
      auth: { name: "Study permit", fee: "CA$150 (+ CA$85 biometrics)", time: "Check IRCC processing times", url: "https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada/study-permit.html" },
      checklist: [
        item("Letter of acceptance", "From a Designated Learning Institution (DLI)."),
        item("Provincial or territorial attestation letter (PAL/TAL)", "Required for most college and university applicants."),
        item("Proof of funds", "Tuition plus IRCC's current living cost minimum."),
        common.passport(), item("Biometrics", "If your nationality requires them."),
        item("Medical exam", "Only if requested for your country or program.")
      ]
    };
  }
  function caWork(nat, ctx) {
    return {
      status: "permit",
      summary: "You need a work permit: employer-specific (usually with an LMIA or LMIA-exempt offer) or an open permit (e.g. International Experience Canada for eligible youth).",
      auth: { name: "Work permit", fee: "CA$155 (+ biometrics)", time: "Varies by stream", url: "https://www.canada.ca/en/immigration-refugees-citizenship/services/work-canada/permit.html" },
      checklist: [
        item("Job offer", "With an LMIA, or an offer of employment number for LMIA-exempt jobs."),
        item("Proof of qualifications", "Degrees, licences, experience letters."),
        common.passport(), item("Biometrics", "If required."),
        item("Police certificate or medical", "Only if requested.")
      ]
    };
  }

  // =====================================================================
  // UNITED KINGDOM
  // =====================================================================
  const UK_ETA = S("QA BH KW OM AE SA AG AR AU BB BZ BR BN CA CL CR GD GT GY HK IL JP KI MO MY MV MH MU MX FM NZ PW PG PY PE KN VC WS SC SG SB KR TW BS TO TV US UY AD AT BE BG HR CY CZ DK EE FI FR DE GR HU IS IT LV LI LT LU MT MC NL NO PL PT RO SM SK SI ES SE CH VA");

  const GB = {
    id: "GB", name: "United Kingdom", flag: "🇬🇧", verified: "2026-11-20",
    links: [
      ["Check if you need a UK visa", "https://www.gov.uk/check-uk-visa"],
      ["Official UK ETA application", "https://www.gov.uk/eta/apply"],
      ["Standard Visitor visa", "https://www.gov.uk/standard-visitor"]
    ],
    evaluate(nat, ctx) {
      const p = ctx.purpose;
      if (nat === "GB") return { status: "citizen", summary: "Travel on your British passport." };
      if (nat === "IE") return { status: "free", summary: "Irish citizens can live, work and study in the UK under the Common Travel Area. No visa or ETA.", checklist: [common.passport("Irish passport or passport card.")] };
      if (has(ctx, "pr:GB")) return { status: "resident", summary: "If you have UK immigration permission (ILR or a current visa/eVisa), you don't need an ETA or a new visa to return.", checklist: [item("Proof of UK status", "eVisa share code / UKVI account linked to your passport."), common.passport()] };
      if (p === "study") return ukStudy();
      if (p === "work") return ukWork();
      if (has(ctx, "visa:GB")) return { status: "resident", summary: "Use your valid UK visa. You don't need an ETA while it is valid.", checklist: [item("Valid UK visa or eVisa", "Check dates and conditions.")] };
      if (UK_ETA.has(nat)) {
        const etaUrl = "https://www.gov.uk/eta/apply";
        return {
          status: "eta", stay: "Up to 6 months per visit",
          auth: { name: "UK ETA", fee: "£20", time: "Usually 3 working days", url: etaUrl },
          summary: p === "transit" ? "You need an ETA if you pass through UK border control. Airside-only transit rules vary by airport: check before you fly." : "Visa free, but you must get an ETA before you travel. Airlines check it at boarding.",
          checklist: lightChecklist({ purpose: p, auth: item("Approved ETA", "£20, valid 2 years or until your passport expires. Use the same passport you applied with.", etaUrl) }),
          notes: ["Every traveller needs their own ETA, including children.", "Use the UK ETA app or gov.uk only."],
          ...(nat === "TW" ? { warn: ["Taiwan passport must include your ID card number."] } : {})
        };
      }
      return {
        status: "visa", stay: "Up to 6 months",
        auth: { name: p === "transit" ? "Transit or Standard Visitor visa" : "Standard Visitor visa", fee: "£135 (6 months)", time: "Usually about 3 weeks", url: "https://www.gov.uk/standard-visitor/apply-standard-visitor-visa" },
        summary: p === "transit" ? "Your nationality may need a Direct Airside Transit Visa even without leaving the airport, unless you hold certain visas (e.g. a valid US, Canada or Australia visa). Check gov.uk." : "You need a Standard Visitor visa before you travel.",
        checklist: visitorChecklist({ purpose: p,
          form: item("Online application", "Apply on gov.uk, then book biometrics at a visa centre.", "https://www.gov.uk/standard-visitor/apply-standard-visitor-visa"),
          extra: [item("Tuberculosis test", "Only if you're staying over 6 months and from a listed country.", "https://www.gov.uk/tb-test-visa")] }),
        ...(p === "transit" ? { links: [["UK transit visa checker", "https://www.gov.uk/transit-visa"]] } : {})
      };
    }
  };
  function ukStudy() {
    return {
      status: "permit",
      summary: "Courses over 6 months need a Student visa. Short courses (up to 6 months) can be done as a visitor.",
      auth: { name: "Student visa", fee: "£558 + Immigration Health Surcharge", time: "Usually about 3 weeks from outside the UK", url: "https://www.gov.uk/student-visa" },
      checklist: [
        item("CAS number", "Confirmation of Acceptance for Studies from a licensed sponsor."),
        item("Proof of funds", "Course fees plus living costs, held for 28 days."),
        item("English language evidence", "As required by your sponsor."),
        item("Immigration Health Surcharge", "Paid during the application.", "https://www.gov.uk/healthcare-immigration-application"),
        item("TB test certificate", "If you're from a listed country.", "https://www.gov.uk/tb-test-visa"),
        common.passport()
      ]
    };
  }
  function ukWork() {
    return {
      status: "permit",
      summary: "Most work needs a sponsored visa, usually the Skilled Worker visa. Youth Mobility and Global Talent are alternatives for some.",
      auth: { name: "Skilled Worker visa", fee: "From £819 + Immigration Health Surcharge", time: "Usually about 3 weeks from outside the UK", url: "https://www.gov.uk/skilled-worker-visa" },
      checklist: [
        item("Certificate of Sponsorship", "From a UK employer with a sponsor licence."),
        item("Job meets salary and skill rules", "Check the current thresholds on gov.uk."),
        item("English language evidence", ""),
        item("Immigration Health Surcharge", "Paid during the application."),
        common.passport()
      ]
    };
  }

  // =====================================================================
  // SCHENGEN AREA (one rule set, country-specific portals)
  // =====================================================================
  const SCHENGEN_STATES = S("AT BE BG HR CZ DK EE FI FR DE GR HU IS IT LV LI LT LU MT NL NO PL PT RO SK SI ES SE CH");
  const SCH_EXEMPT = S("AL AD AG AR AU BS BB BA BR BN CA CL CO CR DM SV MK GE GD GT VA HN IL JP KI MY MH MU MX FM MD MC ME NZ NI PW PA PY PE WS SM RS SC SG SB KR KN LC VC TL TO TT TV UA AE US GB UY VE XK HK MO TW");
  const SCH_BIOMETRIC = S("AL BA MK GE MD ME RS UA");
  const SCH_ATV = S("AF BD CD ER ET GH IR IQ NG PK SO LK");

  // opts (batch 3 additions): natRule(nat, ctx) returns a full result overriding the default for tourism/business
  // (used for national entry restrictions), natWarn(nat, purpose) returns extra warnings for visit results.
  // opts (added in batch 2): verified date, atvExtra (Set of extra national airport-transit-visa
  // nationalities, or null when the national list couldn't be confirmed), atvNotes, reg (arrival registration note).
  function schengen(id, name, flag, portal, longStay, opts = {}) {
    const atvExtra = opts.atvExtra === undefined ? S("") : opts.atvExtra;
    const reg = opts.reg ? [opts.reg] : [];
    return {
      id, name, flag, schengen: true, verified: opts.verified || "2026-11-20",
      links: [
        [`${name}: official visa site`, portal],
        ["EU short-stay visa rules", "https://home-affairs.ec.europa.eu/policies/schengen/visa-policy_en"],
        ["Entry/Exit System (EES)", "https://travel-europe.europa.eu/ees_en"],
        ["ETIAS (official, not yet live)", "https://travel-europe.europa.eu/etias_en"]
      ],
      evaluate(nat, ctx) {
        const p = ctx.purpose;
        if (nat === id) return { status: "citizen", summary: `Travel on your ${COUNTRY_NAME[id]} passport or ID card.` };
        if (EEA_CH.has(nat)) return { status: "free", summary: "EU/EEA/Swiss free movement: you can visit, study and work without a visa.", checklist: [item("Passport or national ID card", "Valid for your stay."), ...(p === "work" || p === "study" ? [item("Register locally if staying over 3 months", "Rules vary by country and city.")] : [])] };
        if (p === "study" || p === "work") return schLong(name, portal, longStay, p);
        if (has(ctx, "pr:EU")) return { status: "resident", stay: "90 days in any 180", summary: "A residence permit from a Schengen country lets you travel to other Schengen countries for up to 90 days in any 180 without a visa.", checklist: [item("Valid Schengen residence permit", "Permits from Ireland and Cyprus don't count."), common.passport()], warn: ["Not valid for working in another Schengen country."] };
        if (opts.natRule && p !== "transit") { const r = opts.natRule(nat, ctx); if (r) return r; }
        const natWarn = opts.natWarn ? opts.natWarn(nat, p) || [] : [];
        if (has(ctx, "visa:SCHENGEN")) return { status: "resident", stay: "As shown on your visa", summary: "Use your valid Schengen visa. Check its dates, entries and days allowed.", checklist: [item("Valid Schengen visa", "Count your days: 90 in any 180.")] };
        if (SCH_EXEMPT.has(nat)) {
          const warn = SCH_BIOMETRIC.has(nat) ? ["Visa-free travel only applies to biometric passports."] : [];
          if (p !== "transit") warn.push(...natWarn);
          if (nat === "HK") warn.push("Hong Kong SAR passport required.");
          if (nat === "MO") warn.push("Macao SAR passport required.");
          if (nat === "TW") warn.push("Taiwan passport must include your ID card number.");
          return {
            status: "free", stay: "90 days in any 180 (whole Schengen Area)",
            summary: p === "transit" ? "No visa needed to transit." : "No visa needed for short stays. Your fingerprints and photo are recorded at the border under the EU Entry/Exit System (EES).",
            checklist: lightChecklist({ purpose: p, passport: "Issued in the last 10 years and valid 3+ months after you leave the Schengen Area." }),
            warn,
            notes: ["ETIAS is not in operation yet and nothing can be applied for. Ignore sites asking for payment.", "Days spent anywhere in the 29 Schengen countries count towards the 90.", ...(p === "transit" ? [] : reg)]
          };
        }
        if (p === "transit") {
          const atvExempt = has(ctx, "visa:US", "visa:CA", "visa:JP", "pr:US", "pr:CA", "pr:JP", "pr:EU");
          const national = atvExtra && atvExtra.has(nat) && !SCH_ATV.has(nat);
          if ((SCH_ATV.has(nat) || national) && !atvExempt) return {
            status: "visa",
            auth: { name: "Airport transit visa (Type A)", fee: "€90", time: "Apply at least 15 days ahead", url: portal },
            summary: (national ? `${name} requires an airport transit visa for your nationality (a national rule on top of the EU list)` : "Your nationality needs an airport transit visa even to change planes") + ", unless you hold a valid US, Canada or Japan visa or residence, or an EU/EEA residence permit.",
            checklist: [common.passport(), item("Onward ticket and visa for final destination", ""), common.photo()],
            notes: ["Some Schengen states add extra nationalities to this list. Check the airport's country.", ...(opts.atvNotes || [])]
          };
          if (atvExtra === null && !atvExempt) return {
            status: "check",
            summary: `You don't need an airport transit visa under the EU-wide list, but we couldn't confirm ${name}'s own extra airport transit visa list on an official page. Check before you fly. Leaving the airport needs a short-stay visa.`,
            checklist: [common.passport(), item("Onward boarding pass", "Stay in the international transit area.")],
            links: [["EU airport transit visa lists (Annex 7B)", "https://home-affairs.ec.europa.eu/policies/schengen/visa-policy_en"], [`${name}: official visa site`, portal]]
          };
          return { status: "free", summary: "You can change planes airside without a Schengen visa. Leaving the airport needs a short-stay visa.", checklist: [common.passport(), item("Onward boarding pass", "Stay in the international transit area.")], notes: ["Some Schengen states require airport transit visas for extra nationalities. Check the transit country's site."] };
        }
        return {
          status: "visa", stay: "Up to 90 days in any 180",
          auth: { name: "Schengen short-stay visa (Type C)", fee: "€90 (children 6 to 11: €45)", time: "Usually 15 days; apply up to 6 months before", url: portal },
          summary: `You need a Schengen visa. Apply to ${name} if it's your main destination (longest stay) or first entry if stays are equal.`,
          ...(natWarn.length ? { warn: natWarn } : {}),
          checklist: visitorChecklist({ purpose: p,
            passport: "Issued in the last 10 years, valid 3+ months after you leave, with 2 blank pages.",
            form: item("Schengen visa application form", "Signed. Many countries use an online form.", portal),
            insurance: "Mandatory: at least €30,000 medical cover valid in all Schengen countries.",
            extra: [item("Biometrics appointment", "Fingerprints at the consulate or visa centre (reused for 5 years)."), item("Day-by-day itinerary", "Especially if visiting several countries.")] }),
          notes: ["One Schengen visa covers all 29 Schengen countries.", ...reg]
        };
      }
    };
  }
  function schLong(name, portal, longStay, p) {
    if (longStay && typeof longStay === "object") longStay = longStay[p]; // batch 3: separate study/work pages
    return {
      status: "permit",
      summary: `${p === "study" ? "Study" : "Work"} longer than 90 days needs a national long-stay (Type D) visa or residence permit from ${name}.`,
      auth: { name: "National long-stay visa (D)", fee: "Varies by country (often around €75 to €100)", time: "Several weeks", url: longStay || portal },
      checklist: p === "study" ? [
        item("University admission letter", ""), item("Proof of funds", "Some countries require a blocked account or set monthly amount."),
        item("Health insurance", "Valid in that country."), item("Accommodation", ""), common.passport(), common.photo()
      ] : [
        item("Employment contract or job offer", ""), item("Work permit approval", "Some countries need employer approval first."),
        item("Qualifications", "Recognition of degrees may be needed."), item("Health insurance", ""), common.passport(), common.photo()
      ]
    };
  }

  const FR = schengen("FR", "France", "🇫🇷", "https://france-visas.gouv.fr/");
  const DE = schengen("DE", "Germany", "🇩🇪", "https://www.auswaertiges-amt.de/en/visa-service", "https://www.make-it-in-germany.com/en/visa-residence");
  const IT = schengen("IT", "Italy", "🇮🇹", "https://vistoperitalia.esteri.it/");
  const ES = schengen("ES", "Spain", "🇪🇸", "https://www.exteriores.gob.es/en/ServiciosAlCiudadano/Paginas/Visados-Schengen.aspx");
  const NL = schengen("NL", "Netherlands", "🇳🇱", "https://www.netherlandsworldwide.nl/visa-the-netherlands", "https://ind.nl/en");
  const PT = schengen("PT", "Portugal", "🇵🇹", "https://vistos.mne.gov.pt/en/");
  const GR = schengen("GR", "Greece", "🇬🇷", "https://www.mfa.gr/en/visas/");
  const CH = schengen("CH", "Switzerland", "🇨🇭", "https://www.sem.admin.ch/sem/en/home/themen/einreise.html");

  // ---------- Batch 2 Schengen states (checked 2026-11-22) ----------
  // Shared EU rules re-confirmed 2026-11-22:
  //  https://home-affairs.ec.europa.eu/policies/schengen/smart-borders/european-travel-information-authorisation-system_en (ETIAS not in operation)
  //  https://www.eulisa.europa.eu/news-and-events/news/entryexit-system-fully-deployed-across-eu (EES fully deployed 10 Apr 2026)
  //  https://home-affairs.ec.europa.eu/policies/schengen/visa-policy/applying-schengen-visa_en (fee €90)
  //  https://eur-lex.europa.eu/eli/reg_impl/2026/496/oj/eng (Georgia: only diplomatic/service passports suspended)
  // National airport transit visa (ATV) lists: atvExtra = null where the national list couldn't be confirmed officially.
  const B2 = "2026-11-22";

  // Austria: https://www.oesterreich.gv.at/en/themen/menschen_aus_anderen_staaten/visum_fuer_oesterreich/Seite.3550020
  //  https://www.migration.gv.at/en/types-of-immigration/ ; registration: https://www.oesterreich.gv.at/themen/bauen_und_wohnen/umzug/2/1/Seite.180657.html
  //  National ATV list not readable (bmeia.gv.at / bmi.gv.at blocked) -> transit "check".
  const AT = schengen("AT", "Austria", "🇦🇹", "https://www.bmeia.gv.at/en/travel-stay/entrance-and-residence-in-austria/visa", "https://www.migration.gv.at/en/types-of-immigration/",
    { verified: B2, atvExtra: null, reg: "Austria: hotels register you. If you stay in a private home, registration with the local registration office (Meldebehörde) is due within 3 days." });
  // Belgium: https://dofi.ibz.be/en/themes/entry/border-control/visa ; registration: https://indonesia.diplomatie.belgium.be/en/travel-belgium/visa-belgium/obligation-register-belgium
  //  National ATV extras not confirmed (dofi.ibz.be captcha) -> transit "check".
  const BE = schengen("BE", "Belgium", "🇧🇪", "https://dofi.ibz.be/en/themes/entry/border-control/visa", "https://dofi.ibz.be/en/themes/third-country-nationals/short-stay",
    { verified: B2, atvExtra: null, reg: "Belgium: if you don't stay in a hotel, register with the local municipality within 3 working days of arrival." });
  // Czechia: https://mzv.gov.cz/jnp/en/information_for_aliens/short_stay_visa/airport_visa.htm (ATV list, page dated 22.11.2022)
  //  https://mzv.gov.cz/jnp/en/information_for_aliens/long_stay_visa/index.html ; registration: https://mzv.gov.cz/riyadh/en/visas_and_consular_information/visas/reporting_duty_of_foreigners.html
  const CZ = schengen("CZ", "Czechia", "🇨🇿", "https://mzv.gov.cz/jnp/en/information_for_aliens/short_stay_visa/x90_180_rule/index.html", "https://mzv.gov.cz/jnp/en/information_for_aliens/long_stay_visa/index.html",
    { verified: B2, atvExtra: S("DZ AM TD CU EG IN LB LY ML MR NE PS RU SS SD SY TR YE"),
      atvNotes: ["For Russian citizens the Czech requirement applies only on flights from certain airports (e.g. in Armenia, Azerbaijan, Georgia, Türkiye, Egypt)."],
      reg: "Czechia: if you don't stay in a hotel or hostel, report to the foreign police within 3 working days of arrival." });
  // Poland: https://www.gov.pl/web/diplomacy/visas (ATV list: common list + AM, EG, CU) ; https://www.gov.pl/web/udsc-en/visas
  //  registration: https://www.gov.pl/web/gov/zamelduj-sie-na-pobyt-staly-dla-cudzoziemcow-en
  const PL = schengen("PL", "Poland", "🇵🇱", "https://www.gov.pl/web/diplomacy/visas", "https://www.gov.pl/web/udsc-en/visas",
    { verified: B2, atvExtra: S("AM EG CU"), reg: "Poland: stays over 30 days must be registered at the municipal office by the 4th day after arrival." });
  // Hungary: https://konzinfo.mfa.gov.hu/en/short-term-stay (ATV: common list only) ; https://oif.gov.hu/factsheets/residence-permit-for-the-purpose-of-employment
  //  registration: https://oif.gov.hu/factsheets/information-notice-for-persons-entitled-to-a-visa-free-stay
  const HU = schengen("HU", "Hungary", "🇭🇺", "https://konzinfo.mfa.gov.hu/en/short-term-stay", "https://oif.gov.hu/factsheets/residence-permit-for-the-purpose-of-employment",
    { verified: B2, reg: "Hungary: stays over 30 days need your accommodation reported to the immigration authority (Enter Hungary)." });
  // Croatia: https://mvep.gov.hr/services-for-citizens/consular-information-22802/visas-22807/issuance-procedure/applying-for-a-schengen-visa-for-croatia/262010
  //  https://mup.gov.hr/aliens-281621/stay-and-work/temporary-stay-of-third-country-nationals/281661 ; registration: https://mvep.gov.hr/page/161369
  //  National ATV list not confirmed -> transit "check".
  const HR = schengen("HR", "Croatia", "🇭🇷", "https://mvep.gov.hr/services-for-citizens/consular-information-22802/visas-22807/issuance-procedure/applying-for-a-schengen-visa-for-croatia/262010", "https://mup.gov.hr/aliens-281621/stay-and-work/temporary-stay-of-third-country-nationals/281661",
    { verified: B2, atvExtra: null, reg: "Croatia: your stay must be registered with the police within 2 days of arrival. Hotels and rentals do this for you." });
  // Denmark: https://nyidanmark.dk/en-GB/You-want-to-apply/Short-stay-visa
  //  ATV: https://nyidanmark.dk/-/media/Files/US/Visum/Diverse-filer/Overview-of-travel-documents-visa-requirements-and-border-crossing-points130426.pdf (common list + SY, 13 Apr 2026)
  const DK = schengen("DK", "Denmark", "🇩🇰", "https://nyidanmark.dk/en-GB/You-want-to-apply/Short-stay-visa", "https://www.nyidanmark.dk/en-GB/You-want-to-apply/Work/Fast-track",
    { verified: B2, atvExtra: S("SY") });
  // Sweden: https://migrationsverket.se/en/you-want-to-apply/visiting-sweden/visiting-sweden-for-up-to-90-days-entry-visa.html
  //  https://www.migrationsverket.se/en/you-want-to-apply/work/employee-or-self-employed.html ; national ATV list not confirmed -> transit "check".
  const SE = schengen("SE", "Sweden", "🇸🇪", "https://migrationsverket.se/en/you-want-to-apply/visiting-sweden/visiting-sweden-for-up-to-90-days-entry-visa.html", "https://www.migrationsverket.se/en/you-want-to-apply/work/employee-or-self-employed.html",
    { verified: B2, atvExtra: null });
  // Norway: https://www.udi.no/en/want-to-apply/visit-and-holiday/ ; https://www.udi.no/en/want-to-apply/work-immigration/skilled-workers/
  //  ATV: https://www.udi.no/en/word-definitions/airport-transit-visa/ (common list + SY, TR)
  const NO = schengen("NO", "Norway", "🇳🇴", "https://www.udi.no/en/want-to-apply/visit-and-holiday/", "https://www.udi.no/en/want-to-apply/work-immigration/skilled-workers/",
    { verified: B2, atvExtra: S("SY TR") });

  // ---------- Batch 3 Schengen states (checked 2026-11-23) ----------
  // Shared EU rules as in batch 2. Romania: full Schengen member since 1 Jan 2025
  //  https://www.consilium.europa.eu/en/press/press-releases/2024/12/12/schengen-council-decides-to-lift-land-border-controls-with-bulgaria-and-romania/
  const B3 = "2026-11-23";
  const RU_NONBIO = "Russian passports without a chip (non-biometric) are not accepted for entry.";

  // Finland: https://um.fi/visa-to-visit-finland (ATV: common list only, also AIP Finland GEN 1.3 2.1.6, 27 Nov 2025:
  //  https://www.ais.fi/eaip/006-2025_2025_11_27/eAIP/EF-GEN%201.3-en-GB.html) ; https://migri.fi/en/studies ; https://migri.fi/en/work-based-residence-permits
  const FI = schengen("FI", "Finland", "🇫🇮", "https://um.fi/visa-to-visit-finland",
    { study: "https://migri.fi/en/studies", work: "https://migri.fi/en/work-based-residence-permits" },
    { verified: B3 });
  // Iceland: https://island.is/en/get-a-visa ; ATV (common list only): https://island.is/en/do-you-need-a-visa/airport-transit-visa
  //  https://island.is/en/residence-permit-students/requirements ; https://island.is/en/permit-based-on-work/rights
  const IS = schengen("IS", "Iceland", "🇮🇸", "https://island.is/en/get-a-visa",
    { study: "https://island.is/en/residence-permit-students/requirements", work: "https://island.is/en/permit-based-on-work/rights" },
    { verified: B3 });
  // Malta: https://identita.gov.mt/central-visa-unit-sec-page-schengen-visa/ (modified 3 Sep 2025) ; https://www.identita.gov.mt/single-permit/
  //  https://identita.gov.mt/central-visa-unit-student-visa-courses-exceeding-90-days/ ; national ATV list not found officially -> transit "check".
  const MT = schengen("MT", "Malta", "🇲🇹", "https://identita.gov.mt/central-visa-unit-sec-page-schengen-visa/",
    { study: "https://identita.gov.mt/central-visa-unit-student-visa-courses-exceeding-90-days/", work: "https://www.identita.gov.mt/single-permit/" },
    { verified: B3, atvExtra: null });
  // Luxembourg: https://guichet.public.lu/en/citoyens/immigration/moins-3-mois/ressortissant-tiers/entree-visa.html
  //  https://guichet.public.lu/en/citoyens/immigration/plus-3-mois/ressortissant-tiers/demarches-communes/entree-visa.html
  //  ATV national list (common list + AO GN GW NP SD SY SS): https://ankara.mae.lu/en/service_citoyens/visa-types.html (updated 08.10.2025)
  //  registration: https://guichet.public.lu/en/citoyens/immigration/moins-3-mois/ressortissant-tiers/sejour.html
  const LU = schengen("LU", "Luxembourg", "🇱🇺", "https://guichet.public.lu/en/citoyens/immigration/moins-3-mois/ressortissant-tiers/entree-visa.html", "https://guichet.public.lu/en/citoyens/immigration/plus-3-mois/ressortissant-tiers/demarches-communes/entree-visa.html",
    { verified: B3, atvExtra: S("AO GN GW NP SD SY SS"), reg: "Luxembourg: declare your arrival at the local commune within 3 days. Filling in the hotel registration form counts as your declaration." });
  // Slovenia: https://www.gov.si/en/topics/entry-and-residence/ ; ATV common list only: https://www.gov.si/en/representations/embassy-addis-ababa/visa-information/
  //  https://infotujci.si/en/third-country-nationals/temporary-residence-permit/ ; registration: https://infotujci.si/en/third-country-nationals/temporary-residence-permit/registration-of-residence
  const SI = schengen("SI", "Slovenia", "🇸🇮", "https://www.gov.si/en/topics/entry-and-residence/", "https://infotujci.si/en/third-country-nationals/temporary-residence-permit/",
    { verified: B3, reg: "Slovenia: register with the nearest police station within 3 days of entry. Hotels and other accommodation providers do this for you." });
  // Slovakia: https://www.mzv.sk/sk/web/washington-en/services/schengen-visa ; https://www.mzv.sk/web/rim-en/services/residence
  //  registration: Act 404/2011 s.111(2)(a), s.113 https://static.slov-lex.sk/pdf/SK/ZZ/2011/404/ZZ_2011_404_20260715.pdf
  //  National ATV list not confirmed -> transit "check".
  const SK = schengen("SK", "Slovakia", "🇸🇰", "https://www.mzv.sk/sk/web/washington-en/services/schengen-visa", "https://www.mzv.sk/web/rim-en/services/residence",
    { verified: B3, atvExtra: null, reg: "Slovakia: report your stay to the foreign police within 3 working days of entry, unless your hotel or other accommodation provider reports it for you." });
  // Estonia: https://www.vm.ee/en/consular-visa-and-travel-information/visa-information/application-schengen-visa
  //  ATV common list only: https://eaip.eans.ee/2026-05-14/html/eAIP/EE-GEN-1.3-en-GB.html ; https://www.politsei.ee/en/instructions/applying-for-a-residence-permit
  //  Russian citizens: Government Order No. 247 (current version from 25 Jan 2026) https://www.riigiteataja.ee/public-api/api/v1/en/akt/529012026002/blob-html
  const EE = schengen("EE", "Estonia", "🇪🇪", "https://www.vm.ee/en/consular-visa-and-travel-information/visa-information/application-schengen-visa", "https://www.politsei.ee/en/instructions/applying-for-a-residence-permit",
    { verified: B3,
      natRule: (nat) => nat === "RU" ? { status: "banned",
        summary: "Russian citizens holding a Schengen short-stay visa (from any country) are not allowed to enter Estonia across the external border, apart from listed exceptions.",
        checklist: [common.passport()],
        notes: ["Exceptions include close family of Estonian citizens or residents, people with EU free-movement rights, diplomats, transport crew, humanitarian cases, and holders of an Estonian visa for registered work or study."],
        links: [["Visas for Russian citizens (kriis.ee)", "https://www.kriis.ee/en/travelling-crossing-state-border/travelling-estonia/visas-russian-citizens"]] } : null });
  // Latvia: https://pmlp.gov.lv/en/visas-and-invitations ; https://www.pmlp.gov.lv/en/residence-permit
  //  ATV common list only: https://www.pmlp.gov.lv/en/airport-transit
  //  Entry declaration (from 1 Sep 2025): https://www.mfa.gov.lv/en/article/procedures-entry-latvia-1-september-2025 , https://eta.gov.lv
  //  Russian citizens: https://www.mfa.gov.lv/en/entry-latvia-citizens-russian-federation-and-frequently-asked-questions (updated 20.11.2026)
  //  https://mfa.gov.lv/en/questions-and-answers-non-recognition-russian-federation-non-biometric-passports-republic-latvia
  const LV_DECL_EXEMPT = union(EEA_CH, S("AD BR MC SM VA US CA GB TR AL ME MK AU CL CO CR IL JP KR MX NZ"));
  const LV = schengen("LV", "Latvia", "🇱🇻", "https://pmlp.gov.lv/en/visas-and-invitations", "https://www.pmlp.gov.lv/en/residence-permit",
    { verified: B3,
      natRule: (nat) => nat === "RU" ? { status: "banned",
        summary: "Russian citizens can't enter Latvia for tourism or business visits, or to transit to another EU country, even with a Schengen visa.",
        checklist: [common.passport()],
        warn: [RU_NONBIO],
        notes: ["Exceptions include holders of an EU/EEA/Swiss residence permit or a Schengen D visa, family members of Latvian, EU, EEA or Swiss citizens, humanitarian cases, transport crew and diplomats."],
        links: [["Entry for Russian citizens (MFA Latvia)", "https://www.mfa.gov.lv/en/entry-latvia-citizens-russian-federation-and-frequently-asked-questions"]] } : null,
      natWarn: (nat) => LV_DECL_EXEMPT.has(nat) ? [] : ["Latvia: unless your nationality is on the exempt list, submit an entry declaration at eta.gov.lv at least 48 hours before you arrive. It isn't a visa."] });
  // Lithuania: https://cn.mfa.lt/en/travel-and-residence/coming-to-lithuania/visas/90 ; https://migracija.lrv.lt/en/activities/residence-permits-of-the-republic-of-lithuania/
  //  National ATV list not confirmed -> transit "check".
  //  Russian citizens: https://ru.mfa.lt/en/travel-and-residence/coming-to-lithuania/entry-of-foreigners-into-lithuania/133
  //  Belarus visa applications: https://keliauk.urm.lt/en/incoming/baltarusija ; RU non-biometric passports:
  //  https://www.urm.lt/en/news/928/from-1-june-lithuania-will-no-longer-recognize-non-biometric-passports-issued-by-russia:44207
  const LT = schengen("LT", "Lithuania", "🇱🇹", "https://cn.mfa.lt/en/travel-and-residence/coming-to-lithuania/visas/90", "https://migracija.lrv.lt/en/activities/residence-permits-of-the-republic-of-lithuania/",
    { verified: B3, atvExtra: null,
      natRule: (nat) => nat === "RU" ? { status: "banned",
        summary: "Russian citizens with a Schengen visa are admitted to Lithuania only in listed categories. Tourist and business visits don't qualify.",
        checklist: [common.passport()],
        warn: [RU_NONBIO],
        notes: ["Admitted categories include holders of an EU/EEA/Swiss residence permit or a Schengen D visa, family members of Lithuanian, EU, EEA or Swiss citizens, transport crew, diplomats, humanitarian cases and Kaliningrad rail transit."],
        links: [["Entry of foreigners into Lithuania (MFA)", "https://ru.mfa.lt/en/travel-and-residence/coming-to-lithuania/entry-of-foreigners-into-lithuania/133"]] } : null,
      natWarn: (nat) => nat === "BY" ? ["Since 3 May 2023 Lithuanian embassies don't accept visa applications from Belarusian citizens, except close family of Lithuanian or EU citizens, holders of a Lithuanian-origin certificate, and urgent humanitarian cases."] : [] });
  // Romania: https://eviza.mae.ro/ (official MFA eVisa portal) ; https://eviza.mae.ro/ShortStayVisa (ATV list: common + EG IN LB MA NP SY TJ TN UZ YE;
  //  IGI-endorsed invitation list) ; https://igi.mai.gov.ro/en/studies/ ; https://igi.mai.gov.ro/en/single-permit/
  const RO_INVITE = S("AF DZ AO BD BI CM CF TD KM CI KP CD DJ EG ER GA GN GW HT IN ID IR IQ JO KG LB LR LY ML MR MA NG PK RU SO LK SD SS SY TN UZ YE PS");
  const RO = schengen("RO", "Romania", "🇷🇴", "https://eviza.mae.ro/",
    { study: "https://igi.mai.gov.ro/en/studies/", work: "https://igi.mai.gov.ro/en/single-permit/" },
    { verified: B3, atvExtra: S("EG IN LB MA NP SY TJ TN UZ YE"),
      natWarn: (nat) => [
        ...(RO_INVITE.has(nat) ? ["Romania: to apply for a visa your nationality needs an invitation approved by the General Inspectorate for Immigration (IGI)."] : []),
        ...(S("AF MG PK YE").has(nat) ? ["Romania: polio vaccination is mandatory for travellers coming from Afghanistan, Madagascar, Pakistan or Yemen."] : [])
      ] });

  // =====================================================================
  // AUSTRALIA
  // =====================================================================
  const AU_ETA = S("US CA JP SG MY KR BN HK TW AD AT BE DK FI FR DE GR IS IE IT LI LU MT MC NO PT SM ES SE CH NL VA GB");
  const AU_EVISITOR = S("BG HR CY CZ EE HU LV LT PL RO SK SI AD AT BE DK FI FR DE GR IS IE IT LI LU MT MC NO PT SM ES SE CH NL VA GB");

  const AU = {
    id: "AU", name: "Australia", flag: "🇦🇺", verified: "2026-11-20",
    links: [
      ["Visa Finder (Home Affairs)", "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-finder"],
      ["ETA (subclass 601)", "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/electronic-travel-authority-601"],
      ["eVisitor (subclass 651)", "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/evisitor-651"]
    ],
    evaluate(nat, ctx) {
      const p = ctx.purpose;
      if (nat === "AU") return { status: "citizen", summary: "Travel on your Australian passport." };
      if (nat === "NZ") return { status: "free", summary: "New Zealand citizens get a Special Category visa on arrival and can live, study and work in Australia.", checklist: [common.passport("Valid New Zealand passport.")] };
      if (has(ctx, "pr:AU")) return { status: "resident", summary: "If you hold a current Australian visa with travel rights, you can return on it.", checklist: [item("Valid visa with travel facility", "Check in VEVO."), common.passport()] };
      if (p === "study") return { status: "permit", summary: "Courses over 3 months need a Student visa (subclass 500).",
        auth: { name: "Student visa (500)", fee: "See Home Affairs pricing", time: "Varies", url: "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/student-500" },
        checklist: [item("Confirmation of Enrolment (CoE)", "From a CRICOS-registered provider."), item("Overseas Student Health Cover (OSHC)", "For your whole stay."), item("Genuine Student statement", "Why this course and why Australia."), item("English test results", "If required."), item("Proof of funds", "To Home Affairs' current minimum."), common.passport()] };
      if (p === "work") return { status: "permit", summary: "Work needs a work visa: employer sponsored (Skills in Demand, subclass 482) or a Working Holiday visa (417/462) if eligible.",
        auth: { name: "Work visa", fee: "Varies by visa", time: "Varies", url: "https://immi.homeaffairs.gov.au/visas/working-in-australia" },
        checklist: [item("Sponsoring employer nomination", "For employer-sponsored visas."), item("Skills assessment", "If your occupation needs one."), item("English test", ""), item("Health and character checks", ""), common.passport()] };
      if (p === "transit") {
        if (AU_ETA.has(nat) || AU_EVISITOR.has(nat)) return { status: "free", summary: "You can usually transit without a visa if you stay airside and leave within 8 hours. Longer, or leaving the airport, needs an ETA or eVisitor.", checklist: [common.passport(), item("Onward ticket", "Departing within 8 hours.")] };
        return { status: "visa", auth: { name: "Transit visa (subclass 771)", fee: "No fee", time: "Apply well ahead", url: "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/transit-771" }, summary: "You likely need a free Transit visa (771) unless you qualify for transit without visa.", checklist: [common.passport(), item("Onward ticket and visa for next country", "")] };
      }
      const etaUrl = "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/electronic-travel-authority-601";
      const evUrl = "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/evisitor-651";
      if (AU_EVISITOR.has(nat)) return {
        status: "eta", stay: "Up to 3 months per visit, within 12 months",
        auth: { name: AU_ETA.has(nat) ? "eVisitor (free) or ETA" : "eVisitor (subclass 651)", fee: AU_ETA.has(nat) ? "eVisitor free; ETA A$20 via app" : "Free", time: "Often within days", url: evUrl },
        summary: AU_ETA.has(nat) ? "You can apply for a free eVisitor online or an ETA in the Australian ETA app." : "Apply for a free eVisitor online before you travel.",
        checklist: lightChecklist({ purpose: p, auth: item("Approved eVisitor or ETA", "Linked to your passport. eVisitor via ImmiAccount.", evUrl) })
      };
      if (AU_ETA.has(nat)) return {
        status: "eta", stay: "Up to 3 months per visit, within 12 months",
        auth: { name: "ETA (subclass 601)", fee: "A$20 service fee", time: "Often within hours", url: etaUrl },
        summary: "Apply for an ETA in the official Australian ETA app before you travel.",
        checklist: lightChecklist({ purpose: p, auth: item("Approved ETA", "Apply only in the Australian ETA app (needs a live face photo).", etaUrl) })
      };
      return {
        status: "visa", stay: "Usually 3, 6 or 12 months",
        auth: { name: "Visitor visa (subclass 600)", fee: "See Home Affairs pricing", time: "Varies; apply early", url: "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/visitor-600" },
        summary: "You need a Visitor visa (subclass 600), applied for online through ImmiAccount.",
        checklist: visitorChecklist({ purpose: p, photo: false, form: item("ImmiAccount online application", "", "https://online.immi.gov.au/"), extra: [item("Biometrics", "If requested for your nationality.")] })
      };
    }
  };

  // =====================================================================
  // JAPAN
  // =====================================================================
  const JP_EXEMPT = {
    BN: 30, ID: 15, MY: 90, KR: 90, SG: 90, TH: 15, HK: 90, MO: 90, TW: 90, CA: 90, US: 90,
    AR: 90, BS: 90, BB: 90, BR: 90, CL: 90, CR: 90, DO: 90, SV: 90, GT: 90, HN: 90, MX: 90, PA: 90, PY: 90, PE: 90, SR: 90, UY: 90,
    AU: 90, NZ: 90, IL: 90, QA: 30, TR: 90, AE: 90, LS: 90, MU: 90, TN: 90,
    AD: 90, AT: 90, BE: 90, BG: 90, HR: 90, CY: 90, CZ: 90, DK: 90, EE: 90, FI: 90, FR: 90, DE: 90, GR: 90, HU: 90, IS: 90, IE: 90, IT: 90,
    LV: 90, LI: 90, LT: 90, LU: 90, MT: 90, MC: 90, ME: 90, NL: 90, MK: 90, NO: 90, PL: 90, PT: 90, RO: 90, SM: 90, RS: 90, SK: 90, SI: 90, ES: 90, SE: 90, CH: 90, GB: 90
  };
  const JP_NOTES = {
    ID: "ePassport holders must register with a Japanese mission in Indonesia first.",
    QA: "ePassport holders must register with a Japanese mission first.",
    TH: "ePassport holders only.", BR: "ePassport holders only.", PA: "ePassport holders only.", PY: "ePassport holders only.", PE: "ePassport holders only.",
    AE: "ePassport holders only.", ME: "ePassport holders only.", RS: "ePassport holders only.",
    MY: "ICAO ePassport strongly advised; others should get a visa.",
    UY: "New passports issued after 16 April 2025 (no place of birth on the data page) are not accepted for the exemption.",
    TW: "Passport must include your personal ID number.", HK: "HKSAR or BN(O) passport with Hong Kong right of abode.",
    BB: "Machine-readable passport required.", TR: "Machine-readable passport required.", LS: "Machine-readable passport required."
  };
  const JP_SIX_MONTH = S("AT DE IE LI CH GB");

  const JP = {
    id: "JP", name: "Japan", flag: "🇯🇵", verified: "2026-11-20",
    links: [
      ["Visa exemption list (MOFA)", "https://www.mofa.go.jp/j_info/visit/visa/short/novisa.html"],
      ["JAPAN eVISA", "https://www.evisa.mofa.go.jp/"],
      ["Visa guide (MOFA)", "https://www.mofa.go.jp/j_info/visit/visa/"]
    ],
    evaluate(nat, ctx) {
      const p = ctx.purpose;
      if (nat === "JP") return { status: "citizen", summary: "Travel on your Japanese passport." };
      if (has(ctx, "pr:JP")) return { status: "resident", summary: "Residence card holders return with their card and a re-entry permit (or special re-entry permit, within 1 year).", checklist: [item("Residence card", ""), common.passport()] };
      if (p === "study" || p === "work") return {
        status: "permit",
        summary: `${p === "study" ? "Study" : "Work"} needs a Certificate of Eligibility (COE), usually applied for by your school or employer in Japan, then a visa.`,
        auth: { name: `${p === "study" ? "Student" : "Work"} visa via COE`, fee: "Varies by nationality", time: "COE often 1 to 3 months", url: "https://www.mofa.go.jp/j_info/visit/visa/long/index.html" },
        checklist: [item("Certificate of Eligibility", "From Immigration Services Agency, via your sponsor."), item("Visa application form and photo", ""), common.passport(), item(p === "study" ? "Admission letter" : "Employment contract", "")]
      };
      if (p === "transit") return { status: JP_EXEMPT[nat] ? "free" : "check", summary: JP_EXEMPT[nat] ? "No visa needed." : "Airside transit usually needs no visa. To leave the airport you may need a visa or a shore pass. Check with your airline.", checklist: [common.passport(), item("Onward ticket", "")] };
      if (JP_EXEMPT[nat]) {
        const days = JP_SIX_MONTH.has(nat) ? "90 days (extendable to 6 months in Japan)" : `${JP_EXEMPT[nat]} days`;
        return {
          status: "free", stay: days,
          summary: "No visa needed for tourism, visiting or business meetings. Paid work is not allowed.",
          checklist: lightChecklist({ purpose: p, extra: [item("Visit Japan Web (optional)", "Fill in immigration and customs details online to speed up arrival.", "https://www.vjw.digital.go.jp/")] }),
          warn: JP_NOTES[nat] ? [JP_NOTES[nat]] : []
        };
      }
      return {
        status: "visa", stay: "Usually 15, 30 or 90 days",
        auth: { name: "Short-term stay visa", fee: "Varies by nationality", time: "About 5 working days after submission", url: "https://www.mofa.go.jp/j_info/visit/visa/short/novisa.html" },
        summary: "You need a short-term visa. If you live in a country covered by JAPAN eVISA, you can apply online for tourism.",
        checklist: visitorChecklist({ purpose: p, form: item("Visa application form", "Or apply through JAPAN eVISA if eligible.", "https://www.evisa.mofa.go.jp/"), extra: [item("Itinerary in Japan", "Daily schedule with hotel details.")] }),
        notes: ["Requirements differ by nationality and where you live. Check your local Japanese embassy page."]
      };
    }
  };

  // =====================================================================
  // UNITED ARAB EMIRATES
  // =====================================================================
  const AE_90 = S("AL AR AM AU AT AZ BS BB BY BE BA BR BG CA CL CN CO CR HR CY CZ DK EC SV EE FJ FI FR GE DE GR HN HU IS IL IT JP KI XK LV LI LT LU MK MV MT MD ME NR NL NZ NO PY PE PL PT GY RO RU VC SM RS SC SG SK SI SB KR ES SE CH GB US UY");
  const AE_30 = S("AD BN HK KZ MO MY MU MC MN IE UA UZ VA");
  const AE_CONDITIONAL = S("IN ID KE PH ZA TH VN");
  const AE_QUAL = ["US", "EU", "SCHENGEN", "GB", "SG", "JP", "KR", "AU", "NZ", "CA"];

  const AE = {
    id: "AE", name: "United Arab Emirates", flag: "🇦🇪", verified: "2026-11-20",
    links: [
      ["ICP smart services (visas)", "https://smartservices.icp.gov.ae/"],
      ["GDRFA Dubai", "https://gdrfad.gov.ae/en"],
      ["UAE visa exemptions (MOFA)", "https://www.mofa.gov.ae/en/visa-exemptions-for-non-citizens"]
    ],
    evaluate(nat, ctx) {
      const p = ctx.purpose;
      const passport = "Valid at least 6 months from arrival.";
      if (nat === "AE") return { status: "citizen", summary: "Travel on your UAE passport or Emirates ID." };
      if (GCC.has(nat)) return { status: "free", summary: "GCC citizens enter with a passport or national ID card. No visa.", checklist: [item("Passport or GCC national ID", "")] };
      if (has(ctx, "pr:AE")) return { status: "resident", summary: "Return on your UAE residence visa and Emirates ID.", checklist: [item("Valid Emirates ID / residence visa", ""), common.passport(passport)] };
      if (p === "study" || p === "work") return {
        status: "permit",
        summary: `${p === "work" ? "Your employer" : "Your university"} must sponsor an entry permit, then a residence visa after arrival (medical test and Emirates ID).`,
        auth: { name: `${p === "work" ? "Employment" : "Student"} residence visa`, fee: "Paid by sponsor or set by ICP/GDRFA", time: "A few weeks", url: "https://u.ae/en/information-and-services/visa-and-emirates-id" },
        checklist: [item(p === "work" ? "Signed job offer / MoHRE contract" : "University admission letter", ""), item("Attested degree (for many jobs)", ""), item("Medical fitness test", "After arrival."), item("Emirates ID biometrics", ""), common.passport(passport), common.photo()]
      };
      if (AE_90.has(nat)) return { status: "free", stay: "90 days within 180", summary: "No visa needed in advance. Your entry is stamped on arrival.", checklist: lightChecklist({ purpose: p, passport }) };
      if (AE_30.has(nat)) return { status: "free", stay: "30 days (extension usually possible)", summary: "No visa needed in advance. Your entry is stamped on arrival.", checklist: lightChecklist({ purpose: p, passport }) };
      if (AE_CONDITIONAL.has(nat)) {
        const qualifying = AE_QUAL.some((c) => has(ctx, `pr:${c}`) || (nat === "IN" && has(ctx, `visa:${c}`)));
        if (qualifying) return {
          status: "voa", stay: "14 days (extendable) or 60 days, depending on option",
          auth: { name: "Visa on arrival (conditional)", fee: "Paid on arrival or pre-approved online", time: "On arrival", url: "https://gdrfad.gov.ae/en" },
          summary: "You can get a visa on arrival because you hold a qualifying visa or residence permit (US, EU, UK, Canada, Australia, NZ, Japan, Singapore or South Korea).",
          checklist: lightChecklist({ purpose: p, passport, extra: [item("Qualifying visa / residence permit", "Valid at least 6 months from arrival.")] }),
          warn: nat === "IN" ? ["The UAE has announced that a UK residence visa alone will stop qualifying for Indian nationals. Confirm with ICP before you fly."] : ["Rules for this route changed in 2026. Confirm with ICP or your airline before flying."]
        };
      }
      if (nat === "MX") return { status: "check", summary: "Mexican citizens have had visa-free entry, but the official list was being updated. Confirm with the UAE MOFA page or your airline.", checklist: [common.passport(passport)] };
      if (p === "transit") return { status: "free", summary: "Airside transit at UAE airports needs no visa. Leaving the airport needs a visa (a 48 or 96 hour transit visa may be available through your airline).", checklist: [common.passport(passport), item("Onward ticket", "")] };
      return {
        status: "evisa", stay: "30 or 60 days (single or multiple entry)",
        auth: { name: "UAE tourist visa (online)", fee: "Varies by duration", time: "Usually a few working days", url: "https://smartservices.icp.gov.ae/" },
        summary: "You need a visa before travel. Apply online via ICP/GDRFA, or through a UAE airline (Emirates, Etihad, flydubai, Air Arabia) or a licensed hotel or agent.",
        checklist: visitorChecklist({ purpose: p, passport, form: item("Online visa application", "Via ICP, GDRFA or your airline.", "https://smartservices.icp.gov.ae/") })
      };
    }
  };

  // =====================================================================
  // MEXICO
  // =====================================================================
  const MX_EXEMPT = S("AD AR AU AT BB BE BZ BO BG CA CL CO CR HR CY CZ DK EE FI FR DE GR HU IS IE IL IT JP LV LI LT LU MY MT MC NL NZ NO PA PY PL PT RO SM SG SK SI KR ES SE CH GB US UY");
  const MX_REQUIRED = S("IN CN PK NG PH VN BD BR EC VE CU HT EG IR ID LK NP GH KE JM AF IQ SY YE SO ET");
  const MX_PR = ["US", "CA", "JP", "GB", "EU", "PA"];
  const MX_VISA = ["US", "CA", "JP", "GB", "SCHENGEN"];

  const MX = {
    id: "MX", name: "Mexico", flag: "🇲🇽", verified: "2026-11-20",
    links: [
      ["Countries that need a visa (INM)", "https://www.inm.gob.mx/gobmx/word/index.php/paises-requieren-visa-para-mexico/"],
      ["Countries that don't need a visa (INM)", "https://www.inm.gob.mx/gobmx/word/index.php/paises-no-requieren-visa-para-mexico/"],
      ["Mexican consulates (SRE)", "https://consulmex.sre.gob.mx/"]
    ],
    evaluate(nat, ctx) {
      const p = ctx.purpose;
      if (nat === "MX") return { status: "citizen", summary: "Travel on your Mexican passport." };
      if (p === "study" || p === "work") return {
        status: "permit",
        summary: p === "work" ? "Paid work needs a visa with work permission: your employer first gets INM authorization, then you apply at a Mexican consulate." : "Courses over 180 days need a temporary resident student visa from a Mexican consulate. Shorter courses can be done as a visitor.",
        auth: { name: p === "work" ? "Temporary resident visa (work)" : "Temporary resident student visa", fee: "Set by the consulate", time: "Book a consulate appointment", url: "https://consulmex.sre.gob.mx/" },
        checklist: [item(p === "work" ? "INM authorization number (from employer)" : "Acceptance letter from a Mexican institution", ""), item("Consulate appointment", "Via the SRE citas system."), common.passport(), common.photo(), item("Visa application form", "")]
      };
      if (MX_EXEMPT.has(nat)) return { status: "free", stay: "Up to 180 days (officer decides)", summary: "No visa needed for tourism, business or transit.", checklist: lightChecklist({ purpose: p, extra: [item("Proof of purpose if asked", "Hotel and return bookings, itinerary, means of support.")] }) };
      const pr = MX_PR.find((c) => has(ctx, `pr:${c}`));
      const visa = MX_VISA.find((c) => has(ctx, `visa:${c}`));
      if (pr || visa) return {
        status: "resident", stay: "Up to 180 days (officer decides)",
        summary: pr ? "No Mexican visa needed: you hold permanent residence from a country Mexico accepts (US, Canada, Japan, UK, Schengen, or Chile/Colombia/Peru)." : "No Mexican visa needed: you hold a valid US, Canada, Japan, UK or Schengen visa.",
        checklist: lightChecklist({ purpose: p, extra: [item(pr ? "Permanent resident card" : "The valid visa in your passport", "Must be valid for your whole stay in Mexico.")] }),
        warn: visa ? ["Many consulates say the visa should be multiple-entry (some also say previously used). Temporary residence cards don't count."] : ["Temporary residence permits don't qualify. It must be permanent residence."]
      };
      if (MX_REQUIRED.has(nat)) return {
        status: "visa", stay: "Up to 180 days",
        auth: { name: "Mexican visitor visa", fee: "Set by the consulate", time: "Book via the SRE citas system", url: "https://citas.sre.gob.mx/" },
        summary: "You need a Mexican visitor visa, unless you hold a valid US, Canada, Japan, UK or Schengen visa, or permanent residence from those countries (or Chile, Colombia, Peru). Add them above if you do.",
        checklist: visitorChecklist({ purpose: p, form: item("Visa application form and appointment", "", "https://citas.sre.gob.mx/") })
      };
      return { status: "check", summary: "We couldn't confirm your nationality on Mexico's current list. Check the official INM lists below. A valid US, Canada, Japan, UK or Schengen visa or permanent residence would let you enter without a Mexican visa.", checklist: [common.passport()] };
    }
  };

  // =====================================================================
  // BAHRAIN
  // Sources (checked 2026-11-21):
  //  https://www.bahrain.com/en/visa (GCC citizens need no visa)
  //  https://www.npra.gov.bh/en/services/port-services/ (68 nationalities get a visa on arrival; list not readable)
  //  https://www.bahrain.bh/wps/portal/en/BNP/ServicesCatalogue/GSX-UI-PServiceDetails?psID=1871 (2-week eVisa, 9 + 4 BD)
  //  https://www.npra.gov.bh/en/services/visas-residence-permit/visa-services/e-visa/multiple-visa/visit-visa-uk-three-months-multiple-entry/
  //  https://www.npra.gov.bh/en/services/visas-residence-permit/visa-services/e-visa/evisa1/visit-visa-gcc-resident-two-weeks-single-entry-/
  // The official per-country eVisa and visa-on-arrival lists (evisa.gov.bh) could not be read, so other nationalities return "check".
  // =====================================================================
  const BH_EVISA = "https://www.evisa.gov.bh/";
  const BH = {
    id: "BH", name: "Bahrain", flag: "🇧🇭", verified: "2026-11-21",
    links: [
      ["Bahrain eVisa (official)", BH_EVISA],
      ["eVisa eligible countries", "https://evisa.gov.bh/list-of-online-visa-country.html"],
      ["Visa on arrival countries", "https://www.evisa.gov.bh/list-of-onarrival-visa-country.html"],
      ["NPRA visa services", "https://www.npra.gov.bh/en/services/visas-residence-permit/visa-services/"]
    ],
    evaluate(nat, ctx) {
      const p = ctx.purpose;
      const passport = "Valid more than 6 months.";
      if (nat === "BH") return { status: "citizen", summary: "Travel on your Bahraini passport or ID card." };
      if (GCC.has(nat)) return { status: "free", summary: "GCC citizens don't need a visa for Bahrain.", checklist: [item("Passport or GCC national ID", "")] };
      if (p === "study") return {
        status: "permit", summary: "A guarantor in Bahrain applies for your student visa while you are outside Bahrain, then you get a student residence permit. Students may not work.",
        auth: { name: "Student visa", fee: "BD 5 + 5 + 30", time: "About 3 working days", url: "https://www.npra.gov.bh/en/services/visas-residence-permit/visa-services/student-visa/" },
        checklist: [item("Admission letter from a Bahrain institution", ""), item("Guarantor in Bahrain", "Files the application for you."), common.passport(passport), common.photo()]
      };
      if (p === "work") return {
        status: "permit", summary: "Your employer applies to the Labour Market Regulatory Authority (LMRA) for a work permit before you travel.",
        auth: { name: "LMRA work permit", fee: "BD 172 per year + BD 5 (usually paid by employer)", time: "About 3 working days", url: "https://lmra.gov.bh/en/page/show/106" },
        checklist: [item("Employment contract", ""), item("Medical examination", ""), common.passport(passport), common.photo()]
      };
      if (p !== "transit" && (nat === "GB" || nat === "IE")) return {
        status: "evisa", stay: "3 months, multiple entry (extendable)",
        auth: { name: "eVisa, 3-month multiple entry", fee: "BD 5 application + BD 20 issue", time: "Usually 1 working day", url: BH_EVISA },
        summary: "UK and Irish citizens can get a 3-month multiple-entry eVisa online. Many nationalities can also get a visa on arrival: check the official list.",
        checklist: lightChecklist({ purpose: p, passport, auth: item("Approved eVisa", "Use it within 3 months of issue.", BH_EVISA) })
      };
      if (p !== "transit" && has(ctx, "pr:AE")) return {
        status: "evisa", stay: "2 weeks (single) or 3 months (multiple)",
        auth: { name: "GCC resident eVisa", fee: "BD 5 + 5 (2 weeks) or BD 5 + 12 (3 months)", time: "Usually 1 working day", url: BH_EVISA },
        summary: "As a GCC resident you can apply online for a GCC-resident eVisa from outside Bahrain.",
        checklist: lightChecklist({ purpose: p, passport, auth: item("GCC residence permit", "With a return visa valid at least 3 months."), extra: [item("Approved eVisa", "Use it within 3 months of issue.", BH_EVISA)] })
      };
      return {
        status: "check",
        summary: p === "transit" ? "We couldn't confirm Bahrain's transit rules on an official page. Ask your airline or check the NPRA site." : "Most nationalities can apply for a 2-week eVisa online (BD 13, 3 to 5 working days), and about 68 can get a visa on arrival. We couldn't read the official country lists, so check yours on evisa.gov.bh.",
        checklist: [common.passport(passport), common.ticket(), common.stay(), item("Bank statement", "Last 3 months, in English (required for the 2-week eVisa).")],
        links: [["Check your nationality (evisa.gov.bh)", "https://evisa.gov.bh/list-of-online-visa-country.html"]]
      };
    }
  };

  // =====================================================================
  // INDIA
  // Sources (checked 2026-11-21):
  //  https://boi.gov.in/boi/contents/travelling-to-india/foreigners/visa-free-regime-visa-on-arrival (Nepal, Bhutan, Maldives)
  //  https://indianvisaonline.gov.in/visa/visa-on-arrival.html (JP, KR, AE visa on arrival)
  //  https://indianvisaonline.gov.in/evisa/images/Etourist_fee_final.pdf (e-Tourist countries, fee schedule 8 Sep 2026)
  //  https://indianvisaonline.gov.in/evisa/images/eTV_revised_fee_final.pdf (e-Business/e-Medical: e-Tourist list + Bangladesh)
  //  https://indianvisaonline.gov.in/visa/visa-provision.html (transit, student, employment visas; FRRO registration)
  //  https://boi.gov.in/boi/contents/travelling-to-india/general-guidelines (e-Arrival card)
  // =====================================================================
  const IN_ETOURIST = S(`AL AD AO AG AR AM AU AT AZ BS BH BB BY BE BZ BJ BO BA BW BR BN BG BI KH CM CA CV KM CL CO CR CI HR CU CY CZ DK DJ DM DO TL EC SV GQ ER EE FJ FI FR GA GM GE DE GH GR GD GT GN GY HT HN HU IS ID IE IL IT JM JP JO KZ KE KI KW KG LA LV LS LR LI LT LU MK MG MW MY ML MT MH MR MU MX FM MD MC MN ME MA MZ MM NA NR NL NZ NI NE NO OM PW PS PA PG PY PE PH PL PT QA KR RO RU RW KN LC VC WS SM SA SN RS SC SL SG SK SI SB ZA ES LK SR SZ SE CH TW TJ TZ TH TG TO TT TV UG UA AE GB US UY UZ VU VA VE VN ZM ZW`);
  const IN_EBUSINESS = union(IN_ETOURIST, S("BD"));
  const IN_VOA = S("JP KR AE");
  const IN_EVISA = "https://indianvisaonline.gov.in/evisa/tvoa.html";
  const IN_ARRIVAL = item("e-Arrival Card", "Submit online within 72 hours before arrival (not a visa).", "https://indianvisaonline.gov.in/earrival/");

  const IN = {
    id: "IN", name: "India", flag: "🇮🇳", verified: "2026-11-21",
    links: [
      ["Indian e-Visa (official)", IN_EVISA],
      ["Bureau of Immigration", "https://boi.gov.in/"],
      ["Regular visa application", "https://indianvisaonline.gov.in/visa/index.html"]
    ],
    evaluate(nat, ctx) {
      const p = ctx.purpose;
      if (nat === "IN") return { status: "citizen", summary: "Travel on your Indian passport." };
      if (nat === "NP" || nat === "BT") return {
        status: "free", summary: "No visa needed when entering India from Nepal or Bhutan. Arriving from China, Hong Kong, Macau or Pakistan needs a passport and visa.",
        checklist: [item("Passport or approved photo ID proving nationality", "A passport is needed if you arrive from a country other than Nepal or Bhutan.")]
      };
      if (p === "study") return { status: "permit", summary: "You need a Student visa (S1 to S5, e.g. S1 for higher education). Visas over 180 days need FRRO registration within 14 days of arrival.",
        auth: { name: "Student visa (S)", fee: "Varies by nationality", time: "Apply well ahead", url: "https://indianvisaonline.gov.in/visa/index.html" },
        checklist: [item("Admission letter", "From a recognised Indian institution."), item("Proof of funds", ""), common.passport(), common.photo(), item("FRRO registration", "Within 14 days, online.", "https://indianfrro.gov.in/")] };
      if (p === "work") return { status: "permit", summary: "You need an Employment visa (E). Visas over 180 days need FRRO registration within 14 days of arrival.",
        auth: { name: "Employment visa (E)", fee: "Varies by nationality", time: "Apply well ahead", url: "https://indianvisaonline.gov.in/visa/index.html" },
        checklist: [item("Employment contract", "With the Indian company."), item("Company registration documents", ""), common.passport(), common.photo(), item("FRRO registration", "Within 14 days, online.", "https://indianfrro.gov.in/")] };
      if (nat === "MV" && p !== "transit") return { status: "free", stay: "Up to 90 days in 6 months", summary: "Maldivian citizens can visit India for tourism, business or medical treatment without a visa.", checklist: lightChecklist({ purpose: p, extra: [IN_ARRIVAL] }) };
      if (nat === "PK") return { status: "visa", summary: "Pakistani nationals need a regular visa from an Indian mission and can't use the e-Visa. Arrival by air only at Delhi, Mumbai or Chennai.", auth: { name: "Regular visa", fee: "Set by the mission", time: "Varies", url: "https://indianvisaonline.gov.in/visa/index.html" }, checklist: [common.passport(), common.photo(), IN_ARRIVAL] };
      if (p === "transit") return { status: "check", summary: "We couldn't confirm visa-free airside transit on an official page. To leave the airport you need a Transit visa (valid 15 days) or another visa.", auth: { name: "Transit visa (TR)", fee: "Varies", time: "Apply ahead", url: "https://indianvisaonline.gov.in/visa/visa-provision.html" }, checklist: [common.passport(), item("Onward ticket", "")] };
      const list = p === "business" ? IN_EBUSINESS : IN_ETOURIST;
      if (IN_VOA.has(nat) && nat !== "AE") return {
        status: "voa", stay: "Up to 60 days, double entry",
        auth: { name: "Visa on arrival", fee: "Rs 2,000", time: "On arrival at Delhi, Mumbai, Chennai, Kolkata, Bengaluru or Hyderabad", url: "https://indianvisaonline.gov.in/visa/visa-on-arrival.html" },
        summary: "You can get a visa on arrival at six major airports, or apply for an e-Visa beforehand.",
        checklist: lightChecklist({ purpose: p, passport: "Valid at least 6 months.", extra: [item("Visa on arrival form (Annexure I)", "Completed, with a disembarkation card."), IN_ARRIVAL] }),
        warn: ["Not available if you, a parent or a grandparent was born in or lived permanently in Pakistan."]
      };
      if (list.has(nat)) return {
        status: "evisa", stay: p === "business" ? "As shown on the e-Business visa" : "Per visa (30 days, 1 year or 5 years); max 180 days a year",
        auth: { name: p === "business" ? "e-Business visa" : "e-Tourist visa", fee: p === "business" ? "Usually US$120 (varies by nationality)" : "From US$10 to $25 (30 days), varies by nationality", time: "Apply online before travel", url: IN_EVISA },
        summary: `Apply for an ${p === "business" ? "e-Business" : "e-Tourist"} visa online before you travel.` + (nat === "AE" ? " UAE nationals who held an Indian visa before can also get a visa on arrival." : ""),
        checklist: lightChecklist({ purpose: p, auth: item("Approved e-Visa (ETA)", "Print it and carry it.", IN_EVISA), extra: [common.photo("Digital photo to the e-Visa spec."), IN_ARRIVAL] }),
        notes: ["e-Tourist visas can't be extended or converted.", "Only use indianvisaonline.gov.in. Other sites charge extra."]
      };
      return {
        status: "visa",
        auth: { name: "Regular visa", fee: "Set by the mission", time: "Varies", url: "https://indianvisaonline.gov.in/visa/index.html" },
        summary: nat === "BD" && p === "tourism" ? "Bangladeshi citizens need a regular tourist visa (e-Visa is only for business and medical)." : "You need a regular visa, applied for online and submitted to an Indian mission or its visa centre.",
        checklist: visitorChecklist({ purpose: p, form: item("Online visa application", "", "https://indianvisaonline.gov.in/visa/index.html"), extra: [IN_ARRIVAL] }),
        ...(["AF", "CN", "IQ", "SD"].includes(nat) ? { warn: ["A 2-month gap is required between tourist visits for your nationality."] } : {})
      };
    }
  };

  // =====================================================================
  // THAILAND
  // Sources (checked 2026-11-21):
  //  https://www.mfa.go.th/en/content/pb-summary-03092026-en (new scheme from 15 Sep 2026: 60 countries 30 days, 2 on 15 days, 3 VOA)
  //  https://www.tatnews.org/2026/09/thailand-introduces-new-30-day-and-15-day-visa-exemption-rules-from-15-september/ (country names)
  //  https://image.mfa.go.th/mfa/0/zE6021nSnu/0303/Bilat_Ordinary.pdf (bilateral agreements)
  //  https://london.thaiembassy.org/en/page/exemp-visa (conditions, visa on arrival)
  //  https://london.thaiembassy.org/en/content/thailand-digital-arrival-card-tdac-required-from-1 (TDAC)
  // =====================================================================
  const TH_30 = S("AU AT BH BE BG BT BN CA HR CY CZ DK EE FJ FI FR GE DE GR HU IS ID IN IE IL IT JP JO KW KG LV LI LT LU MT MY MV NL NZ NO OM PH PL PT QA RO SA SG SK SI ZA ES SE CH TW TR UA AE GB US");
  const TH_BILAT = { AR: "90 days", BR: "90 days", CL: "90 days", KR: "90 days", PE: "90 days", KH: "14 days", MM: "14 days (international airports only)" };
  const TH_BILAT_UNSURE = S("CN HK KZ LA MO MN RU TL VN");
  const TH_15 = S("SC MU");
  const TH_VOA = S("AZ BY RS");
  const TH_EVISA = "https://www.thaievisa.go.th/";
  const TH_TDAC = item("Thailand Digital Arrival Card (TDAC)", "Required for all foreign arrivals. Submit within 3 days before you arrive.", "https://tdac.immigration.go.th/");

  const TH = {
    id: "TH", name: "Thailand", flag: "🇹🇭", verified: "2026-11-21",
    links: [
      ["Thai e-Visa (official)", TH_EVISA],
      ["Visa exemption scheme (MFA)", "https://www.mfa.go.th/en/content/pb-summary-03092026-en"],
      ["Thailand Digital Arrival Card", "https://tdac.immigration.go.th/"]
    ],
    evaluate(nat, ctx) {
      const p = ctx.purpose;
      const passport = "Valid at least 6 months.";
      if (nat === "TH") return { status: "citizen", summary: "Travel on your Thai passport." };
      if (p === "study" || p === "work") return {
        status: "permit", summary: p === "study" ? "Study needs a Non-Immigrant education visa, applied for on the Thai e-Visa site through the embassy for where you live." : "Work needs a Non-Immigrant business visa plus a work permit from the Ministry of Labour, arranged with your employer.",
        auth: { name: p === "study" ? "Non-Immigrant visa (education)" : "Non-Immigrant visa (business) + work permit", fee: "Set by the embassy", time: "5 to 10 working days or more", url: TH_EVISA },
        checklist: [item(p === "study" ? "Acceptance letter from a Thai institution" : "Employer documents and job offer", ""), common.passport(passport), common.photo(), TH_TDAC]
      };
      const exemptStay = TH_30.has(nat) ? "30 days" : TH_15.has(nat) ? "15 days" : TH_BILAT[nat];
      if (exemptStay || TH_BILAT_UNSURE.has(nat)) return {
        status: "free", stay: exemptStay || "Set by bilateral agreement: confirm with the Thai embassy",
        summary: p === "business" ? "Visa exemption is for tourism. For business, check whether you need a Non-Immigrant visa." : "No visa needed for tourism. Fill in the digital arrival card before you go.",
        checklist: lightChecklist({ purpose: p, passport, extra: [TH_TDAC, item("Funds if asked", "Officers may ask for 20,000 THB per person.")] }),
        warn: [...(TH_BILAT_UNSURE.has(nat) ? ["We couldn't confirm the length of stay for your nationality from an official source."] : []), "Entries over land borders are limited to 2 per calendar year."],
        notes: TH_30.has(nat) ? ["One extension of up to 30 days is possible at Thai Immigration."] : []
      };
      if (TH_VOA.has(nat)) return {
        status: "voa", stay: "15 days",
        auth: { name: "Visa on arrival", fee: "2,000 THB (cash)", time: "On arrival", url: "https://london.thaiembassy.org/en/page/exemp-visa" },
        summary: "You can get a 15-day tourist visa on arrival.",
        checklist: lightChecklist({ purpose: p, passport: "Valid at least 6 months, with 2 blank pages.", extra: [common.photo(), item("Funds", "10,000 THB per person or 20,000 THB per family."), TH_TDAC] })
      };
      if (p === "transit") return { status: "check", summary: "We couldn't confirm airside transit rules on an official page. To enter Thailand in transit you need a Transit visa (TS, 800 THB).", auth: { name: "Transit visa (TS)", fee: "800 THB", time: "Apply on the e-Visa site", url: TH_EVISA }, checklist: [common.passport(passport), item("Onward ticket", "")] };
      return {
        status: "evisa", stay: "Usually up to 60 days (tourist visa)",
        auth: { name: "Tourist visa (Thai e-Visa)", fee: "Set by the embassy for where you live", time: "5 to 10 working days, sometimes longer", url: TH_EVISA },
        summary: "You need a visa before you travel. Apply online on the official Thai e-Visa site, through the embassy covering where you live.",
        checklist: visitorChecklist({ purpose: p, passport, form: item("Online e-Visa application", "", TH_EVISA), extra: [TH_TDAC] })
      };
    }
  };

  // =====================================================================
  // IRELAND (not Schengen)
  // Sources (checked 2026-11-21):
  //  https://assets.ireland.ie/documents/List_of_Visa_Required_Non_Visa_Required_Nationalities_-_May_2025.pdf
  //  https://www.gov.ie/en/department-of-justice/press-releases/minister-ocallaghan-announces-new-visa-requirements (SZ, LS, NR)
  //  https://www.irishimmigration.ie/at-the-border/transit-including-transfer-visa-advice/ (transit list; NI, KN, LC added June 2026)
  //  https://www.irishimmigration.ie/?p=18751 (Short-Stay Visa Waiver Programme)
  //  https://www.irishimmigration.ie/british-irish-visa-scheme/
  //  https://api.ireland.ie/en/greatbritain/london/services/visas/latest-visa-updates/ (fees)
  // =====================================================================
  const IE_FREE = S("AD AG AR AU BS BB BZ BR BN CA CL CR SV FJ GD GT GY HK IL JP KI KR MO MY MV MX MC NZ PA PY WS SM SC SG SB TW TO TV UA AE US UY VA");
  const IE_WAIVER = S("BA XK ME MK RS TR UA BH KW OM QA SA IN ID KZ CN PH TH UZ VN");
  const IE_TRANSIT = S("AF AL BO BW CU CD DM ER SZ ET GE GH HN IR IQ LB LS MD NR NI NG KN LC SO ZA LK TT VU ZW");
  const IE_AVATS = "https://www.visas.inis.gov.ie/avats/OnlineHome.aspx";

  const IE = {
    id: "IE", name: "Ireland", flag: "🇮🇪", verified: "2026-11-21",
    links: [
      ["Irish Immigration Service", "https://www.irishimmigration.ie/"],
      ["Online visa application (AVATS)", IE_AVATS],
      ["Short-Stay Visa Waiver Programme", "https://www.irishimmigration.ie/?p=18751"]
    ],
    evaluate(nat, ctx) {
      const p = ctx.purpose;
      if (nat === "IE") return { status: "citizen", summary: "Travel on your Irish passport or passport card." };
      if (nat === "GB") return { status: "free", summary: "British citizens can live, work and study in Ireland under the Common Travel Area.", checklist: [item("Passport or photo ID", "Airlines usually ask for photo ID.")] };
      if (EEA_CH.has(nat)) return { status: "free", summary: "EU/EEA/Swiss citizens can visit, study and work in Ireland without a visa.", checklist: [item("Passport or national ID card", "")] };
      if (p === "study") return { status: "permit", summary: "Courses over 3 months must be on the Interim List of Eligible Programmes (ILEP). You get Stamp 2 permission and register for an IRP card." + (IE_FREE.has(nat) ? " Your nationality doesn't need a visa first." : " You need a study visa first."),
        auth: { name: IE_FREE.has(nat) ? "Stamp 2 (on arrival)" : "Study visa, then Stamp 2", fee: "IRP registration up to €300", time: "Apply for the visa about 3 months ahead", url: "https://www.irishimmigration.ie/coming-to-study-in-ireland/planning-to-study-in-ireland/" },
        checklist: [item("Letter of acceptance (ILEP course)", ""), item("Proof of fees paid and funds", ""), item("Private medical insurance", ""), common.passport(), item("IRP registration", "Within 90 days of arrival.")] };
      if (p === "work") return { status: "permit", summary: "You need an employment permit (e.g. Critical Skills or General) before you start work, then a visa if your nationality needs one.",
        auth: { name: "Employment permit", fee: "Varies by permit", time: "Check DETE processing dates", url: "https://enterprise.gov.ie/en/what-we-do/workplace-and-skills/employment-permits/permit-types/" },
        checklist: [item("Job offer from an Irish employer", ""), item("Employment permit", "From the Department of Enterprise."), common.passport(), item("IRP registration", "If staying over 90 days.")] };
      if (p === "transit") {
        if (IE_TRANSIT.has(nat)) return { status: "visa", auth: { name: "Transit visa", fee: "€25", time: "Apply ahead on AVATS", url: IE_AVATS }, summary: "Your nationality needs an Irish transit visa even to change planes.", checklist: [common.passport(), item("Onward ticket and visa for your destination", "")], warn: ["At Dublin a transit visa only works if both flights use Terminal 2 on the same day between 04:00 and 20:00."] };
        return { status: "free", summary: "No transit visa needed to change planes airside. Leaving the airport follows the normal visitor rules.", checklist: [common.passport(), item("Onward boarding pass", "")] };
      }
      if (IE_FREE.has(nat)) return { status: "free", stay: "Set by the immigration officer at entry", summary: "No visa needed. An immigration officer decides your permission to stay at the border.", checklist: lightChecklist({ purpose: p }), notes: ["Ireland is not in Schengen: Schengen visas and permits don't count."] };
      if (IE_WAIVER.has(nat) && has(ctx, "visa:GB")) return {
        status: "resident", stay: "Up to 90 days, or until your UK permission ends",
        summary: "Under the Short-Stay Visa Waiver Programme you can visit Ireland on your UK short-stay visa, after first entering the UK on it." + (nat === "IN" || nat === "CN" ? " A UK visa endorsed BIVS also works under the British Irish Visa Scheme." : ""),
        checklist: lightChecklist({ purpose: p, extra: [item("Valid UK short-stay (C) visa", "UK long-stay visas and BRPs don't qualify."), item("Evidence you entered the UK first", "")] }),
        warn: ["The waiver programme has a set end date. Confirm it is still running on irishimmigration.ie before you book."]
      };
      return {
        status: "visa", stay: "Up to 90 days",
        auth: { name: "Short stay 'C' visa", fee: "€60 single / €100 multiple", time: "Apply up to 3 months ahead", url: IE_AVATS },
        summary: "You need an Irish visa. Apply online on AVATS, then send your documents to the visa office or embassy." + (IE_WAIVER.has(nat) ? " If you hold a UK short-stay visa, add it above: you may not need an Irish visa." : ""),
        checklist: visitorChecklist({ purpose: p, form: item("AVATS online application", "", IE_AVATS) }),
        notes: ["A Schengen visa or a UK residence permit does not let you enter Ireland."]
      };
    }
  };

  // =====================================================================
  // NEW ZEALAND
  // Sources (checked 2026-11-21):
  //  https://www.immigration.govt.nz/visit/what-you-need-to-visit-new-zealand/visa-waiver-countries-and-territories/
  //  https://www.immigration.govt.nz/visas/new-zealand-electronic-travel-authority-nzeta/
  //  https://www.immigration.govt.nz/visit/what-you-need-to-visit-new-zealand/nzeta-application-guide-for-citizens-of-china (NZD 17/23, IVL NZD 100)
  //  https://www.immigration.govt.nz/opsmanual/34911.htm (transit visa waiver list)
  //  https://www.immigration.govt.nz/visas/transit-visa/
  // =====================================================================
  const NZ_WAIVER = S("AD AR AT BH BE BR BN BG CA CL HR CY CZ DK EE FI FR DE GR HK HU IS IE IL IT JP KR LV LI LT LU MO MY MT MU MX MC NL NO OM PL PT QA RO SM SA SC SG SK SI ES SE CH TW AE US UY VA GB");
  const NZ_TRANSIT_WAIVER = S("BS BO CO CR EC FM FJ ID KI NR PW PA PG PY CN PE PH MH WS SB TH TO TV VE");
  const NZ_PIF = S("FJ KI MH FM NR PW PG WS SB TO TV VU");
  const NZ_ETA = "https://nzeta.immigration.govt.nz/";
  const NZ_TD = item("NZ Traveller Declaration", "Submit online from 24 hours before your journey.", "https://www.travellerdeclaration.govt.nz/");

  const NZ = {
    id: "NZ", name: "New Zealand", flag: "🇳🇿", verified: "2026-11-21",
    links: [
      ["Visa waiver countries", "https://www.immigration.govt.nz/visit/what-you-need-to-visit-new-zealand/visa-waiver-countries-and-territories/"],
      ["Official NZeTA application", NZ_ETA],
      ["Visiting New Zealand", "https://www.immigration.govt.nz/visit/"]
    ],
    evaluate(nat, ctx) {
      const p = ctx.purpose;
      const passport = "Valid at least 3 months after you plan to leave.";
      const eta = { name: "NZeTA + visitor levy", fee: "NZD 17 (app) or 23 (web) + NZD 100 IVL", time: "Allow 72 hours", url: NZ_ETA };
      const etaItem = (levy) => item("Approved NZeTA", levy === false ? "Valid 2 years. You don't pay the visitor levy." : "Valid 2 years. The NZD 100 International Visitor Levy is paid with it.", NZ_ETA);
      if (nat === "NZ") return { status: "citizen", summary: "Travel on your New Zealand passport." };
      if (nat === "AU") return { status: "free", summary: "Australian citizens don't need a visa or NZeTA, and can live, study and work in New Zealand.", checklist: [common.passport("Valid Australian passport."), NZ_TD] };
      if (has(ctx, "pr:NZ")) return { status: "resident", summary: "Return on your New Zealand resident visa.", checklist: [item("Resident visa with travel conditions", ""), common.passport()] };
      if (p === "study") return { status: "permit", summary: "Courses longer than 3 months need a Fee Paying Student Visa.", auth: { name: "Fee Paying Student Visa", fee: "See INZ fees", time: "Varies", url: "https://immigration.govt.nz/visas/fee-paying-student-visa" }, checklist: [item("Offer of place", "From an approved education provider."), item("Proof of funds and fees", ""), item("Health and character checks", "If required."), common.passport(passport)] };
      if (p === "work") return { status: "permit", summary: "Work needs a work visa, most often the Accredited Employer Work Visa. Working holiday visas exist for eligible countries.", auth: { name: "Accredited Employer Work Visa", fee: "See INZ fees", time: "Varies", url: "https://www.immigration.govt.nz/visas/accredited-employer-work-visa/" }, checklist: [item("Job offer from an accredited employer", ""), item("Qualifications and experience", ""), item("Health and character checks", ""), common.passport(passport)] };
      if (p === "transit") {
        if (NZ_WAIVER.has(nat) || NZ_TRANSIT_WAIVER.has(nat) || has(ctx, "pr:AU")) return { status: "eta", auth: { name: "NZeTA (transit)", fee: "NZD 17 or 23 (no levy for Auckland transit)", time: "Allow 72 hours", url: NZ_ETA }, summary: "You need an NZeTA to transit. Transit is only possible at Auckland Airport, airside, for under 24 hours.", checklist: [common.passport(passport), etaItem(false), item("Onward ticket", "Within 24 hours.")] };
        if (nat === "VU") return { status: "check", summary: "Vanuatu may have been removed from the transit visa waiver list. Check with INZ before you fly.", checklist: [common.passport(passport)] };
        return { status: "visa", auth: { name: "Transit visa", fee: "From NZD 235", time: "Most decided within 3 days", url: "https://www.immigration.govt.nz/visas/transit-visa/" }, summary: "You need a Transit visa, unless you are travelling to or from Australia on a valid Australian visa (then an NZeTA is enough).", checklist: [common.passport(passport), item("Onward ticket", "Within 24 hours, via Auckland.")] };
      }
      if (nat === "KW") return { status: "visa", auth: { name: "Visitor visa", fee: "See INZ fees", time: "Varies", url: "https://www.immigration.govt.nz/visit/" }, summary: "Visa waiver travel for Kuwaiti citizens is suspended. You need a visitor visa.", checklist: visitorChecklist({ purpose: p, passport }) };
      if (NZ_WAIVER.has(nat)) return {
        status: "eta", stay: nat === "GB" ? "Up to 6 months" : "Up to 3 months (max 6 months in 12)",
        auth: eta, summary: "Visa free, but you need an NZeTA before you travel.",
        checklist: lightChecklist({ purpose: p, passport, auth: etaItem(), extra: [NZ_TD] }),
        notes: ["Only use the official NZeTA app or nzeta.immigration.govt.nz."]
      };
      if (has(ctx, "pr:AU")) return { status: "eta", stay: "Up to 3 months", auth: { ...eta, name: "NZeTA (no levy)" }, summary: "As an Australian permanent resident you can use an NZeTA instead of a visa, and you don't pay the visitor levy.", checklist: lightChecklist({ purpose: p, passport, auth: etaItem(false), extra: [NZ_TD] }) };
      if ((nat === "CN" || NZ_PIF.has(nat)) && has(ctx, "visa:AU")) return { status: "eta", stay: "Up to 3 months", auth: eta, summary: "You can use an NZeTA if you travel directly from Australia on an eligible Australian visa.", checklist: lightChecklist({ purpose: p, passport, auth: etaItem(), extra: [NZ_TD] }), warn: ["Only transiting through Australia does not qualify."] };
      return {
        status: "visa", stay: "Up to 9 months",
        auth: { name: "Visitor visa", fee: "See INZ fees", time: "Varies; apply early", url: "https://www.immigration.govt.nz/visit/" },
        summary: "You need a visitor visa, applied for online with Immigration New Zealand.",
        checklist: visitorChecklist({ purpose: p, passport, photo: false, extra: [NZ_TD] })
      };
    }
  };

  // =====================================================================
  // TÜRKIYE
  // Sources (checked 2026-11-21):
  //  https://www.mfa.gov.tr/visa-information-for-foreigners.en.mfa (per-country table, ordinary passports)
  //  https://mfa.gov.tr/general-information-about-turkish-visas.en.mfa (passport validity, work/study)
  //  https://mfa.gov.tr/frequently-asked-questions.en.mfa (airside transit)
  //  e-Visa portal: https://www.evisa.gov.tr/ (fees could not be read)
  // =====================================================================
  const TR_90 = S("AL AD AR AU AT AZ BH BE BZ BO BA BR BG CA CL CN CO HR CZ DK EC SV EE FI FR GE DE GR GT HN HK HU IS IR IE IL IT JP JO KZ XK KW KG LV LB LI LT LU MY MT MD MC ME MA NL NZ NI MK NO OM PA PY PE PL PT QA RO SM SA RS SC SG SK SI KR ES SE CH TT TN UA AE GB UY US UZ VA VE");
  const TR_SHORT = { RU: "60 days", BY: "30 days (max 90 a year)", BN: "30 days", CR: "30 days", ID: "30 days (90 in 180)", MO: "30 days", MN: "30 days", TH: "30 days" };
  const TR_EVISA = { AG: "3 months", BS: "3 months", BB: "3 months", DO: "3 months", GD: "3 months", JM: "3 months", LC: "3 months", VC: "3 months", MV: "3 months", MU: "1 month", FJ: "1 month", MX: "30 days", VN: "30 days", TL: "30 days", SR: "30 days", AM: "As shown on the e-Visa", NA: "As shown on the e-Visa", CY: "As shown on the e-Visa" };
  const TR_COND = S("AF BD BT CV GQ IN NP PK PS SN LK SB VU YE");
  const TR_AGE = { DZ: "under 15 or over 50", IQ: "under 15 or over 50", LY: "under 16 or over 45", EG: "under 15 or over 45 (e-Visa)" };
  const TR_EV = "https://www.evisa.gov.tr/";

  const TR = {
    id: "TR", name: "Türkiye", flag: "🇹🇷", verified: "2026-11-21",
    links: [
      ["Visa information for foreigners (MFA)", "https://www.mfa.gov.tr/visa-information-for-foreigners.en.mfa"],
      ["Official e-Visa application", TR_EV],
      ["General visa information (MFA)", "https://mfa.gov.tr/general-information-about-turkish-visas.en.mfa"]
    ],
    evaluate(nat, ctx) {
      const p = ctx.purpose;
      const passport = "Valid at least 60 days beyond your stay (6 months advised).";
      if (nat === "TR") return { status: "citizen", summary: "Travel on your Turkish passport or ID card." };
      if (p === "study" || p === "work") return {
        status: "permit", summary: p === "work" ? "Apply for a work visa at a Turkish mission. Your employer applies to the Ministry of Labour for your work permit." : "You need a student visa from a Turkish mission, then a student residence permit after arrival.",
        auth: { name: p === "work" ? "Work visa + work permit" : "Student visa", fee: "Set by the mission", time: "Work permits: about 30 days", url: "https://mfa.gov.tr/general-information-about-turkish-visas.en.mfa" },
        checklist: [item(p === "work" ? "Employer letter / contract" : "Admission letter", ""), item("Health insurance", "Required for all visa applicants."), common.passport(passport), common.photo(), item("Residence permit", "For stays over 90 days, from the migration directorate.")]
      };
      if (p === "transit") return { status: "free", summary: "No visa needed if you stay in the airport transit area. Leaving the airport needs a visa or visa exemption.", checklist: [common.passport(passport), item("Onward boarding pass", "")] };
      if (TR_90.has(nat) || TR_SHORT[nat]) return {
        status: "free", stay: TR_SHORT[nat] || "90 days in any 180",
        summary: "No visa needed for short visits.",
        checklist: lightChecklist({ purpose: p, passport }),
        warn: nat === "GB" ? ["Only full British citizen passports. BN(O) and other British passports need a visa."] : nat === "HK" ? ["HKSAR passport only."] : []
      };
      if (TR_AGE[nat]) return { status: "check", summary: `Visa-free entry depends on your age: only travellers ${TR_AGE[nat]} are exempt. Others need a visa, or a conditional e-Visa if they hold a valid Schengen, US, UK or Irish visa or residence permit.`, checklist: [common.passport(passport)] };
      if (TR_EVISA[nat]) return {
        status: "evisa", stay: TR_EVISA[nat],
        auth: { name: "Türkiye e-Visa", fee: "Shown on evisa.gov.tr", time: "Apply before travel", url: TR_EV },
        summary: "Apply for an e-Visa online for tourism or business.",
        checklist: lightChecklist({ purpose: p, passport, auth: item("Approved e-Visa", "Print or save it.", TR_EV) }),
        notes: ["Only use evisa.gov.tr."]
      };
      if (TR_COND.has(nat)) {
        if (has(ctx, "visa:US", "visa:GB", "visa:SCHENGEN", "pr:US", "pr:GB", "pr:EU")) return {
          status: "evisa", stay: "Up to 30 days, single entry",
          auth: { name: "Conditional e-Visa", fee: "Shown on evisa.gov.tr", time: "Apply before travel", url: TR_EV },
          summary: "You can get a conditional e-Visa because you hold a valid Schengen, US, UK or Irish visa or residence permit.",
          checklist: lightChecklist({ purpose: p, passport, auth: item("Approved e-Visa", "", TR_EV), extra: [item("Your valid supporting visa or residence permit", "")] }),
          warn: ["Extra conditions apply (e.g. hotel booking and funds). Check evisa.gov.tr."]
        };
        return { ...trVisa(p, passport), notes: ["With a valid Schengen, US, UK or Irish visa or residence permit you could use a conditional e-Visa instead."] };
      }
      if (nat === "PH" || nat === "TW") return { status: "check", summary: "Your nationality is listed for an e-Visa, but we couldn't confirm whether it needs a supporting Schengen, US, UK or Irish visa. Check evisa.gov.tr.", checklist: [common.passport(passport)], links: [["Türkiye e-Visa", TR_EV]] };
      return trVisa(p, passport);
    }
  };
  function trVisa(p, passport) {
    return {
      status: "visa", stay: "As shown on the visa",
      auth: { name: "Visa from a Turkish mission", fee: "Set by the mission", time: "Apply at least 1 month ahead", url: "https://www.mfa.gov.tr/visa-information-for-foreigners.en.mfa" },
      summary: "You need a visa from a Turkish embassy or consulate before you travel.",
      checklist: visitorChecklist({ purpose: p, passport, form: item("Visa pre-application", "Online, then submit at the mission.", "https://www.visa.gov.tr/"), insurance: "Health insurance is required for visa applicants." })
    };
  }

  // =====================================================================
  // SINGAPORE
  // Sources (checked 2026-11-21):
  //  https://www.ica.gov.sg/enter-transit-depart/entering-singapore/visa_requirements (visa-required travel documents)
  //  https://www.ica.gov.sg/enter-transit-depart/entering-singapore/visa_requirements/prc-travel-document (e-Visa S$30, 3 working days)
  //  https://www.ica.gov.sg/enter-depart/entry_requirements/visa-free-transit-facility (VFTF, 96 hours)
  //  https://www.ica.gov.sg/enter-transit-depart/entering-singapore/sg-arrival-card
  //  https://www.mom.gov.sg/passes-and-permits
  // =====================================================================
  const SG_VISA = S("AF DZ AM AZ BD BY KP EG GE IN IR IQ JO KZ XK KG LB LY ML MD MA NG PK RU SO SS SD SY TJ TN TM UA UZ YE PS");
  const SG_VFTF_A = S("AM AZ BY KZ KG MD RU TJ UZ GE TM UA");
  const SG_SGAC = item("SG Arrival Card", "Free. Submit within 3 days before arrival.", "https://www.ica.gov.sg/enter-transit-depart/entering-singapore/sg-arrival-card");

  const SG = {
    id: "SG", name: "Singapore", flag: "🇸🇬", verified: "2026-11-21",
    links: [
      ["Visa requirements (ICA)", "https://www.ica.gov.sg/enter-transit-depart/entering-singapore/visa_requirements"],
      ["SG Arrival Card", "https://www.ica.gov.sg/enter-transit-depart/entering-singapore/sg-arrival-card"],
      ["Work passes (MOM)", "https://www.mom.gov.sg/passes-and-permits"]
    ],
    evaluate(nat, ctx) {
      const p = ctx.purpose;
      const passport = "Valid at least 6 months.";
      if (nat === "SG") return { status: "citizen", summary: "Travel on your Singapore passport." };
      if (has(ctx, "pr:SG")) return { status: "resident", summary: "Return on your Singapore PR or pass.", checklist: [item("Re-Entry Permit or valid pass", ""), common.passport(), SG_SGAC] };
      if (p === "study") return { status: "permit", summary: "Full-time study needs a Student's Pass from ICA, applied for after your school accepts you.", auth: { name: "Student's Pass", fee: "See ICA", time: "Apply through your school", url: "https://www.ica.gov.sg/reside/STP" }, checklist: [item("Acceptance from your school", ""), common.passport(passport), common.photo()] };
      if (p === "work") return { status: "permit", summary: "Your employer applies to the Ministry of Manpower: usually an Employment Pass (from S$5,600 a month, plus COMPASS) or an S Pass (from S$3,300).", auth: { name: "Employment Pass or S Pass", fee: "See MOM", time: "Employer applies", url: "https://www.mom.gov.sg/passes-and-permits" }, checklist: [item("Job offer from a Singapore employer", ""), item("Qualifications", ""), common.passport(passport)] };
      const vftf = p === "transit" && (SG_VFTF_A.has(nat) || (nat === "IN" && has(ctx, "visa:AU", "visa:CA", "visa:JP", "visa:NZ", "visa:GB", "visa:US", "pr:AU", "pr:CA", "pr:JP", "pr:NZ", "pr:GB", "pr:US")));
      if (vftf) return { status: "free", stay: "Up to 96 hours", summary: "You can use the Visa Free Transit Facility for up to 96 hours when travelling to or from a third country.", checklist: [common.passport(passport), item("Onward ticket", "Leaving within 96 hours."), ...(nat === "IN" ? [item("Valid visa or long-term pass", "From Australia, Canada, Germany, Japan, New Zealand, Switzerland, the UK or the US, valid at least 1 month.")] : []), SG_SGAC] };
      if (!SG_VISA.has(nat)) return { status: "free", stay: "Set by the officer at entry (shown on your e-Pass)", summary: p === "transit" ? "No visa needed." : "No visa needed. Submit the free SG Arrival Card before you arrive.", checklist: lightChecklist({ purpose: p, passport, extra: [SG_SGAC] }) };
      if (p === "transit") return { status: "check", summary: "We couldn't confirm airside transit rules for visa-required nationalities. Check with ICA or your airline.", checklist: [common.passport(passport)] };
      return {
        status: "visa", stay: "Set by the officer at entry",
        auth: { name: "Singapore visa (e-Visa)", fee: "S$30", time: "Usually up to 3 working days", url: "https://eservices.ica.gov.sg/esvclandingpage/save" },
        summary: "You need a visa. A local contact in Singapore applies for you online, or you apply through a Singapore mission or its authorised agent. Apply within 30 days before you travel.",
        checklist: visitorChecklist({ purpose: p, passport, form: item("Form 14A", "With a photo taken in the last 3 months."), extra: [SG_SGAC] }),
        ...(nat === "IN" ? { notes: ["Transiting? With a US, UK, Canada, Australia, NZ, Japan, Germany or Switzerland visa you may use the 96-hour Visa Free Transit Facility."] } : {})
      };
    }
  };

  // =====================================================================
  // SOUTH KOREA
  // Sources (checked 2026-11-21):
  //  https://overseas.mofa.go.kr/om-en/wpge/m_11051/contents.do (visa waiver agreements and unilateral visa-free list)
  //  https://www.mofa.go.kr/ca-en/wpge/m_5236/contents.do (Canada 6 months; third-country transit visa-free entry)
  //  https://overseas.mofa.go.kr/ie-en/brd/m_23773/view.do?seq=761699 (K-ETA fee, validity)
  //  https://overseas.mofa.go.kr/us-en/brd/m_4500/view.do?seq=761106 (K-ETA exemption extended to 31 Dec 2026)
  //  https://www.moj.go.kr/bbs/immigration_eng/229/592278/artclView.do (e-Arrival card)
  // =====================================================================
  const KR_90 = S("MY NZ SG TH AG BS BB BR CL CO DM CR DO SV GD GT HT JM MX NI PA PE KN LC VC SR TT VE UY AT BE CZ FR DE GR HU LI LT LV LU MT NL PL SK ES CH DK EE FI IS NO SE BG IE RO TR GB IL LR MA IT HK JP MO TW EC US HR RS SI AU");
  const KR_STAY = { CA: "Up to 6 months", PT: "60 days", RU: "60 days per visit (90 in 180)", LS: "60 days", TN: "30 days", KZ: "Confirm with the embassy (30 or 90 days)" };
  const KR_30 = S("BN AR GY HN PY AL AD BA CY MC ME SM VA FJ KI MH FM NR PW WS SB TO TV BH EG KW MU OM QA SA SC ZA SZ AE");
  const KR_ETA_EXEMPT = S("AU AT BE CA DK FI FR DE HK IT JP MO NL NZ NO PL SG ES SE TW GB US");
  const KR_TRANSIT_EXCLUDED = S("SY SD IR CU XK PS AF IQ NG GH YE GM SN BD KG PK SO UZ NP CM LK MM EG");
  const KR_ETA = "https://www.k-eta.go.kr/";

  const KR = {
    id: "KR", name: "South Korea", flag: "🇰🇷", verified: "2026-11-21",
    links: [
      ["Official K-ETA", KR_ETA],
      ["Korea Visa Portal", "https://www.visa.go.kr/"],
      ["e-Arrival card", "https://www.e-arrivalcard.go.kr/"]
    ],
    evaluate(nat, ctx) {
      const p = ctx.purpose;
      if (nat === "KR") return { status: "citizen", summary: "Travel on your Korean passport." };
      if (has(ctx, "pr:KR")) return { status: "resident", summary: "Return on your Korean residence card (ARC).", checklist: [item("Residence card", "Valid, with re-entry rights."), common.passport()] };
      if (p === "study") return { status: "permit", summary: "Degree study needs a D-2 student visa (language courses: D-4). Stays over 90 days need an Alien Registration Card.", auth: { name: "D-2 student visa", fee: "Varies by nationality (US$30 to 130 single entry)", time: "Apply at a Korean mission", url: "https://www.visa.go.kr/" }, checklist: [item("Certificate of Admission", "From your Korean university."), item("Proof of funds", ""), common.passport("Valid more than 6 months."), common.photo()] };
      if (p === "work") return { status: "permit", summary: "Work needs a work visa sponsored by your employer, such as E-7 (professionals) or E-2 (language teachers, with a Visa Issuance Confirmation Number).", auth: { name: "Work visa (E-7, E-2 etc.)", fee: "Varies by nationality", time: "Employer usually starts the process", url: "https://www.visa.go.kr/" }, checklist: [item("Employment contract", ""), item("Visa Issuance Confirmation Number", "If your employer obtains one."), item("Degree certificates", ""), common.passport("Valid more than 6 months."), common.photo()] };
      if (has(ctx, "visa:KR")) return { status: "resident", summary: "Use your valid Korean visa.", checklist: [item("Valid Korean visa", "")] };
      const stay = KR_STAY[nat] || (KR_90.has(nat) ? "90 days" : KR_30.has(nat) ? "30 days" : null);
      if (stay) {
        if (KR_ETA_EXEMPT.has(nat)) return {
          status: "free", stay, summary: "No visa needed, and your nationality is temporarily exempt from K-ETA. Fill in the e-Arrival card before you land.",
          checklist: lightChecklist({ purpose: p, extra: [item("e-Arrival card", "Up to 3 days before arrival.", "https://www.e-arrivalcard.go.kr/")] }),
          warn: ["The K-ETA exemption runs until 31 December 2026. Trips from 2027 may need a K-ETA: check k-eta.go.kr."],
          notes: ["You can still apply for a K-ETA (KRW 10,000) to skip the arrival card."]
        };
        return {
          status: "eta", stay,
          auth: { name: "K-ETA", fee: "KRW 10,000", time: "Usually within 72 hours", url: KR_ETA },
          summary: p === "transit" ? "Transfer passengers staying airside don't need a K-ETA. To enter Korea you need one." : "Visa free, but you need a K-ETA before boarding.",
          checklist: lightChecklist({ purpose: p, auth: item("Approved K-ETA", "Valid 3 years. Children 17 and under and adults 65+ are exempt.", KR_ETA) }),
          notes: ["Only use k-eta.go.kr or the official app. Unofficial sites charge far more."]
        };
      }
      if (p === "transit") {
        const third = !KR_TRANSIT_EXCLUDED.has(nat) && has(ctx, "visa:US", "visa:CA", "visa:AU", "visa:NZ", "visa:SCHENGEN", "pr:US", "pr:CA", "pr:AU", "pr:NZ", "pr:EU");
        if (third) return { status: "free", stay: "Up to 30 days", summary: "You can enter Korea visa-free for up to 30 days when travelling to or from the country that issued your US, Canada, Australia, NZ or European visa or residence.", checklist: [common.passport(), item("Onward ticket", "Leaving within 30 days."), item("Your valid visa or residence permit", "European visas must be stickers in the passport.")], warn: ["Round trips from your home country via Korea don't qualify."] };
        return { status: "check", summary: "Airside transfer usually needs no visa, but we couldn't confirm it for your nationality. Leaving the airport needs a visa.", checklist: [common.passport()] };
      }
      return {
        status: "visa",
        auth: { name: "Short-term visit visa (C-3)", fee: "Varies by nationality", time: "Apply at a Korean mission or visa centre", url: "https://www.visa.go.kr/" },
        summary: "You need a visa before you travel." + (!KR_TRANSIT_EXCLUDED.has(nat) ? " If you're travelling via Korea to or from the US, Canada, Australia, NZ or Europe with a visa from there, you may enter for 30 days without one." : ""),
        checklist: visitorChecklist({ purpose: p, passport: "Valid more than 6 months.", form: item("Visa application form", "", "https://www.visa.go.kr/") })
      };
    }
  };

  // =====================================================================
  // CHINA (mainland)
  // Sources (checked 2026-11-21):
  //  https://en.nia.gov.cn/n147418/n147463/c183390/content.html (unilateral 30-day visa-free list)
  //  https://www.fmprc.gov.cn/eng/xw/fyrbt/fyrbt/202602/t20260215_11860467.html (policy until 31 Dec 2026)
  //  https://cs.mfa.gov.cn/lh/lhqz_149493/list/202607/t20260713_11981384.html (mutual visa exemption agreements)
  //  https://en.nia.gov.cn/n147418/n147463/c183412/content.html (240-hour visa-free transit, 24-hour direct transit)
  //  https://chicago.china-consulate.gov.cn/eng/zytz_0/202512/t20251204_11767048.htm (online arrival card)
  //  https://en.nia.gov.cn/n147423/n147478/n147715/c158241/content.html (accommodation registration)
  // =====================================================================
  const CN_UNILATERAL = S("AD AT BE BG HR CY DK EE FI FR DE GR HU IS IE IT LV LI LU MT MC ME NL MK NO PL PT RO SK SI ES SE CH GB AU NZ BH BN JP KW OM KR SA AR BR CA CL PE UY");
  const CN_MUTUAL = S("AL AG AM AZ BS BB BY BA DM FJ GE GD KZ MY MV MU QA SM RS SC SG SB SR TH TO AE UZ WS");
  const CN_240 = S("AL AT BY BE BA BG HR CY CZ DK EE FI FR DE GR HU IS IE IT LV LT LU MT MC ME NL MK NO PL PT RO RU RS SK SI ES SE CH UA GB US CA AR BR CL MX AU NZ BN ID JP KG QA SG KR AE VN");
  const CN_ARRIVAL = item("Online arrival card", "Fill in online, in the NIA 12367 app, or on paper at the border.", "https://s.nia.gov.cn/ArrivalCardFillingPC/");
  const CN_REG = item("Accommodation registration", "Hotels do it for you. Elsewhere, register at the local police station within 24 hours.");

  const CN = {
    id: "CN", name: "China", flag: "🇨🇳", verified: "2026-11-21",
    links: [
      ["Visa-free policies (NIA)", "https://en.nia.gov.cn/n147418/n147463/c183390/content.html"],
      ["240-hour visa-free transit (NIA)", "https://en.nia.gov.cn/n147418/n147463/c183412/content.html"],
      ["China Online Visa Application", "http://consular.mfa.gov.cn/VISA/"]
    ],
    evaluate(nat, ctx) {
      const p = ctx.purpose;
      const passport = "Valid more than 6 months, with blank visa pages.";
      if (nat === "CN") return { status: "citizen", summary: "Travel on your Chinese passport." };
      if (nat === "HK" || nat === "MO" || nat === "TW") return { status: "check", summary: "Residents of Hong Kong, Macao and Taiwan travel to the mainland on special permits, not visas. We haven't verified these rules yet.", checklist: [] };
      if (p === "study" || p === "work") return {
        status: "permit", summary: p === "study" ? "Study over 180 days needs an X1 visa (up to 180 days: X2), with a JW201/JW202 form and admission letter." : "Work needs a Z visa, with a Notice of Work Permit arranged by your employer.",
        auth: { name: p === "study" ? "X1 / X2 student visa" : "Z work visa", fee: "Set by the consulate", time: "Apply through the online system, then visit the consulate", url: "http://consular.mfa.gov.cn/VISA/" },
        checklist: [item(p === "study" ? "JW201 or JW202 form + admission letter" : "Notice of Work Permit", ""), common.passport(passport), common.photo(), CN_ARRIVAL]
      };
      if (p === "transit" && CN_240.has(nat)) return { status: "free", stay: "Up to 240 hours (10 days)", summary: "You can use 240-hour visa-free transit when travelling to a third country through an eligible port.", checklist: [common.passport(passport), item("Confirmed onward ticket to a third country", "Within 240 hours."), CN_ARRIVAL, CN_REG], warn: ["Stay within the permitted provinces. Visa-free transit can't be used for work, study or journalism."] };
      if (p === "transit") return { status: "free", summary: "You can transit without a visa for up to 24 hours if you stay in the airport's restricted area. Leaving the airport needs a visa.", checklist: [common.passport(passport), item("Confirmed onward ticket", "Within 24 hours.")] };
      if (nat === "EC") return { status: "check", summary: "Ecuador has a mutual visa exemption agreement, but the official list carries a caveat for it. Check with the Chinese embassy.", checklist: [common.passport(passport)] };
      if (CN_UNILATERAL.has(nat) || CN_MUTUAL.has(nat) || nat === "RU") return {
        status: "free", stay: "Up to 30 days",
        summary: "No visa needed for tourism, business, visiting family or friends, or exchanges.",
        checklist: lightChecklist({ purpose: p, passport, extra: [CN_ARRIVAL, CN_REG] }),
        warn: CN_UNILATERAL.has(nat) ? ["This visa-free policy is set to run until 31 December 2026. Check for an extension if you travel later."] : nat === "RU" ? ["Russia's visa-free entry runs until 31 December 2027."] : []
      };
      return {
        status: "visa",
        auth: { name: p === "business" ? "M business visa" : "L tourist visa", fee: "Set by the consulate", time: "About 4 working days after submission", url: "http://consular.mfa.gov.cn/VISA/" },
        summary: "You need a visa. Fill in the form on the China Online Visa Application system, then submit your passport in person at the consulate or visa centre." + (CN_240.has(nat) ? " If you're passing through to a third country, 240-hour visa-free transit may apply." : ""),
        checklist: visitorChecklist({ purpose: p, passport, form: item("Online visa application (COVA)", "", "http://consular.mfa.gov.cn/VISA/"), extra: [CN_ARRIVAL, CN_REG] }),
        notes: ["China has no eVisa: the online system only replaces the paper form."]
      };
    }
  };

  // =====================================================================
  // SAUDI ARABIA
  // Sources (checked 2026-11-21):
  //  https://visa.visitsaudi.com (eVisa eligible countries)
  //  https://cdn.mt.gov.sa/mtportal/mt-fe-production/content/policies-regulations/documents/tourism-regulations/Tourist-Visa-Regulations-En-V012.pdf
  //  https://my.gov.sa/en/content/tourism (visa on arrival; US/UK/Schengen visa holders; transit visa)
  //  https://www.spa.gov.sa/en/65dafa3c62v (US/UK permanent residents, EU residents)
  //  https://www.mofa.gov.sa/en/eservices (work and study visas)
  // GCC citizen entry could not be confirmed on an official page, so GCC citizens return "check".
  // =====================================================================
  const SA_EVISA_LIST = S("BS BB CA GD PA KN US AL AD AT BE BG HR CY CZ DK EE FI FR GE DE GR NL HU IS IE IT LV LI LT LU MT MC ME NO PL PT RO RU SM SK SI ES SE CH UA GB AZ BN CN HK MO JP KZ KG MY MV SG KR TJ TH TR UZ MU SC ZA AU NZ");
  const SA_EV = "https://visa.visitsaudi.com/";

  const SA = {
    id: "SA", name: "Saudi Arabia", flag: "🇸🇦", verified: "2026-11-21",
    links: [
      ["Saudi tourist eVisa (official)", SA_EV],
      ["Visas and tourism (my.gov.sa)", "https://my.gov.sa/en/content/tourism"],
      ["MOFA e-services", "https://www.mofa.gov.sa/en/eservices"]
    ],
    evaluate(nat, ctx) {
      const p = ctx.purpose;
      const passport = "Valid at least 6 months.";
      if (nat === "SA") return { status: "citizen", summary: "Travel on your Saudi passport or ID." };
      if (GCC.has(nat)) return { status: "check", summary: "GCC citizens normally travel to Saudi Arabia without a visa, but we couldn't confirm the current rule on an official page.", checklist: [item("Passport or GCC national ID", "")] };
      if (p === "study" || p === "work") return {
        status: "permit", summary: p === "work" ? "Your Saudi employer requests a work visa through MOFA, then you apply through a Saudi mission (Enjaz)." : "Your Saudi school or university requests a study visa through MOFA. The tourist eVisa can't be used for study.",
        auth: { name: p === "work" ? "Work visa" : "Study visa", fee: "Varies", time: "Employer or school starts the process", url: "https://www.mofa.gov.sa/en/eservices" },
        checklist: [item(p === "work" ? "Employment contract and visa authorisation" : "Admission and visa request from your school", ""), item("Medical examination", "If required."), common.passport(passport), common.photo()]
      };
      const eligibleBy = SA_EVISA_LIST.has(nat) ? "nat" : has(ctx, "pr:US", "pr:GB", "pr:EU") ? "pr" : has(ctx, "visa:US", "visa:GB", "visa:SCHENGEN") ? "visa" : has(ctx, "pr:AE") ? "gcc" : null;
      if (eligibleBy) return {
        status: "evisa", stay: "Up to 90 days (1-year multiple-entry visa)",
        auth: { name: "Tourist eVisa", fee: "SAR 300 + mandatory medical insurance", time: "Apply online before travel", url: SA_EV },
        summary: (eligibleBy === "nat" ? "Your nationality can get a tourist eVisa online, or the same visa on arrival." : eligibleBy === "pr" ? "As a US/UK permanent resident or EU resident you can apply for the tourist eVisa." : eligibleBy === "visa" ? "Because you hold a valid US, UK or Schengen visa, you can get the tourist visa online or on arrival." : "GCC residents can apply for the tourist eVisa, subject to conditions.") + (p === "transit" ? " A transit visa through MOFA is also available." : ""),
        checklist: lightChecklist({ purpose: p, passport, auth: item("Approved eVisa", "Includes mandatory medical insurance.", SA_EV), extra: eligibleBy === "visa" ? [item("Your US, UK or Schengen visa", "Tourist or business, valid, and used at least once to enter that country.")] : [] }),
        warn: [...(eligibleBy === "gcc" ? ["We couldn't confirm the minimum residence validity or excluded occupations for GCC residents. Check before applying."] : []), "Tourist visas don't allow work or Hajj, or Umrah in Hajj season."],
        notes: ["Umrah is allowed on the tourist eVisa outside Hajj season (book through Nusuk)."]
      };
      if (p === "transit") return { status: "visa", auth: { name: "Transit visa", fee: "Varies", time: "Issued within 48 to 96 hours", url: "https://my.gov.sa/en/content/tourism" }, summary: "Leaving the airport needs a transit visa, applied for online through MOFA (Enjaz).", checklist: [common.passport(passport), item("Onward ticket", "")] };
      return {
        status: "visa",
        auth: { name: "Visit visa (MOFA)", fee: "Varies", time: "Varies", url: "https://www.mofa.gov.sa/en/eservices" },
        summary: "Your nationality isn't on the tourist eVisa list. You need a visit visa through a Saudi mission (Enjaz), unless you hold a US, UK or Schengen visa or US/UK/EU residence (add it above).",
        checklist: visitorChecklist({ purpose: p, passport, insurance: "Mandatory medical insurance." })
      };
    }
  };

  // =====================================================================
  // BRAZIL
  // Sources (checked 2026-11-22):
  //  https://cop30.br/pt-br/servicos-da-cop30/visto/2025-04_quadrogeral-regime-de-vistos_pt.pdf/@@download/file (MRE QGRV, 8 Apr 2025)
  //  https://www2.camara.leg.br/legin/fed/decret/2026/decreto-12864-2-marco-2026-798769-publicacaooriginal-178286-pe.html (Brazil-EU: 90/180 from 1 Mar 2026, not IE)
  //  https://concordia.itamaraty.gov.br/acordo/13219?TipoAcordo=BL&amp=&tipoPesquisa=2 (China: 30 days, 11 May to 31 Dec 2026)
  //  https://agenciagov.ebc.com.br/noticias/202504/brasil-comeca-a-exigir-visto-para-cidadaos-dos-eua-canada-e-australia (US/CA/AU eVisa, US$80.90)
  //  https://planalto.gov.br/ccivil_03/_ato2015-2018/2017/decreto/d9199.htm (90 days, extendable to 180 per year; airside transit)
  //  https://www.gov.br/saude/pt-br/vacinacao/viajantes (no vaccination proof required to enter)
  // The newer QGRV (7 Oct 2026) could not be read. Japan's exemption ended 30 Sep 2026 and its extension
  // could not be confirmed officially, so JP returns "check". Nationalities on neither list return "check".
  // =====================================================================
  const BR_ID = S("AR BO CL CO EC PY PE UY VE"); // may enter with national ID card
  const BR_90_180 = union(S("AL DM GE ME MK SC CH UA"), new Set([...EU].filter((c) => c !== "IE"))); // EU deal excludes Ireland
  const BR_90 = S("ZA AD AG AM BS BB BY BZ BA BW QA KR CR SV AE FJ PH GD GT GY HN HK IS IL JM LI MO MY MA MX MD MC MN NA NI NO NZ PA GB RU SM LC KN VC RS SR TH TT TN TR VA AR BO CL CO EC PY PE UY IE");
  const BR_60 = S("DO VE");
  const BR_30 = S("KZ ID SG CN");
  const BR_EVISA = S("US CA AU");
  const BR_VISA = S("AF AO SA DZ AZ BH BD BJ BN BF BI BT CV KH CM TD KM CG CD KP CI CU DJ EG ER ET GA GM GH GN GW GQ HT YE IN IR IQ JO KI KW LA LS LB LR LY MG MW MV ML MH MU MR FM MZ MM NR NP NE NG OM PW PS PG PK KE KG CF RW SB WS ST SN SL SY SO LK SZ SD SS TJ TZ TL TG TO TM TV UG UZ VU VN ZM ZW XK TW");
  const BR_EV_URL = "https://brazil.vfsevisa.com/";
  const BR_FORM = "https://formulario-mre.serpro.gov.br";

  const BR = {
    id: "BR", name: "Brazil", flag: "🇧🇷", verified: "2026-11-22",
    links: [
      ["Visa regime table (MRE)", "https://www.gov.br/mre/pt-br/assuntos/portal-consular/vistos"],
      ["Brazil eVisa (official, US/CA/AU)", BR_EV_URL],
      ["Get a visa to travel to Brazil (gov.br)", "https://www.gov.br/pt-br/servicos/obter-visto-para-viajar-ao-brasil"]
    ],
    evaluate(nat, ctx) {
      const p = ctx.purpose;
      const passport = "Valid for your whole stay.";
      if (nat === "BR") return { status: "citizen", summary: "Travel on your Brazilian passport or ID." };
      if (p === "study" || p === "work") return {
        status: "permit",
        summary: p === "study" ? "Study needs a temporary visa for study (VITEM IV) from a Brazilian consulate. After arrival you register with the Federal Police." : "Paid work needs a temporary work visa (VITEM V), normally after your employer gets authorisation. Visitors may not do paid work.",
        auth: { name: p === "study" ? "VITEM IV (study)" : "VITEM V (work)", fee: "Set by the consulate", time: "Apply through the consulate for where you live", url: BR_FORM },
        checklist: [item(p === "study" ? "Enrolment or acceptance letter from a Brazilian institution" : "Employment contract and work authorisation", ""), item("Online visa application form", "", BR_FORM), common.passport(passport), common.photo(), item("Register with the Federal Police after arrival", "")]
      };
      if (p === "transit") return {
        status: "free",
        summary: "No visa needed to change planes if you stay in the international transit area. Leaving the airport needs whatever visa your nationality needs to visit.",
        checklist: [common.passport(passport), item("Onward boarding pass", "Stay airside.")],
        ...(BR_VISA.has(nat) || BR_EVISA.has(nat) ? { warn: ["Since August 2024, travellers who need a visa and arrive in transit without one are not admitted to Brazil and must continue their journey."] } : {})
      };
      const freeStay = BR_90_180.has(nat) ? "Up to 90 days in any 180" : BR_90.has(nat) ? "Up to 90 days (extendable to 180 a year)" : BR_60.has(nat) ? "Up to 60 days" : BR_30.has(nat) ? "Up to 30 days" : null;
      if (freeStay) return {
        status: "free", stay: freeStay,
        summary: (nat === "CN" ? "No visa needed for up to 30 days (not extendable) under a temporary arrangement for 11 May to 31 December 2026." : "No visa needed for tourism or business visits.") + (BR_ID.has(nat) ? " You can enter with your national ID card instead of a passport." : ""),
        checklist: lightChecklist({ purpose: p, passport: BR_ID.has(nat) ? "Passport or national ID card, valid for your stay." : passport }),
        ...(nat === "CN" ? { warn: ["The visa exemption for Chinese citizens ends on 31 December 2026 unless renewed. Check before booking trips after that date."] } : {}),
        notes: ["Visitors may not do paid work.", "Yellow fever vaccination is recommended for some regions but not required to enter."]
      };
      if (nat === "JP") return {
        status: "check",
        summary: "Japan's visa exemption for Brazil ran until 30 September 2026. An extension has been reported, but we couldn't confirm it on an official Brazilian page. Check with the Brazilian consulate before you travel.",
        checklist: [common.passport(passport)],
        links: [["Brazilian consulates and visas (MRE)", "https://www.gov.br/mre/pt-br/assuntos/portal-consular/vistos"]]
      };
      if (BR_EVISA.has(nat)) return {
        status: "evisa", stay: "Up to 90 days per visit",
        auth: { name: "Brazil eVisa (visitor)", fee: "US$80.90", time: "Apply online before travel", url: BR_EV_URL },
        summary: "Since 10 April 2025 your nationality needs a visitor visa. Apply online for the eVisa before you travel (air, land or sea).",
        checklist: lightChecklist({ purpose: p, passport, auth: item("Approved eVisa", "US$80.90. Print or save it to show at check-in and the border.", BR_EV_URL), extra: [common.photo("Digital photo for the online form.")] }),
        notes: ["Only use the official eVisa site linked here. Other sites charge extra."]
      };
      if (BR_VISA.has(nat)) return {
        status: "visa", stay: "Up to 90 days",
        auth: { name: "Visitor visa (VIVIS)", fee: "Set by the consulate", time: "Apply through the consulate for where you live", url: BR_FORM },
        summary: "You need a visitor visa (VIVIS) from a Brazilian consulate before you travel. Holding a US, UK or Schengen visa or residence doesn't change this.",
        checklist: visitorChecklist({ purpose: p, passport, form: item("Online visa application form", "Then submit it to the consulate.", BR_FORM) })
      };
      return { status: "check", summary: "We couldn't confirm your nationality on Brazil's official visa table. Check with the Brazilian consulate.", checklist: [common.passport(passport)], links: [["Visa regime table (MRE)", "https://www.gov.br/mre/pt-br/assuntos/portal-consular/vistos"]] };
    }
  };

  // ---------- Engine ----------
  const DESTINATIONS = [US, CA, GB, FR, DE, IT, ES, NL, PT, GR, CH, AU, JP, AE, MX, BH, IN, TH, IE, NZ, TR, SG, KR, CN, SA,
    BR, AT, BE, CZ, PL, HU, HR, DK, SE, NO,
    FI, IS, MT, LU, SI, SK, EE, LV, LT, RO];

  function evaluateTrip({ nationalities, destination, purpose, docs }) {
    const dest = DESTINATIONS.find((d) => d.id === destination);
    const ctx = { purpose, docs: new Set(docs || []) };
    const perPassport = nationalities.map((n) => {
      const r = dest.evaluate(n, ctx);
      return { nationality: n, ...r, meta: STATUS[r.status] };
    });
    perPassport.sort((a, b) => a.meta.rank - b.meta.rank);
    return { dest, best: perPassport[0], perPassport };
  }

  window.VISA = { DESTINATIONS, DOCS, STATUS, evaluateTrip, LAST_VERIFIED: "November 2026" };
})();
