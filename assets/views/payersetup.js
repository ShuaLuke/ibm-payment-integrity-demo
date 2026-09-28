/* Payer Setup — configuration surface (Element 1.1.iv). Service categories,
   reference codes, networks and fee schedules that feed the deterministic
   processing paths. Read-only, deterministic (DP.getPayerSetup). Un-attributed. */
(function () {
  window.Views = window.Views || {};
  function tbl(headers, rows) {
    return '<div style="overflow-x:auto"><table style="width:100%;font-size:11.5px"><thead><tr>' + headers.map(function (h) { return '<th>' + h + '</th>'; }).join("") + '</tr></thead><tbody>' + rows + '</tbody></table></div>';
  }
  function card(icon, title, sub, inner) {
    return '<div class="card" style="margin-bottom:10px"><div style="font-weight:500;font-size:13px;margin-bottom:6px"><i class="ti ti-' + icon + '" style="color:var(--accent-d)"></i> ' + title + (sub ? ' <span class="muted" style="font-weight:400;font-size:11px">· ' + sub + '</span>' : '') + '</div>' + inner + '</div>';
  }
  window.Views.payersetup = {
    render: function (mount) {
      var d = window.DP.getPayerSetup(), esc = window.APP.esc;
      var sc = d.serviceCategories.map(function (r) { return '<tr><td style="font-weight:500">' + esc(r.name) + '</td><td class="mono" style="font-size:10.5px">' + esc(r.codeRange) + '</td><td>' + esc(r.pricer) + '</td><td><span class="tag" style="background:var(--low-bg);color:var(--low-tx)">' + esc(r.status) + '</span></td></tr>'; }).join("");
      var rc = d.referenceCodes.map(function (r) { return '<tr><td style="font-weight:500">' + esc(r.set) + '</td><td class="mono" style="font-size:10.5px">' + esc(r.edition) + '</td><td style="color:var(--text2)">' + esc(r.cycle) + '</td></tr>'; }).join("");
      var nw = d.networks.map(function (r) { return '<tr><td style="font-weight:500">' + esc(r.name) + '</td><td>' + esc(r.type) + '</td><td class="right mono">' + esc(r.providers) + '</td><td><span class="tag" style="background:var(--low-bg);color:var(--low-tx)">' + esc(r.status) + '</span></td></tr>'; }).join("");
      var fs = d.feeSchedules.map(function (r) { return '<tr><td style="font-weight:500">' + esc(r.name) + '</td><td class="mono" style="font-size:10.5px">' + esc(r.version) + '</td><td class="mono" style="font-size:10.5px">' + esc(r.effective) + '</td></tr>'; }).join("");
      mount.innerHTML =
        '<div style="display:flex;flex-direction:column;gap:0">' +
        '<div class="card" style="margin-bottom:10px"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px"><div style="font-weight:600;font-size:14px"><i class="ti ti-settings" style="color:var(--accent-d)"></i> Payer Setup <span class="muted" style="font-weight:400;font-size:11.5px">· configure the core healthcare entities that drive benefit, pricing &amp; coverage logic</span></div><span class="tag" style="background:var(--surface)"><i class="ti ti-lock"></i> Configuration</span></div>' +
        '<div style="font-size:11.5px;color:var(--text2);margin-top:6px">Service categories, reference codes, providers, networks and fee schedules feed directly into deterministic processing paths, so the appropriate benefit, pricing and coverage logic is applied consistently.</div></div>' +
        card("category", "Service categories", "how services map to pricers", tbl(["Category", "Code range", "Pricer", "Status"], sc)) +
        card("book", "Reference code sets", "editions & update cycles", tbl(["Code set", "Edition", "Update cycle"], rc)) +
        card("affiliate", "Networks", "Network participation", tbl(["Network", "Type", "Providers", "Status"], nw)) +
        card("currency-dollar", "Fee schedules", "contracted rates & CMS schedules", tbl(["Fee schedule", "Version", "Effective"], fs)) +
        '<div style="font-size:10.5px;color:var(--text3)"><i class="ti ti-info-circle"></i> Representative configuration for the demo — read-only.</div>' +
        '</div>';
    }
  };
})();
