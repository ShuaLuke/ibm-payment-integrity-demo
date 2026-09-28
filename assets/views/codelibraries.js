/* Code libraries — the reference code sets the system reads a claim against (CPT/HCPCS,
   ICD-10-CM/PCS, revenue codes, type-of-bill, modifiers, CARC/RARC, taxonomy).
   Each library shows its code system, edition, update cycle and effective date;
   drill in for a searchable code table. Read-only (DP.getCodeLibraries /
   getCodeLibrary) — entries reuse the DP reference maps, nothing regenerated. */
(function () {
  window.Views = window.Views || {};
  var selectedId = null;
  var query = "";

  function block(icon, title, sub, inner) {
    return '<div class="card" style="margin:0 0 8px;background:var(--surface)"><div style="font-weight:600;font-size:12px;margin-bottom:6px"><i class="ti ti-' + icon + '" style="color:var(--accent-d)"></i> ' + title + (sub ? ' <span class="muted" style="font-weight:400;font-size:10.5px">· ' + sub + '</span>' : '') + '</div>' + inner + '</div>';
  }

  window.Views.codelibraries = {
    render: function (mount) {
      var libs = window.DP.getCodeLibraries();
      if (!selectedId || !libs.some(function (l) { return l.id === selectedId; })) { selectedId = libs[0].id; query = ""; }
      var sel = window.DP.getCodeLibrary(selectedId);

      var listRows = libs.map(function (l) {
        var on = l.id === selectedId;
        return '<button class="cl-row" data-id="' + l.id + '" style="width:100%;text-align:left;border:none;border-left:3px solid ' + (on ? "var(--accent)" : "transparent") + ';background:' + (on ? "var(--accent-l)" : "transparent") + ';padding:9px 12px;cursor:pointer;border-bottom:0.5px solid var(--border2)">' +
          '<div style="display:flex;gap:7px;align-items:center"><i class="ti ti-' + l.icon + '" style="color:var(--accent-d)"></i><span style="font-weight:' + (on ? "600" : "500") + ';font-size:12px">' + window.APP.esc(l.name) + '</span></div>' +
          '<div style="display:flex;gap:6px;align-items:center;margin-top:4px;flex-wrap:wrap"><span class="mono" style="font-size:10px;color:var(--text3)">' + window.APP.esc(l.edition) + '</span><span class="tag" style="background:var(--surface);font-size:10px">' + window.APP.esc(l.approxCount) + ' codes</span></div>' +
          '</button>';
      }).join("");

      mount.innerHTML =
        '<div style="display:flex;flex-direction:column;gap:10px">' +
        '<div class="card"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px"><div style="font-weight:600;font-size:14px"><i class="ti ti-books" style="color:var(--accent-d)"></i> Code libraries <span class="muted" style="font-weight:400;font-size:11.5px">· the reference code sets a claim is read against</span></div>' +
        '<span class="tag" style="background:var(--surface)"><i class="ti ti-refresh"></i> Versioned &amp; update-cycled</span></div>' +
        '<div style="font-size:11.5px;color:var(--text2);margin-top:6px">Each library carries its code system, edition, update cycle and effective date. The engines and rules resolve every claim code through these sets — kept current on their published schedules.</div></div>' +
        '<div style="display:grid;grid-template-columns:280px 1fr;gap:10px;align-items:start">' +
        '<div class="card" style="padding:0;overflow:hidden"><div style="padding:9px 12px;font-size:10.5px;color:var(--text3);text-transform:uppercase;letter-spacing:.04em;border-bottom:0.5px solid var(--border2)">Libraries</div>' + listRows + '</div>' +
        '<div id="cl-detail">' + detailHtml(sel) + '</div>' +
        '</div></div>';

      mount.querySelectorAll(".cl-row").forEach(function (b) {
        b.addEventListener("click", function () { selectedId = b.getAttribute("data-id"); query = ""; window.Views.codelibraries.render(mount); });
      });
      wireSearch(mount);
    }
  };

  function detailHtml(lib) {
    if (!lib) return '<div class="card muted" style="font-size:12px">Select a library.</div>';
    var m = lib.meta, esc = window.APP.esc;
    var kv = function (k, v) { return '<div style="flex:1;min-width:120px;background:var(--surface);border-radius:7px;padding:8px 10px"><div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.04em">' + k + '</div><div style="font-weight:600;font-size:12.5px;margin-top:2px">' + v + '</div></div>'; };
    var props = '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
      kv("Code system", esc(m.system)) + kv("Edition", esc(m.edition)) +
      kv("Update cycle", esc(m.cycle)) + kv("Effective", esc(m.effective)) +
      kv("Published size", esc(m.approxCount) + " codes") +
      '</div>';

    var tableId = "cl-table";
    return '<div style="display:flex;flex-direction:column">' +
      '<div class="card" style="margin:0 0 10px"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><i class="ti ti-' + m.icon + '" style="color:var(--accent-d);font-size:18px"></i><span style="font-weight:600;font-size:14px">' + esc(m.name) + '</span><span class="tag" style="background:var(--surface)">' + esc(m.system) + '</span></div>' +
      '<div style="margin-top:10px">' + props + '</div></div>' +
      '<div class="card">' +
      '<div style="display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin-bottom:8px">' +
      '<div style="font-weight:600;font-size:12px"><i class="ti ti-list" style="color:var(--accent-d)"></i> Codes <span class="muted" style="font-weight:400;font-size:10.5px">· ' + lib.entries.length + ' sample entries</span></div>' +
      '<div style="position:relative"><i class="ti ti-search" style="position:absolute;left:9px;top:8px;color:var(--text3);font-size:13px"></i><input id="cl-search" placeholder="Filter code or description…" style="padding:6px 10px 6px 28px;border:0.5px solid var(--border);border-radius:7px;font-size:12px;font-family:inherit;width:230px" value="' + esc(query) + '"></div>' +
      '</div>' +
      '<div style="overflow-x:auto"><table style="width:100%"><thead><tr><th style="width:15%">Code</th><th style="width:45%">Description</th><th>Category / note</th></tr></thead><tbody id="' + tableId + '">' + rowsHtml(lib.entries) + '</tbody></table></div>' +
      '<div style="font-size:10.5px;color:var(--text3);margin-top:8px"><i class="ti ti-info-circle"></i> ' + esc(lib.sampleNote) + '</div>' +
      '</div></div>';
  }

  function rowsHtml(entries) {
    var esc = window.APP.esc, q = query.toLowerCase();
    var rows = entries.filter(function (e) { return !q || String(e.code).toLowerCase().indexOf(q) >= 0 || String(e.description).toLowerCase().indexOf(q) >= 0; });
    if (!rows.length) return '<tr><td colspan="3" class="muted" style="font-size:11.5px;padding:8px">No codes match “' + esc(query) + '”.</td></tr>';
    return rows.map(function (e) {
      return '<tr><td class="mono" style="font-weight:600">' + esc(e.code) + '</td><td>' + esc(e.description) + '</td><td style="font-size:11px;color:var(--text3)">' + esc(e.category || "—") + '</td></tr>';
    }).join("");
  }

  function wireSearch(mount) {
    var inp = mount.querySelector("#cl-search"); if (!inp) return;
    inp.addEventListener("input", function () {
      query = inp.value;
      var tb = mount.querySelector("#cl-table");
      var lib = window.DP.getCodeLibrary(selectedId);
      if (tb && lib) tb.innerHTML = rowsHtml(lib.entries);
    });
  }
})();
