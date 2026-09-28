/* Supabase integration — auth gate + cross-session, shared persistence.
   The synthetic dataset stays in data.js; this overlays saved case-state + audit
   from Supabase and writes mutations back. Falls back to local mode if unconfigured. */
(function () {
  var cfg = window.PIVOT_CONFIG || {};
  var enabled = !!(cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase);
  var client = enabled ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey) : null;
  var SB = { enabled: enabled, ready: false, client: client, user: null };
  window.SB = SB;

  function resolveUser(email) { return (cfg.users || {})[email] || { name: email, role: "analyst", initials: (email || "?")[0].toUpperCase() }; }

  // ---- persistence ----
  function saveCase(id) {
    if (!SB.ready) return;
    var a = window.DP.raw.allegations.find(function (x) { return x.id === id; }); if (!a) return;
    var d = window.APP.state.decisions[id] || {};
    client.from("case_state").upsert({
      claim_id: id, status: a.status, assignee: a.assignee || null,
      decision_outcome: d.outcome || null, rationale: d.rationale || null,
      review_state: d.reviewState || null, return_note: d.returnNote || null,
      updated_by: window.APP.ROLES[window.APP.state.role].name, updated_at: new Date().toISOString()
    }).then(function (r) { if (r.error) console.warn("saveCase:", r.error.message); });
  }
  // persist a lead's case assignment. Separate write so a missing case_link column
  // (migration not yet applied) can never break the core decision/case_state save.
  function saveCaseLink(id) {
    if (!SB.ready) return;
    client.from("case_state").upsert({ claim_id: id, case_link: (window.APP.state.caseLinks || {})[id] || null, updated_by: window.APP.ROLES[window.APP.state.role].name, updated_at: new Date().toISOString() })
      .then(function (r) { if (r.error) console.warn("saveCaseLink:", r.error.message); });
  }
  // persist a decision's coded reason. Separate write (same rationale as
  // saveCaseLink) so a missing decision_reason column can never break the core save.
  function saveCaseReason(id) {
    if (!SB.ready) return;
    var d = window.APP.state.decisions[id] || {};
    client.from("case_state").upsert({ claim_id: id, decision_reason: d.reason || null, updated_by: window.APP.ROLES[window.APP.state.role].name, updated_at: new Date().toISOString() })
      .then(function (r) { if (r.error) console.warn("saveCaseReason:", r.error.message); });
  }
  // persist (or clear) a case closure, keyed by the case's primary provider id
  function saveClosure(pid) {
    if (!SB.ready) return;
    var c = (window.APP.state.closedCases || {})[pid];
    if (!c) { client.from("case_closure").delete().eq("provider_id", pid).then(function (r) { if (r.error) console.warn("reopenCase:", r.error.message); }); return; }
    client.from("case_closure").upsert({ provider_id: pid, reason: c.reason || null, reason_text: c.reasonText || null, narrative: c.narrative || null, closed_by: c.by || window.APP.ROLES[window.APP.state.role].name, updated_at: new Date().toISOString() }).then(function (r) { if (r.error) console.warn("closeCase:", r.error.message); });
  }
  function saveAudit(action, detail) {
    if (!SB.ready) return;
    client.from("audit_log").insert({ action: action, detail: detail, user_name: window.APP.ROLES[window.APP.state.role].name })
      .then(function (r) { if (r.error) console.warn("saveAudit:", r.error.message); });
  }
  function loadState() {
    return Promise.all([
      client.from("case_state").select("*"),
      client.from("audit_log").select("*").order("ts", { ascending: false }).limit(1000),
      client.from("case_closure").select("*")
    ]).then(function (res) {
      var cs = res[0].data || [], al = res[1].data || [], cc = res[2].data || [];
      cs.forEach(function (row) {
        var a = window.DP.raw.allegations.find(function (x) { return x.id === row.claim_id; });
        if (a) { if (row.status) a.status = row.status; a.assignee = row.assignee || null; }
        if (row.decision_outcome) window.APP.state.decisions[row.claim_id] = { outcome: row.decision_outcome, rationale: row.rationale, reason: row.decision_reason || null, reviewState: row.review_state, returnNote: row.return_note, status: row.status, ts: new Date(row.updated_at) };
        if (row.case_link) (window.APP.state.caseLinks = window.APP.state.caseLinks || {})[row.claim_id] = row.case_link;
      });
      cc.forEach(function (row) { (window.APP.state.closedCases = window.APP.state.closedCases || {})[row.provider_id] = { reason: row.reason, reasonText: row.reason_text || window.APP.closeReasonText(row.reason), narrative: row.narrative || "", by: row.closed_by, ts: new Date(row.updated_at) }; });
      window.APP.state.audit = al.map(function (e) { return { ts: new Date(e.ts), action: e.action, detail: e.detail, user: e.user_name }; });
    });
  }

  function wrap() {
    // Forward every argument through — these wrappers must not care about the
    // wrapped function's signature, or adding a parameter (e.g. the decision
    // reason) silently drops it in Supabase mode while still working locally.
    var after = function (name, save) {
      var orig = window.APP[name];
      window.APP[name] = function () { var r = orig.apply(window.APP, arguments); save.apply(null, arguments); return r; };
    };
    after("auditLog", function (ac, de) { saveAudit(ac, de); });
    after("applyDecision", function (id) { saveCase(id); saveCaseReason(id); });
    after("supervisorAction", function (id) { saveCase(id); });
    after("assignCase", function (id) { saveCase(id); });
    after("setLeadCase", function (id) { saveCaseLink(id); });
    after("closeCase", function (pid) { saveClosure(pid); });
    after("reopenCase", function (pid) { saveClosure(pid); });
    window.APP.resetDemo = function () { client.rpc("reset_demo").then(function () { location.reload(); }); };
    window.APP.signOut = function () { client.auth.signOut().then(function () { location.reload(); }); };
  }

  // ---- auth flow ----
  function afterLogin(email) {
    var u = resolveUser(email); SB.user = email;
    window.APP.state.role = u.role;
    window.APP.ROLES[u.role] = { name: u.name, title: u.role === "supervisor" ? "Supervisor" : "Analyst", initials: u.initials };
    return loadState().then(function () { SB.ready = true; removeLogin(); window.APP.boot(); addSignOut(); });
  }
  function addSignOut() {
    if (document.getElementById("signout-btn")) return;
    var rs = document.getElementById("role-switch"); if (!rs) return;
    var b = document.createElement("button");
    b.id = "signout-btn"; b.title = "Sign out";
    b.style.cssText = "background:rgba(255,255,255,0.08);border:0.5px solid rgba(255,255,255,0.2);border-radius:7px;color:#dde1e6;cursor:pointer;padding:5px 9px;font-family:inherit;font-size:12px";
    b.innerHTML = '<i class="ti ti-logout"></i>';
    b.onclick = function () { window.APP.signOut(); };
    rs.parentNode.appendChild(b);
  }

  function removeLogin() { var o = document.getElementById("login-ov"); if (o) o.remove(); }

  function showLogin() {
    var o = document.createElement("div");
    o.id = "login-ov";
    o.style.cssText = "position:fixed;inset:0;z-index:400;background:radial-gradient(1100px 700px at 85% 100%,rgba(15,98,254,.22),rgba(15,98,254,0) 70%),#fff;display:flex;align-items:center;justify-content:center;font-family:'IBM Plex Sans',sans-serif";
    o.innerHTML =
      '<div style="width:380px;max-width:92vw;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 12px 48px rgba(0,0,0,0.4)">' +
      '<div style="background:#001141;padding:20px;text-align:center"><div style="color:#fff;font-weight:400;font-size:18px;letter-spacing:.1px;margin-top:2px">IBM <b style="font-weight:600">Payment Integrity</b></div><div style="color:#c1c7cd;font-size:11px">Detect · Investigate · Recover</div></div>' +
      '<div style="padding:20px">' +
      '<div style="font-size:12px;color:#4d5358;margin-bottom:10px">Sign in to continue</div>' +
      '<input id="lg-email" placeholder="Email" value="analyst@example.com" style="width:100%;padding:9px 11px;border:0.5px solid #c1c7cd;border-radius:8px;font-size:13px;margin-bottom:8px;font-family:inherit">' +
      '<input id="lg-pass" type="password" placeholder="Password" style="width:100%;padding:9px 11px;border:0.5px solid #c1c7cd;border-radius:8px;font-size:13px;font-family:inherit">' +
      '<div id="lg-err" style="color:#b91c1c;font-size:11.5px;min-height:16px;margin:6px 0"></div>' +
      '<button id="lg-go" style="width:100%;background:#0f62fe;color:#fff;border:none;border-radius:8px;padding:10px;font-size:13px;font-weight:500;cursor:pointer;font-family:inherit">Sign in</button>' +
      '<div style="display:flex;gap:8px;margin-top:12px"><button class="lg-quick" data-e="analyst@example.com" style="flex:1;background:#f2f4f8;border:0.5px solid #dde1e6;border-radius:8px;padding:8px;font-size:11.5px;cursor:pointer;font-family:inherit">Use Analyst email</button><button class="lg-quick" data-e="supervisor@example.com" style="flex:1;background:#f2f4f8;border:0.5px solid #dde1e6;border-radius:8px;padding:8px;font-size:11.5px;cursor:pointer;font-family:inherit">Use Supervisor email</button></div>' +
      '<div style="font-size:10px;color:#878d96;text-align:center;margin-top:12px"><i class="ti ti-shield-lock"></i> Synthetic data · demonstration only</div>' +
      '</div></div>';
    document.body.appendChild(o);
    function go() {
      var email = document.getElementById("lg-email").value.trim(), pass = document.getElementById("lg-pass").value;
      document.getElementById("lg-err").textContent = "Signing in…";
      client.auth.signInWithPassword({ email: email, password: pass }).then(function (r) {
        if (r.error) { document.getElementById("lg-err").textContent = r.error.message; return; }
        afterLogin(email);
      });
    }
    o.querySelector("#lg-go").addEventListener("click", go);
    o.querySelector("#lg-pass").addEventListener("keydown", function (e) { if (e.key === "Enter") go(); });
    o.querySelectorAll(".lg-quick").forEach(function (b) { b.addEventListener("click", function () { document.getElementById("lg-email").value = b.getAttribute("data-e"); document.getElementById("lg-pass").focus(); }); });
  }

  function start() {
    if (!enabled) { window.APP.boot(); return; } // local fallback
    wrap();
    client.auth.getSession().then(function (s) {
      if (s.data.session) afterLogin(s.data.session.user.email);
      else showLogin();
    });
  }

  function boot() { if (!window.APP || !window.DP) return setTimeout(boot, 60); start(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
