/* Utilization heatmap — anomaly density by specialty × FWA type, and by region */
(function () {
  window.Views = window.Views || {};
  var SHORT = { "Upcoding": "Upcode", "Unbundling": "Unbundle", "Modifier misuse": "Modifier", "Duplicate claim": "Duplicate", "Frequency / over-utilization": "Frequency", "Billing outside specialty": "Off-spec", "Deceased patient": "Deceased", "Phantom billing": "Phantom", "Authorization mismatch": "Auth" };

  window.Views.heatmap = {
    render: function (mount) {
      var allegs = window.DP.raw.allegations;
      var fwas = Object.keys(window.DP.getAnomalyBreakdown());
      var specs = {}, cities = {}, matrix = {}, max = 0;
      allegs.forEach(function (a) {
        var p = window.DP.getProvider(a.providerId);
        var spec = p.taxonomyLabel || "Other", city = p.city || "—", exp = a.exposurePost || 0;
        specs[spec] = (specs[spec] || 0) + exp;
        cities[city] = (cities[city] || 0) + exp;
        matrix[spec] = matrix[spec] || {};
        matrix[spec][a.fwaType] = (matrix[spec][a.fwaType] || 0) + exp;
        if (matrix[spec][a.fwaType] > max) max = matrix[spec][a.fwaType];
      });
      var specList = Object.keys(specs).sort(function (a, b) { return specs[b] - specs[a]; });
      var cityMax = Math.max.apply(null, Object.values(cities));

      var head = '<th style="text-align:left">Specialty</th>' + fwas.map(function (f) { return '<th style="text-align:center;font-size:10px">' + (SHORT[f] || f) + '</th>'; }).join("");
      var body = specList.map(function (s) {
        var cells = fwas.map(function (f) {
          var v = (matrix[s] && matrix[s][f]) || 0;
          var alpha = v ? (0.12 + (v / max) * 0.78).toFixed(2) : 0;
          var txt = v ? (v >= 1000 ? "$" + Math.round(v / 1000) + "k" : "$" + v) : "";
          return '<td style="text-align:center;padding:0"><div title="' + window.APP.esc(s) + " · " + window.APP.esc(f) + " · " + window.DP.usd(v) + '" style="margin:2px;height:30px;display:flex;align-items:center;justify-content:center;border-radius:5px;font-size:10.5px;font-weight:500;background:rgba(15,98,254,' + alpha + ');color:' + (alpha > 0.5 ? "#ffffff" : "var(--text2)") + '">' + txt + '</div></td>';
        }).join("");
        return '<tr><td style="font-size:11.5px;font-weight:500;white-space:nowrap">' + window.APP.esc(s) + '</td>' + cells + '</tr>';
      }).join("");

      mount.innerHTML =
        '<div class="page">' +
        '<div class="page-head"><div><div class="page-title">Utilization heatmap</div><div class="page-sub">Flagged exposure by provider specialty, anomaly type and region</div></div>' +
        '<span class="lg"><span style="width:60px;height:10px;border-radius:3px;background:linear-gradient(90deg,rgba(15,98,254,0.12),rgba(15,98,254,0.9))"></span>&nbsp;low → high exposure</span></div>' +
        '<div class="card" style="overflow-x:auto"><table style="min-width:720px"><thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody></table></div>' +
        '<div class="card" style="margin-top:10px"><div style="font-weight:500;font-size:13px;margin-bottom:10px">Flagged exposure by region</div>' +
        Object.keys(cities).sort(function (a, b) { return cities[b] - cities[a]; }).slice(0, 8).map(function (c) {
          return '<div style="margin-bottom:7px"><div style="display:flex;justify-content:space-between;font-size:11.5px;margin-bottom:3px"><span>' + window.APP.esc(c) + ', TX</span><span style="font-weight:500">' + window.DP.usd(cities[c]) + '</span></div><div style="height:8px;background:var(--border2);border-radius:4px;overflow:hidden"><div style="height:100%;width:' + Math.max(3, Math.round(cities[c] / cityMax * 100)) + '%;background:var(--accent)"></div></div></div>';
        }).join("") + '</div>' +
        '<div style="font-size:11px;color:var(--text2);margin-top:8px">Darker cells concentrate improper-payment exposure. Hover a cell for the exact amount.</div>' +
        '</div>';
    }
  };
})();
