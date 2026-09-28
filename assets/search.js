/* Global search / command palette — jump to any lead, provider, business, business
   rule, or healthcare standard. */
(function () {
  var open = false;

  // Healthcare standards the platform speaks — each opens a representative lead that
  // demonstrates the transaction/standard on its Claim (or Coding) tab.
  var STANDARDS = [
    { code: "837P", label: "X12 837P — professional claim", sub: "EDI · CMS-1500 professional", lead: "20481", tab: "claim" },
    { code: "837I", label: "X12 837I — institutional claim", sub: "EDI · UB-04 institutional", lead: "20544", tab: "claim" },
    { code: "837D", label: "X12 837D — dental claim", sub: "EDI · dental", lead: "20274", tab: "claim" },
    { code: "835", label: "X12 835 — remittance advice", sub: "EDI · payment · CARC / RARC", lead: "20481", tab: "claim" },
    { code: "NCPDP D.0", label: "NCPDP D.0 — pharmacy claim", sub: "retail pharmacy · NDC", lead: "20805", tab: "claim" },
    { code: "HL7 FHIR", label: "HL7 FHIR — ExplanationOfBenefit", sub: "CARIN Blue Button aligned", lead: "20481", tab: "claim" },
    { code: "CARIN Blue Button", label: "CARIN Blue Button", sub: "HL7 FHIR profile", lead: "20481", tab: "claim" },
    { code: "NCCI", label: "CMS NCCI edits", sub: "coding · PTP / MUE / modifier", lead: "20517", tab: "coding" },
    { code: "ICD-10", label: "ICD-10-CM / PCS", sub: "diagnosis & procedure coding", lead: "20544", tab: "claim" },
    { code: "CPT / HCPCS", label: "CPT / HCPCS", sub: "procedure coding", lead: "20481", tab: "coding" }
  ];

  function results(q) {
    q = q.trim().toLowerCase(); if (!q) return [];
    var out = [];
    window.DP.raw.allegations.forEach(function (a) {
      var p = window.DP.getProvider(a.providerId);
      if ((a.id + " " + p.name + " " + p.npi + " " + a.fwaType).toLowerCase().indexOf(q) >= 0)
        out.push({ type: "claim", id: a.id, label: "#" + a.id + " · " + a.fwaType, sub: p.name + " · NPI " + p.npi, risk: a.riskScore });
    });
    window.DP.listProviders().forEach(function (p) {
      if ((p.name + " " + p.npi).toLowerCase().indexOf(q) >= 0)
        out.push({ type: "provider", id: p.id, label: p.name, sub: (p.taxonomyLabel || "") + " · NPI " + p.npi });
    });
    window.DP.listBusinesses().forEach(function (b) {
      if ((b.name + " " + (b.officer || "") + " " + (b.tin || "")).toLowerCase().indexOf(q) >= 0)
        out.push({ type: "business", id: b.id, label: b.name, sub: b.kind + " · " + b.providerCount + " providers" });
    });
    // business rules — from the rule catalog (Library › Rules)
    (window.DP.getRuleCatalog() || []).forEach(function (r) {
      if ((r.name + " " + r.code + " " + (r.regulatorySource || "") + " " + (r.fraudType || "") + " " + (r.description || "")).toLowerCase().indexOf(q) >= 0)
        out.push({ type: "rule", id: r.id, label: r.name, sub: r.code + " · " + (r.regulatorySource || r.category || "rule") });
    });
    // healthcare standards
    STANDARDS.forEach(function (s) {
      if ((s.code + " " + s.label + " " + s.sub).toLowerCase().indexOf(q) >= 0)
        out.push({ type: "standard", id: s.code, lead: s.lead, tab: s.tab, label: s.label, sub: s.sub });
    });
    return out.slice(0, 16);
  }

  function build() {
    var ov = document.createElement("div");
    ov.id = "gs-overlay";
    ov.style.cssText = "position:fixed;inset:0;z-index:300;background:rgba(0,17,65,0.35);display:none;align-items:flex-start;justify-content:center;padding-top:12vh;font-family:'IBM Plex Sans',sans-serif";
    ov.innerHTML =
      '<div id="gs-box" style="width:560px;max-width:92vw;background:var(--card);border:0.5px solid var(--border);border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,0.25);overflow:hidden">' +
      '<div style="display:flex;align-items:center;gap:8px;padding:11px 14px;border-bottom:0.5px solid var(--border2)"><i class="ti ti-search" style="color:var(--text2)"></i><input id="gs-input" placeholder="Search leads, providers, businesses, rules, standards…" style="flex:1;border:none;outline:none;font-size:14px;background:transparent;color:var(--ink);font-family:inherit"><span style="font-size:10px;color:var(--text3);border:0.5px solid var(--border);border-radius:4px;padding:1px 5px">esc</span></div>' +
      '<div id="gs-results" style="max-height:52vh;overflow-y:auto"></div></div>';
    document.body.appendChild(ov);
    ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
    document.getElementById("gs-input").addEventListener("input", function () { render(this.value); });
    document.getElementById("gs-input").addEventListener("keydown", function (e) { if (e.key === "Escape") close(); if (e.key === "Enter") { var first = document.querySelector(".gs-row"); if (first) first.click(); } });
  }

  var META = {
    claim: { icon: "flag", tag: "Lead" }, provider: { icon: "building-hospital", tag: "Provider" },
    business: { icon: "building-community", tag: "Business" }, rule: { icon: "gavel", tag: "Rule" },
    standard: { icon: "certificate", tag: "Standard" }
  };
  function render(q) {
    var list = results(q);
    document.getElementById("gs-results").innerHTML = list.length ? list.map(function (r) {
      var m = META[r.type] || { icon: "search", tag: r.type };
      return '<div class="gs-row" data-type="' + r.type + '" data-id="' + window.APP.esc(r.id) + '" data-lead="' + (r.lead || "") + '" data-tab="' + (r.tab || "") + '" style="display:flex;align-items:center;gap:10px;padding:9px 14px;cursor:pointer;border-top:0.5px solid var(--border2)"><i class="ti ti-' + m.icon + '" style="color:var(--accent-d)"></i>' +
        '<div style="flex:1"><div style="font-size:12.5px;font-weight:500">' + window.APP.esc(r.label) + '</div><div style="font-size:11px;color:var(--text2)">' + window.APP.esc(r.sub) + '</div></div>' +
        (r.risk ? window.UI.riskChip(r.risk) : '<span class="tag">' + m.tag + '</span>') + '</div>';
    }).join("") : (q.trim() ? '<div class="muted" style="padding:14px;font-size:12.5px">No matches.</div>' : '<div class="muted" style="padding:14px;font-size:12px">Search leads, providers, businesses, rules, or standards (e.g. "837I", "NCCI", "upcoding").</div>');
    document.querySelectorAll(".gs-row").forEach(function (row) {
      row.addEventListener("click", function () {
        var t = row.getAttribute("data-type"), id = row.getAttribute("data-id");
        close();
        if (t === "claim") window.APP.openAllegation(id);
        else if (t === "business") window.APP.openBusiness(id);
        else if (t === "provider") window.APP.openProvider(id);
        else if (t === "rule") { window.APP.nav("rules"); setTimeout(function () { var rr = document.querySelector('.rule-row[data-rule="' + id + '"]'); if (rr) { rr.click(); rr.scrollIntoView({ block: "center" }); } }, 30); }
        else if (t === "standard") { var lead = row.getAttribute("data-lead"), tb = row.getAttribute("data-tab"); window.APP.openAllegation(lead); setTimeout(function () { var ct = document.querySelector('.ctab[data-tab="' + tb + '"]'); if (ct) ct.click(); }, 40); }
      });
    });
  }

  function openPalette() { open = true; document.getElementById("gs-overlay").style.display = "flex"; var i = document.getElementById("gs-input"); i.value = ""; render(""); setTimeout(function () { i.focus(); }, 10); }
  function close() { open = false; document.getElementById("gs-overlay").style.display = "none"; }

  window.SEARCH = { open: openPalette, close: close };
  function boot() {
    if (!window.APP || !window.DP || !window.APP.ready) return setTimeout(boot, 100);
    build();
    var btn = document.getElementById("gsearch"); if (btn) btn.addEventListener("click", openPalette);
    document.addEventListener("keydown", function (e) {
      if (e.key === "/" && !/input|textarea|select/i.test((e.target.tagName || "")) && !open) { e.preventDefault(); openPalette(); }
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
