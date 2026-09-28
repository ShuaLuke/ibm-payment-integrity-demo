/* Rule Discovery — emerging-rule candidates (Element 3.2.ii/iii). A pattern the
   models keep surfacing is proposed as a RULE: logic, required data, a suggested
   trigger, expected output, and a REPLAY estimating impact. A human approves,
   returns, or rejects it (HIL governance) before promotion. Read-only data
   (DP.getRuleCandidates); approve/return/reject is session state for the demo. */
(function () {
  window.Views = window.Views || {};
  var selectedId = null;
  var decisions = {};   // candidate id → session decision (approved / returned / rejected)

  var STAT = {
    draft: ["var(--surface)", "var(--text2)", "pencil", "Draft"],
    "under-review": ["var(--med-bg)", "var(--med-tx)", "eye", "Under review"],
    approved: ["var(--accent-l)", "var(--accent-d)", "circle-check", "Approved · promoting"],
    returned: ["var(--med-bg)", "var(--med-tx)", "corner-up-left", "Returned for edits"],
    rejected: ["var(--high-bg)", "var(--high-tx)", "circle-x", "Rejected"]
  };
  var TONE = { high: ["var(--high-bg)", "var(--high-tx)"], med: ["var(--med-bg)", "var(--med-tx)"], low: ["var(--low-bg)", "var(--low-tx)"] };
  var SEV = { Critical: ["var(--high-bg)", "var(--high-tx)"], High: ["#fbe6cf", "#9a5b12"], Medium: ["var(--med-bg)", "var(--med-tx)"], Low: ["var(--low-bg)", "var(--low-tx)"] };

  function statPill(s) { var c = STAT[s] || ["var(--surface)", "var(--text2)", "point", s]; return '<span class="tag" style="background:' + c[0] + ';color:' + c[1] + '"><i class="ti ti-' + c[2] + '"></i> ' + c[3] + '</span>'; }
  function sevPill(s) { var c = SEV[s] || ["var(--surface)", "var(--text2)"]; return '<span class="tag" style="background:' + c[0] + ';color:' + c[1] + '">' + window.APP.esc(s) + '</span>'; }

  function block(icon, title, sub, inner) {
    return '<div class="card" style="margin:0 0 8px;background:var(--surface)"><div style="font-weight:600;font-size:12px;margin-bottom:6px"><i class="ti ti-' + icon + '" style="color:var(--accent-d)"></i> ' + title + (sub ? ' <span class="muted" style="font-weight:400;font-size:10.5px">· ' + sub + '</span>' : '') + '</div>' + inner + '</div>';
  }

  window.Views.discovery = {
    render: function (mount) {
      var cands = window.DP.getRuleCandidates();
      cands.forEach(function (c) { if (decisions[c.id]) c.status = decisions[c.id]; });
      if (!selectedId || !cands.some(function (c) { return c.id === selectedId; })) selectedId = cands[0].id;
      var sel = cands.filter(function (c) { return c.id === selectedId; })[0];

      var counts = { draft: 0, "under-review": 0, approved: 0, returned: 0, rejected: 0 };
      cands.forEach(function (c) { counts[c.status] = (counts[c.status] || 0) + 1; });

      var listRows = cands.map(function (c) {
        var on = c.id === selectedId;
        return '<button class="disc-row" data-id="' + c.id + '" style="width:100%;text-align:left;border:none;border-left:3px solid ' + (on ? "var(--accent)" : "transparent") + ';background:' + (on ? "var(--accent-l)" : "transparent") + ';padding:10px 12px;cursor:pointer;border-bottom:0.5px solid var(--border2)">' +
          '<div style="display:flex;gap:6px;align-items:center;justify-content:space-between"><span style="font-weight:' + (on ? "600" : "500") + ';font-size:12px;line-height:1.35">' + window.APP.esc(c.name) + '</span></div>' +
          '<div style="display:flex;gap:5px;align-items:center;margin-top:5px;flex-wrap:wrap">' + statPill(c.status) + '<span class="muted" style="font-size:10.5px">' + window.APP.esc(c.fraudType) + '</span></div>' +
          '<div style="font-size:10.5px;color:var(--text3);margin-top:4px"><i class="ti ti-cpu"></i> ' + window.APP.esc(c.sourcePattern.model) + ' · ' + c.confidence + '% conf.</div>' +
          '</button>';
      }).join("");

      var summaryChips = [
        chipHtml("bulb", cands.length + " candidates surfaced"),
        chipHtml("eye", counts["under-review"] + " under review"),
        chipHtml("circle-check", counts.approved + " approved"),
        chipHtml("pencil", counts.draft + " draft")
      ].join("");

      mount.innerHTML =
        '<div style="display:flex;flex-direction:column;gap:10px">' +
        '<div class="card"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px"><div style="font-weight:600;font-size:14px"><i class="ti ti-bulb" style="color:var(--accent-d)"></i> Rule discovery <span class="muted" style="font-weight:400;font-size:11.5px">· patterns the models surfaced, proposed as rules for human review</span></div>' +
        '<span class="tag" style="background:var(--surface)"><i class="ti ti-shield-check"></i> Human-in-the-loop governance</span></div>' +
        '<div style="font-size:11.5px;color:var(--text2);margin-top:6px">Each candidate carries its source pattern, proposed logic, the data it needs, a suggested trigger, the expected output, and a replay over recent claims estimating impact. A reviewer approves, returns, or rejects it before it can enter the release pipeline.</div>' +
        '<div style="margin-top:9px;display:flex;gap:8px;flex-wrap:wrap">' + summaryChips + '</div></div>' +
        pendActivityCard() +
        '<div style="display:grid;grid-template-columns:320px 1fr;gap:10px;align-items:start">' +
        '<div class="card" style="padding:0;overflow:hidden"><div style="padding:9px 12px;font-size:10.5px;color:var(--text3);text-transform:uppercase;letter-spacing:.04em;border-bottom:0.5px solid var(--border2)">Candidate pipeline</div>' + listRows + '</div>' +
        '<div id="disc-detail">' + detailHtml(sel) + '</div>' +
        '</div></div>';

      wire(mount);
    }
  };

  function chipHtml(icon, label) { return '<span class="tag" style="background:var(--surface)"><i class="ti ti-' + icon + '"></i> ' + window.APP.esc(label) + '</span>'; }

  // PEND-activity analysis — which rules fire, how often, disposition → gaps / redundant / automation
  function pendActivityCard() {
    var pa = window.DP.getPendActivity && window.DP.getPendActivity(); if (!pa) return "";
    var esc = window.APP.esc;
    var rows = pa.rows.map(function (r) {
      var pct = parseInt(r.overturnRate, 10) || 0;
      var tone = pct >= 40 ? ["var(--high-bg)", "var(--high-tx)"] : pct >= 15 ? ["var(--med-bg)", "var(--med-tx)"] : ["var(--low-bg)", "var(--low-tx)"];
      return '<tr><td class="mono" style="font-weight:600">' + esc(r.rule) + '</td><td>' + esc(r.name) + '</td>' +
        '<td class="right mono">' + r.fired.toLocaleString() + '</td><td class="right mono">' + r.pend.toLocaleString() + '</td>' +
        '<td><span class="tag" style="background:' + tone[0] + ';color:' + tone[1] + '">' + esc(r.overturnRate) + ' overturn</span></td>' +
        '<td style="font-size:11px;color:var(--text2)">' + esc(r.disposition) + '</td>' +
        '<td style="font-size:11px">' + esc(r.flag) + '</td></tr>';
    }).join("");
    var KIND = { gap: ["ti-puzzle", "var(--high-tx)", "Rule gap"], redundant: ["ti-copy", "var(--med-tx)", "Redundant pend"], automation: ["ti-robot", "var(--accent-d)", "Automation opportunity"] };
    var ins = pa.insights.map(function (i) { var k = KIND[i.kind] || ["ti-point", "var(--text2)", ""]; return '<div style="display:flex;gap:7px;padding:5px 0;border-top:0.5px solid var(--border2);font-size:11.5px"><i class="ti ' + k[0] + '" style="color:' + k[1] + ';margin-top:1px"></i><div><b style="color:' + k[1] + '">' + k[2] + '.</b> ' + esc(i.text) + '</div></div>'; }).join("");
    return '<div class="card"><div style="font-weight:600;font-size:13px;margin-bottom:2px"><i class="ti ti-activity" style="color:var(--accent-d)"></i> PEND-activity analysis <span class="muted" style="font-weight:400;font-size:11px">· which rules fire, how often, and with what disposition (' + esc(pa.window) + ')</span></div>' +
      '<div style="font-size:11.5px;color:var(--text2);margin:2px 0 7px">The engine mines its own PEND activity to surface rule gaps, redundant pends and automation opportunities — the seed of the rule recommendations below.</div>' +
      '<div style="overflow-x:auto"><table style="width:100%;font-size:11px"><thead><tr><th>Rule</th><th>Name</th><th class="right">Fired</th><th class="right">Pended</th><th>Overturn</th><th>Disposition</th><th>Signal</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<div style="margin-top:8px">' + ins + '</div></div>';
  }

  function detailHtml(c) {
    if (!c) return '<div class="card muted" style="font-size:12px">Select a candidate.</div>';
    var esc = window.APP.esc, usdS = window.DP.usdShort, usd = window.DP.usd;

    // ---- source pattern
    var sp = c.sourcePattern;
    var patternInner = '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px">' +
      '<span class="tag" style="background:var(--accent-l);color:var(--accent-d)"><i class="ti ti-cpu"></i> ' + esc(sp.model) + '</span>' +
      '<span class="tag" style="background:var(--surface)">' + esc(sp.type) + '</span>' +
      '<span class="tag" style="background:var(--surface)">' + c.confidence + '% confidence</span></div>' +
      '<div style="font-size:11.5px;color:var(--text);line-height:1.6">' + esc(sp.finding) + '</div>';

    // ---- proposed logic (IF/THEN + pseudocode)
    var crit = (c.logic.criteria || []).map(function (x) {
      return '<div style="display:flex;gap:8px;padding:4px 0;border-top:0.5px solid var(--border2);font-size:11.5px">' +
        '<span style="flex:none;color:var(--accent-d);font-weight:600;min-width:34px">IF</span><span style="flex:1">' + esc(x.when) + '</span>' +
        '<span style="flex:none;color:var(--high-tx);font-weight:600;min-width:38px">THEN</span><span style="flex:1;color:var(--text2)">' + esc(x.then) + '</span></div>';
    }).join("");
    var logicInner = '<div style="font-size:11.5px;color:var(--text);line-height:1.6;margin-bottom:4px">' + esc(c.logic.summary) + '</div>' + crit +
      (c.logic.pseudocode ? '<pre class="mono" style="margin:8px 0 0;background:#0a1640;color:#d0e2ff;border-radius:6px;padding:9px 11px;font-size:10.5px;line-height:1.5;overflow-x:auto;white-space:pre">' + esc(c.logic.pseudocode) + '</pre>' : '');

    // ---- required data
    var inRows = (c.inputs || []).map(function (i) {
      return '<tr><td style="font-weight:500">' + esc(i.field) + '</td><td class="mono" style="font-size:10.5px;color:var(--accent-d)">' + esc(i.source) + '</td><td class="mono" style="font-size:10.5px;color:var(--text3)">' + esc(i.example) + '</td></tr>';
    }).join("");
    var inputsInner = '<div style="overflow-x:auto"><table style="width:100%"><thead><tr><th>Field</th><th>Source segment / reference</th><th>Example</th></tr></thead><tbody>' + inRows + '</tbody></table></div>';

    // ---- trigger + expected output
    var o = c.output;
    var kv = function (k, v) { return '<div style="display:flex;gap:8px;padding:3px 0;font-size:11.5px;border-top:0.5px solid var(--border2)"><span style="color:var(--text2);min-width:96px;flex:none">' + k + '</span><span style="flex:1">' + v + '</span></div>'; };
    var outInner = kv("Trigger", '<span class="tag" style="background:var(--accent-l);color:var(--accent-d)"><i class="ti ti-bolt"></i> ' + esc(c.trigger) + '</span>') +
      (c.providerAttributes ? kv("Provider attributes", esc(c.providerAttributes)) : "") +
      (c.lookback ? kv("Historical lookback", esc(c.lookback)) : "") +
      kv("Signal", esc(o.signal)) +
      kv("Emits", '<span class="mono" style="color:var(--high-tx)">' + esc(o.emits) + '</span>') +
      kv("Disposition", esc(o.disposition)) +
      kv("Feeds", '<span style="color:var(--text2)">' + esc(o.downstream) + '</span>');

    // ---- replay / impact
    var im = c.impact;
    var dispChips = (im.dispositions || []).map(function (d) { var t = TONE[d.tone] || TONE.med; return '<span class="tag" style="background:' + t[0] + ';color:' + t[1] + '">' + d.count.toLocaleString() + ' — ' + esc(d.label) + '</span>'; }).join(" ");
    var impactInner = '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:8px">' +
      stat("Claims matched", im.claimsMatched.toLocaleString()) +
      stat("Replay window", im.window) +
      stat("Est. exposure", usd(im.exposure), true) +
      '</div>' +
      '<div style="font-size:10.5px;color:var(--text3);text-transform:uppercase;letter-spacing:.04em;margin-bottom:5px">Projected dispositions</div>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap">' + dispChips + '</div>' +
      '<div style="font-size:10.5px;color:var(--text3);margin-top:8px"><i class="ti ti-info-circle"></i> Replay is a dry-run over historical claims — no dispositions are applied until the rule is approved and promoted.</div>';

    // ---- HIL governance
    var hil = hilHtml(c);

    return '<div style="display:flex;flex-direction:column">' +
      '<div class="card" style="margin:0 0 10px"><div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap">' +
      '<div style="flex:1;min-width:0"><div style="font-weight:600;font-size:14px;line-height:1.35">' + esc(c.name) + '</div>' +
      '<div style="display:flex;gap:6px;align-items:center;margin-top:6px;flex-wrap:wrap">' + statPill(c.status) + sevPill(c.severity) +
      '<span class="tag" style="background:var(--surface)">' + esc(c.fraudType) + '</span>' +
      '<span class="muted" style="font-size:10.5px"><i class="ti ti-calendar"></i> discovered ' + esc(c.discoveredAt) + (c.reviewer ? ' · reviewer ' + esc(c.reviewer) : '') + '</span></div></div>' +
      '</div></div>' +
      block("cpu", "Source pattern", "the model finding that triggered this candidate", patternInner) +
      block("binary-tree", "Proposed logic", "the rule the pattern implies", logicInner) +
      block("database-import", "Required data", "claim fields → 837 / NCPDP segments + external references", inputsInner) +
      block("logout", "Trigger &amp; expected output", "where it runs and what it emits", outInner) +
      block("player-play", "Replay &amp; estimated impact", "dry-run over recent claims", impactInner) +
      hil +
      '</div>';
  }

  function hilHtml(c) {
    var esc = window.APP.esc;
    var active = c.status === "draft" || c.status === "under-review";
    var promo = '';
    if (c.status === "approved") {
      var envs = ["Dev", "Test", "Pre-prod", "Prod"];
      promo = '<div style="margin-top:8px;padding:9px 11px;background:var(--accent-l);border-radius:7px">' +
        '<div style="font-size:11.5px;color:var(--accent-d);font-weight:600;margin-bottom:6px"><i class="ti ti-rocket"></i> Promoted to the release pipeline — now flowing through the controlled environments</div>' +
        '<div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap">' +
        envs.map(function (e, i) { var live = i === 0; return (i ? '<i class="ti ti-chevron-right" style="color:var(--text3);font-size:12px"></i>' : '') + '<span class="tag" style="background:' + (live ? "var(--med-bg)" : "#fff") + ';color:' + (live ? "var(--med-tx)" : "var(--text3)") + ';border:0.5px solid var(--border)">' + (live ? '<i class="ti ti-loader"></i> ' : '') + e + '</span>'; }).join("") +
        '</div>' +
        '<div style="font-size:10.5px;color:var(--text2);margin-top:7px">Deploying to Dev on merge · QA / UAT / Change Advisory Board sign-offs required to reach production. Track it on the <b>Releases</b> tab.</div>' +
        '<div style="margin-top:8px"><button class="disc-act" data-act="reopen" data-id="' + c.id + '" style="border:0.5px solid var(--border);background:#fff;border-radius:7px;padding:6px 11px;font-size:11.5px;cursor:pointer"><i class="ti ti-arrow-back-up"></i> Recall from pipeline</button>' +
        '<button class="disc-act" data-act="releases" style="margin-left:6px;border:0.5px solid var(--accent);background:var(--accent);color:#fff;border-radius:7px;padding:6px 11px;font-size:11.5px;cursor:pointer"><i class="ti ti-arrow-right"></i> Open Releases</button></div>' +
        '</div>';
    } else if (c.status === "returned" || c.status === "rejected") {
      var isRej = c.status === "rejected";
      promo = '<div style="margin-top:8px;padding:9px 11px;background:' + (isRej ? "var(--high-bg)" : "var(--med-bg)") + ';border-radius:7px">' +
        '<div style="font-size:11.5px;color:' + (isRej ? "var(--high-tx)" : "var(--med-tx)") + ';font-weight:600"><i class="ti ti-' + (isRej ? "circle-x" : "corner-up-left") + '"></i> ' + (isRej ? "Rejected — will not be promoted" : "Returned to the modeling team for refinement") + '</div>' +
        '<div style="margin-top:8px"><button class="disc-act" data-act="reopen" data-id="' + c.id + '" style="border:0.5px solid var(--border);background:#fff;border-radius:7px;padding:6px 11px;font-size:11.5px;cursor:pointer"><i class="ti ti-arrow-back-up"></i> Reopen for review</button></div>' +
        '</div>';
    }
    var actions = active ? '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
      '<button class="disc-act" data-act="approve" data-id="' + c.id + '" style="border:none;background:var(--accent);color:#fff;border-radius:8px;padding:9px 15px;font-size:12px;font-weight:600;cursor:pointer"><i class="ti ti-circle-check"></i> Approve &amp; promote</button>' +
      '<button class="disc-act" data-act="return" data-id="' + c.id + '" style="border:0.5px solid var(--border);background:#fff;border-radius:8px;padding:9px 15px;font-size:12px;cursor:pointer"><i class="ti ti-corner-up-left"></i> Return for edits</button>' +
      '<button class="disc-act" data-act="reject" data-id="' + c.id + '" style="border:0.5px solid #e6b8b8;background:#fff;color:var(--high-tx);border-radius:8px;padding:9px 15px;font-size:12px;cursor:pointer"><i class="ti ti-circle-x"></i> Reject</button>' +
      '</div>' : '';
    return '<div class="card"><div style="font-weight:600;font-size:12px;margin-bottom:8px"><i class="ti ti-gavel" style="color:var(--accent-d)"></i> Human-in-the-loop decision <span class="muted" style="font-weight:400;font-size:10.5px">· a reviewer governs whether this pattern becomes an enforced rule</span></div>' +
      actions + promo + '</div>';
  }

  function stat(label, val, accent) {
    return '<div style="flex:1;min-width:110px;background:#fff;border:0.5px solid var(--border);border-radius:7px;padding:8px 10px"><div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.04em">' + label + '</div><div style="font-weight:600;font-size:15px' + (accent ? ';color:var(--high-tx)' : '') + '">' + val + '</div></div>';
  }

  function wire(mount) {
    mount.querySelectorAll(".disc-row").forEach(function (b) {
      b.addEventListener("click", function () { selectedId = b.getAttribute("data-id"); window.Views.discovery.render(mount); });
    });
    mount.querySelectorAll(".disc-act").forEach(function (b) {
      b.addEventListener("click", function () {
        var act = b.getAttribute("data-act"), id = b.getAttribute("data-id");
        if (act === "releases") { window.APP.nav("releases"); return; }
        var cands = window.DP.getRuleCandidates(), c = cands.filter(function (x) { return x.id === id; })[0];
        var name = c ? c.name : id;
        if (act === "approve") { decisions[id] = "approved"; window.APP.auditLog("RULE_CANDIDATE_APPROVE", name + " · approved & promoted to the release pipeline"); }
        else if (act === "return") { decisions[id] = "returned"; window.APP.auditLog("RULE_CANDIDATE_RETURN", name + " · returned for edits"); }
        else if (act === "reject") { decisions[id] = "rejected"; window.APP.auditLog("RULE_CANDIDATE_REJECT", name + " · rejected"); }
        else if (act === "reopen") { delete decisions[id]; window.APP.auditLog("RULE_CANDIDATE_REOPEN", name + " · reopened for review"); }
        window.Views.discovery.render(mount);
      });
    });
  }
})();
