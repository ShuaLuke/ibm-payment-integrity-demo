/* Analytics dashboard — aggregate analysis */
(function () {
  window.Views = window.Views || {};

  window.Views.analytics = {
    render: function (mount) {
      var k = window.APP.kpis(), base = window.DP.getKpis();
      var ana = window.DP.getAnomalyBreakdown();
      var allegs = window.DP.raw.allegations;

      // anomaly bars
      var anoRows = Object.keys(ana).map(function (t) { return { t: t, n: ana[t], exp: allegs.filter(function (a) { return a.fwaType === t; }).reduce(function (s, a) { return s + (a.exposurePost || 0); }, 0) }; }).sort(function (a, b) { return b.exp - a.exp; });
      var maxExp = Math.max.apply(null, anoRows.map(function (r) { return r.exp; }));

      // source split
      var src = { "Pattern Recognition": 0, "Rules Engine": 0, "Both": 0 };
      allegs.forEach(function (a) { src[a.source] = (src[a.source] || 0) + 1; });

      // peer comparison (99215 share)
      var peers = window.DP.listPeers().map(function (p) { return { name: shortName(p.name), share: p.em99215Share, self: false }; });
      var p1 = window.DP.getProvider("PR001");
      peers.push({ name: "Alamo Internal Medicine", share: p1.em99215ShareComputed, self: true });
      peers.sort(function (a, b) { return a.share - b.share; });

      // top providers by open exposure
      var byProv = {};
      allegs.forEach(function (a) { byProv[a.providerId] = (byProv[a.providerId] || 0) + (a.exposurePost || 0); });
      var top = Object.keys(byProv).map(function (id) { var p = window.DP.getProvider(id); return { name: p.name, npi: p.npi, spec: p.taxonomyLabel, exp: byProv[id], risk: p.riskScore }; }).sort(function (a, b) { return b.exp - a.exp; }).slice(0, 6);

      mount.innerHTML =
        '<div class="page">' +
        '<div class="page-head"><div><div class="page-title">Analytics</div><div class="page-sub">Payment-integrity oversight — exposure, recovery and provider risk</div></div>' +
        window.EXPORT.group("an") + '</div>' +
        '<div class="kpis" style="grid-template-columns:repeat(5,1fr)">' +
        kpi("Post-payment exposure", window.DP.usdShort(base.exposurePost)) +
        kpi("Submitted for recovery", window.DP.usdShort(k.submittedForRecovery)) +
        kpi("Verified recoupment", window.DP.usdShort(base.verifiedRecoupment)) +
        kpi("Open / closed", base.openAllegations + " / " + base.closedAllegations.toLocaleString()) +
        kpi("Avg days to close", base.avgTimeToCompletionDays) +
        '</div>' +
        '<div class="card" style="margin-bottom:10px"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><div style="font-weight:500;font-size:13px">Trends — flagged exposure &amp; recovery (last 8 months)</div><div style="font-size:11px"><span style="color:#0f62fe">■</span> exposure <span style="color:#1f8a5b;margin-left:8px">■</span> recovered <span style="color:#c8cdd5;margin-left:8px">▮</span> flagged count</div></div>' + trendChart(window.DP.getTrends()) + '</div>' +
        '<div style="display:grid;grid-template-columns:1.3fr 1fr;gap:10px;margin-bottom:10px">' +
        '<div class="card"><div style="font-weight:500;font-size:13px;margin-bottom:10px">Exposure by anomaly type</div>' +
        anoRows.map(function (r) {
          return '<div style="margin-bottom:8px"><div style="display:flex;justify-content:space-between;font-size:11.5px;margin-bottom:3px"><span>' + r.t + ' <span class="muted">· ' + r.n + '</span></span><span style="font-weight:500">' + window.DP.usd(r.exp) + '</span></div>' +
            '<div style="height:8px;background:var(--border2);border-radius:4px;overflow:hidden"><div style="height:100%;width:' + Math.max(3, Math.round(r.exp / maxExp * 100)) + '%;background:var(--accent)"></div></div></div>';
        }).join("") + '</div>' +
        '<div class="card"><div style="font-weight:500;font-size:13px;margin-bottom:10px">Detection source</div>' +
        srcBar("ML / AI models", src["Pattern Recognition"], allegs.length, "#0f62fe") +
        srcBar("Rules engine", src["Rules Engine"], allegs.length, "#1192e8") +
        srcBar("Both", src["Both"], allegs.length, "#c77d11") +
        '<div style="font-size:11px;color:var(--text2);margin-top:8px;line-height:1.5">ML/AI composite anomaly models drive volume; rules provide defensible, citation-backed edits. Cases flagged by <span style="font-weight:500">both</span> carry the highest confidence.</div></div>' +
        '</div>' +
        '<div class="card" style="margin-bottom:10px"><div style="font-weight:500;font-size:13px;margin-bottom:9px">Human-in-the-loop feedback <span class="muted" style="font-weight:400;font-size:11px">· confirmed &amp; dismissed outcomes feed model retraining</span></div>' + hitlHtml() + '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">' +
        '<div class="card"><div style="font-weight:500;font-size:13px;margin-bottom:4px">Upcoding — 99215 share vs peers</div><div style="font-size:11px;color:var(--text2);margin-bottom:10px">Established-patient E/M, Internal Medicine (TX)</div>' +
        peers.map(function (p) {
          return '<div style="margin-bottom:7px"><div style="display:flex;justify-content:space-between;font-size:11.5px;margin-bottom:3px"><span' + (p.self ? ' style="font-weight:500;color:var(--high-tx)"' : '') + '>' + p.name + (p.self ? ' ▲' : '') + '</span><span style="font-weight:500' + (p.self ? ';color:var(--high-tx)' : '') + '">' + Math.round(p.share * 100) + '%</span></div>' +
            '<div style="height:8px;background:var(--border2);border-radius:4px;overflow:hidden"><div style="height:100%;width:' + Math.round(p.share * 100) + '%;background:' + (p.self ? 'var(--high)' : 'var(--accent)') + '"></div></div></div>';
        }).join("") + '<div style="font-size:11px;color:var(--text2);margin-top:6px">Peer median 14% · Alamo ' + Math.round(p1.em99215ShareComputed * 100) + '% (5.8σ)</div></div>' +
        '<div class="card" style="padding:0;overflow:hidden"><div style="padding:12px 14px 6px;font-weight:500;font-size:13px">Top providers by open exposure</div>' +
        '<table><thead><tr><th>Provider</th><th>Specialty</th><th class="right">Risk</th><th class="right">Exposure</th></tr></thead><tbody>' +
        top.map(function (t) { return '<tr><td><div style="font-weight:500;font-size:12px">' + window.APP.esc(t.name) + '</div><div class="mono" style="font-size:10px;color:var(--text3)">NPI ' + t.npi + '</div></td><td style="font-size:11.5px;color:var(--text2)">' + window.APP.esc(t.spec) + '</td><td class="right">' + window.UI.riskChip(t.risk) + '</td><td class="right" style="font-weight:500">' + window.DP.usd(t.exp) + '</td></tr>'; }).join("") +
        '</tbody></table></div>' +
        '</div></div>';

      var flHead = ["Lead", "FWA Type", "Risk", "Confidence", "Source", "Status", "Assignee", "Provider", "NPI", "ClaimType", "Exposure"];
      var flRows = window.DP.listAllegations().map(function (r) { return ["#" + r.id, r.fwaType, r.riskScore, r.confidence + "%", r.source, r.status, r.assignee || "", r.providerName, r.providerNpi, r.claimType, r.exposurePost]; });
      window.EXPORT.wire("an", {
        csv: function () { window.EXPORT.csv("pivot-flagged-claims", flHead, flRows); },
        xls: function () { window.EXPORT.xls("pivot-flagged-claims", "Leads", flHead, flRows); },
        pdf: function () {
          var body = window.EXPORT.kvHtml([
            ["Post-payment exposure", window.DP.usdShort(base.exposurePost)], ["Submitted for recovery", window.DP.usdShort(k.submittedForRecovery)],
            ["Verified recoupment", window.DP.usdShort(base.verifiedRecoupment)], ["Open / closed", base.openAllegations + " / " + base.closedAllegations.toLocaleString()], ["Avg days to close", base.avgTimeToCompletionDays]
          ]) +
            "<h2>Exposure by anomaly type</h2>" + window.EXPORT.tableHtml(["Anomaly type", "Count", "Exposure"], anoRows.map(function (r) { return [r.t, r.n, window.DP.usd(r.exp)]; })) +
            "<h2>Top providers by open exposure</h2>" + window.EXPORT.tableHtml(["Provider", "Specialty", "Risk", "Exposure"], top.map(function (t) { return [t.name, t.spec, t.risk, window.DP.usd(t.exp)]; })) +
            "<h2>Leads (" + flRows.length + ")</h2>" + window.EXPORT.tableHtml(flHead, flRows);
          window.EXPORT.pdf("Payment Integrity — Analytics", body);
        }
      });
    }
  };
  function trendChart(tr) {
    if (!tr.length) return "";
    var W = 900, H = 180, pl = 22, pr = 22, pt = 12, pb = 24, iw = W - pl - pr, ih = H - pt - pb, n = tr.length;
    var maxExp = Math.max.apply(null, tr.map(function (t) { return t.exposure; }));
    var maxCnt = Math.max.apply(null, tr.map(function (t) { return t.flagged; }));
    var x = function (i) { return pl + (n === 1 ? iw / 2 : i * iw / (n - 1)); };
    var y = function (v) { return pt + ih - (v / maxExp) * ih; };
    var bw = iw / n * 0.4;
    var bars = tr.map(function (t, i) { var bh = (t.flagged / maxCnt) * ih * 0.5; return '<rect x="' + (x(i) - bw / 2) + '" y="' + (pt + ih - bh) + '" width="' + bw + '" height="' + bh + '" fill="#dde1e6" rx="2"></rect>'; }).join("");
    var expLine = tr.map(function (t, i) { return x(i) + "," + y(t.exposure); }).join(" ");
    var recLine = tr.map(function (t, i) { return x(i) + "," + y(t.recovered); }).join(" ");
    var area = "M" + x(0) + "," + (pt + ih) + " L" + tr.map(function (t, i) { return x(i) + "," + y(t.exposure); }).join(" L") + " L" + x(n - 1) + "," + (pt + ih) + " Z";
    var dots = tr.map(function (t, i) { return '<circle cx="' + x(i) + '" cy="' + y(t.exposure) + '" r="3" fill="#0f62fe"></circle><circle cx="' + x(i) + '" cy="' + y(t.recovered) + '" r="2.5" fill="#1f8a5b"></circle>'; }).join("");
    var labels = tr.map(function (t, i) { return '<text x="' + x(i) + '" y="' + (H - 7) + '" font-size="9" fill="#878d96" text-anchor="middle" font-family="IBM Plex Mono,monospace">' + t.month.slice(2) + '</text>'; }).join("");
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" preserveAspectRatio="none" style="display:block;height:180px">' + bars + '<path d="' + area + '" fill="rgba(15,98,254,0.10)"></path><polyline points="' + expLine + '" fill="none" stroke="#0f62fe" stroke-width="2"></polyline><polyline points="' + recLine + '" fill="none" stroke="#1f8a5b" stroke-width="2" stroke-dasharray="4,3"></polyline>' + dots + labels + '</svg>';
  }

  function hitlHtml() {
    var prec = window.DP.raw.precedents || [];
    var decs = Object.keys(window.APP.state.decisions).map(function (k) { return window.APP.state.decisions[k]; });
    var confirmed = prec.filter(function (p) { return p.outcome === "Confirmed"; }).length + decs.filter(function (d) { return d.outcome === "confirm"; }).length;
    var dismissed = prec.filter(function (p) { return p.outcome === "Dismissed"; }).length + decs.filter(function (d) { return d.outcome === "dismiss"; }).length;
    var pending = decs.filter(function (d) { return d.reviewState === "pending"; }).length;
    var total = confirmed + dismissed;
    var fpr = total ? Math.round(dismissed / total * 100) : 0;
    var cw = total ? Math.round(confirmed / total * 100) : 0;
    return '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:10px">' +
      '<div class="kpi"><div class="l">Confirmed (labeled)</div><div class="v">' + confirmed + '</div></div>' +
      '<div class="kpi"><div class="l">Dismissed (labeled)</div><div class="v">' + dismissed + '</div></div>' +
      '<div class="kpi"><div class="l">False-positive rate</div><div class="v">' + fpr + '%</div></div>' +
      '<div class="kpi"><div class="l">Pending review</div><div class="v">' + pending + '</div></div></div>' +
      '<div style="height:10px;background:var(--border2);border-radius:5px;overflow:hidden;display:flex"><div style="width:' + cw + '%;background:var(--high)"></div><div style="flex:1;background:var(--low)"></div></div>' +
      '<div style="display:flex;justify-content:space-between;font-size:10.5px;color:var(--text2);margin-top:4px"><span style="color:var(--high-tx)">Confirmed ' + cw + '%</span><span style="color:var(--low-tx)">Dismissed ' + (100 - cw) + '%</span></div>' +
      '<div style="font-size:11px;color:var(--text2);margin-top:8px">Every confirm/dismiss is logged as labeled training data. The next quarterly retraining incorporates these outcomes to reduce false positives and sharpen risk scoring.</div>';
  }

  function kpi(l, v) { return '<div class="kpi"><div class="l">' + l + '</div><div class="v">' + v + '</div></div>'; }
  function srcBar(l, n, total, c) {
    var pct = Math.round(n / total * 100);
    return '<div style="margin-bottom:8px"><div style="display:flex;justify-content:space-between;font-size:11.5px;margin-bottom:3px"><span>' + l + '</span><span style="font-weight:500">' + n + ' · ' + pct + '%</span></div><div style="height:8px;background:var(--border2);border-radius:4px;overflow:hidden"><div style="height:100%;width:' + pct + '%;background:' + c + '"></div></div></div>';
  }
  function shortName(n) { return n.replace(" Associates", "").replace(" Partners", ""); }
})();
