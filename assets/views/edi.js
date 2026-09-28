/* EDI dashboard — the intake health of the claims pipeline: X12 transaction-set
   volumes, acknowledgment stats and rejection reasons, a live data-sources panel
   (feeds + incoming-records stream) and a live 24-hour pipeline flow from ingest
   to remediation. Base stats are deterministic (DP.getEdiDashboard); the live
   panels are simulated activity on top. Un-attributed. */
(function () {
  window.Views = window.Views || {};

  function kpi(label, val, sub) {
    return '<div class="card" style="flex:1;min-width:150px;margin:0"><div style="font-size:10.5px;color:var(--text3);text-transform:uppercase;letter-spacing:.04em">' + label + '</div>' +
      '<div style="font-weight:600;font-size:22px;margin-top:2px">' + val + '</div>' + (sub ? '<div style="font-size:11px;color:var(--text2);margin-top:1px">' + sub + '</div>' : '') + '</div>';
  }
  function num(n) { return n.toLocaleString(); }

  // 14-day inbound-claim volume sparkline
  function sparkline(data) {
    var w = 220, h = 40, max = Math.max.apply(null, data), min = Math.min.apply(null, data);
    var pts = data.map(function (v, i) { var x = (i / (data.length - 1)) * w; var y = h - ((v - min) / (max - min || 1)) * (h - 6) - 3; return x.toFixed(1) + "," + y.toFixed(1); }).join(" ");
    return '<svg viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '" preserveAspectRatio="none" style="max-width:100%"><polyline points="' + pts + '" fill="none" stroke="var(--accent-d)" stroke-width="1.6"/></svg>';
  }

  // ---- Live operations: data-source feeds + 24h pipeline flow ----
  // Simulated live activity (synthetic, like all demo data): each tick a record
  // "arrives" from a feed, the source counters and the incoming-records stream
  // update, and claims advance the 24-hour pipeline counts. 24h baselines are
  // ~1/30 of the trailing-30-day volumes above. The timer stops itself when the
  // view is left.
  var SOURCES = [
    { k: "clm", grp: "Transactions", name: "Medical claims", from: "Clearinghouses & TPAs", feed: "837P / I / D", cad: "streaming", n: 2135, unit: "claims" },
    { k: "rem", grp: "Transactions", name: "Remittance", from: "Payer finance system", feed: "835", cad: "streaming", n: 1911, unit: "remits" },
    { k: "elg", grp: "Transactions", name: "Eligibility & enrollment", from: "Enrollment system", feed: "834 · 270/271", cad: "streaming", n: 2136, unit: "records" },
    { k: "npi", grp: "Reference & external", name: "Provider registry", from: "CMS NPPES", feed: "NPI", cad: "daily delta", n: 318, unit: "updates" },
    { k: "pec", grp: "Reference & external", name: "Medicare enrollment", from: "CMS PECOS", feed: "enrollment", cad: "daily delta", n: 96, unit: "changes" },
    { k: "leie", grp: "Reference & external", name: "Exclusions", from: "HHS-OIG LEIE", feed: "exclusion list", cad: "per claim", n: 2101, unit: "screened", hits: 3 },
    { k: "sam", grp: "Reference & external", name: "Debarments", from: "SAM.gov", feed: "exclusions", cad: "per claim", n: 2101, unit: "screened", hits: 0 },
    { k: "dmf", grp: "Reference & external", name: "Death records", from: "SSA Death Master File", feed: "DMF", cad: "per claim", n: 2101, unit: "screened", hits: 1 },
    { k: "lic", grp: "Reference & external", name: "Licensure", from: "State licensing boards", feed: "license status", cad: "on flag", n: 92, unit: "checks", hits: 2 },
    { k: "corp", grp: "Reference & external", name: "Corporate ownership", from: "Secretary of State filings", feed: "registrations", cad: "on flag", n: 17, unit: "lookups", hits: 1 },
    { k: "news", grp: "Reference & external", name: "Adverse media", from: "News monitoring", feed: "articles", cad: "continuous", n: 41, unit: "articles", hits: 2 }
  ];
  var STAGES = [
    { k: "ingest", t: "Ingest", s: "claims received" },
    { k: "validate", t: "Validate", s: "accepted" },
    { k: "normalize", t: "Normalize", s: "to canonical record" },
    { k: "enrich", t: "Enrich", s: "matched & screened" },
    { k: "analytics", t: "Analytics", s: "scored" },
    { k: "casemgmt", t: "Case mgmt", s: "flags triaged" },
    { k: "remediate", t: "Remediate", s: "prevented (prepay)" }
  ];

  function liveState() {
    return {
      src: SOURCES.map(function (x) { return { k: x.k, n: x.n, hits: x.hits, last: Date.now() - Math.round(Math.random() * 40000) }; }),
      p: { ingest: 2135, rejected: 34, validate: 2101, normalize: 2101, enrich: 2101, exclHits: 3, analytics: 2101, flagged: 92, casemgmt: 92, leads: 17, toCases: 3, prevented: 148920, recovery: 402310, letters: 11 },
      inStage: { ingest: 6, validate: 3, normalize: 1, enrich: 4, analytics: 2, casemgmt: 14, remediate: 5 },
      feed: [], seq: 0, updated: Date.now()
    };
  }

  function money(n) { return "$" + Math.round(n).toLocaleString(); }
  function ago(ms) { var s = Math.max(1, Math.round((Date.now() - ms) / 1000)); return s < 60 ? s + "s ago" : Math.round(s / 60) + "m ago"; }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  var liveCss = '<style>@keyframes edi-pulse{0%{box-shadow:0 0 0 0 rgba(15,98,254,.55)}70%{box-shadow:0 0 0 6px rgba(15,98,254,0)}100%{box-shadow:0 0 0 0 rgba(15,98,254,0)}}' +
    '.edi-dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:#0f62fe;animation:edi-pulse 1.6s infinite}' +
    '@keyframes edi-in{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}.edi-ev{animation:edi-in .35s ease-out}' +
    '@keyframes edi-bump{0%{color:var(--accent-d)}100%{color:inherit}}.edi-bump{animation:edi-bump .9s ease-out}' +
    '.edi-stage{flex:1;min-width:128px;background:#0a1640;border-radius:9px;padding:10px 12px;color:#fff}' +
    '.edi-arrow{align-self:center;color:#0f62fe;font-size:16px;padding:0 2px}</style>';

  function sourcesPanel() {
    var rows = "", grp = "";
    SOURCES.forEach(function (x) {
      if (x.grp !== grp) { grp = x.grp; rows += '<tr><td colspan="5" style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.04em;padding-top:8px">' + grp + '</td></tr>'; }
      rows += '<tr><td><div style="font-weight:500;font-size:12px">' + x.name + '</div><div style="font-size:10.5px;color:var(--text2)">' + x.from + ' · <span class="mono">' + x.feed + '</span></div></td>' +
        '<td style="font-size:10.5px;color:var(--text2);white-space:nowrap">' + x.cad + '</td>' +
        '<td class="right mono" style="font-size:11.5px;white-space:nowrap"><span data-src-n="' + x.k + '"></span> <span style="color:var(--text3);font-size:10px">' + x.unit + '</span></td>' +
        '<td class="right" style="white-space:nowrap">' + (x.hits != null ? '<span data-src-h="' + x.k + '"></span>' : '') + '</td>' +
        '<td class="right mono" style="font-size:10.5px;color:var(--text2);white-space:nowrap"><span class="edi-dot" style="width:6px;height:6px;margin-right:5px"></span><span data-src-a="' + x.k + '"></span></td></tr>';
    });
    return '<div class="card" style="padding:0;overflow:hidden">' +
      '<div style="padding:10px 12px;border-bottom:0.5px solid var(--border2);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">' +
      '<div style="font-weight:500;font-size:12.5px"><i class="ti ti-plug-connected" style="color:var(--accent-d)"></i> Data sources <span class="muted" style="font-weight:400;font-size:10.5px">· last 24 hours</span></div>' +
      '<div style="font-size:11px;color:var(--text2);display:flex;align-items:center;gap:6px"><span class="edi-dot"></span> Live · ' + SOURCES.length + ' feeds connected</div></div>' +
      '<div style="display:flex;flex-wrap:wrap">' +
      '<div style="flex:1.5;min-width:420px;overflow-x:auto;padding:0 12px 8px"><table style="width:100%"><thead><tr><th>Source</th><th>Cadence</th><th class="right">24h</th><th class="right">Hits</th><th class="right">Last received</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<div style="flex:1;min-width:300px;border-left:0.5px solid var(--border2);padding:10px 12px;background:var(--surface);display:flex;flex-direction:column">' +
      '<div style="font-size:10.5px;color:var(--text3);text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px">Incoming records</div>' +
      // fills the height of the sources table beside it; rows that don't fit whole are dropped
      '<div style="flex:1;min-height:372px;position:relative"><div id="edi-feed" style="position:absolute;inset:0;display:flex;flex-direction:column;gap:5px;overflow:hidden"></div></div></div>' +
      '</div></div>';
  }

  function pipelinePanel() {
    var boxes = STAGES.map(function (st, i) {
      return (i ? '<div class="edi-arrow"><i class="ti ti-arrow-right"></i></div>' : '') +
        '<div class="edi-stage"><div style="display:flex;justify-content:space-between;align-items:baseline;gap:6px"><span style="font-weight:600;font-size:12.5px">' + st.t + '</span><span style="font-size:10px;color:#a6c8ff;white-space:nowrap"><span data-in="' + st.k + '"></span> in stage</span></div>' +
        '<div class="mono" style="font-size:19px;font-weight:600;margin-top:6px" data-p="' + st.k + '"></div>' +
        '<div style="font-size:10.5px;color:#a6c8ff">' + st.s + '</div>' +
        '<div style="font-size:10.5px;color:#dde1e6;margin-top:6px;min-height:28px;line-height:1.35" data-pd="' + st.k + '"></div></div>';
    }).join("");
    return '<div class="card"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:10px">' +
      '<div style="font-weight:500;font-size:12.5px"><i class="ti ti-sitemap" style="color:var(--accent-d)"></i> Pipeline <span class="muted" style="font-weight:400;font-size:10.5px">· last 24 hours · ingest to remediation</span></div>' +
      '<div style="font-size:11px;color:var(--text2);display:flex;align-items:center;gap:6px"><span class="edi-dot"></span> Live · updated <span id="edi-upd">1s ago</span></div></div>' +
      '<div style="display:flex;gap:4px;overflow-x:auto;padding-bottom:2px">' + boxes + '</div>' +
      '<div style="font-size:10.5px;color:var(--text3);margin-top:8px"><i class="ti ti-refresh"></i> Analyst decisions feed model retraining (human-in-the-loop). Standards-validated intake feeds enrichment (code libraries, external intelligence), the rules and AI models, and case management; outcomes remit via 835.</div></div>';
  }

  var liveRun = 0; // each render gets a run id; an older render's timer stops itself
  function startLive(root) {
    var run = ++liveRun;
    var S = liveState(), D = window.DP.raw;
    // claim type follows the provider (institutional / dental / professional); the
    // Meridian chain facilities are left to the scripted beats so they never "pass"
    var chain = /Substance Abuse/;
    var provs = D.providers.filter(function (p) { return p.name && !chain.test(p.taxonomyLabel); });
    var inst = provs.filter(function (p) { return /Hospital|Home Health|Nephrology/.test(p.taxonomyLabel); });
    var dent = provs.filter(function (p) { return /Dentist/.test(p.taxonomyLabel); });
    var prof = provs.filter(function (p) { return inst.indexOf(p) < 0 && dent.indexOf(p) < 0; });
    var vets = D.veterans;
    // scripted story beats surface early in the stream (Sonoran chain)
    var script = [
      { at: 3, ev: { src: "837I", cls: "hi", txt: "Sonoran Recovery Center · residential per diem · $17,280", out: "scored 93 · held for prepay review" } },
      { at: 7, ev: { src: "LEIE", cls: "hi", txt: "Pacific Sands Treatment · exclusion check", out: "EXCLUDED · OIG LEIE" } },
      { at: 12, ev: { src: "SOS", cls: "md", txt: "Meridian Behavioral Holdings LLC · registration", out: "officer shared by 4 facilities" } }
    ];
    var n = function (el, v) { if (!el) return; var t = typeof v === "number" ? v.toLocaleString() : v; if (el.textContent !== t) { el.textContent = t; el.classList.remove("edi-bump"); void el.offsetWidth; el.classList.add("edi-bump"); } };
    var q = function (sel) { return root.querySelector(sel); };
    var srcOf = function (k) { return S.src.filter(function (x) { return x.k === k; })[0]; };

    function paint() {
      S.src.forEach(function (x) {
        n(q('[data-src-n="' + x.k + '"]'), x.n);
        var h = q('[data-src-h="' + x.k + '"]');
        if (h) h.innerHTML = x.hits ? '<span class="tag" style="background:var(--high-bg);color:var(--high-tx)">' + x.hits + '</span>' : '<span style="color:var(--text3);font-size:11px">0</span>';
        var a = q('[data-src-a="' + x.k + '"]'); if (a) a.textContent = ago(x.last);
      });
      var P = S.p;
      n(q('[data-p="ingest"]'), P.ingest); n(q('[data-p="validate"]'), P.validate); n(q('[data-p="normalize"]'), P.normalize);
      n(q('[data-p="enrich"]'), P.enrich); n(q('[data-p="analytics"]'), P.analytics); n(q('[data-p="casemgmt"]'), P.casemgmt); n(q('[data-p="remediate"]'), money(P.prevented));
      var d = function (k, html) { var el = q('[data-pd="' + k + '"]'); if (el) el.innerHTML = html; };
      d("ingest", "837P · 837I · 837D");
      d("validate", '<span style="color:#ffb4a8">' + P.rejected + ' rejected</span> · returned to submitter');
      d("normalize", "X12 → canonical · FHIR-mapped");
      d("enrich", "code libraries · registries · " + '<span style="color:#ffb4a8">' + P.exclHits + ' exclusion hits</span>');
      d("analytics", '<span style="color:#ffd27a;font-weight:600">' + P.flagged + ' flagged</span> · median 1.8s to score');
      d("casemgmt", P.leads + " leads opened · " + P.toCases + " added to cases");
      d("remediate", P.letters + " recovery letters · " + money(P.recovery));
      Object.keys(S.inStage).forEach(function (k) { var el = q('[data-in="' + k + '"]'); if (el) el.textContent = S.inStage[k]; });
      var u = q("#edi-upd"); if (u) u.textContent = ago(S.updated);
    }

    function push(ev) {
      var feed = q("#edi-feed"); if (!feed) return;
      var tone = ev.cls === "hi" ? "background:var(--high-bg);color:var(--high-tx)" : ev.cls === "md" ? "background:var(--med-bg,#fff4dc);color:var(--med-tx)" : "background:var(--card);color:var(--text2)";
      var t = new Date(); var ts = ("0" + t.getHours()).slice(-2) + ":" + ("0" + t.getMinutes()).slice(-2) + ":" + ("0" + t.getSeconds()).slice(-2);
      var row = document.createElement("div");
      row.className = "edi-ev";
      row.style.cssText = "display:flex;gap:7px;align-items:flex-start;font-size:11px;line-height:1.35;padding:5px 7px;border-radius:6px;background:var(--card);border:0.5px solid var(--border2)";
      row.innerHTML = '<span class="mono" style="color:var(--text3);font-size:10px;padding-top:1px">' + ts + '</span>' +
        '<span class="mono" style="font-size:9.5px;font-weight:600;padding:1px 5px;border-radius:4px;background:var(--surface);color:var(--accent-d);min-width:34px;text-align:center">' + ev.src + '</span>' +
        '<span style="flex:1"><span style="color:var(--ink,inherit)">' + window.APP.esc(ev.txt) + '</span><br><span style="font-size:10.5px;padding:0 4px;border-radius:3px;' + tone + '">→ ' + window.APP.esc(ev.out) + '</span></span>';
      feed.insertBefore(row, feed.firstChild);
      while (feed.children.length > 1 && feed.scrollHeight > feed.clientHeight + 1) feed.removeChild(feed.lastChild);
    }

    function claimEvent() {
      var P = S.p, type = pick(["837P", "837P", "837P", "837P", "837I", "837D"]);
      var pr = pick(type === "837I" ? inst : type === "837D" ? dent : prof);
      var amt = type === "837I" ? 900 + Math.random() * 14000 : type === "837D" ? 80 + Math.random() * 900 : 60 + Math.random() * 600;
      srcOf("clm").n++; srcOf("clm").last = Date.now(); P.ingest++;
      if (Math.random() < 0.016) { P.rejected++; return { src: type, cls: "", txt: shortName(pr.name) + " · " + money(amt), out: pick(["rejected · invalid NPI (277CA A7)", "rejected · missing segment (999 IK3)", "rejected · member mismatch (277CA A3)"]) }; }
      P.validate++; P.normalize++; P.enrich++; P.analytics++;
      ["leie", "sam", "dmf"].forEach(function (k) { var x = srcOf(k); x.n++; x.last = Date.now(); });
      var score = Math.round(Math.random() < 0.06 ? 72 + Math.random() * 25 : 5 + Math.random() * 55);
      if (score >= 70) {
        P.flagged++; P.casemgmt++; srcOf("lic").n++; srcOf("lic").last = Date.now();
        if (Math.random() < 0.3) { P.prevented += amt; }
        if (Math.random() < 0.2) P.leads++;
        return { src: type, cls: "md", txt: shortName(pr.name) + " · " + money(amt), out: "scored " + score + " · flagged → analyst queue" };
      }
      return { src: type, cls: "", txt: shortName(pr.name) + " · " + money(amt), out: "scored " + score + " · pass" };
    }
    function otherEvent() {
      var r = Math.random(), pr = pick(provs), v = pick(vets);
      if (r < 0.35) { var x = srcOf("rem"); x.n++; x.last = Date.now(); return { src: "835", cls: "", txt: "Remittance · " + shortName(pr.name), out: "posted · " + money(80 + Math.random() * 3000) + " paid" }; }
      if (r < 0.7) { var e = srcOf("elg"); e.n++; e.last = Date.now(); return { src: pick(["271", "834"]), cls: "", txt: "Member " + (v ? v.name : "record") + " · eligibility", out: "active · eligible" }; }
      if (r < 0.85) { var np = srcOf("npi"); np.n++; np.last = Date.now(); return { src: "NPPES", cls: "", txt: shortName(pr.name) + " · NPI record", out: pick(["address updated", "taxonomy updated", "no change"]) }; }
      if (r < 0.93) { var pc = srcOf("pec"); pc.n++; pc.last = Date.now(); return { src: "PECOS", cls: "", txt: shortName(pr.name) + " · enrollment", out: "enrollment verified" }; }
      var nw = srcOf("news"); nw.n++; nw.last = Date.now(); return { src: "NEWS", cls: "", txt: "Article scanned · " + shortName(pr.name), out: "no adverse match" };
    }

    paint();
    for (var i = 0; i < 16; i++) push(Math.random() < 0.6 ? claimEvent() : otherEvent()); // prefill so the stream starts full
    paint();
    var tick = 0;
    var timer = setInterval(function () {
      if (run !== liveRun || !document.body.contains(root) || !root.querySelector("#edi-feed")) { clearInterval(timer); return; }
      tick++;
      var sc = script.filter(function (x) { return x.at === tick; })[0];
      if (sc) {
        push(sc.ev); S.updated = Date.now();
        if (sc.ev.src === "837I") { S.p.ingest++; S.p.validate++; S.p.normalize++; S.p.enrich++; S.p.analytics++; S.p.flagged++; S.p.casemgmt++; srcOf("clm").n++; srcOf("clm").last = Date.now(); }
        if (sc.ev.src === "LEIE") { S.p.exclHits++; srcOf("leie").hits++; srcOf("leie").last = Date.now(); }
        if (sc.ev.src === "SOS") { srcOf("corp").n++; srcOf("corp").hits++; srcOf("corp").last = Date.now(); }
      } else if (Math.random() < 0.8) {
        push(Math.random() < 0.62 ? claimEvent() : otherEvent()); S.updated = Date.now();
      }
      Object.keys(S.inStage).forEach(function (k) { S.inStage[k] = Math.max(0, S.inStage[k] + Math.round(Math.random() * 2 - 1)); });
      paint();
    }, 1400);
  }

  function shortName(n) { return String(n || "").replace(/\s+(Associates|Partners|LLC|Inc\.?|Group)$/i, ""); }

  window.Views.edi = {
    render: function (mount) {
      var d = window.DP.getEdiDashboard();
      var esc = window.APP.esc;

      var setRows = d.sets.map(function (s) {
        var dirIcon = s.direction === "inbound" ? "arrow-down-left" : s.direction === "outbound" ? "arrow-up-right" : "arrows-left-right";
        var barW = Math.round(s.acceptRate);
        var rejPill = s.rejected ? '<span class="tag" style="background:var(--high-bg);color:var(--high-tx)">' + num(s.rejected) + ' rej</span>' : '<span class="tag" style="background:var(--low-bg);color:var(--low-tx)">0 rej</span>';
        return '<tr><td class="mono" style="font-weight:600">' + s.code + '</td><td>' + esc(s.name) + '</td>' +
          '<td style="font-size:11px;color:var(--text2)"><i class="ti ti-' + dirIcon + '"></i> ' + s.direction + '</td>' +
          '<td class="right mono">' + num(s.volume) + '</td>' +
          '<td><div style="display:flex;align-items:center;gap:6px"><div style="flex:1;min-width:60px;height:6px;background:var(--surface);border-radius:3px;overflow:hidden"><div style="width:' + barW + '%;height:100%;background:var(--accent-d)"></div></div><span class="mono" style="font-size:10.5px;min-width:38px">' + s.acceptRate + '%</span></div></td>' +
          '<td class="right">' + rejPill + '</td>' +
          '<td class="right mono" style="font-size:11px">' + (s.ackHrs ? s.ackHrs + "h" : "—") + '</td></tr>';
      }).join("");

      var rejHtml = d.rejReasons.map(function (r) {
        return '<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-top:0.5px solid var(--border2)">' +
          '<span class="mono" style="font-size:10.5px;color:var(--accent-d);min-width:104px">' + esc(r.code) + '</span>' +
          '<span style="flex:1;font-size:11.5px">' + esc(r.label) + '</span>' +
          '<div style="width:80px;height:6px;background:var(--surface);border-radius:3px;overflow:hidden"><div style="width:' + r.pct + '%;height:100%;background:var(--med-tx)"></div></div>' +
          '<span class="mono" style="font-size:10.5px;min-width:30px;text-align:right">' + r.pct + '%</span></div>';
      }).join("");

      mount.innerHTML = liveCss +
        '<div style="display:flex;flex-direction:column;gap:10px">' +
        '<div class="card"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px"><div style="font-weight:600;font-size:14px"><i class="ti ti-transfer" style="color:var(--accent-d)"></i> EDI transactions <span class="muted" style="font-weight:400;font-size:11.5px">· claims-pipeline intake health</span></div>' +
        '<span class="tag" style="background:var(--surface)">' + esc(d.standard) + '</span></div>' +
        '<div style="font-size:11px;color:var(--text2);margin-top:4px">' + esc(d.asOf) + ' · acknowledgments (999 / TA1 / 277CA) and status by X12 transaction set.</div></div>' +
        '<div style="display:flex;gap:10px;flex-wrap:wrap">' +
        kpi("Transactions", num(d.totals.transactions), d.asOf) +
        kpi("Inbound claims", num(d.totals.inboundClaims), "837P / I / D") +
        kpi("Acceptance rate", d.totals.acceptRate + "%", "on first pass") +
        kpi("Rejected", num(d.totals.rejected), "returned for correction") +
        kpi("Avg ack time", d.totals.avgAckHrs + "h", d.totals.ta1Errors + " TA1 interchange errors") +
        '</div>' +
        sourcesPanel() +
        '<div class="card"><div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px"><div style="font-weight:500;font-size:12.5px"><i class="ti ti-chart-line" style="color:var(--accent-d)"></i> Inbound claim volume <span class="muted" style="font-weight:400;font-size:10.5px">· trailing 14 days</span></div>' + sparkline(d.trend) + '</div></div>' +
        '<div class="card" style="padding:0;overflow:hidden"><div style="padding:10px 12px;font-weight:500;font-size:12.5px;border-bottom:0.5px solid var(--border2)"><i class="ti ti-list" style="color:var(--accent-d)"></i> Transaction sets</div>' +
        '<div style="overflow-x:auto"><table style="width:100%"><thead><tr><th>Set</th><th>Name</th><th>Dir</th><th class="right">Volume</th><th>Accept rate</th><th class="right">Rejected</th><th class="right">Ack</th></tr></thead><tbody>' + setRows + '</tbody></table></div></div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">' +
        '<div class="card"><div style="font-weight:500;font-size:12.5px;margin-bottom:4px"><i class="ti ti-alert-triangle" style="color:var(--med-tx)"></i> Top rejection reasons</div>' + rejHtml + '</div>' +
        '<div class="card"><div style="font-weight:500;font-size:12.5px;margin-bottom:4px"><i class="ti ti-shield-check" style="color:var(--accent-d)"></i> Acknowledgment posture</div>' +
        '<div style="font-size:11.5px;color:var(--text2);line-height:1.7;padding-top:2px">Every inbound interchange returns a <b class="mono">TA1</b> (interchange) and <b class="mono">999</b> (functional) acknowledgment; claims additionally return a <b class="mono">277CA</b> claim-acknowledgment. Rejected transactions are returned for correction and never enter adjudication — so the analytics run on a clean, standards-validated claim stream.</div></div>' +
        '</div>' +
        pipelinePanel() +
        '</div>';
      startLive(mount);
    }
  };
})();
