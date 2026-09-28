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
      function setActive(scn) { mount.querySelectorAll(".nscn").forEach(function (b) { var on = b.getAttribute("data-scn") === scn; b.style.background = on ? "var(--card)" : "none"; b.style.color = on ? "var(--ink)" : "var(--text2)"; b.style.boxShadow = on ? "0 1px 2px rgba(16,36,59,.08)" : "none"; }); }
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
          legend.innerHTML = window.Collusion.legendHtml(window.Collusion.analyze(focus), { showFocus: false });
          boxes.innerHTML = scn === "chain" ? boxesChain() : boxesRing();
          window.Collusion.render(cv, focus, { height: 440, showFocus: false });
          return;
        }
        var model = window.NETWORKS.model(scn), row = window.NETWORKS.list().filter(function (r) { return r.id === scn; })[0];
        legend.innerHTML = window.Collusion.legendHtml(model, { showFocus: false });
        boxes.innerHTML = boxesSynthetic(row, model);
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

  // ---------- All networks (portfolio overview) ----------
  function usd(n) { return window.DP.usd(n); }
  function pct(a, b) { return b ? Math.round(a / b * 100) : 0; }
  var STATUS_TONE = { "New": ["var(--surface)", "var(--text2)"], "Under review": ["var(--med-bg)", "var(--med-tx)"], "Case open": ["var(--accent-l)", "var(--accent-d)"], "Referred to OIG": ["var(--high-bg)", "var(--high-tx)"] };
  var ovFilter = { geo: "", scheme: "" };

  function overviewHtml() {
    var S = window.NETWORKS.stats(), esc = window.APP.esc;
    var tile = function (label, val, sub) { return '<div class="card" style="flex:1;min-width:140px;margin:0"><div style="font-size:10.5px;color:var(--text3);text-transform:uppercase;letter-spacing:.04em">' + label + '</div><div style="font-weight:600;font-size:22px;margin-top:2px;font-variant-numeric:tabular-nums">' + val + '</div>' + (sub ? '<div style="font-size:11px;color:var(--text2);margin-top:1px">' + sub + '</div>' : '') + '</div>'; };
    // one 100% bar: cross-state (dark) vs within one state (light), with counts
    var bar = function (label, cross, total, strong) {
      var c = pct(cross, total), i = 100 - c;
      return '<div style="display:grid;grid-template-columns:minmax(150px,210px) 1fr 104px;gap:10px;align-items:center;padding:6px 0' + (strong ? ';border-bottom:0.5px solid var(--border2);padding-bottom:10px;margin-bottom:4px' : '') + '">' +
        '<div style="font-size:12px;' + (strong ? 'font-weight:600' : '') + '">' + esc(label) + ' <span class="muted" style="font-size:10.5px">· ' + total + '</span></div>' +
        '<div style="display:flex;height:18px;border-radius:5px;overflow:hidden;background:var(--surface)">' +
        (cross ? '<div title="' + cross + ' cross-state" style="width:' + c + '%;background:#10243b;color:#fff;font-size:10px;display:flex;align-items:center;padding-left:6px;white-space:nowrap">' + (c >= 18 ? c + '%' : '') + '</div>' : '') +
        (total - cross ? '<div title="' + (total - cross) + ' within one state" style="width:' + i + '%;background:#9fd8d0;color:#0b3d37;font-size:10px;display:flex;align-items:center;justify-content:flex-end;padding-right:6px;white-space:nowrap">' + (i >= 18 ? i + '%' : '') + '</div>' : '') +
        '</div>' +
        '<div class="mono" style="font-size:10.5px;color:var(--text2);text-align:right;white-space:nowrap">' + cross + ' cross · ' + (total - cross) + ' in</div></div>';
    };
    var split = bar("All networks", S.cross, S.networks, true) + S.byScheme.map(function (b) { return bar(b.label, b.cross, b.total); }).join("");
    var mostCross = S.byScheme.slice().sort(function (a, b) { return pct(b.cross, b.total) - pct(a.cross, a.total); });
    var chip = function (k, v, label) { var on = ovFilter[k] === v; return '<button class="qscope nv-f' + (on ? " active" : "") + '" data-k="' + k + '" data-v="' + v + '">' + label + '</button>'; };
    return '<div style="display:flex;flex-direction:column;gap:10px">' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap">' +
      tile("Networks detected", S.networks, "linked by ownership, TIN, agent, recruiter or address") +
      tile("Cross state lines", S.cross + ' <span style="font-size:14px;color:var(--text2);font-weight:500">· ' + S.crossPct + '%</span>', "providers in 2+ states") +
      tile("Within one state", S.inState + ' <span style="font-size:14px;color:var(--text2);font-weight:500">· ' + (100 - S.crossPct) + '%</span>', "all providers in one state") +
      tile("Providers involved", S.facilities, S.veterans + " members affected") +
      tile("Flagged exposure", usd(S.exposure), "flagged paid + pending claims") +
      '</div>' +
      '<div class="card" style="padding:0;overflow:hidden">' +
      '<div style="padding:9px 12px;border-bottom:0.5px solid var(--border2);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">' +
      '<div style="font-weight:500;font-size:12.5px"><i class="ti ti-chart-dots-3" style="color:var(--accent-d)"></i> Everything connected <span class="muted" style="font-weight:400;font-size:10.5px">· ' + S.networks + ' networks · ' + S.facilities + ' providers · ' + S.veterans + ' members · ' + window.NETWORKS.BRIDGES.length + ' cross-network links</span></div>' +
      '<div style="font-size:10.5px;color:var(--text3)"><i class="ti ti-pointer"></i> Hover a hub or a red link · click a hub to open its network</div></div>' +
      '<div id="nv-map" style="position:relative;height:540px;background:var(--surface)"></div>' +
      '<div class="legend" style="margin:0;padding:8px 12px;border-top:0.5px solid var(--border2)">' + mapLegend() + '</div></div>' +
      '<div class="card"><div style="display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:6px;margin-bottom:6px"><div style="font-weight:500;font-size:12.5px"><i class="ti ti-map-2" style="color:var(--accent-d)"></i> Cross-state vs within one state <span class="muted" style="font-weight:400;font-size:10.5px">· by scheme type</span></div>' +
      '<div style="display:flex;gap:12px;font-size:11px;color:var(--text2)"><span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#10243b;vertical-align:-1px"></span> Cross-state</span><span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#9fd8d0;vertical-align:-1px"></span> Within one state</span></div></div>' +
      '<div style="overflow-x:auto"><div style="min-width:480px">' + split + '</div></div>' +
      '<div style="font-size:11px;color:var(--text2);margin-top:6px"><i class="ti ti-info-circle"></i> ' + esc(mostCross[0].label) + ' networks cross state lines most often (' + pct(mostCross[0].cross, mostCross[0].total) + '%); ' + esc(mostCross[mostCross.length - 1].label.toLowerCase()) + 's mostly stay in one state (' + pct(mostCross[mostCross.length - 1].inState, mostCross[mostCross.length - 1].total) + '%).</div></div>' +
      '<div class="card" style="padding:0;overflow:hidden">' +
      '<div style="padding:9px 12px;border-bottom:0.5px solid var(--border2);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px"><div style="font-weight:500;font-size:12.5px"><i class="ti ti-affiliate" style="color:var(--accent-d)"></i> Networks <span class="muted" style="font-weight:400;font-size:10.5px">· click a row to open its graph</span></div>' +
      '<div style="display:flex;gap:2px;flex-wrap:wrap;background:var(--surface);border:0.5px solid var(--border);border-radius:8px;padding:2px">' + chip("geo", "", "All") + chip("geo", "cross", "Cross-state") + chip("geo", "in", "One state") + '</div>' +
      '<select class="input" id="nv-scheme" style="width:auto;font-size:12px;padding:4px 8px"><option value="">All scheme types</option>' + window.NETWORKS.SCHEME_ORDER.map(function (k) { return '<option value="' + k + '"' + (ovFilter.scheme === k ? " selected" : "") + '>' + window.NETWORKS.SCHEMES[k].label + '</option>'; }).join("") + '</select></div>' +
      '<div style="overflow-x:auto"><table style="width:100%"><thead><tr><th>Network</th><th>Scheme</th><th>States</th><th class="right">Providers</th><th class="right">Members</th><th class="right">Exposure</th><th>Status</th><th class="right">Risk</th></tr></thead><tbody id="nv-body">' + rowsHtml() + '</tbody></table></div>' +
      '<div style="padding:8px 12px;font-size:10.5px;color:var(--text3);border-top:0.5px solid var(--border2)">Exposure = flagged paid + pending claims at the network\'s providers.</div></div>' +
      '</div>';
  }
  // ---------- the full map: every network on one force graph ----------
  var HUB_COLOR = { chain: "#b5730e", ring: "#c6362f", agent: "#6b4aa0", recruit: "#0f6e56", shell: "#2d5f9a" };
  function mapLegend() {
    var dot = function (c, bg, label, r) { return '<span class="lg"><span style="display:inline-block;width:' + r + 'px;height:' + r + 'px;border-radius:50%;background:' + bg + ';border:2px solid ' + c + '"></span>' + label + '</span>'; };
    return window.NETWORKS.SCHEME_ORDER.map(function (k) { return dot(HUB_COLOR[k], "#10243b", window.NETWORKS.SCHEMES[k].bizKind, 11); }).join("") +
      dot("#c6362f", "#fbe3e3", "Provider", 9) + dot("#378add", "#cfe3f7", "Affected member", 7) +
      '<span class="lg"><span style="width:18px;height:0;border-top:2px dashed #d9480f"></span>Cross-network link</span>' +
      '<span class="lg" style="color:var(--text3)">Hub size = exposure</span>';
  }
  function drawMap(el, paint) {
    if (!el) return;
    if (typeof d3 === "undefined") { setTimeout(function () { drawMap(el, paint); }, 80); return; }
    var G = window.NETWORKS.fullGraph(), esc = window.APP.esc;
    var W = el.clientWidth || 1000, H = el.clientHeight || 540;
    d3.select(el).selectAll("*").remove();
    var maxExp = d3.max(G.nodes.filter(function (n) { return n.kind === "hub"; }), function (n) { return n.exposure; }) || 1;
    var R = function (n) { return n.kind === "hub" ? 10 + 14 * Math.sqrt(n.exposure / maxExp) : n.kind === "provider" ? 6.5 : 3.2; };
    var pcol = function (r) { return r >= 80 ? "#c6362f" : r >= 50 ? "#c77d11" : "#10243b"; };
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
      .attr("fill", function (d) { return d.kind === "hub" ? "#10243b" : d.kind === "provider" ? pcol(d.risk) + "33" : "#cfe3f7"; })
      .attr("stroke", function (d) { return d.kind === "hub" ? HUB_COLOR[d.scheme] : d.kind === "provider" ? (d.excluded ? "#8b1a13" : pcol(d.risk)) : "#378add"; })
      .attr("stroke-width", function (d) { return d.kind === "hub" ? 3 : d.kind === "provider" ? (d.excluded ? 2.4 : 1.3) : 0.8; })
      .style("cursor", function (d) { return d.kind === "hub" ? "pointer" : "default"; });
    var lab = gT.selectAll("text").data(hubs).join("text")
      .text(function (d) { return shortHub(d.name); }).attr("text-anchor", "middle").attr("font-size", 10).attr("font-weight", 600).attr("fill", "var(--ink, #10243b)")
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
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) { sim.stop(); for (var i = 0; i < 300; i++) sim.tick(); ticked(); }

    // hover: light up one network (and any network linked to it)
    var tip = d3.select(el).append("div").style("position", "absolute").style("background", "#10243b").style("color", "#e6eef7").style("border-radius", "7px").style("padding", "8px 11px").style("font-size", "11px").style("line-height", "1.45").style("max-width", "260px").style("pointer-events", "none").style("opacity", 0).style("box-shadow", "0 6px 18px rgba(0,0,0,.2)");
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
        showTip(e, "<div style='color:#7fe0d6;margin-bottom:2px'>" + esc(window.NETWORKS.SCHEMES[d.scheme].label) + "</div><b>" + esc(d.name) + "</b><div style='color:#93a7bf'>" +
          row.facilities + " providers · " + row.veterans + " members · " + row.states.join(", ") + "<br>" + window.DP.usd(row.exposure) + " exposure" +
          (br.length ? "<br><span style='color:#ffb89a'>Linked to " + br.length + " other network" + (br.length > 1 ? "s" : "") + "</span>" : "") + "<br>Click to open its network</div>");
      })
      .on("mouseout", reset)
      .on("click", function (e, d) { paint(d.core ? d.scenario : d.net); window.scrollTo(0, 0); });
    nd.filter(function (d) { return d.kind !== "hub"; })
      .on("mouseover", function (e, d) {
        var nets = {}; nets[d.net] = 1; focusNets(nets);
        showTip(e, d.kind === "provider" ? "<div style='color:#ffb4a8;margin-bottom:2px'>Provider</div><b>" + esc(d.name) + "</b><div style='color:#93a7bf'>" + esc(d.state || "") + " · risk " + d.risk + (d.excluded ? "<br><span style='color:#ffb4a8'>On the OIG exclusion list</span>" : "") + "</div>"
          : "<div style='color:#8fc4f2;margin-bottom:2px'>Affected member</div><b>" + esc(d.name) + "</b><div style='color:#93a7bf'>Billed by more than one provider in this network</div>");
      })
      .on("mouseout", reset);
    hit.on("mouseover", function (e, d) {
      var nets = {}; nets[d.source.net] = 1; nets[d.target.net] = 1; focusNets(nets);
      showTip(e, "<div style='color:#ffb89a;margin-bottom:2px'>Cross-network link · " + esc(d.type) + "</div><b>" + esc(shortHub(d.source.name)) + " ↔ " + esc(shortHub(d.target.name)) + "</b><div style='color:#93a7bf'>" + esc(d.detail) + "</div>");
    }).on("mouseout", reset);
  }
  function shortHub(n) { n = String(n || "").replace(/ · shared mailing address/, "").replace(/\s+(LLC|Inc\.|Group|Partners|Holdings|Services|Solutions|Network)$/i, ""); return n.length > 26 ? n.slice(0, 25) + "…" : n; }

  function rowsHtml() {
    var esc = window.APP.esc;
    var rows = window.NETWORKS.list().filter(function (r) {
      return (!ovFilter.geo || (ovFilter.geo === "cross") === r.crossState) && (!ovFilter.scheme || r.scheme === ovFilter.scheme);
    }).slice().sort(function (a, b) { return b.exposure - a.exposure; });
    if (!rows.length) return '<tr><td colspan="8" class="muted" style="padding:14px;text-align:center">No networks match these filters.</td></tr>';
    return rows.map(function (r) {
      var tone = STATUS_TONE[r.status] || STATUS_TONE.New;
      var states = r.states.map(function (s) { return '<span class="tag" style="font-size:10px">' + s + '</span>'; }).join(" ");
      return '<tr class="nv-row" data-id="' + r.id + '" style="cursor:pointer">' +
        '<td><div style="font-weight:500">' + esc(r.name) + '' + '</div><div style="font-size:10.5px;color:var(--text3)">' + esc(r.type) + (r.excluded ? ' · <span style="color:var(--high-tx)">' + r.excluded + ' OIG-excluded</span>' : '') + '</div></td>' +
        '<td style="font-size:11.5px">' + esc(window.NETWORKS.SCHEMES[r.scheme].short) + '</td>' +
        '<td><div style="display:flex;gap:3px;flex-wrap:wrap;align-items:center">' + states + (r.crossState ? ' <i class="ti ti-arrows-exchange" title="Cross-state" style="color:var(--text3);font-size:12px"></i>' : '') + '</div></td>' +
        '<td class="right mono">' + r.facilities + '</td><td class="right mono">' + r.veterans + '</td>' +
        '<td class="right mono" style="font-weight:600">' + usd(r.exposure) + '</td>' +
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
      '<div style="font-size:11.5px;color:var(--text2);margin-top:8px;line-height:1.5">' + usd(r.paid) + ' flagged paid + ' + usd(r.pending) + ' pending = <b>' + usd(r.exposure) + '</b> exposure · status <b>' + esc(r.status) + '</b> · risk ' + r.risk + '.</div></div>';
  }
  function exportAll(kind) {
    var head = ["Network", "Scheme", "Type", "States", "Cross-state", "Providers", "Members affected", "Flagged paid", "Pending", "Exposure", "Status", "Risk"];
    var rows = window.NETWORKS.list().map(function (r) { return [r.name, window.NETWORKS.SCHEMES[r.scheme].label, r.type, r.states.join("/"), r.crossState ? "Yes" : "No", r.facilities, r.veterans, r.paid, r.pending, r.exposure, r.status, r.risk]; });
    if (kind === "csv") return window.EXPORT.csv("pivot-networks", head, rows);
    if (kind === "xls") return window.EXPORT.xls("pivot-networks", "Networks", head, rows);
    var S = window.NETWORKS.stats();
    window.EXPORT.pdf("Detected provider networks", "<div class='sub'>" + S.networks + " networks · " + S.cross + " cross-state (" + S.crossPct + "%) · " + S.facilities + " providers · " + S.veterans + " members affected · " + usd(S.exposure) + " flagged exposure</div>" + window.EXPORT.tableHtml(head, rows));
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
      '<div style="flex:1;background:var(--low-bg);border:0.5px solid #bfe0c9;border-radius:8px;padding:10px 12px"><div style="display:flex;align-items:center;gap:6px;font-weight:500;font-size:12.5px;color:var(--low-tx)"><i class="ti ti-circle-check"></i>Benign by contrast</div><div style="font-size:11.5px;color:#2f5a44;margin-top:3px;line-height:1.5">Coastal Kidney Care also bills one member heavily (<span style="font-weight:500">36 dialysis claims</span>), but it shares no TIN, owner, referrals or patients with another provider, so it has no network to draw. High volume alone isn\'t a ring.</div></div>';
  }
  function boxesChain() {
    var s = window.Collusion.analyze("PR300");
    return '<div style="flex:1">' + window.Collusion.narrativeHtml(s) + '</div>';
  }

})();
