/* Copilot — floating slide-over assistant, available on every screen.
   Scopes to the current claim when you're viewing one, else a default hero case. */
(function () {
  var SUGGEST = ["Summarize this case for adjudication", "How does it compare to peers?", "What's the recommended action?", "Draft a rationale"];
  var open = false;
  var mode = "chat";   // chat | agents | letters

  var ctxId = null; // set by explain() — a claim in focus without opening its lead page
  function ctx() {
    var onClaim = window.APP.state.view === "claim" && window.APP.state.allegationId;
    var id = onClaim ? window.APP.state.allegationId : (ctxId || "20481");
    return window.DP.getAllegation(id);
  }
  function focused() { return (window.APP.state.view === "claim" && window.APP.state.allegationId) || ctxId; }

  function build() {
    var fab = document.createElement("button");
    fab.id = "cp-fab";
    fab.style.cssText = "position:fixed;bottom:18px;right:18px;z-index:210;background:#0043ce;color:#fff;border:none;border-radius:26px;padding:10px 16px;font-size:13px;font-weight:500;font-family:'IBM Plex Sans',sans-serif;cursor:pointer;display:flex;align-items:center;gap:8px;box-shadow:0 3px 14px rgba(0,0,0,0.22)";
    fab.innerHTML = '<i class="ti ti-sparkles"></i> Investigative Assistant';
    fab.onclick = toggle;
    document.body.appendChild(fab);

    var panel = document.createElement("div");
    panel.id = "cp-panel";
    panel.style.cssText = "position:fixed;top:var(--ribbon-h,0px);right:0;width:370px;max-width:92vw;height:calc(100vh - var(--ribbon-h,0px));z-index:220;background:var(--card);border-left:0.5px solid var(--border);box-shadow:-4px 0 24px rgba(0,0,0,0.12);transform:translateX(100%);transition:transform .22s ease;display:flex;flex-direction:column;font-family:'IBM Plex Sans',sans-serif";
    panel.innerHTML =
      '<div style="background:#001141;color:#fff;padding:12px 14px;display:flex;align-items:center;justify-content:space-between"><div style="display:flex;align-items:center;gap:8px"><i class="ti ti-sparkles" style="color:#78a9ff"></i><span style="font-weight:500">Investigative Assistant</span></div><button id="cp-x" style="background:none;border:none;color:#c1c7cd;cursor:pointer;font-size:16px"><i class="ti ti-x"></i></button></div>' +
      '<div id="cp-ctx" style="padding:7px 14px;font-size:11px;color:var(--text2);border-bottom:0.5px solid var(--border2);background:var(--surface)"></div>' +
      '<div id="cp-tabs" style="display:flex;gap:2px;padding:6px 10px 0;border-bottom:0.5px solid var(--border2);background:var(--surface)"></div>' +
      '<div id="cp-chat" class="chat" style="flex:1;overflow-y:auto;padding:12px 14px;min-height:0"></div>' +
      '<div id="cp-alt" style="flex:1;overflow-y:auto;padding:12px 14px;min-height:0;display:none"></div>' +
      '<div id="cp-foot" style="padding:10px 14px;border-top:0.5px solid var(--border2)"><div class="suggest" id="cp-suggest" style="margin-bottom:8px"></div>' +
      '<div style="display:flex;gap:8px"><input id="cp-input" class="input" placeholder="Ask the Investigative Assistant…"><button class="btn primary" id="cp-send"><i class="ti ti-send"></i></button></div>' +
      '<div style="font-size:10px;color:var(--text3);margin-top:6px"><i class="ti ti-sparkles"></i> Grounded in the case data.</div></div>';
    document.body.appendChild(panel);

    renderTabs();
    document.getElementById("cp-x").onclick = toggle;
    document.getElementById("cp-suggest").innerHTML = SUGGEST.map(function (s) { return '<button class="btn" style="font-size:11.5px">' + s + '</button>'; }).join("");
    document.getElementById("cp-suggest").querySelectorAll("button").forEach(function (b) { b.onclick = function () { ask(b.textContent); }; });
    document.getElementById("cp-send").onclick = function () { var i = document.getElementById("cp-input"); ask(i.value.trim()); i.value = ""; };
    document.getElementById("cp-input").addEventListener("keydown", function (e) { if (e.key === "Enter") { ask(this.value.trim()); this.value = ""; } });
  }

  function toggle() {
    open = !open;
    document.getElementById("cp-panel").style.transform = open ? "translateX(0)" : "translateX(100%)";
    document.getElementById("cp-fab").style.display = open ? "none" : "flex";
    if (open) { setCtxLine(); renderTabs(); setMode(mode, true); }
  }

  // ---- mode tabs: Assistant · Agents · Correspondence ----
  var TABS = [{ m: "chat", l: "Assistant", i: "message" }, { m: "agents", l: "Agents", i: "robot" }, { m: "letters", l: "Correspondence", i: "mail" }];
  function renderTabs() {
    var bar = document.getElementById("cp-tabs"); if (!bar) return;
    bar.innerHTML = TABS.map(function (t) {
      var on = t.m === mode;
      return '<button class="cp-tab" data-m="' + t.m + '" style="border:none;border-bottom:2px solid ' + (on ? "var(--accent)" : "transparent") + ';background:none;color:' + (on ? "var(--accent-d)" : "var(--text2)") + ';font-weight:' + (on ? "600" : "400") + ';font-size:11.5px;padding:7px 9px;cursor:pointer;font-family:inherit"><i class="ti ti-' + t.i + '"></i> ' + t.l + '</button>';
    }).join("");
    bar.querySelectorAll(".cp-tab").forEach(function (b) { b.onclick = function () { setMode(b.getAttribute("data-m")); }; });
  }
  function setMode(m, force) {
    if (m === mode && !force) return;
    mode = m; renderTabs();
    var chat = document.getElementById("cp-chat"), alt = document.getElementById("cp-alt"), foot = document.getElementById("cp-foot");
    if (m === "chat") { chat.style.display = "block"; alt.style.display = "none"; foot.style.display = "block"; if (!chat.childNodes.length) greet(); }
    else { chat.style.display = "none"; foot.style.display = "none"; alt.style.display = "block"; if (m === "agents") renderAgents(); else renderLetters(); }
  }
  function setCtxLine() {
    var a = ctx();
    document.getElementById("cp-ctx").innerHTML = focused()
      ? '<i class="ti ti-focus-2" style="color:var(--accent-d)"></i> Focused on #' + a.id + ' — ' + window.APP.esc(a.provider.name) + ' · ' + a.fwaType
      : '<i class="ti ti-info-circle"></i> General assistant — open a case for its full context';
  }
  function greet() {
    setCtxLine();
    var chat = document.getElementById("cp-chat"); chat.innerHTML = "";
    var a = ctx();
    addAI(focused()
      ? "I'm focused on lead #" + a.id + " — " + a.fwaType.toLowerCase() + " at " + a.provider.name + ". Ask me to summarize the risk, compare to peers, recommend an action, or draft a rationale."
      : "Ask me about any lead. Open a lead and I'll ground my answers in its evidence, rules and network context.", false);
  }
  function addUser(t) { var d = el("msg user", t); chat().appendChild(d); scroll(); }
  function addAI(t, stream) { var d = el("msg ai", ""); chat().appendChild(d); if (stream) window.AI.stream(d, t, scroll); else d.textContent = t; scroll(); }
  function ask(qy) {
    if (!qy) return;
    if (!open) toggle();
    if (mode !== "chat") setMode("chat");
    setCtxLine();
    addUser(qy);
    var a = ctx();
    window.APP.auditLog("COPILOT_QUERY", "#" + a.id + " · " + qy);
    if (isAdjIntent(qy)) { thinkThen(function () { addBrief(a); window.APP.auditLog("AI_CASE_SUMMARY", "Lead #" + a.id); }); return; }
    setTimeout(function () { addAI(window.AI.copilot(a, qy), true); }, 200);
  }
  function isAdjIntent(q) { q = (q || "").toLowerCase(); return /summar/.test(q) && /(adjudicat|case|decision|brief)/.test(q); }
  function thinkThen(fn) {
    var d = el("msg ai", "Analyzing the case…"); chat().appendChild(d); scroll();
    setTimeout(function () { d.remove(); fn(); }, 420);
  }
  function chat() { return document.getElementById("cp-chat"); }
  function scroll() { var c = chat(); c.scrollTop = c.scrollHeight; }
  function el(cls, txt) { var d = document.createElement("div"); d.className = cls; if (txt) d.textContent = txt; return d; }

  // ---- structured adjudication brief ----
  function addBrief(a) {
    var s = window.AI.adjudicationSummary(a);
    var wrap = document.createElement("div"); wrap.style.alignSelf = "stretch";
    wrap.innerHTML = briefHtml(s);
    chat().appendChild(wrap); scroll();
    var go = wrap.querySelector('[data-act="go"]'); if (go) go.onclick = function () { applyRec(s.recommendation.action, a); };
    return wrap;
  }
  var REC_STYLE = {
    "confirm": { bg: "var(--high-bg)", tx: "var(--high-tx)", icon: "check", cta: "Open decision · pre-fill Confirm" },
    "confirm-escalate": { bg: "var(--high-bg)", tx: "var(--high-tx)", icon: "check", cta: "Open decision · pre-fill Confirm" },
    "escalate": { bg: "var(--med-bg)", tx: "var(--med-tx)", icon: "arrow-up-right", cta: "Open decision · pre-fill Escalate" },
    "dismiss": { bg: "var(--low-bg)", tx: "var(--low-tx)", icon: "x", cta: "Open decision · pre-fill Dismiss" },
    "request-records": { bg: "var(--accent-l)", tx: "var(--accent-d)", icon: "file-text", cta: "Request additional records" },
    "pay": { bg: "var(--low-bg)", tx: "var(--low-tx)", icon: "check", cta: "Open decision · pre-fill Pay" },
    "hold": { bg: "var(--med-bg)", tx: "var(--med-tx)", icon: "clock-hour-4", cta: "Open decision · pre-fill Hold" },
    "deny": { bg: "var(--high-bg)", tx: "var(--high-tx)", icon: "ban", cta: "Open decision · pre-fill Deny" }
  };
  function sect(title, body) { return '<div><div style="font-weight:600;font-size:10px;letter-spacing:.04em;text-transform:uppercase;color:var(--text3);margin-bottom:3px">' + title + '</div><div style="line-height:1.5;color:var(--text);font-size:12px">' + body + '</div></div>'; }
  function briefHtml(s) {
    var rec = s.recommendation, st = REC_STYLE[rec.action] || REC_STYLE.confirm;
    var ev = '<ul style="margin:0;padding-left:15px;line-height:1.55">' + s.evidence.map(function (e) {
      return '<li style="margin-bottom:1px"><span style="color:var(--text2)">' + window.APP.esc(e.label) + ':</span> <span' + (e.outlier ? ' style="color:var(--high-tx);font-weight:500"' : '') + '>' + window.APP.esc(e.detail) + '</span></li>';
    }).join("") + '</ul>';
    var precChips = (s.precedents.cases || []).map(function (c) {
      var conf = c.outcome === "Confirmed";
      return '<span class="pill ' + (conf ? "p-conf" : "p-dis") + '" style="font-size:10px">#' + c.id + ' · ' + c.outcome + '</span>';
    }).join(" ");
    return '<div style="background:var(--card);border:0.5px solid var(--border);border-radius:12px;overflow:hidden">' +
      '<div style="background:#001141;color:#fff;padding:8px 11px;font-size:11.5px;display:flex;align-items:center;gap:6px"><i class="ti ti-file-analytics" style="color:#78a9ff"></i> Adjudication brief · #' + s.headline.split("#")[1] + '</div>' +
      '<div style="padding:11px;display:flex;flex-direction:column;gap:10px">' +
      '<div style="display:flex;align-items:center;gap:9px;background:' + st.bg + ';border-radius:8px;padding:8px 10px"><i class="ti ti-' + st.icon + '" style="color:' + st.tx + ';font-size:18px"></i><div style="font-weight:600;color:' + st.tx + ';font-size:12.5px">Recommended: ' + window.APP.esc(rec.label) + '</div></div>' +
      sect("The anomaly", window.APP.esc(s.anomaly)) +
      sect("Evidence", ev) +
      sect(s.isRing ? "Network signal — coordinated" : "Network signal", '<span' + (s.isRing ? ' style="color:var(--high-tx)"' : '') + '><i class="ti ti-affiliate"></i> ' + window.APP.esc(s.network) + '</span>') +
      sect("Precedent", window.APP.esc(s.precedents.text) + (precChips ? '<div style="margin-top:5px;display:flex;gap:5px;flex-wrap:wrap">' + precChips + '</div>' : "")) +
      sect("Why this recommendation", window.APP.esc(rec.rationale)) +
      '<button class="btn primary" data-act="go" style="width:100%;justify-content:center;font-size:12px"><i class="ti ti-arrow-right"></i> ' + st.cta + '</button>' +
      '<div style="font-size:10px;color:var(--text3);text-align:center"><i class="ti ti-sparkles"></i> Grounded in this case\'s evidence &amp; precedent</div>' +
      '</div></div>';
  }
  // Take the analyst to the decision control, pre-selecting the recommended action.
  // The claim view (tabbed) handles switching to the Decision tab + selecting the seg.
  function applyRec(action, a) {
    if (open) toggle();
    // from the prepay queue: record the Pay / Hold / Deny decision in place
    if (a && a.mode === "prepay" && window.APP.state.view !== "claim" && /^(pay|hold|deny)$/.test(action)) {
      window.APP.prepayDecide(a.id, action); window.APP.nav("queue"); return;
    }
    if (window.Views && window.Views.claim && window.Views.claim.gotoDecision) { window.Views.claim.gotoDecision(action); return; }
    if (action === "request-records") { var rq = document.getElementById("c-req"); if (rq) { rq.scrollIntoView({ behavior: "smooth", block: "center" }); setTimeout(function () { rq.click(); }, 300); } return; }
    var seg = { "confirm": "c", "confirm-escalate": "c", "dismiss": "d", "escalate": "e" }[action];
    setTimeout(function () { var el = document.querySelector('.seg[data-d="' + seg + '"]'); if (el) el.click(); }, 360);
  }

  // ---- Agents mode: three role-specialized agents on the current lead ----
  var SEV = { high: ["var(--high-bg)", "var(--high-tx)"], medium: ["var(--med-bg)", "var(--med-tx)"], low: ["var(--low-bg)", "var(--low-tx)"] };
  function renderAgents() {
    var alt = document.getElementById("cp-alt"); var a = ctx();
    window.APP.auditLog("AI_AGENTS_RUN", "Lead #" + a.id + " · investigative / claims / policy agents");
    var reports = window.AI.agentReports(a);
    var esc = window.APP.esc;
    var cards = reports.map(function (r) {
      var findings = r.findings.map(function (f) { var c = SEV[f.sev] || SEV.low; return '<div style="display:flex;gap:7px;padding:5px 0;border-top:0.5px solid var(--border2);font-size:11.5px"><span style="width:7px;height:7px;border-radius:50%;background:' + c[1] + ';flex:none;margin-top:5px"></span><span style="flex:1;line-height:1.5">' + esc(f.text) + '</span></div>'; }).join("");
      var src = r.sources.map(function (s) { return '<span class="tag" style="background:var(--surface);font-size:10px">' + esc(s) + '</span>'; }).join(" ");
      return '<div class="card" style="margin:0 0 9px"><div style="display:flex;align-items:center;gap:7px;margin-bottom:2px"><i class="ti ti-' + r.icon + '" style="color:var(--accent-d)"></i><span style="font-weight:600;font-size:12.5px">' + esc(r.role) + ' agent</span><span class="muted" style="font-size:10.5px">· ' + esc(r.focus) + '</span></div>' +
        findings + '<div style="margin-top:7px;display:flex;gap:5px;flex-wrap:wrap;align-items:center"><span style="font-size:10px;color:var(--text3)">read:</span> ' + src + '</div></div>';
    }).join("");
    alt.innerHTML = '<div style="font-size:11.5px;color:var(--text2);margin-bottom:10px"><i class="ti ti-robot" style="color:var(--accent-d)"></i> Three agents examined lead #' + a.id + ' — each grounded in the case data it reads. Findings feed the adjudication brief and any correspondence.</div>' +
      cards +
      '<div style="font-size:10px;color:var(--text3);margin-top:2px"><i class="ti ti-sparkles"></i> Grounded in this case\'s rules, model, network, coding &amp; pricing.</div>';
  }

  // ---- Correspondence mode: generate → review → attach / export ----
  var draftLetter = null;
  function renderLetters() {
    var alt = document.getElementById("cp-alt"); var a = ctx(), esc = window.APP.esc;
    if (draftLetter && draftLetter.leadId === a.id) return renderLetterViewer(a);
    var types = window.AI.CORRESPONDENCE_TYPES.map(function (t) {
      return '<button class="cp-letter" data-t="' + t.id + '" style="width:100%;text-align:left;border:0.5px solid var(--border);background:#fff;border-radius:9px;padding:10px 12px;cursor:pointer;margin-bottom:8px;font-family:inherit">' +
        '<div style="display:flex;align-items:center;gap:8px"><i class="ti ti-' + t.icon + '" style="color:var(--accent-d);font-size:16px"></i><span style="font-weight:600;font-size:12.5px">' + esc(t.label) + '</span></div>' +
        '<div style="font-size:11px;color:var(--text2);margin-top:3px">' + esc(t.blurb) + '</div></button>';
    }).join("");
    var kb = window.AI.knowledgeBase().map(function (k) { return '<div style="display:flex;gap:7px;padding:5px 0;border-top:0.5px solid var(--border2);font-size:11px"><i class="ti ti-book" style="color:var(--accent-d);margin-top:1px"></i><div><b>' + esc(k.title) + '</b> <span class="muted">· ' + esc(k.cite) + '</span><div style="color:var(--text2)">' + esc(k.summary) + '</div></div></div>'; }).join("");
    alt.innerHTML = '<div style="font-size:11.5px;color:var(--text2);margin-bottom:10px"><i class="ti ti-mail" style="color:var(--accent-d)"></i> Generate a notice for lead #' + a.id + ' — ' + esc((a.provider || {}).name || "") + '. Populated with the case specifics; review before attaching or exporting.</div>' +
      types +
      '<div class="card" style="margin:6px 0 0;background:var(--surface)"><div style="font-weight:600;font-size:11.5px;margin-bottom:2px"><i class="ti ti-books" style="color:var(--accent-d)"></i> Knowledge base <span class="muted" style="font-weight:400;font-size:10px">· policies the assist grounds against</span></div>' + kb + '</div>';
    alt.querySelectorAll(".cp-letter").forEach(function (b) { b.onclick = function () { draftLetter = window.AI.correspondence(a, b.getAttribute("data-t")); draftLetter.leadId = a.id; window.APP.auditLog("AI_LETTER_DRAFT", "Lead #" + a.id + " · " + draftLetter.label); renderLetterViewer(a); }; });
  }
  function renderLetterViewer(a) {
    var alt = document.getElementById("cp-alt"), esc = window.APP.esc, L = draftLetter;
    alt.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px"><span style="font-weight:600;font-size:12.5px"><i class="ti ti-mail" style="color:var(--accent-d)"></i> ' + esc(L.label) + '</span>' +
      '<button id="cp-let-back" class="btn" style="font-size:11px"><i class="ti ti-arrow-left"></i> Templates</button></div>' +
      '<pre class="mono" style="margin:0;padding:11px 12px;font-size:10.5px;line-height:1.55;white-space:pre-wrap;background:#fff;border:0.5px solid var(--border);border-radius:8px;max-height:calc(100vh - 280px);overflow:auto">' + esc(L.body) + '</pre>' +
      '<div style="display:flex;gap:8px;margin-top:10px"><button id="cp-let-attach" class="btn primary" style="flex:1;justify-content:center;font-size:12px"><i class="ti ti-paperclip"></i> Attach to case</button>' +
      '<button id="cp-let-export" class="btn" style="flex:1;justify-content:center;font-size:12px"><i class="ti ti-printer"></i> Export</button></div>' +
      '<div style="font-size:10px;color:var(--text3);margin-top:8px"><i class="ti ti-sparkles"></i> Drafted by the agentic assist · adopt after review. Attaching logs to the audit trail.</div>';
    alt.querySelector("#cp-let-back").onclick = function () { draftLetter = null; renderLetters(); };
    alt.querySelector("#cp-let-attach").onclick = function () {
      var name = L.label.replace(/[^a-z0-9]+/gi, "-") + "_Lead-" + a.id + ".txt";
      window.APP.addArtifact(a.id, { name: name, kind: "correspondence", body: L.body });
      window.EXPORT.toast("Attached “" + name + "” to the case");
    };
    alt.querySelector("#cp-let-export").onclick = function () {
      window.EXPORT.pdf(L.label + " — Lead #" + a.id, '<pre style="white-space:pre-wrap;font-family:inherit;font-size:12px;line-height:1.5">' + window.EXPORT.htmlEsc(L.body) + '</pre>');
    };
  }

  window.COPILOT = {
    open: function (m) {
      var was = open; ctxId = null;
      if (!was) toggle();
      if (m) setMode(m, was); else if (was) setMode(mode, true);
      setCtxLine();
    },
    close: function () { if (open) toggle(); ctxId = null; },
    // Explain a claim's model recommendation without leaving the current screen
    // (prepay queue): focuses the assistant on it and streams the full brief.
    explain: function (id) {
      ctxId = id;
      if (!open) toggle();
      setMode("chat", true);
      var a = window.DP.getAllegation(id);
      var label = { pay: "Pay", hold: "Hold", deny: "Deny" }[a.recommendedAction] || "this action";
      addUser("Why does the model recommend " + label + " on claim #" + a.id + "?");
      thinkThen(function () {
        var wrap = addBrief(a);
        // from the queue the action applies in place — say so, and start the reader at the question
        var go = wrap.querySelector('[data-act="go"]');
        if (go && a.mode === "prepay" && window.APP.state.view !== "claim") go.innerHTML = '<i class="ti ti-' + ({ pay: "check", hold: "clock-hour-4", deny: "ban" }[a.recommendedAction] || "check") + '"></i> ' + label + ' this claim';
        var c = chat(), q = wrap.previousElementSibling; c.scrollTop += (q || wrap).getBoundingClientRect().top - c.getBoundingClientRect().top - 8;
        window.APP.auditLog("AI_RECOMMENDATION_EXPLAINED", "Prepay claim #" + a.id + " · " + label);
      });
    },
    isOpen: function () { return open; }, ask: ask,
    summarize: function (id) {
      if (!open) toggle();
      if (mode !== "chat") setMode("chat");
      setCtxLine();
      var a = id ? window.DP.getAllegation(id) : ctx();
      addUser("Summarize this case for adjudication");
      thinkThen(function () { addBrief(a); window.APP.auditLog("AI_CASE_SUMMARY", "Lead #" + a.id); });
    }
  };
  function boot() { if (!window.APP || !window.DP || !window.APP.ready) return setTimeout(boot, 100); build(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
