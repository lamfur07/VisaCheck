/* VisaCheck rules data and engine.
 * Every rule here was checked against an official source in November 2026.
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
    id: "US", name: "United States", flag: "🇺🇸",
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
    id: "CA", name: "Canada", flag: "🇨🇦",
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
    id: "GB", name: "United Kingdom", flag: "🇬🇧",
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

  function schengen(id, name, flag, portal, longStay) {
    return {
      id, name, flag, schengen: true,
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
        if (has(ctx, "visa:SCHENGEN")) return { status: "resident", stay: "As shown on your visa", summary: "Use your valid Schengen visa. Check its dates, entries and days allowed.", checklist: [item("Valid Schengen visa", "Count your days: 90 in any 180.")] };
        if (SCH_EXEMPT.has(nat)) {
          const warn = SCH_BIOMETRIC.has(nat) ? ["Visa-free travel only applies to biometric passports."] : [];
          if (nat === "HK") warn.push("Hong Kong SAR passport required.");
          if (nat === "MO") warn.push("Macao SAR passport required.");
          if (nat === "TW") warn.push("Taiwan passport must include your ID card number.");
          return {
            status: "free", stay: "90 days in any 180 (whole Schengen Area)",
            summary: p === "transit" ? "No visa needed to transit." : "No visa needed for short stays. Your fingerprints and photo are recorded at the border under the EU Entry/Exit System (EES).",
            checklist: lightChecklist({ purpose: p, passport: "Issued in the last 10 years and valid 3+ months after you leave the Schengen Area." }),
            warn,
            notes: ["ETIAS is not in operation yet and nothing can be applied for. Ignore sites asking for payment.", "Days spent anywhere in the 29 Schengen countries count towards the 90."]
          };
        }
        if (p === "transit") {
          const atvExempt = has(ctx, "visa:US", "visa:CA", "visa:JP", "pr:US", "pr:CA", "pr:JP", "pr:EU");
          if (SCH_ATV.has(nat) && !atvExempt) return {
            status: "visa",
            auth: { name: "Airport transit visa (Type A)", fee: "€90", time: "Apply at least 15 days ahead", url: portal },
            summary: "Your nationality needs an airport transit visa even to change planes, unless you hold a valid US, Canada or Japan visa or residence, or an EU/EEA residence permit.",
            checklist: [common.passport(), item("Onward ticket and visa for final destination", ""), common.photo()],
            notes: ["Some Schengen states add extra nationalities to this list. Check the airport's country."]
          };
          return { status: "free", summary: "You can change planes airside without a Schengen visa. Leaving the airport needs a short-stay visa.", checklist: [common.passport(), item("Onward boarding pass", "Stay in the international transit area.")], notes: ["Some Schengen states require airport transit visas for extra nationalities. Check the transit country's site."] };
        }
        return {
          status: "visa", stay: "Up to 90 days in any 180",
          auth: { name: "Schengen short-stay visa (Type C)", fee: "€90 (children 6 to 11: €45)", time: "Usually 15 days; apply up to 6 months before", url: portal },
          summary: `You need a Schengen visa. Apply to ${name} if it's your main destination (longest stay) or first entry if stays are equal.`,
          checklist: visitorChecklist({ purpose: p,
            passport: "Issued in the last 10 years, valid 3+ months after you leave, with 2 blank pages.",
            form: item("Schengen visa application form", "Signed. Many countries use an online form.", portal),
            insurance: "Mandatory: at least €30,000 medical cover valid in all Schengen countries.",
            extra: [item("Biometrics appointment", "Fingerprints at the consulate or visa centre (reused for 5 years)."), item("Day-by-day itinerary", "Especially if visiting several countries.")] }),
          notes: ["One Schengen visa covers all 29 Schengen countries."]
        };
      }
    };
  }
  function schLong(name, portal, longStay, p) {
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

  // =====================================================================
  // AUSTRALIA
  // =====================================================================
  const AU_ETA = S("US CA JP SG MY KR BN HK TW AD AT BE DK FI FR DE GR IS IE IT LI LU MT MC NO PT SM ES SE CH NL VA GB");
  const AU_EVISITOR = S("BG HR CY CZ EE HU LV LT PL RO SK SI AD AT BE DK FI FR DE GR IS IE IT LI LU MT MC NO PT SM ES SE CH NL VA GB");

  const AU = {
    id: "AU", name: "Australia", flag: "🇦🇺",
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
    id: "JP", name: "Japan", flag: "🇯🇵",
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
    id: "AE", name: "United Arab Emirates", flag: "🇦🇪",
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
    id: "MX", name: "Mexico", flag: "🇲🇽",
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

  // ---------- Engine ----------
  const DESTINATIONS = [US, CA, GB, FR, DE, IT, ES, NL, PT, GR, CH, AU, JP, AE, MX];

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
