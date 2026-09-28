/* Home — role-aware landing ("what's on my plate today") */
(function () {
  window.Views = window.Views || {};
  var OPEN = ["New", "Assigned", "Under review", "Pending review", "Returned"];

  window.Views.home = {
    render: function (mount) {
      var A = window.DP.raw.allegations;
      var r = window.APP.ROLES[window.APP.state.role];
      var modeSub = window.APP.isPrepay() ? " · Prepay — pre-payment triage" : " · Retrospective — post-payment review";
      mount.innerHTML = '<div class="page">' +
        '<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px"><div class="avatar" style="width:34px;height:34px">' + r.initials + '</div>' +
        '<div><div class="page-title" style="font-size:18px">Welcome back, ' + r.name + '</div><div class="page-sub">' + r.title + ' workspace' + modeSub + '</div></div></div>' +
        (window.APP.isPrepay() ? prepayHome() : window.APP.isSupervisor() ? supervisorHome(A) : analystHome(A)) +
        recent() + '</div>';
      wire(mount);
    }
  };

  function analystHome(A) {
    var me = "Dana Whitmore";
    var mine = A.filter(function (a) { return a.assignee === me && OPEN.indexOf(a.status) >= 0; });
    var mineHigh = mine.filter(function (a) { return a.riskScore >= 80; });
    var myExp = mine.reduce(function (s, a) { return s + (a.exposurePost || 0); }, 0);
    var next = A.filter(function (a) { return !a.assignee && a.status === "New"; }).sort(function (a, b) { return b.riskScore - a.riskScore; })[0];
    var allCases = window.DP.listCases({ mode: "retrospective" });
    var myCases = allCases.filter(function (c) { return c.assignee === me; });
    var caseSrc = myCases.length ? myCases : allCases;
    // Two separate lists per the analyst's request: pending Leads and Cases, each
    // navigating to its own detail page (lead → claim view · case → provider case).
    return kpis([
      ["Leads assigned to me", mine.length], ["High-risk (mine)", mineHigh.length],
      ["My cases", caseSrc.length], ["My flagged exposure", window.DP.usdShort(myExp)]
    ]) +
      (next ? nextCard(next, "Highest-risk unassigned claim — pick it up and review.") : "") +
      leadRows("Leads assigned to me", mine.sort(function (a, b) { return b.riskScore - a.riskScore; }), "You have no leads assigned.") +
      caseRows(myCases.length ? "My cases" : "Open cases", caseSrc, "No cases yet — confirm or escalate a lead to open one.");
  }

  function supervisorHome(A) {
    var pending = window.APP.pendingReviews();
    var team = A.filter(function (a) { return OPEN.indexOf(a.status) >= 0; });
    var byAnalyst = {};
    team.forEach(function (a) { if (a.assignee) byAnalyst[a.assignee] = (byAnalyst[a.assignee] || 0) + 1; });
    var submitted = window.APP.kpis().submittedForRecovery;
    var teamHtml = Object.keys(byAnalyst).sort(function (a, b) { return byAnalyst[b] - byAnalyst[a]; }).map(function (n) {
      return '<div class="tm-link" data-team="' + window.APP.esc(n) + '" style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-top:0.5px solid var(--border2);font-size:12.5px;cursor:pointer"><span>' + window.APP.esc(n) + '</span><span style="display:flex;align-items:center;gap:8px"><span style="font-weight:500">' + byAnalyst[n] + ' open</span><i class="ti ti-chevron-right" style="color:var(--text3)"></i></span></div>';
    }).join("");
    return kpis([
      ["Awaiting my approval", pending.length], ["Team open cases", team.length],
      ["Submitted for recovery", window.DP.usdShort(submitted)], ["Open cases", window.DP.listCases().length]
    ]) +
      (pending.length ? '<div class="card" style="margin-bottom:10px;border:0.5px solid #e7c99a"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><div style="font-weight:500;font-size:13px"><i class="ti ti-inbox" style="color:var(--med)"></i> ' + pending.length + ' decision' + (pending.length > 1 ? "s" : "") + ' awaiting your approval</div><button class="btn primary" id="h-appr" style="background:var(--med);border-color:var(--med)">Review approvals <i class="ti ti-arrow-right"></i></button></div>' +
        pending.slice(0, 3).map(function (p) { return '<div class="row" data-id="' + p.id + '" style="display:flex;gap:10px;align-items:center;padding:6px 0;border-top:0.5px solid var(--border2);cursor:pointer">' + window.UI.riskChip(p.a.riskScore) + '<div style="flex:1;font-size:12.5px;font-weight:500">' + window.APP.esc(p.a.provider.name) + ' <span class="tag fwa">' + p.a.fwaType + '</span></div><span class="muted" style="font-size:11px">' + (p.dec.outcome === "confirm" ? "Confirm" : "Escalate") + ' · ' + window.DP.usd(p.a.exposurePost) + '</span></div>'; }).join("") + '</div>' : '') +
      '<div class="card" style="margin-bottom:10px"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px"><div style="font-weight:500;font-size:13px">Team workload</div><button class="btn" id="h-team" style="font-size:11px;padding:4px 9px">Manage &amp; assign <i class="ti ti-arrow-right"></i></button></div>' + (teamHtml || '<div class="muted" style="font-size:12px">No assigned work.</div>') + '</div>';
  }

  function prepayHome() {
    var rows = window.DP.listAllegations({ mode: "prepay" });
    var stats = window.APP.prepayStats();
    var denies = rows.filter(function (r) { return r.recommendedAction === "deny"; }).length;
    var holds = rows.filter(function (r) { return r.recommendedAction === "hold"; }).length;
    var top = rows.slice().sort(function (a, b) { return b.riskScore - a.riskScore; });
    return kpis([
      ["Pending to triage", stats.pending + " / " + stats.total],
      ["Amount at risk", window.DP.usdShort(stats.atRisk)],
      ["Recommended: Deny", denies], ["Recommended: Hold", holds]
    ]) +
      '<div class="card" style="margin-bottom:10px;display:flex;align-items:center;gap:12px;border:0.5px solid #9fe1d8"><i class="ti ti-shield-check" style="color:var(--accent-d);font-size:24px"></i>' +
      '<div style="flex:1"><div style="font-weight:500;font-size:13px">Pre-payment triage queue</div><div style="font-size:11.5px;color:var(--text2)">' + stats.pending + ' claims scored before payment — ' + window.DP.usd(stats.atRisk) + ' at risk. Deny or hold the improper ones before the money leaves the payer.</div></div>' +
      '<button class="btn primary" id="h-triage"><i class="ti ti-player-play"></i> Start triage</button></div>' +
      prepayList("Highest-risk pending claims", top.slice(0, 6));
  }
  function prepayList(title, rows) {
    var recTx = { pay: "var(--low-tx)", hold: "var(--med-tx)", deny: "var(--high-tx)" };
    var recLbl = { pay: "Pay", hold: "Hold", deny: "Deny" };
    return '<div class="card" style="padding:0;overflow:hidden"><div style="padding:11px 13px 6px;font-weight:500;font-size:13px">' + title + ' <span class="muted" style="font-weight:400;font-size:11px">· ' + rows.length + '</span></div>' +
      '<table><tbody>' + rows.map(function (a) {
        var p = window.DP.getProvider(a.providerId);
        return '<tr class="row" data-id="' + a.id + '"><td style="width:70px">' + window.UI.riskChip(a.riskScore) + '</td><td><span style="font-weight:500">' + window.APP.esc(p.name) + '</span> <span class="tag fwa">' + a.fwaType + '</span></td>' +
          '<td class="right" style="font-weight:500">' + window.DP.usd(a.exposurePre || 0) + '</td>' +
          '<td style="width:70px;color:' + recTx[a.recommendedAction] + ';font-weight:500;font-size:11.5px">' + (recLbl[a.recommendedAction] || "—") + '</td></tr>';
      }).join("") + '</tbody></table></div>';
  }

  function nextCard(a, sub) {
    return '<div class="card" style="margin-bottom:10px;display:flex;align-items:center;gap:12px;border:0.5px solid #9fe1d8">' +
      window.UI.riskChip(a.riskScore) +
      '<div style="flex:1"><div style="font-size:10.5px;color:var(--text2);text-transform:none">Next up</div><div style="font-weight:500;font-size:13px">' + window.APP.esc(window.DP.getProvider(a.providerId).name) + ' <span class="tag fwa">' + a.fwaType + '</span></div><div style="font-size:11.5px;color:var(--text2)">' + sub + '</div></div>' +
      '<button class="btn primary" data-id="' + a.id + '" id="h-next"><i class="ti ti-player-play"></i> Review</button></div>';
  }

  // Pending leads assigned to me — each row opens the lead (claim) detail.
  function leadRows(title, rows, emptyMsg) {
    return '<div class="card" style="padding:0;overflow:hidden;margin-bottom:10px"><div style="padding:11px 13px 6px;font-weight:500;font-size:13px"><i class="ti ti-flag" style="color:var(--high)"></i> ' + title + ' <span class="muted" style="font-weight:400;font-size:11px">· ' + rows.length + '</span></div>' +
      (rows.length ? '<table><tbody>' + rows.map(function (a) {
        var p = window.DP.getProvider(a.providerId);
        return '<tr class="row" data-id="' + a.id + '"><td style="width:70px">' + window.UI.riskChip(a.riskScore) + '</td><td><span style="font-weight:500">' + window.APP.esc(p.name) + '</span> <span class="tag fwa">' + a.fwaType + '</span></td><td>' + window.UI.statusPill(window.UI.leadStatus(a)) + '</td><td class="right" style="font-weight:500">' + window.DP.usd(a.exposurePost || 0) + '</td></tr>';
      }).join("") + '</tbody></table>' : '<div class="muted" style="font-size:12px;padding:0 13px 13px">' + emptyMsg + '</div>') + '</div>';
  }
  // Cases (provider-level rollups of leads) — each row opens the provider Case detail.
  function caseRows(title, cases, emptyMsg) {
    var caseCls = function (s) { return s === "Under investigation" ? "p-esc" : s === "Closed" ? "p-dis" : "p-new"; };
    return '<div class="card" style="padding:0;overflow:hidden"><div style="padding:11px 13px 6px;font-weight:500;font-size:13px"><i class="ti ti-folders" style="color:var(--accent-d)"></i> ' + title + ' <span class="muted" style="font-weight:400;font-size:11px">· ' + cases.length + '</span></div>' +
      (cases.length ? '<table><tbody>' + cases.map(function (c) {
        var types = c.fwaTypes.slice(0, 2).map(function (t) { return '<span class="tag fwa">' + window.APP.esc(t) + '</span>'; }).join(" ");
        return '<tr class="case-row" data-pid="' + c.providerId + '" style="cursor:pointer"><td style="width:70px">' + window.UI.riskChip(c.riskScore) + '</td><td><span style="font-weight:500">' + window.APP.esc(c.name) + '</span> ' + types + '<div class="mono" style="font-size:10px;color:var(--text3)">' + c.leadCount + ' lead' + (c.leadCount === 1 ? '' : 's') + (c.openCount ? ' · +' + c.openCount + ' feeding in' : '') + '</div></td><td><span class="pill ' + caseCls(c.status) + '">' + c.status + '</span></td><td class="right" style="font-weight:500">' + window.DP.usd(c.exposure || 0) + '</td></tr>';
      }).join("") + '</tbody></table>' : '<div class="muted" style="font-size:12px;padding:0 13px 13px">' + emptyMsg + '</div>') + '</div>';
  }

  function recent() {
    var log = window.APP.state.audit.slice(0, 5);
    if (!log.length) return "";
    return '<div class="card" style="margin-top:10px"><div style="font-weight:500;font-size:13px;margin-bottom:6px">Recent activity</div>' +
      log.map(function (e) { return '<div style="display:flex;gap:10px;padding:5px 0;border-top:0.5px solid var(--border2);font-size:11.5px"><span style="flex:1">' + window.APP.esc(e.detail) + '</span><span class="mono" style="color:var(--text3)">' + window.APP.fmtTs(e.ts) + '</span></div>'; }).join("") + '</div>';
  }

  function kpis(list) { return '<div class="kpis">' + list.map(function (k) { return '<div class="kpi"><div class="l">' + k[0] + '</div><div class="v">' + k[1] + '</div></div>'; }).join("") + '</div>'; }

  function wire(mount) {
    var next = document.getElementById("h-next"); if (next) next.addEventListener("click", function () { window.APP.openAllegation(next.getAttribute("data-id")); });
    var appr = document.getElementById("h-appr"); if (appr) appr.addEventListener("click", function () { window.APP.nav("approvals"); });
    var team = document.getElementById("h-team"); if (team) team.addEventListener("click", function () { window.APP.nav("team"); });
    var triage = document.getElementById("h-triage"); if (triage) triage.addEventListener("click", function () { window.APP.nav("queue"); });
    mount.querySelectorAll(".tm-link").forEach(function (el) { el.addEventListener("click", function () { window.APP.openTeam(el.getAttribute("data-team")); }); });
    mount.querySelectorAll(".case-row[data-pid]").forEach(function (el) { el.addEventListener("click", function () { window.APP.openProvider(el.getAttribute("data-pid")); }); });
    mount.querySelectorAll("tr.row, .row[data-id]").forEach(function (el) { el.addEventListener("click", function () { window.APP.openAllegation(el.getAttribute("data-id")); }); });
  }
})();
