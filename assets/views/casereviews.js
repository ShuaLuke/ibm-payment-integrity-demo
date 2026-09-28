/* Case reviews — the supervisor's case queue. Distinct from the per-lead Approvals
   queue: this lists whole CASES an analyst has submitted for supervisor sign-off
   (narrative + all leads + total exposure), with approve/return inline. Supervisor
   only (gated by the SUBS role filter). Row → the case page for the full review. */
(function () {
  window.Views = window.Views || {};

  window.Views.casereviews = {
    render: function (mount) {
      var pending = window.APP.pendingCaseReviews();
      // also show recently-actioned cases for context
      var store = window.APP.state.caseReviews || {};
      var actioned = Object.keys(store)
        .filter(function (pid) { return store[pid].status !== "pending"; })
        .map(function (pid) { return { pid: pid, review: store[pid], caseInfo: window.DP.getCase(pid, "retrospective") }; })
        .filter(function (x) { return x.caseInfo; })
        .sort(function (a, b) { return (b.review.reviewedAt || 0) - (a.review.reviewedAt || 0); });

      var totalExp = pending.reduce(function (s, x) { return s + (x.caseInfo.exposure || 0); }, 0);

      mount.innerHTML =
        '<div class="page">' +
        '<div class="page-head"><div><div class="page-title">Case reviews</div>' +
        '<div class="page-sub">Whole cases submitted for supervisor sign-off — narrative, constituent leads and total exposure reviewed as a unit. Distinct from the per-lead Approvals queue.</div></div></div>' +
        '<div class="kpis" style="margin-bottom:12px">' +
        '<div class="kpi"><div class="l">Awaiting your review</div><div class="v">' + pending.length + '</div></div>' +
        '<div class="kpi"><div class="l">Exposure under review</div><div class="v">' + window.DP.usdShort(totalExp) + '</div></div>' +
        '<div class="kpi"><div class="l">Actioned</div><div class="v">' + actioned.length + '</div></div></div>' +

        (pending.length
          ? pending.map(function (x) { return reviewCardHtml(x); }).join("")
          : '<div class="card" style="text-align:center;padding:30px"><i class="ti ti-clipboard-check" style="font-size:26px;color:var(--text3)"></i><div style="font-size:13px;color:var(--text2);margin-top:8px">No cases awaiting review.</div><div style="font-size:11.5px;color:var(--text3);margin-top:3px">When an analyst submits a case for sign-off it appears here.</div></div>') +

        (actioned.length ? '<div style="font-weight:500;font-size:12.5px;color:var(--text2);margin:16px 0 8px">Recently actioned</div>' +
          '<div class="card" style="padding:0;overflow:hidden"><table><thead><tr><th>Case</th><th>Outcome</th><th class="right">Leads</th><th class="right">Exposure</th><th>By</th></tr></thead><tbody>' +
          actioned.map(function (x) {
            var c = x.caseInfo, rv = x.review;
            var pill = rv.status === "approved" ? '<span class="pill p-conf">Approved</span>' : '<span class="pill p-ret">Returned</span>';
            return '<tr class="row" data-pid="' + x.pid + '" style="cursor:pointer"><td><div style="font-weight:500">' + window.APP.esc(c.name) + '</div><div class="mono" style="font-size:10.5px;color:var(--text3)">CASE-' + x.pid + '</div></td><td>' + pill + '</td><td class="right">' + c.leadCount + '</td><td class="right" style="font-weight:500">' + window.DP.usd(c.exposure || 0) + '</td><td style="font-size:11.5px">' + window.APP.esc(rv.reviewedBy || "—") + '</td></tr>';
          }).join("") + '</tbody></table></div>' : '') +
        '</div>';

      // ---- wiring ----
      var reRender = function () { window.Views.casereviews.render(mount); };
      mount.querySelectorAll("[data-open]").forEach(function (el) {
        el.addEventListener("click", function (e) { e.stopPropagation(); window.APP.openProvider(el.getAttribute("data-open")); });
      });
      mount.querySelectorAll(".cr-approve").forEach(function (b) {
        b.addEventListener("click", function (e) { e.stopPropagation(); window.APP.caseReviewAction(b.getAttribute("data-pid"), "approve"); reRender(); });
      });
      mount.querySelectorAll(".cr-return").forEach(function (b) {
        b.addEventListener("click", function (e) {
          e.stopPropagation();
          var pid = b.getAttribute("data-pid");
          var note = (document.getElementById("cr-note-" + pid) || {}).value;
          if (!note || !note.trim()) { var n = document.getElementById("cr-note-" + pid); if (n) n.focus(); return; }
          window.APP.caseReviewAction(pid, "return", note.trim()); reRender();
        });
      });
      mount.querySelectorAll("tr.row").forEach(function (tr) { tr.addEventListener("click", function () { window.APP.openProvider(tr.getAttribute("data-pid")); }); });
    }
  };

  function reviewCardHtml(x) {
    var c = x.caseInfo, rv = x.review, p = c.provider || {};
    var narr = window.APP.getCaseNarrative(x.pid);
    var leads = (c.caseLeads || []).slice(0, 6);
    var fwa = (c.fwaTypes || []).slice(0, 3).map(function (t) { return '<span class="tag fwa">' + window.APP.esc(t) + '</span>'; }).join(" ");
    return '<div class="card" style="margin-bottom:10px;border-color:#d0e2ff">' +
      '<div style="display:flex;align-items:flex-start;gap:10px;flex-wrap:wrap;margin-bottom:8px">' +
      '<div style="flex:1;min-width:0"><div style="font-weight:600;font-size:14px">' + window.APP.esc(c.name) +
      (c.multiProvider ? ' <span class="tag" style="background:var(--med-bg);color:var(--med-tx)"><i class="ti ti-affiliate"></i> ' + c.providerCount + ' providers</span>' : '') + '</div>' +
      '<div class="mono" style="font-size:10.5px;color:var(--text3)">CASE-' + x.pid + ' · NPI ' + (p.npi || "—") + ' · submitted by ' + window.APP.esc(rv.submittedBy) + ' · ' + window.APP.fmtTs(rv.submittedAt) + '</div></div>' +
      '<span class="chip ' + (window.DP.band ? (window.DP.band(c.riskScore) === "high" ? "rh" : window.DP.band(c.riskScore) === "med" ? "rm" : "rl") : "rh") + '"><span class="s">' + c.riskScore + '</span></span>' +
      '<span data-open="' + x.pid + '" style="font-size:11.5px;color:var(--accent-d);cursor:pointer;white-space:nowrap">Open case <i class="ti ti-chevron-right"></i></span></div>' +

      '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:9px">' +
      kpi("Confirmed leads", c.leadCount) + kpi("Open feeding in", c.openCount) + kpi("Total exposure", window.DP.usd(c.exposure || 0)) + '</div>' +
      (fwa ? '<div style="margin-bottom:8px">' + fwa + '</div>' : '') +

      (narr ? '<div style="background:var(--surface);border:0.5px solid var(--border);border-radius:7px;padding:9px 11px;font-size:12px;color:var(--text);line-height:1.55;margin-bottom:9px">' +
        '<div style="font-size:10px;color:var(--text2);text-transform:uppercase;letter-spacing:.04em;margin-bottom:3px">Case narrative</div>' +
        window.APP.esc(narr.text.length > 320 ? narr.text.slice(0, 317) + "…" : narr.text) + '</div>'
        : '<div class="muted" style="font-size:11.5px;margin-bottom:9px">No narrative on file.</div>') +

      '<div style="font-size:10.5px;color:var(--text2);margin-bottom:4px">Constituent leads</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:10px">' +
      leads.map(function (a) { return '<span class="tag" style="background:var(--surface)"><span class="mono">#' + a.id + '</span> · ' + window.APP.esc(a.fwaType) + ' · ' + window.DP.usd(a.exposurePost || 0) + '</span>'; }).join("") +
      (c.leadCount > leads.length ? '<span class="muted" style="font-size:10.5px;align-self:center">+' + (c.leadCount - leads.length) + ' more</span>' : '') + '</div>' +

      '<div style="display:flex;gap:8px;align-items:flex-start;border-top:0.5px solid var(--border2);padding-top:9px">' +
      '<input id="cr-note-' + x.pid + '" class="input" placeholder="Return note (required to return)…" style="flex:1;font-size:12px">' +
      '<button class="btn cr-return" data-pid="' + x.pid + '" style="font-size:11px"><i class="ti ti-corner-up-left"></i> Return</button>' +
      '<button class="btn primary cr-approve" data-pid="' + x.pid + '" style="font-size:11px;background:var(--low);border-color:var(--low)"><i class="ti ti-check"></i> Approve case</button></div>' +
      '</div>';
  }
  function kpi(l, v) { return '<div style="background:var(--surface);border:0.5px solid var(--border);border-radius:7px;padding:7px 9px"><div style="font-size:10px;color:var(--text2);text-transform:uppercase;letter-spacing:.03em">' + l + '</div><div style="font-size:14px;font-weight:600;margin-top:1px">' + window.APP.esc(v) + '</div></div>'; }
})();
