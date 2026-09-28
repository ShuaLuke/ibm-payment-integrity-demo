/* Team & assignments — roster, per-analyst caseload, unassigned pool,
   single + bulk (re)assignment, and workload-balancing suggestions. */
(function () {
  window.Views = window.Views || {};
  var OPEN = ["New", "Assigned", "Under review", "Returned", "Pending review", "Recommended close"];
  var isOpen = function (a) { return OPEN.indexOf(a.status) >= 0; };
  var selected = {};

  window.Views.team = {
    render: function (mount) {
      selected = {};
      var team = window.APP.ANALYSTS;
      var A = window.DP.raw.allegations;
      function forAnalyst(n) { return A.filter(function (a) { return a.assignee === n && isOpen(a); }); }
      var unassigned = A.filter(function (a) { return !a.assignee && isOpen(a); });
      var sel = window.APP.state.teamSel || team[0];
      var isPool = sel === "__unassigned__";

      function rosterRow(name, list, key) {
        var high = list.filter(function (a) { return a.riskScore >= 80; }).length;
        var exp = list.reduce(function (s, a) { return s + (a.exposurePost || 0); }, 0);
        var active = sel === key;
        return '<div class="tm-row" data-sel="' + key + '" style="display:flex;align-items:center;gap:10px;padding:9px 11px;border-radius:8px;cursor:pointer;' + (active ? 'background:var(--accent-l);border:0.5px solid #bfe0d9' : 'border:0.5px solid transparent') + '">' +
          (key === "__unassigned__" ? '<div style="width:30px;height:30px;border-radius:50%;background:var(--surface);border:0.5px solid var(--border);display:flex;align-items:center;justify-content:center;color:var(--text2)"><i class="ti ti-inbox"></i></div>' : '<div class="avatar" style="width:30px;height:30px;background:var(--ink);color:#fff">' + initials(name) + '</div>') +
          '<div style="flex:1"><div style="font-size:12.5px;font-weight:500">' + window.APP.esc(name) + '</div><div style="font-size:11px;color:var(--text2)">' + list.length + ' open · ' + high + ' high-risk</div></div>' +
          '<div style="text-align:right"><div style="font-size:12px;font-weight:500">' + window.DP.usdShort(exp) + '</div></div></div>';
      }

      var selName = isPool ? "Unassigned pool" : sel;
      var selList = (isPool ? unassigned : forAnalyst(sel)).sort(function (a, b) { return b.riskScore - a.riskScore; });

      // Team performance & workload — KPIs per analyst incl. completed + avg time.
      function perfCard() {
        var rows = team.map(function (n) {
          var list = forAnalyst(n);
          var high = list.filter(function (a) { return a.riskScore >= 80; }).length;
          var exp = list.reduce(function (s, a) { return s + (a.exposurePost || 0); }, 0);
          var m = window.APP.ANALYST_META[n] || {};
          var strengths = (m.strengths || []).slice(0, 3).map(function (t) { return '<span class="tag fwa">' + window.APP.esc(t) + '</span>'; }).join(" ");
          return '<tr><td><div style="display:flex;align-items:center;gap:8px"><span class="avatar" style="width:24px;height:24px;font-size:9px">' + initials(n) + '</span>' + window.APP.esc(n) + '</div></td>' +
            '<td>' + (strengths || '<span class="muted">—</span>') + '</td>' +
            '<td class="right" style="font-weight:500">' + list.length + '</td>' +
            '<td class="right">' + high + '</td>' +
            '<td class="right">' + (m.completed != null ? m.completed : '—') + '</td>' +
            '<td class="right">' + (m.avgDays != null ? m.avgDays + 'd' : '—') + '</td>' +
            '<td class="right" style="font-weight:500">' + window.DP.usdShort(exp) + '</td>' +
            '<td class="right" style="font-weight:500;color:var(--low-tx)">' + (m.closedExp2w != null ? window.DP.usdShort(m.closedExp2w) : '—') + '</td></tr>';
        }).join("");
        return '<div class="card" style="margin-bottom:12px;padding:0;overflow:hidden">' +
          '<div style="padding:11px 13px;border-bottom:0.5px solid var(--border2);font-weight:500;font-size:13px"><i class="ti ti-gauge" style="color:var(--accent-d)"></i> Team performance &amp; workload <span class="muted" style="font-weight:400;font-size:11px">· open load, completed, average handling time &amp; recovery per analyst</span></div>' +
          '<table><thead><tr><th>Analyst</th><th>Specialties (best at)</th><th class="right">Open</th><th class="right">High-risk</th><th class="right">Completed</th><th class="right">Avg time</th><th class="right">Open exposure</th><th class="right">Closed exp (2w)</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
      }

      mount.innerHTML =
        '<div class="page">' +
        '<div class="page-head"><div><div class="page-title">Team &amp; assignments</div><div class="page-sub">Track team performance, balance workload, and assign leads to the analyst who\'s best at them</div></div>' +
        '<span class="tag"><i class="ti ti-user-shield"></i> Supervisor · Karen Boyd</span></div>' +
        perfCard() +
        '<div style="display:flex;gap:12px;align-items:flex-start">' +
        '<div style="width:280px;flex:none;display:flex;flex-direction:column;gap:6px">' +
        '<div class="l" style="font-size:10.5px;color:var(--text2);margin-bottom:2px">Analysts</div>' +
        team.map(function (n) { return rosterRow(n, forAnalyst(n), n); }).join("") +
        '<div class="l" style="font-size:10.5px;color:var(--text2);margin:8px 0 2px">Pool</div>' +
        rosterRow("Unassigned pool", unassigned, "__unassigned__") +
        '</div>' +
        '<div style="flex:1;min-width:0">' +
        '<div class="card" style="padding:0;overflow:hidden">' +
        '<div style="padding:11px 13px;display:flex;justify-content:space-between;align-items:center;border-bottom:0.5px solid var(--border2)"><div style="font-weight:500;font-size:13px">' + window.APP.esc(selName) + ' <span class="muted" style="font-weight:400;font-size:11px">· ' + selList.length + ' open</span></div>' +
        (isPool && selList.length ? '<span style="display:flex;gap:6px"><button class="btn" id="tm-strength" style="font-size:11.5px"><i class="ti ti-target-arrow"></i> Assign by strength</button><button class="btn" id="tm-balance" style="font-size:11.5px"><i class="ti ti-scale"></i> Balance workload</button></span>' : '') + '</div>' +
        '<div id="tm-bulk" style="display:none;padding:8px 13px;background:var(--accent-l);border-bottom:0.5px solid #d0e2ff;align-items:center;gap:10px"><span id="tm-bulk-n" style="font-weight:500;font-size:12.5px;color:var(--accent-d)"></span><span style="flex:1"></span><span style="font-size:12px;color:var(--text2)">Assign to</span><select id="tm-bulk-who" class="input" style="width:auto;font-size:12px">' + team.map(function (n) { return '<option value="' + n + '">' + n + '</option>'; }).join("") + '<option value="__unassigned__">Unassign</option></select><button class="btn primary" id="tm-bulk-apply" style="font-size:12px"><i class="ti ti-user-check"></i> Assign</button><button class="btn" id="tm-bulk-clear" style="font-size:12px">Clear</button></div>' +
        '<table><thead><tr><th style="width:30px"><input type="checkbox" class="tm-all"></th><th>Risk</th><th>Lead</th><th>Provider</th><th class="right">Exposure</th><th>Status</th><th>Assign to</th></tr></thead><tbody>' +
        (selList.length ? selList.map(function (a) {
          var p = window.DP.getProvider(a.providerId);
          return '<tr class="tm-case" data-id="' + a.id + '"><td><input type="checkbox" class="tm-check" data-id="' + a.id + '" onclick="event.stopPropagation()"></td><td>' + window.UI.riskChip(a.riskScore) + '</td>' +
            '<td><span class="mono" style="font-weight:500">#' + a.id + '</span> <span class="tag fwa">' + a.fwaType + '</span></td>' +
            '<td>' + window.APP.esc(p.name) + '</td><td class="right" style="font-weight:500">' + window.DP.usd(a.exposurePost || 0) + '</td>' +
            '<td>' + window.UI.statusPill(a.status) + '</td>' +
            '<td><select class="input tm-assign" data-id="' + a.id + '" style="width:auto;font-size:11.5px;padding:4px 6px" onclick="event.stopPropagation()">' + assignOpts(a.assignee, team) + '</select></td></tr>';
        }).join("") : '<tr><td colspan="7" class="muted" style="padding:16px;text-align:center">' + (isPool ? "No unassigned claims — everything's allocated." : "No open cases for this analyst.") + '</td></tr>') +
        '</tbody></table></div><div id="tm-plan"></div></div></div></div>';

      // roster + row navigation
      mount.querySelectorAll(".tm-row").forEach(function (r) { r.addEventListener("click", function () { window.APP.state.teamSel = r.getAttribute("data-sel"); window.Views.team.render(mount); }); });
      mount.querySelectorAll(".tm-case").forEach(function (r) { r.addEventListener("click", function () { window.APP.openAllegation(r.getAttribute("data-id")); }); });
      mount.querySelectorAll(".tm-assign").forEach(function (s) { s.addEventListener("change", function () { var v = this.value; window.APP.assignCase(this.getAttribute("data-id"), v === "__unassigned__" ? null : v); window.Views.team.render(mount); }); });

      // selection + bulk bar
      function refreshBulk() {
        var ids = Object.keys(selected).filter(function (k) { return selected[k]; });
        var bar = document.getElementById("tm-bulk");
        bar.style.display = ids.length ? "flex" : "none";
        document.getElementById("tm-bulk-n").textContent = ids.length + " selected";
      }
      mount.querySelectorAll(".tm-check").forEach(function (c) { c.addEventListener("change", function () { selected[this.getAttribute("data-id")] = this.checked; refreshBulk(); }); });
      var all = mount.querySelector(".tm-all");
      if (all) all.addEventListener("change", function () { var on = this.checked; mount.querySelectorAll(".tm-check").forEach(function (c) { c.checked = on; selected[c.getAttribute("data-id")] = on; }); refreshBulk(); });
      document.getElementById("tm-bulk-clear").addEventListener("click", function () { selected = {}; window.Views.team.render(mount); });
      document.getElementById("tm-bulk-apply").addEventListener("click", function () {
        var who = document.getElementById("tm-bulk-who").value;
        Object.keys(selected).forEach(function (id) { if (selected[id]) window.APP.assignCase(id, who === "__unassigned__" ? null : who); });
        window.Views.team.render(mount);
      });

      // workload-balancing suggestion
      var bb = document.getElementById("tm-balance");
      if (bb) bb.addEventListener("click", function () { showBalancePlan(mount, unassigned, team, forAnalyst); });
      var sb = document.getElementById("tm-strength");
      if (sb) sb.addEventListener("click", function () { showStrengthPlan(mount, unassigned, team, forAnalyst); });
    }
  };

  // Route each unassigned lead to the analyst who specializes in its FWA type
  // (fallback: least-loaded analyst when no specialist matches).
  function showStrengthPlan(mount, unassigned, team, forAnalyst) {
    var loads = {}; team.forEach(function (n) { loads[n] = forAnalyst(n).length; });
    var plan = unassigned.slice().sort(function (a, b) { return b.riskScore - a.riskScore; }).map(function (c) {
      var best = window.APP.bestAnalystFor(c.fwaType);
      var pick = best || team.reduce(function (m, n) { return loads[n] < loads[m] ? n : m; }, team[0]);
      loads[pick]++;
      return { id: c.id, risk: c.riskScore, provider: window.DP.getProvider(c.providerId).name, fwa: c.fwaType, who: pick, byStrength: !!best };
    });
    document.getElementById("tm-plan").innerHTML =
      '<div class="card" style="margin-top:10px;border:0.5px solid #a6c8ff">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><div style="font-weight:500;font-size:13px"><i class="ti ti-target-arrow" style="color:var(--accent-d)"></i> Suggested assignment by specialty</div>' +
      '<div><button class="btn" id="tm-plan-cancel" style="font-size:12px;margin-right:6px">Cancel</button><button class="btn primary" id="tm-plan-apply" style="font-size:12px"><i class="ti ti-check"></i> Apply all (' + plan.length + ')</button></div></div>' +
      '<div style="font-size:11.5px;color:var(--text2);margin-bottom:8px">Routes each unassigned lead to the analyst who specializes in that FWA type, falling back to the least-loaded analyst when no specialist matches.</div>' +
      '<table><thead><tr><th>Risk</th><th>Lead</th><th>Provider</th><th>Suggested analyst</th><th>Basis</th></tr></thead><tbody>' +
      plan.map(function (r) { return '<tr><td>' + window.UI.riskChip(r.risk) + '</td><td><span class="mono" style="font-weight:500">#' + r.id + '</span> <span class="tag fwa">' + r.fwa + '</span></td><td>' + window.APP.esc(r.provider) + '</td><td><span class="avatar" style="width:22px;height:22px;font-size:9px;display:inline-flex;vertical-align:middle;margin-right:5px">' + initials(r.who) + '</span>' + window.APP.esc(r.who) + '</td><td>' + (r.byStrength ? '<span class="tag" style="background:var(--low-bg);color:var(--low-tx)">specialist</span>' : '<span class="muted">least-loaded</span>') + '</td></tr>'; }).join("") +
      '</tbody></table></div>';
    document.getElementById("tm-plan-cancel").addEventListener("click", function () { document.getElementById("tm-plan").innerHTML = ""; });
    document.getElementById("tm-plan-apply").addEventListener("click", function () {
      plan.forEach(function (r) { window.APP.assignCase(r.id, r.who); });
      window.APP.auditLog("WORKLOAD_ASSIGNED_BY_STRENGTH", plan.length + " leads routed to specialists by FWA type");
      window.Views.team.render(mount);
    });
  }

  function showBalancePlan(mount, unassigned, team, forAnalyst) {
    var loads = {}; team.forEach(function (n) { loads[n] = forAnalyst(n).length; });
    var before = {}; team.forEach(function (n) { before[n] = loads[n]; });
    var plan = unassigned.slice().sort(function (a, b) { return b.riskScore - a.riskScore; }).map(function (c) {
      var pick = team.reduce(function (m, n) { return loads[n] < loads[m] ? n : m; }, team[0]);
      loads[pick]++;
      return { id: c.id, risk: c.riskScore, provider: window.DP.getProvider(c.providerId).name, fwa: c.fwaType, who: pick };
    });
    var summary = team.map(function (n) { return '<span class="tag" style="margin-right:6px">' + initials(n) + ' ' + before[n] + '→<span style="color:var(--accent-d);font-weight:500">' + loads[n] + '</span></span>'; }).join("");
    document.getElementById("tm-plan").innerHTML =
      '<div class="card" style="margin-top:10px;border:0.5px solid #a6c8ff">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><div style="font-weight:500;font-size:13px"><i class="ti ti-scale" style="color:var(--accent-d)"></i> Suggested balanced assignment</div>' +
      '<div><button class="btn" id="tm-plan-cancel" style="font-size:12px;margin-right:6px">Cancel</button><button class="btn primary" id="tm-plan-apply" style="font-size:12px"><i class="ti ti-check"></i> Apply all (' + plan.length + ')</button></div></div>' +
      '<div style="font-size:11.5px;color:var(--text2);margin-bottom:8px">Distributes ' + plan.length + ' unassigned claims to the least-loaded analysts, highest-risk first. Open cases after: ' + summary + '</div>' +
      '<table><thead><tr><th>Risk</th><th>Lead</th><th>Provider</th><th>Suggested analyst</th></tr></thead><tbody>' +
      plan.map(function (r) { return '<tr><td>' + window.UI.riskChip(r.risk) + '</td><td><span class="mono" style="font-weight:500">#' + r.id + '</span> <span class="tag fwa">' + r.fwa + '</span></td><td>' + window.APP.esc(r.provider) + '</td><td><span class="avatar" style="width:22px;height:22px;font-size:9px;display:inline-flex;vertical-align:middle;margin-right:5px">' + initials(r.who) + '</span>' + window.APP.esc(r.who) + '</td></tr>'; }).join("") +
      '</tbody></table></div>';
    document.getElementById("tm-plan-cancel").addEventListener("click", function () { document.getElementById("tm-plan").innerHTML = ""; });
    document.getElementById("tm-plan-apply").addEventListener("click", function () {
      plan.forEach(function (r) { window.APP.assignCase(r.id, r.who); });
      window.APP.auditLog("WORKLOAD_BALANCED", plan.length + " claims auto-distributed across " + team.length + " analysts");
      window.Views.team.render(mount);
    });
  }

  function assignOpts(cur, team) { return '<option value="__unassigned__"' + (!cur ? " selected" : "") + '>Unassigned</option>' + team.map(function (n) { return '<option value="' + n + '"' + (cur === n ? " selected" : "") + '>' + n + '</option>'; }).join(""); }
  function initials(n) { return n.split(" ").map(function (x) { return x[0]; }).join("").slice(0, 2).toUpperCase(); }
})();
