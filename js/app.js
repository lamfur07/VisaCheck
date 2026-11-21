(function () {
  "use strict";
  const { DESTINATIONS, DOCS, STATUS, evaluateTrip, LAST_VERIFIED } = window.VISA;
  const API = window.VISA_API;
  const CFG = window.VISACHECK_CONFIG || {};
  const $ = (s, root = document) => root.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const name = (c) => window.COUNTRY_NAME[c] || c;
  const flag = (c) => window.flagOf(c);
  const VERIFIED = new Set(DESTINATIONS.map((d) => d.id));
  const MAX_PASSPORTS = 5;

  const PURPOSES = [
    ["tourism", "🏖️", "Tourism"],
    ["business", "💼", "Business"],
    ["transit", "🔁", "Transit"],
    ["study", "🎓", "Study"],
    ["work", "🛠️", "Work"]
  ];
  const PILLARS = [
    ["identity", "🛂", "Identity & eligibility", "Proof of who you are and your right to travel"],
    ["funds", "💰", "Financial stability", "Proof you can pay for the trip"],
    ["purpose", "✈️", "Purpose & intent to return", "Why you're going and that you'll leave"],
    ["health", "🏥", "Health & security", "Insurance, medical and vaccination checks"],
    ["filing", "📝", "Filing & authorisation", "Forms, fees, appointments and approvals"]
  ];

  const state = { nats: [], dest: null, purpose: "tourism", docs: new Set() };
  let runId = 0;
  let inflight = null;

  // ---------- Safe storage ----------
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* unavailable */ } }
  };

  // ---------- Theme ----------
  $("#themeBtn").addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("vc-theme", next); } catch { /* ignore */ }
  });

  // ---------- Generic searchable picker ----------
  function makePicker({ input, list, wrap, source, onPick, badge }) {
    let active = 0, opts = [];
    const render = () => {
      const q = input.value.trim().toLowerCase();
      opts = source()
        .filter(([c, n]) => !q || n.toLowerCase().includes(q) || c.toLowerCase() === q)
        .sort((a, b) => {
          const as = a[1].toLowerCase().startsWith(q), bs = b[1].toLowerCase().startsWith(q);
          return as === bs ? a[1].localeCompare(b[1]) : as ? -1 : 1;
        })
        .slice(0, 80);
      active = Math.min(active, Math.max(opts.length - 1, 0));
      list.innerHTML = opts.length
        ? opts.map(([c, n], i) => `<li role="option" id="${list.id}-${c}" data-code="${c}" aria-selected="${i === active}"><span aria-hidden="true">${flag(c)}</span>${esc(n)}${badge && badge(c) ? `<span class="vbadge">${badge(c)}</span>` : ""}</li>`).join("")
        : `<li class="empty" role="option" aria-disabled="true">No country matches “${esc(input.value)}”</li>`;
      list.hidden = false;
      input.setAttribute("aria-expanded", "true");
      if (opts[active]) input.setAttribute("aria-activedescendant", `${list.id}-${opts[active][0]}`);
      const sel = list.querySelector('[aria-selected="true"]');
      if (sel && sel.scrollIntoView) sel.scrollIntoView({ block: "nearest" });
    };
    const close = () => { list.hidden = true; input.setAttribute("aria-expanded", "false"); input.removeAttribute("aria-activedescendant"); };
    input.addEventListener("focus", () => { if (wrap.classList.contains("has-value")) input.select(); render(); });
    input.addEventListener("input", () => { active = 0; wrap.classList.remove("has-value"); render(); });
    input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); active = Math.min(active + 1, opts.length - 1); render(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); active = Math.max(active - 1, 0); render(); }
      else if (e.key === "Enter") { e.preventDefault(); if (!list.hidden && opts[active]) { onPick(opts[active][0]); close(); } }
      else if (e.key === "Escape" || e.key === "Tab") close();
    });
    list.addEventListener("mousedown", (e) => {
      const li = e.target.closest("li[data-code]");
      if (li) { e.preventDefault(); onPick(li.dataset.code); close(); }
    });
    document.addEventListener("click", (e) => { if (!wrap.contains(e.target)) close(); });
    return { close };
  }

  // ---------- Step 1: nationalities ----------
  const natInput = $("#natInput");
  makePicker({
    input: natInput, list: $("#natList"), wrap: $("#natPicker"),
    source: () => window.COUNTRIES.filter(([c]) => !state.nats.includes(c)),
    onPick: (c) => {
      if (state.nats.length >= MAX_PASSPORTS) return showError(`You can add up to ${MAX_PASSPORTS} passports.`);
      if (!state.nats.includes(c)) state.nats.push(c);
      natInput.value = "";
      renderNats(); clearError();
    }
  });
  natInput.addEventListener("keydown", (e) => {
    if (e.key === "Backspace" && !natInput.value && state.nats.length) { state.nats.pop(); renderNats(); }
  });
  function renderNats() {
    $("#natChips").innerHTML = state.nats.map((c, i) =>
      `<span class="chip">${flag(c)} ${esc(name(c))}${i === 0 && state.nats.length > 1 ? " <small>main</small>" : ""}<button type="button" data-rm="${c}" aria-label="Remove ${esc(name(c))}">✕</button></span>`).join("");
    natInput.placeholder = state.nats.length ? "Add another nationality (optional)" : "Search your country, e.g. India";
  }
  $("#natChips").addEventListener("click", (e) => {
    const b = e.target.closest("[data-rm]");
    if (b) { state.nats = state.nats.filter((x) => x !== b.dataset.rm); renderNats(); natInput.focus(); }
  });

  // ---------- Step 2: destination ----------
  const destInput = $("#destInput");
  makePicker({
    input: destInput, list: $("#destList"), wrap: $("#destPicker"),
    source: () => window.COUNTRIES,
    badge: (c) => (VERIFIED.has(c) ? "Verified" : ""),
    onPick: (c) => { setDest(c); clearError(); }
  });
  function setDest(c) {
    state.dest = c;
    destInput.value = c ? `${flag(c)}  ${name(c)}` : "";
    $("#destPicker").classList.toggle("has-value", !!c);
    renderQuick();
  }
  // If the user types but doesn't pick, restore the chosen destination on blur.
  destInput.addEventListener("blur", () => setTimeout(() => {
    if (!$("#destPicker").classList.contains("has-value")) setDest(state.dest);
  }, 150));
  function renderQuick() {
    $("#destQuick").innerHTML = DESTINATIONS.map((d) =>
      `<button type="button" class="qchip" data-dest="${d.id}" aria-pressed="${state.dest === d.id}">${d.flag} ${esc(d.name)}</button>`).join("");
  }
  $("#destQuick").addEventListener("click", (e) => {
    const b = e.target.closest("[data-dest]");
    if (b) { setDest(b.dataset.dest); clearError(); }
  });

  // ---------- Step 3: purpose ----------
  function renderPurpose() {
    $("#purposeGroup").innerHTML = PURPOSES.map(([id, icon, label]) =>
      `<button type="button" class="seg" role="radio" aria-checked="${state.purpose === id}" tabindex="${state.purpose === id ? 0 : -1}" data-p="${id}"><span aria-hidden="true">${icon}</span>${label}</button>`).join("");
  }
  $("#purposeGroup").addEventListener("click", (e) => {
    const b = e.target.closest("[data-p]");
    if (b) { state.purpose = b.dataset.p; renderPurpose(); $(`[data-p="${state.purpose}"]`).focus(); }
  });
  $("#purposeGroup").addEventListener("keydown", (e) => {
    if (!["ArrowRight", "ArrowLeft"].includes(e.key)) return;
    e.preventDefault();
    const i = PURPOSES.findIndex(([id]) => id === state.purpose);
    const n = (i + (e.key === "ArrowRight" ? 1 : -1) + PURPOSES.length) % PURPOSES.length;
    state.purpose = PURPOSES[n][0]; renderPurpose(); $(`[data-p="${state.purpose}"]`).focus();
  });

  // ---------- Step 4: documents ----------
  function renderDocs() {
    const box = (arr) => arr.map(([k, label]) =>
      `<label class="check"><input type="checkbox" value="${k}" ${state.docs.has(k) ? "checked" : ""}/><span>${esc(label)}</span></label>`).join("");
    $("#prList").innerHTML = box(DOCS.residence);
    $("#visaList").innerHTML = box(DOCS.visas);
    if (state.docs.size) $("#docsBox").open = true;
    renderDocsCount();
  }
  function renderDocsCount() { $("#docsCount").textContent = state.docs.size ? `${state.docs.size} selected` : ""; }
  $("#docsBox").addEventListener("change", (e) => {
    if (e.target.type !== "checkbox") return;
    e.target.checked ? state.docs.add(e.target.value) : state.docs.delete(e.target.value);
    renderDocsCount();
  });

  // ---------- Errors ----------
  function showError(m) { $("#formError").textContent = m; }
  function clearError() { $("#formError").textContent = ""; }

  // ---------- URL state (shareable) ----------
  const validDocs = new Set([...DOCS.residence, ...DOCS.visas].map(([k]) => k));
  function toHash() {
    const p = new URLSearchParams();
    p.set("n", state.nats.join(","));
    p.set("d", state.dest);
    p.set("p", state.purpose);
    if (state.docs.size) p.set("doc", [...state.docs].join(","));
    try { history.replaceState(null, "", "#" + p.toString()); } catch { /* sandboxed */ }
  }
  function fromHash() {
    let p;
    try { p = new URLSearchParams(location.hash.slice(1)); } catch { return false; }
    const n = [...new Set((p.get("n") || "").toUpperCase().split(","))].filter((c) => window.COUNTRY_NAME[c]).slice(0, MAX_PASSPORTS);
    if (n.length) state.nats = n;
    const d = (p.get("d") || "").toUpperCase();
    if (window.COUNTRY_NAME[d]) state.dest = d;
    const pu = p.get("p");
    if (PURPOSES.some(([id]) => id === pu)) state.purpose = pu;
    (p.get("doc") || "").split(",").filter((k) => validDocs.has(k)).forEach((k) => state.docs.add(k));
    return !!(state.nats.length && state.dest);
  }

  // ---------- Evaluation ----------
  async function evaluate() {
    const dest = state.dest;
    // Citizens of the destination: done.
    if (state.nats.includes(dest)) {
      const r = { status: "citizen", summary: `You're a citizen of ${name(dest)}. Travel on that passport.` };
      return { destName: name(dest), destFlag: flag(dest), verified: VERIFIED.has(dest), best: { nationality: dest, ...r, meta: STATUS.citizen }, perPassport: [], links: [] };
    }
    if (VERIFIED.has(dest)) {
      const res = evaluateTrip({ nationalities: state.nats, destination: dest, purpose: state.purpose, docs: [...state.docs] });
      return { destName: res.dest.name, destFlag: res.dest.flag, verified: true, best: res.best, perPassport: res.perPassport, links: res.dest.links };
    }
    return evaluateViaApi(dest);
  }

  async function evaluateViaApi(dest) {
    const base = { destName: name(dest), destFlag: flag(dest), verified: false, links: [] };
    const fallbackLinks = [["IATA Travel Centre (airline entry rules)", "https://www.iatatravelcentre.com/"]];
    if (!CFG.apiProxyUrl) {
      const best = {
        nationality: state.nats[0], status: "check", meta: STATUS.check,
        summary: `We don't have verified rules for ${name(dest)} yet. Check the destination's official immigration or embassy website, or the IATA Travel Centre that airlines use.`,
        checklist: [], links: fallbackLinks
      };
      return { ...base, best, perPassport: [] };
    }
    if (inflight) inflight.abort();
    inflight = new AbortController();
    const signal = inflight.signal;
    const settled = await Promise.allSettled(state.nats.map((n) =>
      API.check(n, dest, { signal, purpose: state.purpose, destName: name(dest) }).then((r) => ({ nationality: n, ...r, meta: STATUS[r.status] || STATUS.check }))));
    if (signal.aborted) throw Object.assign(new Error("Cancelled"), { code: "ABORT" });
    const ok = settled.filter((s) => s.status === "fulfilled").map((s) => s.value);
    if (!ok.length) {
      const reason = settled[0] && settled[0].reason;
      throw reason || new Error("Lookup failed");
    }
    ok.sort((a, b) => a.meta.rank - b.meta.rank);
    const best = ok[0];
    if (state.docs.size) (best.notes = best.notes || []).push("Your residence permits or visas may change these rules. We can't verify that for this destination, so ask the embassy.");
    best.links = [...(best.links || []), ...fallbackLinks];
    return { ...base, best, perPassport: ok };
  }

  // ---------- Rendering ----------
  const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
  const safe = (u) => (API.safeUrl(u) ? esc(API.safeUrl(u)) : "");

  function pillarOf(t) {
    const s = t.toLowerCase();
    if (/insurance|medical|tb test|tuberculosis|health|oshc|surcharge|police|vaccin|polio|yellow fever/.test(s)) return "health";
    if (/fund|bank|financ|\bpay\b|salary/.test(s)) return "funds";
    if (/passport|photo|card|residence|green card|status|valid .*visa|visa in your passport|national id|id card/.test(s)) return "identity";
    if (/ticket|accommodation|ties|invitation|itinerary|letter|admission|acceptance|\bcas\b|i-20|job|contract|employment|enrol|degree|qualification|attestation|travel plan|purpose|onward|statement|certificate of eligibility|sponsorship|salary and skill/.test(s)) return "purpose";
    return "filing";
  }

  function headline(r, destName) {
    const a = r.auth && r.auth.name;
    switch (r.status) {
      case "citizen": return `Welcome home to ${destName}`;
      case "resident": return "No visa needed for you";
      case "free": return `No visa needed for ${destName}`;
      case "voa": return "You can get a visa on arrival";
      case "eta": return `Get ${a || "an online travel authorisation"} before you fly`;
      case "evisa": return `Apply for ${a || "an eVisa"} online`;
      case "visa": return `You need ${a || "a visa"}`;
      case "permit": return `You need ${a || "a visa or permit"}`;
      case "banned": return "Entry is restricted for this passport";
      default: return "Confirm with the official source";
    }
  }

  function renderSkeleton() {
    $("#results").innerHTML = `<article class="card skeleton" aria-busy="true"><div class="sk sm"></div><div class="sk lg"></div><div class="sk md"></div><div class="sk md"></div></article>`;
  }

  function renderError(err) {
    const msg = err && err.code === "TIMEOUT" ? "The lookup took too long." : err && err.code === "RATE" ? err.message : "We couldn't load visa data right now.";
    $("#results").innerHTML = `<article class="card verdict tone-red"><div class="verdict-top"><span class="badge"><span class="dot"></span>Something went wrong</span></div>
      <h2>${esc(msg)}</h2><p class="summary">Check your connection and try again. You can also use the IATA Travel Centre, which airlines rely on.</p>
      <div class="cta-row"><button type="button" class="btn-ghost" id="retryBtn">Try again</button><a class="btn-ghost" href="https://www.iatatravelcentre.com/" target="_blank" rel="noopener">IATA Travel Centre ↗</a></div></article>`;
    $("#retryBtn").onclick = run;
  }

  function render(res) {
    const { best, perPassport, destName, destFlag, verified } = res;
    const tone = best.meta.tone;
    const purposeLabel = PURPOSES.find(([id]) => id === state.purpose)[2];
    const multi = perPassport.length > 1;

    const facts = [];
    if (multi) facts.push(["Best passport", `${flag(best.nationality)} ${name(best.nationality)}`]);
    if (best.stay) facts.push(["Maximum stay", best.stay]);
    if (best.auth && best.auth.name) facts.push(["What you need", best.auth.name]);
    if (best.auth && best.auth.fee) facts.push(["Official fee", best.auth.fee]);
    if (best.auth && best.auth.time) facts.push(["Timing", best.auth.time]);
    const applyUrl = best.auth && API.safeUrl(best.auth.url);

    let html = `
    <article class="card verdict tone-${tone}">
      <div class="verdict-top">
        <span class="badge"><span class="dot"></span>${esc(best.meta.label)}</span>
        <span class="route">${flag(best.nationality)} ${esc(name(best.nationality))} → ${destFlag} ${esc(destName)} · ${esc(purposeLabel)}</span>
      </div>
      <h2>${esc(headline(best, destName))}</h2>
      <p class="summary">${esc(best.summary)}</p>
      ${facts.length ? `<div class="facts">${facts.map(([k, v]) => `<div class="fact"><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div></div>`).join("")}</div>` : ""}
      <div class="cta-row">
        ${applyUrl ? `<a class="apply no-print" href="${esc(applyUrl)}" target="_blank" rel="noopener">Apply on the official site ↗</a>` : ""}
        <span class="source">${verified ? "✓ Verified rules · " + esc(LAST_VERIFIED) : "Live data · confirm with the embassy"}</span>
      </div>
      ${(best.warn || []).map((w) => `<div class="alert warn"><span aria-hidden="true">⚠️</span><span>${esc(w)}</span></div>`).join("")}
      ${(best.notes || []).map((n) => `<div class="alert note"><span aria-hidden="true">💡</span><span>${esc(n)}</span></div>`).join("")}
    </article>`;

    if (multi) {
      html += `<article class="card section"><div class="section-head"><div><h3>Your passports compared</h3><p class="hint">Easiest first. Enter and leave on the passport you used to apply.</p></div></div>
        <div class="compare">${perPassport.map((r, i) => `
          <div class="cmp tone-${r.meta.tone} ${i === 0 ? "best" : ""}"><span class="who">${flag(r.nationality)} ${esc(name(r.nationality))}${i === 0 ? '<span class="best-tag">Best</span>' : ""}</span>
          <span class="what"><span class="dot"></span>${esc(r.meta.label)}${r.auth && r.auth.name ? ` · ${esc(r.auth.name)}` : ""}</span></div>`).join("")}</div></article>`;
    }

    const items = (best.checklist || []).filter((it) => it && it.t);
    if (items.length) {
      const key = `vc:${best.nationality}:${state.dest}:${state.purpose}:${items.length}`;
      const saved = new Set(store.get(key) || []);
      const groups = PILLARS.map(([id, icon, title, sub]) => ({ id, icon, title, sub, items: items.map((it, i) => ({ ...it, i })).filter((it) => pillarOf(it.t) === id) })).filter((g) => g.items.length);
      html += `<article class="card section" id="checklistCard">
        <div class="section-head"><div><h3>Your document checklist</h3><p class="hint">Tick items off as you prepare them. Progress is saved on this device.</p></div>
          <div class="tools no-print"><button type="button" class="btn-ghost" id="copyBtn">Copy list</button><button type="button" class="btn-ghost print-only-host" id="printBtn">Print / PDF</button></div></div>
        <div class="progress-wrap"><div class="progress" role="progressbar" aria-label="Checklist progress" aria-valuemin="0" aria-valuemax="${items.length}" aria-valuenow="0"><span id="progBar"></span></div><span class="progress-label" id="progLabel"></span></div>
        <div class="pillars" data-key="${esc(key)}">${groups.map((g, gi) => `
          <section class="pillar ${groups.length % 2 === 1 && gi === groups.length - 1 ? "wide" : ""}">
            <div class="pillar-head"><span class="pillar-num">${gi + 1}</span><div><h4>${g.icon} ${esc(g.title)}</h4><div class="sub">${esc(g.sub)}</div></div></div>
            <ul>${g.items.map((it) => `<li><label><input type="checkbox" data-i="${it.i}" ${saved.has(it.i) ? "checked" : ""}/><div>
              <div class="t">${esc(it.t)}</div>${it.d ? `<div class="d">${esc(it.d)}</div>` : ""}
              ${safe(it.url) ? `<a class="lnk no-print" href="${safe(it.url)}" target="_blank" rel="noopener">Official page ↗</a>` : ""}</div></label></li>`).join("")}</ul>
          </section>`).join("")}</div>
      </article>`;
    }

    const seen = new Set();
    const links = [...(best.links || []), ...(res.links || [])]
      .map(([l, u]) => [l, API.safeUrl(u)])
      .filter(([, u]) => u && !seen.has(u) && seen.add(u));
    if (links.length) {
      html += `<article class="card section"><div class="section-head"><div><h3>🔗 Official sources</h3><p class="hint">Rules change. Confirm here before you book, and avoid paid look-alike sites.</p></div></div>
        <ul class="links">${links.map(([l, u]) => `<li><a href="${esc(u)}" target="_blank" rel="noopener">${esc(l)}<span class="host">${esc(host(u))} ↗</span></a></li>`).join("")}</ul></article>`;
    }

    html += `<div class="bottom-actions no-print"><button type="button" class="btn-ghost print-only-host" id="shareBtn">Copy link to this result</button><button type="button" class="btn-ghost" id="editBtn">Change trip</button></div>`;
    $("#results").innerHTML = html;
    wire(items, best, destName, purposeLabel);
  }

  function wire(items, best, destName, purposeLabel) {
    const box = $(".pillars");
    const update = () => {
      if (!box) return;
      const inputs = [...box.querySelectorAll("input[type=checkbox]")];
      const done = inputs.filter((b) => b.checked);
      $("#progBar").style.width = `${(done.length / inputs.length) * 100}%`;
      $("#progLabel").textContent = `${done.length} of ${inputs.length} ready`;
      $(".progress").setAttribute("aria-valuenow", String(done.length));
      store.set(box.dataset.key, done.map((b) => +b.dataset.i));
    };
    if (box) { box.addEventListener("change", update); update(); }

    const flash = async (btn, text, ok) => {
      const label = btn.textContent;
      try { await navigator.clipboard.writeText(text); btn.textContent = ok; }
      catch { btn.textContent = "Copy not available"; }
      setTimeout(() => { btn.textContent = label; }, 1800);
    };
    const copyBtn = $("#copyBtn");
    if (copyBtn) copyBtn.onclick = () => flash(copyBtn,
      `${name(best.nationality)} → ${destName} (${purposeLabel}): ${best.meta.label}\n${best.summary}\n\n` +
      items.map((it) => `☐ ${it.t}${it.d ? ": " + it.d : ""}`).join("\n") +
      `\n\nFrom VisaCheck. Confirm on official sites before travel.`, "Copied ✓");
    const printBtn = $("#printBtn");
    if (printBtn) printBtn.onclick = () => { try { window.print(); } catch { /* blocked */ } };
    const share = $("#shareBtn");
    if (share) share.onclick = () => flash(share, location.href, "Link copied ✓");
    $("#editBtn").onclick = () => { $("#tripForm").scrollIntoView({ behavior: "smooth" }); natInput.focus({ preventScroll: true }); };
  }

  // ---------- Run ----------
  async function run() {
    if (!state.nats.length) { showError("Add at least one passport."); natInput.focus(); return; }
    if (!state.dest) { showError("Choose where you're going."); destInput.focus(); return; }
    clearError(); toHash();
    const id = ++runId;
    const btn = $("#checkBtn");
    btn.disabled = true;
    if (!VERIFIED.has(state.dest) && CFG.apiProxyUrl && !state.nats.includes(state.dest)) renderSkeleton();
    try {
      const res = await evaluate();
      if (id !== runId) return; // a newer search started
      render(res);
    } catch (err) {
      if (id !== runId || (err && err.code === "ABORT")) return;
      console.error(err);
      renderError(err);
    } finally {
      if (id === runId) btn.disabled = false;
    }
    const r = $("#results");
    if (r.scrollIntoView) r.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  $("#tripForm").addEventListener("submit", (e) => { e.preventDefault(); run(); });
  $("#brandLink").addEventListener("click", (e) => {
    e.preventDefault();
    state.nats = []; state.dest = null; state.purpose = "tourism"; state.docs.clear();
    try { history.replaceState(null, "", location.pathname); } catch { /* ignore */ }
    renderNats(); setDest(null); renderPurpose(); renderDocs(); $("#results").innerHTML = ""; clearError();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  // Hide print / share-link buttons where the page is sandboxed in a frame.
  try { if (window.self !== window.top) document.documentElement.classList.add("embedded"); } catch { document.documentElement.classList.add("embedded"); }

  // ---------- Init ----------
  $("#verified").textContent = LAST_VERIFIED;
  const ready = fromHash();
  renderNats(); setDest(state.dest); renderPurpose(); renderDocs();
  if (ready) run();
})();
