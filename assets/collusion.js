/* Collusion — shared analysis + narrative + layered graph for a provider's
   collusion network. Fed by DP.getCollusionNetwork(providerId). Reused by the
   case view (claim.js). Attaches to window.Collusion. */
(function () {
  var LINK_RANK = { SHARES_TIN: 5, SHARES_REGISTRATION: 4, SHARES_OFFICER: 3, REFERRED_TO: 2, SHARES_PATIENT_WITH: 1 };
  var LINK_COLOR = {
    SHARES_TIN: "#c6362f", SHARES_REGISTRATION: "#b5730e", SHARES_OFFICER: "#7a3aa0",
    REFERRED_TO: "#0f6e56", SHARES_PATIENT_WITH: "#8a95a3"
  };

  // Fold the many provider↔provider edges into one summary per pair.
  function aggregate(net) {
    var byPair = {};
    (net.links || []).forEach(function (e) {
      var a = e.source, b = e.target, key = a < b ? a + "|" + b : b + "|" + a;
      var s = byPair[key] || (byPair[key] = { a: key.split("|")[0], b: key.split("|")[1], tin: null, officer: false, registration: null, referrals: 0, spCount: 0, spMax: 0, top: 0, topType: null });
      if (e.type === "SHARES_TIN") s.tin = (e.props && e.props.tin) || true;
      if (e.type === "SHARES_OFFICER") s.officer = (e.props && e.props.officer) || true;
      if (e.type === "SHARES_REGISTRATION") s.registration = (e.props && e.props.registration) || true;
      if (e.type === "REFERRED_TO") s.referrals += 1;
      // shared patients come two ways: one edge carrying a count (chain), or one edge
      // per shared member (ring) — take whichever yields the larger tally.
      if (e.type === "SHARES_PATIENT_WITH") {
        if (e.props && e.props.sharedVeterans) s.spMax = Math.max(s.spMax, e.props.sharedVeterans);
        else s.spCount += 1;
      }
      if (LINK_RANK[e.type] > s.top) { s.top = LINK_RANK[e.type]; s.topType = e.type; }
    });
    return Object.keys(byPair).map(function (k) { var s = byPair[k]; s.sharedPatients = Math.max(s.spCount, s.spMax); return s; });
  }

  // Edge label carries the quantitative facts only; shared TIN/officer/registration
  // are conveyed by edge color + legend + narrative (so the chain's 6 edges don't all
  // repeat the same "same officer/registration" string and turn into clutter).
  function pairLabel(s) {
    var parts = [];
    if (s.tin) parts.push("shared TIN");
    if (s.referrals) parts.push(s.referrals + " referral" + (s.referrals > 1 ? "s" : ""));
    if (s.sharedPatients) parts.push(s.sharedPatients + " shared patient" + (s.sharedPatients > 1 ? "s" : ""));
    return parts.join(" · ");
  }

  // Structured read of the network for narrative + recommendation.
  function analyze(providerId) {
    var net = window.DP.getCollusionNetwork(providerId);
    if (!net) return null;
    var provs = net.providers.filter(Boolean);
    var focus = provs.find(function (p) { return p.id === providerId; }) || provs[0] || null;
    var types = {}; (net.links || []).forEach(function (e) { types[e.type] = (types[e.type] || 0) + 1; });

    // members treated by >= 2 network providers (the "shuffled" patients)
    var byVet = {};
    (net.vetLinks || []).forEach(function (e) { (byVet[e.source] = byVet[e.source] || {})[e.target] = 1; });
    var vetCount = net.veterans.filter(Boolean).length;
    var sharedVetCount = Object.keys(byVet).filter(function (v) { return Object.keys(byVet[v]).length >= 2; }).length;
    var sharedPct = vetCount ? Math.round(sharedVetCount / vetCount * 100) : 0;

    var distinctTins = {}; provs.forEach(function (p) { if (p.tin) distinctTins[p.tin] = 1; });
    var kind = "isolated";
    if (provs.length > 1) kind = (types.SHARES_REGISTRATION || types.SHARES_OFFICER) ? "chain" : "ring";
    // the business entity behind the providers (holding company or shared-TIN entity)
    var business = null;
    if (provs.length > 1) {
      business = (focus && focus.registration)
        ? { id: focus.registrationId || focus.registration, name: focus.registration, kind: "Holding company", sub: focus.officer ? "officer " + focus.officer : "" }
        : { id: focus ? focus.tin : "tin", name: "TIN " + (focus ? focus.tin : ""), kind: "Billing entity", sub: "one billing entity" };
    }

    return {
      business: business,
      net: net, focus: focus, kind: kind, isRing: net.isRing && provs.length > 1,
      providers: provs, providerCount: provs.length,
      states: provs.map(function (p) { return p.state; }).filter(function (s, i, a) { return s && a.indexOf(s) === i; }),
      vetCount: vetCount, sharedVetCount: sharedVetCount, sharedPct: sharedPct,
      sharedTin: !!types.SHARES_TIN, tin: focus ? focus.tin : null, distinctTinCount: Object.keys(distinctTins).length,
      sharedOfficer: !!types.SHARES_OFFICER, officer: focus ? focus.officer : null,
      sharedRegistration: !!types.SHARES_REGISTRATION, registration: focus ? focus.registration : null,
      referralCount: types.REFERRED_TO || 0
    };
  }

  // Plain-language explainability block (why this is likely collusion).
  function narrativeHtml(s) {
    if (!s || !s.isRing) {
      return '<div style="display:flex;align-items:flex-start;gap:9px;background:var(--low-bg);border:0.5px solid #bfe0c9;border-radius:8px;padding:10px 12px">' +
        '<i class="ti ti-circle-check" style="color:var(--low-tx);margin-top:1px"></i>' +
        '<div style="font-size:11.5px;color:var(--low-tx);line-height:1.5"><span style="font-weight:600">No collusion network detected.</span> This provider bills in isolation — no shared TIN, ownership, referrals or cross-billed patients link it to another flagged provider. The flag stands on the claim\'s own merits.</div></div>';
    }
    // signal chips
    var chips = [];
    var chip = function (icon, txt, strong) { return '<span style="display:inline-flex;align-items:center;gap:4px;background:' + (strong ? "var(--high-bg)" : "var(--surface)") + ';border:0.5px solid ' + (strong ? "#f3c9c9" : "var(--border)") + ';color:' + (strong ? "var(--high-tx)" : "var(--text2)") + ';border-radius:999px;padding:2px 9px;font-size:11px;font-weight:500"><i class="ti ti-' + icon + '"></i>' + txt + '</span>'; };
    if (s.kind === "chain") {
      chips.push(chip("building-community", "1 holding company", true));
      if (s.sharedOfficer) chips.push(chip("user-shield", "same officer", true));
      chips.push(chip("id-badge-2", s.distinctTinCount + " separate TINs mask ownership", false));
    } else {
      if (s.sharedTin) chips.push(chip("id-badge-2", "shared TIN " + (s.tin || ""), true));
      if (s.referralCount) chips.push(chip("arrow-guide", s.referralCount + " cross-referrals", false));
    }
    chips.push(chip("users", s.sharedPct + "% of members shared", s.sharedPct >= 60));
    if (s.states.length > 1) chips.push(chip("map-pin", s.states.join(" → "), s.kind === "chain"));

    var lead;
    if (s.kind === "chain") {
      lead = '<span style="font-weight:600">' + window.APP.esc(s.registration || "A single holding company") + '</span> operates <b>' + s.providerCount + '</b> facilities across ' +
        (s.states.join(" · ")) + ' under one officer (' + window.APP.esc(s.officer || "—") + '), yet each bills under a <b>separate TIN</b> to hide the common ownership. ' +
        'The same <b>' + s.sharedVetCount + ' members (' + s.sharedPct + '%)</b> are cycled between the facilities for back-to-back short stays — a pattern no independent provider produces.';
    } else {
      lead = '<span style="font-weight:600">' + s.providerCount + ' flagged providers</span> operate as one billing entity: they ' +
        (s.sharedTin ? 'share <b>TIN ' + window.APP.esc(s.tin || "") + '</b>' : 'are commonly controlled') +
        (s.referralCount ? ', pass <b>' + s.referralCount + ' referrals</b> between them,' : ',') +
        ' and bill the <b>same ' + s.sharedVetCount + ' members (' + s.sharedPct + '%)</b> — coordinated anomalies, not independent activity.';
    }

    return '<div style="background:var(--high-bg);border:0.5px solid #f3c9c9;border-radius:8px;padding:11px 12px">' +
      '<div style="display:flex;align-items:center;gap:6px;font-weight:600;font-size:12.5px;color:var(--high-tx);margin-bottom:6px"><i class="ti ti-affiliate"></i>' +
      (s.kind === "chain" ? "Residential-chain collusion" : "Provider ring") + ' · likely coordinated fraud</div>' +
      '<div style="font-size:11.5px;color:#5a2b27;line-height:1.55;margin-bottom:8px">' + lead + '</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:6px">' + chips.join("") + '</div>' +
      '<div style="font-size:11px;color:var(--high-tx);margin-top:8px;font-weight:500"><i class="ti ti-arrow-right"></i> ' +
      (s.sharedTin ? "shared TIN" : "shared ownership") + " + " + s.sharedPct + "% shared members + " +
      (s.kind === "chain" ? "same officer &amp; registration" : s.referralCount + " referrals") +
      ' &rarr; treat as a single coordinated scheme, not isolated claims.</div></div>';
  }

  // Layered graph for an in-context panel, read top to bottom as the story:
  // the business entity behind it (holding company or shared-TIN billing entity)
  // → the providers it controls (cards with state + TIN) → the members cycled
  // between them. Hovering any node highlights its thread and dims the rest.
  // `el` is a positioned container.
  function render(el, providerId, opts) {
    opts = opts || {};
    var s = opts.model || analyze(providerId);
    if (!s || !s.isRing) {
      el.innerHTML = '<div style="height:110px;display:flex;align-items:center;justify-content:center;color:var(--text3);font-size:11.5px;gap:6px"><i class="ti ti-circle-dashed"></i> No connected providers — nothing to map.</div>';
      return;
    }
    if (typeof d3 === "undefined") { setTimeout(function () { render(el, providerId, opts); }, 80); return; }
    var net = s.net, esc = window.APP ? window.APP.esc : function (x) { return x; };
    var W = el.clientWidth || 620, H = opts.height || 300;
    el.style.position = "relative";
    d3.select(el).selectAll("svg,div.cn-tip").remove();

    // ---- data ----
    var provs = s.providers.slice().sort(function (a, b) { return (a.state || "").localeCompare(b.state || "") || a.name.localeCompare(b.name); });
    var visits = {}; // veteranId -> [providerId]
    (net.vetLinks || []).forEach(function (e) { (visits[e.source] = visits[e.source] || []).indexOf(e.target) < 0 && visits[e.source].push(e.target); });
    var inNet = {}; s.providers.forEach(function (p) { inNet[p.id] = 1; });
    Object.keys(visits).forEach(function (vid) { visits[vid] = visits[vid].filter(function (pid) { return inNet[pid]; }); });
    var vets = net.veterans.filter(Boolean).filter(function (v) { return visits[v.id] && visits[v.id].length; });
    var pairs = aggregate(net).filter(function (p) { return p.referrals > 0; });

    // ---- layout: three rows ----
    var yBiz = Math.round(H * 0.15), yProv = Math.round(H * 0.47), yVet = Math.round(H * 0.83);
    var n = provs.length, span = Math.min(W - 40, n * 250);
    var cw = Math.min(200, span / n - 18), ch = H >= 380 ? 62 : 54;
    var P = {};
    var showFocus = opts.showFocus !== false; // off where there's no "case" (Insights › Network)
    provs.forEach(function (p, i) { P[p.id] = { p: p, x: W / 2 - span / 2 + span * (i + 0.5) / n, y: yProv, focus: showFocus && p.id === providerId }; });
    // members ordered by the average x of the facilities they visited (fewer crossings)
    vets.forEach(function (v) { var xs = visits[v.id].map(function (id) { return P[id] ? P[id].x : W / 2; }); v._ax = xs.reduce(function (a, b) { return a + b; }, 0) / xs.length; });
    vets.sort(function (a, b) { return a._ax - b._ax; });
    var m = vets.length, vspan = Math.min(W - 60, Math.max(m * 96, span * 0.8));
    var V = {};
    vets.forEach(function (v, i) { V[v.id] = { v: v, x: W / 2 - vspan / 2 + vspan * (i + 0.5) / m, y: yVet }; });
    var chain = s.kind === "chain";
    // labels default from the built-in scenarios; a model can override them
    var L = labelsFor(s);

    var svg = d3.select(el).append("svg").attr("width", "100%").attr("height", H).attr("viewBox", "0 0 " + W + " " + H).attr("preserveAspectRatio", "xMidYMid meet").style("display", "block").style("font-family", "IBM Plex Sans,sans-serif");
    var defs = svg.append("defs");
    defs.append("marker").attr("id", "cn-ar").attr("viewBox", "0 -4 8 8").attr("refX", 7).attr("refY", 0).attr("markerWidth", 6).attr("markerHeight", 6).attr("orient", "auto").append("path").attr("d", "M0,-4L8,0L0,4").attr("fill", "#0f6e56");

    // row captions
    var cap = svg.append("g").attr("font-size", 8.5).attr("font-family", "IBM Plex Mono,monospace").attr("letter-spacing", "0.06em").attr("fill", "#8a95a3");
    cap.append("text").attr("x", 12).attr("y", yBiz - 22).text(L.top);
    cap.append("text").attr("x", 12).attr("y", yProv - ch / 2 - 8).text(L.mid + (s.states.length > 1 ? " · " + s.states.join(" · ") : ""));
    cap.append("text").attr("x", 12).attr("y", yVet - 16).text("SHARED MEMBERS · " + m);

    var gEdge = svg.append("g"), gNode = svg.append("g");

    // owner → provider edges
    var bizEdges = provs.map(function (p) {
      var t = P[p.id];
      return gEdge.append("path").attr("d", "M" + (W / 2) + "," + (yBiz + 20) + " C" + (W / 2) + "," + (yBiz + 20 + (t.y - ch / 2 - yBiz - 20) * 0.6) + " " + t.x + "," + (yBiz + 30) + " " + t.x + "," + (t.y - ch / 2))
        .attr("fill", "none").attr("stroke", s.sharedTin ? "#c6362f" : "#b5730e").attr("stroke-width", s.sharedTin ? 2.4 : 1.6).attr("stroke-dasharray", s.sharedTin ? null : "4,3").attr("opacity", 0.75)
        .datum({ prov: p.id });
    });
    // referral arcs between providers (ring)
    var refEdges = pairs.map(function (pr) {
      var A = P[pr.a], B = P[pr.b]; if (!A || !B) return null;
      var l = A.x < B.x ? A : B, r = A.x < B.x ? B : A, x1 = l.x + cw / 2, x2 = r.x - cw / 2, cy = yProv - ch / 2 - 18;
      var path = x2 > x1 ? "M" + x1 + "," + (yProv - 8) + " C" + (x1 + 20) + "," + cy + " " + (x2 - 20) + "," + cy + " " + x2 + "," + (yProv - 8) : "M" + l.x + "," + (yProv - ch / 2) + " Q" + ((l.x + r.x) / 2) + "," + (cy - 30) + " " + r.x + "," + (yProv - ch / 2);
      var e = gEdge.append("path").attr("d", path).attr("fill", "none").attr("stroke", "#0f6e56").attr("stroke-width", 1.8).attr("stroke-dasharray", "5,4").attr("marker-end", "url(#cn-ar)").datum({ a: pr.a, b: pr.b });
      gEdge.append("text").attr("x", (x1 + x2) / 2 || (l.x + r.x) / 2).attr("y", cy - 3).attr("text-anchor", "middle").attr("font-size", 9.5).attr("font-weight", 600).attr("fill", "#0f6e56").text("⇄ " + pr.referrals + " referral" + (pr.referrals > 1 ? "s" : ""));
      return e;
    }).filter(Boolean);
    // member → provider edges
    var vetEdges = [];
    vets.forEach(function (v) {
      var a = V[v.id];
      visits[v.id].forEach(function (pid) {
        var t = P[pid]; if (!t) return;
        vetEdges.push(gEdge.append("path").attr("d", "M" + a.x + "," + (a.y - 7) + " C" + a.x + "," + (a.y - 40) + " " + t.x + "," + (t.y + ch / 2 + 30) + " " + t.x + "," + (t.y + ch / 2))
          .attr("fill", "none").attr("stroke", "#9fb3c8").attr("stroke-width", 1.1).attr("opacity", 0.7).datum({ vet: v.id, prov: pid }));
      });
    });

    // owner node (card)
    var bizName = s.business ? s.business.name : "";
    var bw = Math.min(330, W - 40), bh = 40;
    var biz = gNode.append("g").attr("transform", "translate(" + (W / 2 - bw / 2) + "," + (yBiz - bh / 2) + ")").attr("cursor", "pointer");
    biz.append("rect").attr("width", bw).attr("height", bh).attr("rx", 9).attr("fill", "#10243b");
    biz.append("text").attr("x", 14).attr("y", 17).attr("fill", "#fff").attr("font-size", 12).attr("font-weight", 600).text("⌂  " + trunc(bizName, 38));
    biz.append("text").attr("x", 14).attr("y", 31).attr("fill", "#8fb7c9").attr("font-size", 9.5)
      .text(L.bizSub(n));

    // provider cards
    var provNodes = provs.map(function (p) {
      var t = P[p.id], c = col({ type: "Provider", risk: p.riskScore });
      var g = gNode.append("g").attr("transform", "translate(" + (t.x - cw / 2) + "," + (t.y - ch / 2) + ")").attr("cursor", "pointer").datum({ prov: p.id });
      g.append("rect").attr("width", cw).attr("height", ch).attr("rx", 8).attr("fill", "var(--card, #fff)").attr("stroke", t.focus ? "#0f6e56" : c).attr("stroke-width", t.focus ? 2.6 : 1.4);
      g.append("rect").attr("width", 4).attr("height", ch - 12).attr("x", 0).attr("y", 6).attr("rx", 2).attr("fill", t.focus ? "#0f6e56" : c);
      g.append("text").attr("x", 11).attr("y", 16).attr("font-size", 11).attr("font-weight", 600).attr("fill", "#10243b").text(trunc(shortName(p.name), Math.floor(cw / 6.6)));
      g.append("text").attr("x", 11).attr("y", 30).attr("font-size", 9.5).attr("fill", "#5f6b7a").attr("font-family", "IBM Plex Mono,monospace").text((p.state || "") + " · TIN " + (p.tin || "—"));
      if (ch >= 54) g.append("text").attr("x", 11).attr("y", ch - 9).attr("font-size", 9).attr("font-weight", 600).attr("fill", s.sharedTin ? "#c6362f" : "#b5730e")
        .text(s.sharedTin ? "shared TIN" : "separate TIN");
      g.append("text").attr("x", cw - 9).attr("y", ch - 9).attr("text-anchor", "end").attr("font-size", 9).attr("font-weight", 600).attr("fill", c).text("risk " + p.riskScore);
      if (t.focus) g.append("text").attr("x", cw - 9).attr("y", 16).attr("text-anchor", "end").attr("font-size", 8).attr("font-family", "IBM Plex Mono,monospace").attr("fill", "#0f6e56").text("THIS CASE");
      if (excluded(p)) {
        var bx = g.append("g").attr("transform", "translate(" + (cw - 84) + "," + (-9) + ")");
        bx.append("rect").attr("width", 80).attr("height", 16).attr("rx", 8).attr("fill", "#c6362f");
        bx.append("text").attr("x", 40).attr("y", 11).attr("text-anchor", "middle").attr("font-size", 8.5).attr("font-weight", 700).attr("fill", "#fff").attr("letter-spacing", "0.04em").text("OIG EXCLUDED");
      }
      return g;
    });

    // members
    var vetNodes = vets.map(function (v) {
      var a = V[v.id];
      var g = gNode.append("g").attr("transform", "translate(" + a.x + "," + a.y + ")").attr("cursor", "help").datum({ vet: v.id });
      g.append("rect").attr("x", -34).attr("y", -16).attr("width", 68).attr("height", 52).attr("fill", "transparent"); // generous hover target
      g.append("circle").attr("r", 7).attr("fill", "#e6f1fb").attr("stroke", "#378add").attr("stroke-width", 1.4);
      g.append("text").attr("y", 19).attr("text-anchor", "middle").attr("font-size", 9).attr("fill", "#3d4a58").text(vetShort(v.name));
      g.append("text").attr("y", 30).attr("text-anchor", "middle").attr("font-size", 8.5).attr("font-family", "IBM Plex Mono,monospace").attr("fill", "#378add")
        .text(visits[v.id].length + " " + (L.mid === "FACILITIES" ? "facilities" : "providers"));
      return g;
    });

    // ---- hover: highlight one thread, dim the rest ----
    var tip = d3.select(el).append("div").attr("class", "cn-tip").style("position", "absolute").style("background", "#10243b").style("border-radius", "7px").style("padding", "8px 11px").style("font-size", "11px").style("color", "#e6eef7").style("pointer-events", "none").style("opacity", 0).style("z-index", 10).style("max-width", "250px").style("line-height", "1.45").style("box-shadow", "0 6px 18px rgba(0,0,0,.2)");
    function focusOn(provSet, vetSet, bizOn) {
      var dim = 0.12;
      bizEdges.forEach(function (e) { e.attr("opacity", provSet[e.datum().prov] ? 1 : dim); });
      refEdges.forEach(function (e) { var d = e.datum(); e.attr("opacity", provSet[d.a] && provSet[d.b] ? 1 : dim); });
      vetEdges.forEach(function (e) { var d = e.datum(); var on = vetSet[d.vet] && provSet[d.prov]; e.attr("opacity", on ? 1 : 0.06).attr("stroke", on ? "#378add" : "#9fb3c8").attr("stroke-width", on ? 2 : 1.1); });
      provNodes.forEach(function (g) { g.attr("opacity", provSet[g.datum().prov] ? 1 : 0.3); });
      vetNodes.forEach(function (g) { g.attr("opacity", vetSet[g.datum().vet] ? 1 : 0.25); });
      biz.attr("opacity", bizOn ? 1 : 0.45);
    }
    function reset() {
      bizEdges.forEach(function (e) { e.attr("opacity", 0.75); });
      refEdges.forEach(function (e) { e.attr("opacity", 1); });
      vetEdges.forEach(function (e) { e.attr("opacity", 0.7).attr("stroke", "#9fb3c8").attr("stroke-width", 1.1); });
      provNodes.concat(vetNodes).forEach(function (g) { g.attr("opacity", 1); });
      biz.attr("opacity", 1); tip.style("opacity", 0);
    }
    function showTip(e, html) {
      var r = el.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      tip.html(html).style("opacity", 1).style("left", Math.max(4, Math.min(x + 14, W - 260)) + "px");
      var th = tip.node().offsetHeight; // flip above the cursor when it would run off the bottom
      tip.style("top", (y + th + 16 > H ? Math.max(4, y - th - 12) : Math.max(4, y - 10)) + "px");
    }
    var all = function (list, key) { var o = {}; list.forEach(function (x) { o[x[key || "id"]] = 1; }); return o; };
    biz.on("mouseover", function (e) {
      focusOn(all(provs), all(vets), true);
      showTip(e, "<div style='color:#7fe0d6;margin-bottom:2px'>" + esc(L.bizKind) + "</div><b>" + esc(bizName) + "</b><div style='color:#93a7bf'>" +
        esc(L.bizTip(n)) + (s.synthetic ? "" : "<br>Click to open the business profile") + "</div>");
    }).on("mouseout", reset).on("click", function () { if (window.APP && s.business && !s.synthetic) window.APP.openBusiness(s.business.id); });
    provNodes.forEach(function (g) {
      var pid = g.datum().prov, p = P[pid].p;
      var vs = {}; vets.forEach(function (v) { if (visits[v.id].indexOf(pid) >= 0) vs[v.id] = 1; });
      var pset = {}; pset[pid] = 1;
      g.on("mouseover", function (e) {
        focusOn(pset, vs, true);
        showTip(e, "<div style='color:#ffb4a8;margin-bottom:2px'>" + (P[pid].focus ? "Provider · this case" : "Provider") + "</div><b>" + esc(p.name) + "</b><div style='color:#93a7bf'>" + esc(p.state || "") + " · NPI " + esc(p.npi || "") + " · TIN " + esc(p.tin || "") +
          "<br>risk " + p.riskScore + " · " + Object.keys(vs).length + " shared members" + (excluded(p) ? "<br><span style='color:#ffb4a8'>On the OIG LEIE exclusion list</span>" : "") + (s.synthetic ? "" : "<br>Click to open the report card") + "</div>");
      }).on("mouseout", reset).on("click", function () { if (window.APP && !s.synthetic) window.APP.openProvider(pid); });
    });
    vetNodes.forEach(function (g) {
      var vid = g.datum().vet, v = V[vid].v, route = visits[vid].filter(function (id) { return P[id]; });
      route.sort(function (a, b) { return P[a].x - P[b].x; });
      var vs = {}; vs[vid] = 1;
      g.on("mouseover", function (e) {
        focusOn(all(route.map(function (id) { return { id: id }; })), vs, false);
        showTip(e, "<div style='color:#8fc4f2;margin-bottom:2px'>Affected member</div><b>" + esc(v.name) + "</b><div style='color:#93a7bf'>" + [v.city, v.state].filter(Boolean).map(esc).join(", ") +
          "<br>Billed by " + route.length + ": " + route.map(function (id) { return esc(shortName(P[id].p.name)) + " (" + esc(P[id].p.state || "") + ")"; }).join(" → ") + "</div>");
      }).on("mouseout", reset);
    });
  }

  // Legend matching the layered graph.
  function legendHtml(s, opts) {
    opts = opts || {};
    if (!s || !s.isRing) return "";
    var dot = function (stroke, bg, label) { return '<span class="lg"><span class="dot" style="border-color:' + stroke + ';background:' + bg + '"></span>' + label + '</span>'; };
    var box = function (stroke, label) { return '<span class="lg"><span style="width:14px;height:10px;border:1.5px solid ' + stroke + ';border-radius:3px;background:#fff"></span>' + label + '</span>'; };
    var line = function (color, w, dash, label) { return '<span class="lg"><span style="width:16px;height:0;border-top:' + w + 'px ' + (dash ? "dashed" : "solid") + ' ' + color + '"></span>' + label + '</span>'; };
    var L = labelsFor(s);
    var out = [dot("#10243b", "#10243b", L.bizKind)];
    if (opts.showFocus !== false) out.push(box("#0f6e56", "Provider in this case"));
    out.push(box("#c6362f", opts.showFocus !== false ? "Linked provider · high risk" : "Provider · high risk"), dot("#378add", "#e6f1fb", "Shared member"));
    out.push(s.sharedTin ? line("#c6362f", 2.4, false, L.link) : line("#b5730e", 1.6, true, L.link));
    if (s.referralCount) out.push(line("#0f6e56", 1.8, true, "Referrals"));
    out.push(line("#9fb3c8", 1.1, false, "Billed for member"));
    return out.join("");
  }

  function excluded(p) { return !!(p && (p.excluded || (window.DP && window.DP.LEIE_EXCLUSIONS && window.DP.LEIE_EXCLUSIONS[p.id]))); }
  // Graph wording for a network. Built-in scenarios derive it from `kind`;
  // synthetic networks (assets/networks.js) pass `labels` on the model.
  function labelsFor(s) {
    var chain = s.kind === "chain", o = s.labels || {};
    return {
      top: o.top || (chain ? "OWNER" : "BILLING ENTITY"),
      mid: o.mid || (chain ? "FACILITIES" : "PROVIDERS"),
      bizKind: o.bizKind || (chain ? "Holding company" : "Billing entity"),
      link: o.link || (chain ? "Common ownership" : "Shared TIN"),
      bizSub: o.bizSub || function (n) { return chain ? "Holding company" + (s.officer ? " · officer " + s.officer : "") + " · controls " + n : "One billing entity · " + n + " providers bill under it"; },
      bizTip: o.bizTip || function (n) { return chain ? "Controls " + n + " facilities in " + s.states.join(", ") + " under separate TINs" + (s.officer ? " · officer " + s.officer : "") : n + " providers bill under one TIN"; }
    };
  }
  function trunc(t, n) { t = String(t || ""); return t.length > n ? t.slice(0, Math.max(1, n - 1)) + "…" : t; }
  function vetShort(name) { var p = String(name || "").split(" "); return p.length > 1 ? p[0].charAt(0) + ". " + p[p.length - 1] : name; }

  function col(d) {
    if (d.type === "Business") return "#10243b";
    if (d.type === "Provider") return d.risk >= 80 ? "#c6362f" : d.risk >= 50 ? "#c77d11" : "#10243b";
    return "#378add";
  }
  function rad(d) { return d.type === "Business" ? 26 : d.type === "Provider" ? (d.focus ? 22 : 19) : 7; }
  function shortName(n) { return n.replace(" Center", "").replace(" Treatment", "").replace(" Associates", "").replace(" Partners", ""); }
  function bizLabel(n) { n = n.replace(" LLC", "").replace(" Holdings", "").replace(" Behavioral", ""); return n.length > 20 ? n.slice(0, 19) + "…" : n; }

  window.Collusion = { analyze: analyze, narrativeHtml: narrativeHtml, render: render, aggregate: aggregate, legendHtml: legendHtml };
})();
