/* Network view — All networks (portfolio overview: cross-state vs in-state by
   scheme type, network table) plus the two worked examples (shared-TIN ring,
   residential chain) and any synthetic network, each drawn with the layered
   Collusion graph. Network data: assets/networks.js. */
(function () {
  window.Views = window.Views || {};

  window.Views.network = {
    render: function (mount) {
      var scnBtn = function (id, label, sub) { return '<button class="nscn" data-scn="' + id + '" style="border:none;background:none;border-radius:6px;padding:5px 11px;font-size:12px;cursor:pointer;color:var(--text2);font-family:var(--sans);display:flex;flex-direction:column;align-items:flex-start;line-height:1.2"><span style="font-weight:500">' + label + '</span><span style="font-size:9.5px;color:var(--text3)">' + sub + '</span></button>'; };
      mount.innerHTML =
        '<div class="page">' +
        '<div class="page-head"><div><div class="page-title">Provider network</div><div class="page-sub" id="n-sub">Detected provider networks.</div></div>' +
        '<div style="display:flex;gap:10px;align-items:center">' +
        '<div style="display:flex;background:var(--surface);border:0.5px solid var(--border);border-radius:8px;padding:2px">' + scnBtn("all", "All networks", window.NETWORKS.list().length + " detected") + scnBtn("ring", "Shared-TIN ring", "one billing entity") + scnBtn("chain", "Residential chain", "AZ → CA → NV") + '</div>' +
        window.EXPORT.group("nw") +
        '</div></div>' +
        '<div id="n-overview" hidden></div>' +
        '<div id="n-back" hidden style="margin-bottom:8px"></div>' +
        '<div class="canvas" id="n-canvas"></div>' +
        '<div class="legend" id="n-legend"></div>' +
        '<div id="n-boxes" style="display:flex;gap:10px;margin-top:4px"></div>' +
        '</div>';

      var current = "ring";
      function setActive(scn) { mount.querySelectorAll(".nscn").forEach(function (b) { var on = b.getAttribute("data-scn") === scn; b.style.background = on ? "var(--card)" : "none"; b.style.color = on ? "var(--ink)" : "var(--text2)"; b.style.boxShadow = on ? "0 1px 2px rgba(0,17,65,.08)" : "none"; }); }
      // scn: "all" (portfolio overview) · "ring" / "chain" (worked examples) · "N03"… (a synthetic network)
      function paint(scn) {
        current = scn; setActive(scn === "ring" || scn === "chain" ? scn : "all");
        var ov = document.getElementById("n-overview"), cv = document.getElementById("n-canvas"), back = document.getElementById("n-back");
        var legend = document.getElementById("n-legend"), boxes = document.getElementById("n-boxes");
        ov.hidden = scn !== "all"; cv.hidden = scn === "all"; legend.hidden = scn === "all"; back.hidden = scn === "all";
        back.innerHTML = '<button class="btn" id="n-back-btn"><i class="ti ti-arrow-left"></i> All networks</button>';
        document.getElementById("n-back-btn").onclick = function () { paint("all"); };
        if (scn === "all") { ov.innerHTML = overviewHtml(); boxes.innerHTML = ""; wireOverview(ov, paint); return; }
        if (scn === "ring" || scn === "chain") {
          var focus = scn === "chain" ? "PR300" : "PR001";
          // the chain is drawn down to the claim: the flagged $17K claim plus its look-alikes
          var an = window.Collusion.analyze(focus);
          var claims = scn === "chain" ? window.DP.getNetworkClaims(an.providers.map(function (p) { return p.id; }), SEED_CLAIM) : null;
          legend.innerHTML = window.Collusion.legendHtml(an, { showFocus: false, claims: !!claims });
          boxes.innerHTML = scn === "chain" ? boxesChain() : boxesRing();
          cv.style.height = claims ? "560px" : "";
          window.Collusion.render(cv, focus, { height: claims ? 560 : 440, showFocus: false, claims: claims });
          return;
        }
        var model = window.NETWORKS.model(scn), row = window.NETWORKS.list().filter(function (r) { return r.id === scn; })[0];
        legend.innerHTML = window.Collusion.legendHtml(model, { showFocus: false });
        boxes.innerHTML = boxesSynthetic(row, model);
        cv.style.height = "";
        window.Collusion.render(cv, null, { height: 440, showFocus: false, model: model });
      }
      mount.querySelectorAll(".nscn").forEach(function (b) { b.onclick = function () { paint(b.getAttribute("data-scn")); }; });
      window.EXPORT.wire("nw", {
        csv: function () { if (current === "all" || /^N/.test(current)) return exportAll("csv"); var d = netData(current); window.EXPORT.csv("collusion-network-" + current, d.eHead, d.eRows); },
        xls: function () { if (current === "all" || /^N/.test(current)) return exportAll("xls"); var d = netData(current); window.EXPORT.xls("collusion-network-" + current, "Edges", d.eHead, d.eRows); },
        pdf: function () {
          if (current === "all" || /^N/.test(current)) return exportAll("pdf");
          var d = netData(current), s = window.Collusion.analyze(d.focus);
          var summary = s.kind === "chain"
            ? window.APP.esc(s.registration || "") + " — " + s.providerCount + " facilities across " + s.states.join("/") + ", shared officer " + window.APP.esc(s.officer || "") + ", " + s.sharedPct + "% shared members, separate TINs (hidden common ownership)."
            : s.providerCount + " providers operating as one billing entity — shared TIN " + (s.tin || "") + ", " + s.referralCount + " referrals, " + s.sharedPct + "% shared members.";
          window.EXPORT.pdf("Collusion network — " + (current === "chain" ? "residential chain" : "shared-TIN ring"),
            "<div class='card'>" + window.EXPORT.htmlEsc(summary) + "</div><h2>Providers</h2>" + window.EXPORT.tableHtml(d.pHead, d.pRows) +
            "<h2>Shared-identifier edges</h2>" + window.EXPORT.tableHtml(["Type", "Source", "Target", "Detail"], d.eRows.map(function (e) { return [e[0], e[2], e[4], e[5]]; })));
        }
      });
      paint(window.APP.state.networkScenario || "all");
      window.APP.state.networkScenario = null;
    }
  };

  // the prepay claim the guided story starts from (Sonoran Recovery Center, lead 20721)
  var SEED_CLAIM = "C00585", SEED_LEAD = "20721", SEED_AMOUNT = 17280;

  // ---------- All networks (portfolio overview) ----------
  function usd(n) { return window.DP.usd(n); }
  function pct(a, b) { return b ? Math.round(a / b * 100) : 0; }
  var STATUS_TONE = { "New": ["var(--surface)", "var(--text2)"], "Under review": ["var(--med-bg)", "var(--med-tx)"], "Case open": ["var(--accent-l)", "var(--accent-d)"], "Referred to OIG": ["var(--high-bg)", "var(--high-tx)"] };
  var ovFilter = { geo: "", scheme: "" };

  function overviewHtml() {
    var S = window.NETWORKS.stats(), P = window.NETWORKS.PLAN, esc = window.APP.esc;
    var tile = function (label, val, sub) { return '<div class="card" style="flex:1;min-width:140px;margin:0"><div style="font-size:10.5px;color:var(--text3);text-transform:uppercase;letter-spacing:.04em">' + label + '</div><div style="font-weight:600;font-size:22px;margin-top:2px;font-variant-numeric:tabular-nums">' + val + '</div>' + (sub ? '<div style="font-size:11px;color:var(--text2);margin-top:1px">' + sub + '</div>' : '') + '</div>'; };
    // one 100% bar: cross-state (dark) vs within one state (light), with counts
    var bar = function (label, cross, total, strong) {
      var c = pct(cross, total), i = 100 - c;
      return '<div style="display:grid;grid-template-columns:minmax(150px,210px) 1fr 104px;gap:10px;align-items:center;padding:6px 0' + (strong ? ';border-bottom:0.5px solid var(--border2);padding-bottom:10px;margin-bottom:4px' : '') + '">' +
        '<div style="font-size:12px;' + (strong ? 'font-weight:600' : '') + '">' + esc(label) + ' <span class="muted" style="font-size:10.5px">· ' + total + '</span></div>' +
        '<div style="display:flex;height:18px;border-radius:5px;overflow:hidden;background:var(--surface)">' +
        (cross ? '<div title="' + cross + ' cross-state" style="width:' + c + '%;background:#001141;color:#fff;font-size:10px;display:flex;align-items:center;padding-left:6px;white-space:nowrap">' + (c >= 18 ? c + '%' : '') + '</div>' : '') +
        (total - cross ? '<div title="' + (total - cross) + ' within one state" style="width:' + i + '%;background:#a6c8ff;color:#001d6c;font-size:10px;display:flex;align-items:center;justify-content:flex-end;padding-right:6px;white-space:nowrap">' + (i >= 18 ? i + '%' : '') + '</div>' : '') +
        '</div>' +
        '<div class="mono" style="font-size:10.5px;color:var(--text2);text-align:right;white-space:nowrap">' + cross + ' cross · ' + (total - cross) + ' in</div></div>';
    };
    var split = bar("All networks", S.cross, S.networks, true) + S.byScheme.map(function (b) { return bar(b.label, b.cross, b.total); }).join("");
    var mostCross = S.byScheme.slice().sort(function (a, b) { return pct(b.cross, b.total) - pct(a.cross, a.total); });
    var chip = function (k, v, label) { var on = ovFilter[k] === v; return '<button class="qscope nv-f' + (on ? " active" : "") + '" data-k="' + k + '" data-v="' + v + '">' + label + '</button>'; };
    return '<div style="display:flex;flex-direction:column;gap:10px">' + funnelHtml() +
      '<div style="display:flex;gap:10px;flex-wrap:wrap">' +
      tile("Networks detected", S.networks, "linked by ownership, TIN, agent, recruiter or address") +
      tile("Cross state lines", S.cross + ' <span style="font-size:14px;color:var(--text2);font-weight:500">· ' + S.crossPct + '%</span>', "providers in 2+ states") +
      tile("Within one state", S.inState + ' <span style="font-size:14px;color:var(--text2);font-weight:500">· ' + (100 - S.crossPct) + '%</span>', "all providers in one state") +
      tile("Providers involved", S.facilities, S.members.toLocaleString() + " members affected") +
      tile("Identified at risk", bigUsd(S.atRisk), P.lookbackMonths + "-month lookback · " + S.claims.toLocaleString() + " claims") +
      '</div>' +
      '<div class="card" style="padding:0;overflow:hidden">' +
      '<div style="padding:9px 12px;border-bottom:0.5px solid var(--border2);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">' +
      '<div style="font-weight:500;font-size:12.5px"><i class="ti ti-chart-dots-3" style="color:var(--accent-d)"></i> Everything connected <span class="muted" style="font-weight:400;font-size:10.5px">· ' + S.networks + ' networks · ' + S.facilities + ' providers · ' + S.members.toLocaleString() + ' members · ' + window.NETWORKS.BRIDGES.length + ' cross-network links</span></div>' +
      '<div style="font-size:10.5px;color:var(--text3)"><i class="ti ti-pointer"></i> Hover a hub or a red link · click a hub to open its network</div></div>' +
      '<div id="nv-map" style="position:relative;height:540px;background:var(--surface)"></div>' +
      '<div class="legend" style="margin:0;padding:8px 12px;border-top:0.5px solid var(--border2)">' + mapLegend() + '</div></div>' +
      '<div class="card"><div style="display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:6px;margin-bottom:6px"><div style="font-weight:500;font-size:12.5px"><i class="ti ti-map-2" style="color:var(--accent-d)"></i> Cross-state vs within one state <span class="muted" style="font-weight:400;font-size:10.5px">· by scheme type</span></div>' +
      '<div style="display:flex;gap:12px;font-size:11px;color:var(--text2)"><span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#001141;vertical-align:-1px"></span> Cross-state</span><span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#a6c8ff;vertical-align:-1px"></span> Within one state</span></div></div>' +
      '<div style="overflow-x:auto"><div style="min-width:480px">' + split + '</div></div>' +
      '<div style="font-size:11px;color:var(--text2);margin-top:6px"><i class="ti ti-info-circle"></i> ' + esc(mostCross[0].label) + ' networks cross state lines most often (' + pct(mostCross[0].cross, mostCross[0].total) + '%); ' + esc(mostCross[mostCross.length - 1].label.toLowerCase()) + 's mostly stay in one state (' + pct(mostCross[mostCross.length - 1].inState, mostCross[mostCross.length - 1].total) + '%).</div></div>' +
      '<div class="card" style="padding:0;overflow:hidden">' +
      '<div style="padding:9px 12px;border-bottom:0.5px solid var(--border2);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px"><div style="font-weight:500;font-size:12.5px"><i class="ti ti-affiliate" style="color:var(--accent-d)"></i> Networks <span class="muted" style="font-weight:400;font-size:10.5px">· click a row to open its graph</span></div>' +
      '<div style="display:flex;gap:2px;flex-wrap:wrap;background:var(--surface);border:0.5px solid var(--border);border-radius:8px;padding:2px">' + chip("geo", "", "All") + chip("geo", "cross", "Cross-state") + chip("geo", "in", "One state") + '</div>' +
      '<select class="input" id="nv-scheme" style="width:auto;font-size:12px;padding:4px 8px"><option value="">All scheme types</option>' + window.NETWORKS.SCHEME_ORDER.map(function (k) { return '<option value="' + k + '"' + (ovFilter.scheme === k ? " selected" : "") + '>' + window.NETWORKS.SCHEMES[k].label + '</option>'; }).join("") + '</select></div>' +
      '<div style="overflow-x:auto"><table style="width:100%"><thead><tr><th>Network</th><th>Scheme</th><th>States</th><th class="right">Providers</th><th class="right">Members</th><th class="right">At risk · ' + P.lookbackMonths + ' mo</th><th class="right">Flagged now</th><th>Status</th><th class="right">Risk</th></tr></thead><tbody id="nv-body">' + rowsHtml() + '</tbody></table></div>' +
      '<div style="padding:8px 12px;font-size:10.5px;color:var(--text3);border-top:0.5px solid var(--border2)">At risk = paid claims matching the network\'s pattern over a ' + P.lookbackMonths + '-month lookback. Flagged now = paid + pending claims already flagged at its providers.</div></div>' +
      '</div>';
  }
  // ---------- one flagged claim → $100M: the funnel + line-by-line contrast ----------
  function funnelHtml() {
    var F = window.NETWORKS.funnel(SEED_AMOUNT), S = window.NETWORKS.stats(), P = window.NETWORKS.PLAN, esc = window.APP.esc;
    var short = bigUsd, total = S.atRisk;
    var lines = Math.round(total / P.lineAvg), hours = Math.round(lines * P.minutesPerLine / 60);
    var spend = P.annualClaims * P.lookbackMonths / 12;
    var stages = F.map(function (f, i) {
      var last = i === F.length - 1, mult = i ? Math.round(f.amount / F[i - 1].amount) : 0;
      return (i ? '<div class="fn-arrow" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;color:var(--text3);min-width:34px"><i class="ti ti-chevron-right" style="font-size:16px"></i><span class="mono" style="font-size:11.5px;font-weight:600;color:var(--accent-d)">×' + mult + '</span></div>' : '') +
        '<div class="fn-stage" data-k="' + f.key + '" style="flex:1;min-width:128px;border-radius:8px;padding:9px 10px;cursor:pointer;' +
        (i === 0 ? 'background:var(--high-bg);border:0.5px solid #f3c9c9' : last ? 'background:#001141;color:#fff' : 'background:var(--surface);border:0.5px solid var(--border)') + '">' +
        '<div style="font-size:10px;text-transform:uppercase;letter-spacing:.04em;' + (last ? 'color:#78a9ff' : i === 0 ? 'color:var(--high-tx)' : 'color:var(--text3)') + '">' + esc(f.label) + '</div>' +
        '<div style="font-weight:600;font-size:' + (last ? 24 : 19) + 'px;margin-top:2px;font-variant-numeric:tabular-nums">' + (i === 0 ? window.DP.usd(f.amount) : short(f.amount)) + '</div>' +
        '<div style="font-size:10.5px;line-height:1.35;margin-top:2px;' + (last ? 'color:#dde1e6' : 'color:var(--text2)') + '">' + esc(f.detail) + '</div>' +
        '<div class="mono" style="font-size:9.5px;margin-top:3px;' + (last ? 'color:#c1c7cd' : 'color:var(--text3)') + '">' + esc(f.count) + '</div></div>';
    }).join("");
    return '<div class="card" id="nv-funnel" style="margin:0">' +
      '<div style="display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:6px;margin-bottom:8px">' +
      '<div style="font-weight:600;font-size:13.5px"><i class="ti ti-zoom-money" style="color:var(--accent-d)"></i> From one flagged claim to ' + short(total) + '</div>' +
      '<div style="font-size:10.5px;color:var(--text3)">Payer with ' + short(P.annualClaims) + ' in annual claims · ' + P.lookbackMonths + '-month lookback</div></div>' +
      '<div style="display:flex;align-items:stretch;overflow-x:auto;padding-bottom:2px">' + stages + '</div>' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:10px">' +
      '<div style="flex:1;min-width:240px;border:0.5px dashed var(--border);border-radius:8px;padding:9px 11px;color:var(--text2)">' +
      '<div style="font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:var(--text3)"><i class="ti ti-list-details"></i> Line by line</div>' +
      '<div style="font-size:12px;line-height:1.5;margin-top:3px">Finding ' + short(total) + ' one ~$' + (P.lineAvg / 1000) + 'K line at a time means reviewing <b>' + lines.toLocaleString() + ' claim lines</b>, about <b>' + hours.toLocaleString() + ' analyst hours</b> at ' + P.minutesPerLine + ' minutes a line, and still missing the ownership, address and billing-agent links that tie them together.</div></div>' +
      '<div style="flex:1;min-width:240px;background:var(--accent-l);border:0.5px solid var(--accent);border-radius:8px;padding:9px 11px">' +
      '<div style="font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:var(--accent-d)"><i class="ti ti-affiliate"></i> Network first</div>' +
      '<div style="font-size:12px;line-height:1.5;margin-top:3px;color:var(--ink)">One flag opens the network. Analysts work <b>' + S.networks + ' networks</b> of <b>' + S.facilities + ' providers</b> as ' + S.networks + ' cases, each with its evidence already assembled, instead of ' + lines.toLocaleString() + ' separate lines.</div></div></div>' +
      '<div style="font-size:10.5px;color:var(--text3);margin-top:8px"><i class="ti ti-info-circle"></i> ' + short(total) + ' is ' + (total / spend * 100).toFixed(2) + '% of the ' + short(spend) + ' paid over the lookback. Synthetic figures for demonstration.</div></div>';
  }
  // $17,280 · $2.7M · $102.7M · $10B
  function bigUsd(n) {
    var t = function (x) { return String(Math.round(x * 10) / 10); };
    return n >= 1e9 ? "$" + t(n / 1e9) + "B" : n >= 1e6 ? "$" + t(n / 1e6) + "M" : window.DP.usd(n);
  }
  function wireFunnel(ov, paint) {
    ov.querySelectorAll(".fn-stage").forEach(function (el) {
      el.onclick = function () {
        var k = el.getAttribute("data-k");
        if (k === "claim") window.APP.openAllegation(SEED_LEAD);
        else if (k === "provider") window.APP.openProvider("PR300");
        else if (k === "network") { paint("chain"); window.scrollTo(0, 0); }
        else { var m = ov.querySelector(k === "linked" ? "#nv-map" : "#nv-body"); if (m) m.scrollIntoView({ behavior: "smooth", block: "center" }); }
      };
    });
  }

  // ---------- the full map: every network on one force graph ----------
  var HUB_COLOR = { chain: "#b5730e", ring: "#c6362f", agent: "#8a3ffc", recruit: "#0043ce", shell: "#0072c3" };
  function mapLegend() {
    var dot = function (c, bg, label, r) { return '<span class="lg"><span style="display:inline-block;width:' + r + 'px;height:' + r + 'px;border-radius:50%;background:' + bg + ';border:2px solid ' + c + '"></span>' + label + '</span>'; };
    return window.NETWORKS.SCHEME_ORDER.map(function (k) { return dot(HUB_COLOR[k], "#001141", window.NETWORKS.SCHEMES[k].bizKind, 11); }).join("") +
      dot("#c6362f", "#fbe3e3", "Provider", 9) + dot("#1192e8", "#bae6ff", "Affected member", 7) +
      '<span class="lg"><span style="width:18px;height:0;border-top:2px dashed #d9480f"></span>Cross-network link</span>' +
      '<span class="lg" style="color:var(--text3)">Hub size = dollars at risk</span>';
  }
  function drawMap(el, paint) {
    if (!el) return;
    if (typeof d3 === "undefined") { setTimeout(function () { drawMap(el, paint); }, 80); return; }
    var G = window.NETWORKS.fullGraph(), esc = window.APP.esc;
    var W = el.clientWidth || 1000, H = el.clientHeight || 540;
    d3.select(el).selectAll("*").remove();
    var maxExp = d3.max(G.nodes.filter(function (n) { return n.kind === "hub"; }), function (n) { return n.atRisk; }) || 1;
    var R = function (n) { return n.kind === "hub" ? 10 + 14 * Math.sqrt(n.atRisk / maxExp) : n.kind === "provider" ? 6.5 : 3.2; };
    var pcol = function (r) { return r >= 80 ? "#c6362f" : r >= 50 ? "#c77d11" : "#001141"; };
    // Pass 1: lay out the 20 hubs (with their cross-network links), then stretch
    // that layout to fill the canvas and pin the hubs in place.
    var hubs = G.nodes.filter(function (n) { return n.kind === "hub"; });
    var hubIdx = {}; hubs.forEach(function (h, i) { hubIdx[h.id] = h; var a = i / hubs.length * Math.PI * 2; h.x = W / 2 + Math.cos(a) * 200; h.y = H / 2 + Math.sin(a) * 150; });
    var hubLinks = G.links.filter(function (l) { return l.kind === "bridge"; }).map(function (l) { return { source: l.source, target: l.target }; });
    var hs = d3.forceSimulation(hubs).stop()
      .force("link", d3.forceLink(hubLinks).id(function (d) { return d.id; }).distance(130).strength(0.6))
      .force("charge", d3.forceManyBody().strength(-700))
      .force("x", d3.forceX(W / 2).strength(0.04)).force("y", d3.forceY(H / 2).strength(0.07));
    for (var t = 0; t < 400; t++) hs.tick();
    var padX = 90, padTop = 58, padBot = 58;
    var xs = d3.extent(hubs, function (h) { return h.x; }), ys = d3.extent(hubs, function (h) { return h.y; });
    hubs.forEach(function (h) {
      h.fx = h.x = padX + (h.x - xs[0]) / ((xs[1] - xs[0]) || 1) * (W - padX * 2);
      h.fy = h.y = padTop + (h.y - ys[0]) / ((ys[1] - ys[0]) || 1) * (H - padTop - padBot);
    });
    // Pass 2 starts each network's providers and members on their own hub
    var hubOf = {}; hubs.forEach(function (h) { hubOf[h.net] = h; });
    G.nodes.forEach(function (n) { if (n.kind !== "hub") { var h = hubOf[n.net]; n.x = h.x + (Math.random() - 0.5) * 30; n.y = h.y + (Math.random() - 0.5) * 30; } });

    var svg = d3.select(el).append("svg").attr("width", "100%").attr("height", H).attr("viewBox", "0 0 " + W + " " + H).style("display", "block").style("font-family", "IBM Plex Sans,sans-serif");
    var gL = svg.append("g"), gN = svg.append("g"), gT = svg.append("g");
    var lk = gL.selectAll("line").data(G.links).join("line")
      .attr("stroke", function (d) { return d.kind === "bridge" ? "#d9480f" : d.kind === "hub" ? "#9aa8b6" : "#c9d3dc"; })
      .attr("stroke-width", function (d) { return d.kind === "bridge" ? 2.2 : d.kind === "hub" ? 1.1 : 0.7; })
      .attr("stroke-dasharray", function (d) { return d.kind === "bridge" ? "6,4" : null; })
      .attr("opacity", function (d) { return d.kind === "vet" ? 0.8 : 1; });
    // wide invisible hit line for the cross-network links
    var hit = gL.selectAll("line.hit").data(G.links.filter(function (d) { return d.kind === "bridge"; })).join("line").attr("class", "hit").attr("stroke", "transparent").attr("stroke-width", 12).style("cursor", "help");
    var nd = gN.selectAll("circle").data(G.nodes).join("circle")
      .attr("r", R)
      .attr("fill", function (d) { return d.kind === "hub" ? "#001141" : d.kind === "provider" ? pcol(d.risk) + "33" : "#bae6ff"; })
      .attr("stroke", function (d) { return d.kind === "hub" ? HUB_COLOR[d.scheme] : d.kind === "provider" ? (d.excluded ? "#8b1a13" : pcol(d.risk)) : "#1192e8"; })
      .attr("stroke-width", function (d) { return d.kind === "hub" ? 3 : d.kind === "provider" ? (d.excluded ? 2.4 : 1.3) : 0.8; })
      .style("cursor", function (d) { return d.kind === "hub" ? "pointer" : "default"; });
    var lab = gT.selectAll("text").data(hubs).join("text")
      .text(function (d) { return shortHub(d.name); }).attr("text-anchor", "middle").attr("font-size", 10).attr("font-weight", 600).attr("fill", "var(--ink, #001141)")
      .attr("paint-order", "stroke").attr("stroke", "var(--surface, #f4f6f8)").attr("stroke-width", 3).style("pointer-events", "none");

    var sim = d3.forceSimulation(G.nodes)
      .force("link", d3.forceLink(G.links).id(function (d) { return d.id; }).distance(function (l) { return l.kind === "hub" ? 28 : 14; }).strength(function (l) { return l.kind === "bridge" ? 0 : 1; }))
      .force("charge", d3.forceManyBody().strength(function (d) { return d.kind === "provider" ? -45 : d.kind === "veteran" ? -10 : -60; }).distanceMax(70))
      .force("collide", d3.forceCollide().radius(function (d) { return R(d) + (d.kind === "hub" ? 4 : 1.5); }));
    function ticked() {
      G.nodes.forEach(function (n) { var r = R(n) + 2; n.x = Math.max(r, Math.min(W - r, n.x)); n.y = Math.max(r + 12, Math.min(H - r, n.y)); });
      lk.attr("x1", function (d) { return d.source.x; }).attr("y1", function (d) { return d.source.y; }).attr("x2", function (d) { return d.target.x; }).attr("y2", function (d) { return d.target.y; });
      hit.attr("x1", function (d) { return d.source.x; }).attr("y1", function (d) { return d.source.y; }).attr("x2", function (d) { return d.target.x; }).attr("y2", function (d) { return d.target.y; });
      nd.attr("cx", function (d) { return d.x; }).attr("cy", function (d) { return d.y; });
      lab.attr("x", function (d) { return d.x; }).attr("y", function (d) { return d.y - R(d) - 5; });
    }
    sim.on("tick", function () { if (!document.body.contains(el)) { sim.stop(); return; } ticked(); });
    ticked(); // paint once now: hubs and links are pinned, so the map is usable even before the first animation frame
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) { sim.stop(); for (var i = 0; i < 300; i++) sim.tick(); ticked(); }

    // hover: light up one network (and any network linked to it)
    var tip = d3.select(el).append("div").style("position", "absolute").style("background", "#001141").style("color", "#f2f4f8").style("border-radius", "7px").style("padding", "8px 11px").style("font-size", "11px").style("line-height", "1.45").style("max-width", "260px").style("pointer-events", "none").style("opacity", 0).style("box-shadow", "0 6px 18px rgba(0,0,0,.2)");
    function showTip(e, html) { var r = el.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top; tip.html(html).style("opacity", 1).style("left", Math.max(4, Math.min(x + 14, W - 270)) + "px"); var th = tip.node().offsetHeight; tip.style("top", (y + th + 16 > H ? Math.max(4, y - th - 12) : y + 12) + "px"); }
    function focusNets(nets) {
      nd.attr("opacity", function (d) { return nets[d.net] ? 1 : 0.12; });
      lab.attr("opacity", function (d) { return nets[d.net] ? 1 : 0.2; });
      lk.attr("opacity", function (d) { var a = d.source.net, b = d.target.net; return nets[a] && nets[b] ? 1 : 0.06; });
    }
    function reset() { nd.attr("opacity", 1); lab.attr("opacity", 1); lk.attr("opacity", function (d) { return d.kind === "vet" ? 0.8 : 1; }); tip.style("opacity", 0); }
    var bridgesOf = function (net) { return window.NETWORKS.BRIDGES.filter(function (b) { return b.a === net || b.b === net; }); };
    nd.filter(function (d) { return d.kind === "hub"; })
      .on("mouseover", function (e, d) {
        var nets = {}; nets[d.net] = 1; var br = bridgesOf(d.net); br.forEach(function (b) { nets[b.a] = 1; nets[b.b] = 1; });
        focusNets(nets);
        var row = window.NETWORKS.list().filter(function (r) { return r.id === d.net; })[0];
        showTip(e, "<div style='color:#78a9ff;margin-bottom:2px'>" + esc(window.NETWORKS.SCHEMES[d.scheme].label) + "</div><b>" + esc(d.name) + "</b><div style='color:#c1c7cd'>" +
          row.facilities + " providers · " + row.members.toLocaleString() + " members · " + row.states.join(", ") + "<br>" + bigUsd(row.atRisk) + " at risk · " + row.claims.toLocaleString() + " claims" +
          (br.length ? "<br><span style='color:#ffb89a'>Linked to " + br.length + " other network" + (br.length > 1 ? "s" : "") + "</span>" : "") + "<br>Click to open its network</div>");
      })
      .on("mouseout", reset)
      .on("click", function (e, d) { paint(d.core ? d.scenario : d.net); window.scrollTo(0, 0); });
    nd.filter(function (d) { return d.kind !== "hub"; })
      .on("mouseover", function (e, d) {
        var nets = {}; nets[d.net] = 1; focusNets(nets);
        showTip(e, d.kind === "provider" ? "<div style='color:#ffb4a8;margin-bottom:2px'>Provider</div><b>" + esc(d.name) + "</b><div style='color:#c1c7cd'>" + esc(d.state || "") + " · risk " + d.risk + (d.excluded ? "<br><span style='color:#ffb4a8'>On the OIG exclusion list</span>" : "") + "</div>"
          : "<div style='color:#82cfff;margin-bottom:2px'>Affected member</div><b>" + esc(d.name) + "</b><div style='color:#c1c7cd'>Billed by more than one provider in this network</div>");
      })
      .on("mouseout", reset);
    hit.on("mouseover", function (e, d) {
      var nets = {}; nets[d.source.net] = 1; nets[d.target.net] = 1; focusNets(nets);
      showTip(e, "<div style='color:#ffb89a;margin-bottom:2px'>Cross-network link · " + esc(d.type) + "</div><b>" + esc(shortHub(d.source.name)) + " ↔ " + esc(shortHub(d.target.name)) + "</b><div style='color:#c1c7cd'>" + esc(d.detail) + "</div>");
    }).on("mouseout", reset);
  }
  function shortHub(n) { n = String(n || "").replace(/ · shared mailing address/, "").replace(/\s+(LLC|Inc\.|Group|Partners|Holdings|Services|Solutions|Network)$/i, ""); return n.length > 26 ? n.slice(0, 25) + "…" : n; }

  function rowsHtml() {
    var esc = window.APP.esc;
    var rows = window.NETWORKS.list().filter(function (r) {
      return (!ovFilter.geo || (ovFilter.geo === "cross") === r.crossState) && (!ovFilter.scheme || r.scheme === ovFilter.scheme);
    }).slice().sort(function (a, b) { return b.atRisk - a.atRisk; });
    if (!rows.length) return '<tr><td colspan="9" class="muted" style="padding:14px;text-align:center">No networks match these filters.</td></tr>';
    return rows.map(function (r) {
      var tone = STATUS_TONE[r.status] || STATUS_TONE.New;
      var states = r.states.map(function (s) { return '<span class="tag" style="font-size:10px">' + s + '</span>'; }).join(" ");
      return '<tr class="nv-row" data-id="' + r.id + '" style="cursor:pointer">' +
        '<td><div style="font-weight:500">' + esc(r.name) + '' + '</div><div style="font-size:10.5px;color:var(--text3)">' + esc(r.type) + (r.excluded ? ' · <span style="color:var(--high-tx)">' + r.excluded + ' OIG-excluded</span>' : '') + '</div></td>' +
        '<td style="font-size:11.5px">' + esc(window.NETWORKS.SCHEMES[r.scheme].short) + '</td>' +
        '<td><div style="display:flex;gap:3px;flex-wrap:wrap;align-items:center">' + states + (r.crossState ? ' <i class="ti ti-arrows-exchange" title="Cross-state" style="color:var(--text3);font-size:12px"></i>' : '') + '</div></td>' +
        '<td class="right mono">' + r.facilities + '</td><td class="right mono">' + r.members.toLocaleString() + '</td>' +
        '<td class="right mono" style="font-weight:600">' + bigUsd(r.atRisk) + '</td>' +
        '<td class="right mono" style="color:var(--text2)">' + usd(r.exposure) + '</td>' +
        '<td><span class="pill" style="background:' + tone[0] + ';color:' + tone[1] + ';font-size:10.5px">' + esc(r.status) + '</span></td>' +
        '<td class="right">' + window.UI.riskChip(r.risk) + '</td></tr>';
    }).join("");
  }
  function wireOverview(ov, paint) {
    var wireRows = function () {
      ov.querySelectorAll(".nv-row").forEach(function (tr) {
        tr.onclick = function () { var r = window.NETWORKS.list().filter(function (x) { return x.id === tr.getAttribute("data-id"); })[0]; paint(r.core ? r.scenario : r.id); window.scrollTo(0, 0); };
      });
    };
    // filters redraw only the table, so the map keeps its layout
    var refresh = function () {
      ov.querySelectorAll(".nv-f").forEach(function (b) { b.classList.toggle("active", ovFilter[b.getAttribute("data-k")] === b.getAttribute("data-v")); });
      ov.querySelector("#nv-body").innerHTML = rowsHtml(); wireRows();
    };
    ov.querySelectorAll(".nv-f").forEach(function (b) { b.onclick = function () { ovFilter[b.getAttribute("data-k")] = b.getAttribute("data-v"); refresh(); }; });
    var sel = ov.querySelector("#nv-scheme"); if (sel) sel.onchange = function () { ovFilter.scheme = sel.value; refresh(); };
    wireRows();
    wireFunnel(ov, paint);
    drawMap(ov.querySelector("#nv-map"), paint);
  }
  function boxesSynthetic(r, m) {
    var esc = window.APP.esc, sc = window.NETWORKS.SCHEMES[r.scheme];
    var shared = {};
    m.net.vetLinks.forEach(function (e) { shared[e.source] = (shared[e.source] || 0) + 1; });
    var multi = Object.keys(shared).filter(function (k) { return shared[k] > 1; }).length;
    var chips = ['<span class="tag">' + esc(sc.label) + '</span>', '<span class="tag">' + r.facilities + ' providers</span>', '<span class="tag">' + (r.crossState ? "Cross-state · " + r.states.join(" → ") : "Within " + r.states[0]) + '</span>', '<span class="tag">' + multi + ' members billed by 2+ providers</span>'];
    if (r.excluded) chips.push('<span class="tag" style="background:var(--high-bg);color:var(--high-tx)">' + r.excluded + ' OIG-excluded</span>');
    return '<div style="flex:1;background:var(--surface);border:0.5px solid var(--border);border-radius:8px;padding:10px 12px"><div style="font-weight:600;font-size:12.5px;color:var(--ink);margin-bottom:6px"><i class="ti ti-affiliate"></i> ' + esc(r.name) + '</div>' +
      '<div style="display:flex;gap:5px;flex-wrap:wrap">' + chips.join("") + '</div>' +
      '<div style="font-size:11.5px;color:var(--text2);margin-top:8px;line-height:1.5"><b>' + bigUsd(r.atRisk) + '</b> at risk over ' + window.NETWORKS.PLAN.lookbackMonths + ' months (' + r.claims.toLocaleString() + ' claims, ' + r.members.toLocaleString() + ' members) · ' + usd(r.exposure) + ' flagged so far · status <b>' + esc(r.status) + '</b> · risk ' + r.risk + '.</div></div>';
  }
  function exportAll(kind) {
    var head = ["Network", "Scheme", "Type", "States", "Cross-state", "Providers", "Members affected", "Claims (36 mo)", "At risk (36 mo)", "Flagged paid", "Pending", "Flagged now", "Status", "Risk"];
    var rows = window.NETWORKS.list().map(function (r) { return [r.name, window.NETWORKS.SCHEMES[r.scheme].label, r.type, r.states.join("/"), r.crossState ? "Yes" : "No", r.facilities, r.members, r.claims, r.atRisk, r.paid, r.pending, r.exposure, r.status, r.risk]; });
    if (kind === "csv") return window.EXPORT.csv("networks", head, rows);
    if (kind === "xls") return window.EXPORT.xls("networks", "Networks", head, rows);
    var S = window.NETWORKS.stats();
    window.EXPORT.pdf("Detected provider networks", "<div class='sub'>" + S.networks + " networks · " + S.cross + " cross-state (" + S.crossPct + "%) · " + S.facilities + " providers · " + S.members.toLocaleString() + " members affected · " + bigUsd(S.atRisk) + " at risk over " + window.NETWORKS.PLAN.lookbackMonths + " months</div>" + window.EXPORT.tableHtml(head, rows));
  }

  // export data for the current scenario's collusion subgraph
  function netData(scn) {
    var focus = scn === "chain" ? "PR300" : "PR001";
    var net = window.DP.getCollusionNetwork(focus), provs = net.providers.filter(Boolean);
    var nameOf = {}; provs.forEach(function (p) { nameOf[p.id] = p.name; });
    var pHead = ["ID", "Name", "NPI", "TIN", "State", "Risk", "Role"];
    var pRows = provs.map(function (p) { return [p.id, p.name, p.npi, p.tin, p.state, p.riskScore, p.role]; });
    var eHead = ["Type", "Source", "Source name", "Target", "Target name", "Detail"];
    var eRows = net.links.map(function (e) { var pr = e.props || {}; var det = pr.tin || pr.officer || pr.registration || (pr.sharedVeterans ? pr.sharedVeterans + " shared members" : "") || (pr.veteranId ? "member " + pr.veteranId : "") || ""; return [e.type, e.source, nameOf[e.source] || e.source, e.target, nameOf[e.target] || e.target, det]; });
    return { focus: focus, pHead: pHead, pRows: pRows, eHead: eHead, eRows: eRows };
  }

  function boxesRing() {
    var s = window.Collusion.analyze("PR001");
    return '<div style="flex:1">' + window.Collusion.narrativeHtml(s) + '</div>' +
      '<div style="flex:1;background:var(--low-bg);border:0.5px solid #bfe0c9;border-radius:8px;padding:10px 12px"><div style="display:flex;align-items:center;gap:6px;font-weight:500;font-size:12.5px;color:var(--low-tx)"><i class="ti ti-circle-check"></i>Benign by contrast</div><div style="font-size:11.5px;color:#1f5a3d;margin-top:3px;line-height:1.5">Coastal Kidney Care also bills one member heavily (<span style="font-weight:500">36 dialysis claims</span>), but it shares no TIN, owner, referrals or patients with another provider, so it has no network to draw. High volume alone isn\'t a ring.</div></div>';
  }
  function boxesChain() {
    var s = window.Collusion.analyze("PR300");
    return '<div style="flex:1">' + window.Collusion.narrativeHtml(s) + '</div>';
  }

})();
