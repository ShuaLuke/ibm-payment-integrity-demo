/* Model registry — the AI/ML models behind the analytics (Element 3.1). A
   governed catalog: type, version, status, the healthcare task, how it was
   trained, its feature DRIVER TABLE (each input + calculation methodology), the
   data period, and performance. Read-only, deterministic (DP.getModelRegistry). */
(function () {
  window.Views = window.Views || {};
  var selectedId = null;
  var wiz = null;   // create-model wizard state, or null for the registry
  var feat = null;  // feature-creation panel state ("open" | "created" | null)
  var LIBRARY_COUNT = 54;
  var MODEL_TYPES = [
    { id: "predictive", name: "Predictive Analysis", sub: "Logistic Regression — supervised", icon: "trending-up", supervised: true },
    { id: "rf", name: "Random Forest", sub: "supervised ensemble", icon: "binary-tree", supervised: true },
    { id: "kmeans", name: "K-means clustering", sub: "unsupervised anomaly detection", icon: "affiliate", supervised: false },
    { id: "ai", name: "AI model", sub: "auto-featured", icon: "sparkles", ai: true }
  ];
  var DATASETS = [
    { id: "prof", name: "Professional claims 2024–2025", labeled: true },
    { id: "inst", name: "Institutional claims 2024–2025", labeled: true },
    { id: "pt", name: "Physical therapy claims 2024–2025", labeled: false },
    { id: "rx", name: "Pharmacy claims 2024–2025", labeled: true }
  ];
  var COLUMNS = ["CPT / HCPCS code", "Modifiers", "Diagnosis codes", "Units", "Billed amount", "Provider specialty", "Place of service", "Days supply"];

  var STAT = {
    production: ["var(--low-bg)", "var(--low-tx)", "player-play", "Production"],
    training: ["var(--med-bg)", "var(--med-tx)", "loader", "Training"],
    candidate: ["var(--accent-l)", "var(--accent-d)", "flask", "Candidate"]
  };
  var TYPE_ICON = {
    "Anomaly Detection": "chart-dots", "Predictive (supervised)": "trending-up",
    "Clustering (unsupervised)": "affiliate", "Natural Language Processing": "message-language", "Ensemble": "stack-2"
  };
  function statPill(s) { var c = STAT[s] || ["var(--surface)", "var(--text2)", "point", s]; return '<span class="tag" style="background:' + c[0] + ';color:' + c[1] + '"><i class="ti ti-' + c[2] + '"></i> ' + c[3] + '</span>'; }
  function block(icon, title, sub, inner) {
    return '<div class="card" style="margin:0 0 8px;background:var(--surface)"><div style="font-weight:600;font-size:12px;margin-bottom:6px"><i class="ti ti-' + icon + '" style="color:var(--accent-d)"></i> ' + title + (sub ? ' <span class="muted" style="font-weight:400;font-size:10.5px">· ' + sub + '</span>' : '') + '</div>' + inner + '</div>';
  }

  window.Views.models = {
    render: function (mount) {
      if (wiz) { mount.innerHTML = wizardHtml(); wireWizard(mount); return; }
      if (feat) { mount.innerHTML = featureHtml(); wireFeature(mount); return; }
      var models = window.DP.getModelRegistry();
      var order = window.DP.MODEL_TYPE_ORDER;
      if (!selectedId || !models.some(function (m) { return m.id === selectedId; })) selectedId = models[0].id;
      var sel = models.filter(function (m) { return m.id === selectedId; })[0];

      var byStatus = { production: 0, training: 0, candidate: 0 };
      models.forEach(function (m) { byStatus[m.status] = (byStatus[m.status] || 0) + 1; });
      var chips = [
        chip("robot", models.length + " models"),
        chip("player-play", byStatus.production + " in production"),
        chip("loader", byStatus.training + " training"),
        chip("flask", byStatus.candidate + " candidate")
      ].join("");

      // ---- left: models grouped by type ----
      var groups = order.filter(function (t) { return models.some(function (m) { return m.type === t; }); });
      var listHtml = groups.map(function (t) {
        var rows = models.filter(function (m) { return m.type === t; }).map(function (m) {
          var on = m.id === selectedId;
          return '<button class="mdl-row" data-id="' + m.id + '" style="width:100%;text-align:left;border:none;border-left:3px solid ' + (on ? "var(--accent)" : "transparent") + ';background:' + (on ? "var(--accent-l)" : "transparent") + ';padding:9px 12px;cursor:pointer;border-bottom:0.5px solid var(--border2)">' +
            '<div style="font-weight:' + (on ? "600" : "500") + ';font-size:12px">' + window.APP.esc(m.name) + '</div>' +
            '<div style="display:flex;gap:5px;align-items:center;margin-top:4px;flex-wrap:wrap">' + statPill(m.status) + '<span class="mono" style="font-size:10px;color:var(--text3)">' + window.APP.esc(m.version) + '</span>' + (m.prepayEnabled ? '<span class="tag" style="background:var(--surface);font-size:10px"><i class="ti ti-bolt"></i> prepay</span>' : '') + '</div>' +
            '</button>';
        }).join("");
        return '<div style="padding:8px 12px 4px;font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.04em;background:var(--surface);border-bottom:0.5px solid var(--border2)"><i class="ti ti-' + (TYPE_ICON[t] || "point") + '"></i> ' + window.APP.esc(t) + '</div>' + rows;
      }).join("");

      mount.innerHTML =
        '<div style="display:flex;flex-direction:column;gap:10px">' +
        '<div class="card"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px"><div style="font-weight:600;font-size:14px"><i class="ti ti-robot" style="color:var(--accent-d)"></i> Model registry <span class="muted" style="font-weight:400;font-size:11.5px">· the AI / ML models behind the analytics</span></div>' +
        '<div style="display:flex;gap:8px;align-items:center"><span class="tag" style="background:var(--surface)"><i class="ti ti-shield-check"></i> Governed &amp; versioned</span><button id="mdl-feat" class="btn" style="font-size:12px"><i class="ti ti-adjustments-plus"></i> New feature</button><button id="mdl-new" class="btn primary" style="font-size:12px"><i class="ti ti-plus"></i> New model</button></div></div>' +
        '<div style="font-size:11.5px;color:var(--text2);margin-top:6px">The library is pre-populated with <b>' + LIBRARY_COUNT + ' ML models</b> ready to be retrained on your data, organized by model or service type (' + models.length + ' shown here in detail). Every model is catalogued with its type, version, status, healthcare task, training method, feature driver table, data period and measured performance — explainable and auditable.</div>' +
        '<div style="margin-top:9px;display:flex;gap:8px;flex-wrap:wrap">' + chip("robot", LIBRARY_COUNT + " in the library") + chips + '</div></div>' +
        '<div style="display:grid;grid-template-columns:300px 1fr;gap:10px;align-items:start">' +
        '<div class="card" style="padding:0;overflow:hidden">' + listHtml + '</div>' +
        '<div id="mdl-detail">' + detailHtml(sel) + '</div>' +
        '</div></div>';

      mount.querySelectorAll(".mdl-row").forEach(function (b) {
        b.addEventListener("click", function () { selectedId = b.getAttribute("data-id"); window.Views.models.render(mount); });
      });
      var nb = mount.querySelector("#mdl-new"); if (nb) nb.onclick = function () { wiz = { step: 0, type: null, dataset: null, columns: [], trained: false }; window.Views.models.render(mount); };
      var fb = mount.querySelector("#mdl-feat"); if (fb) fb.onclick = function () { feat = "open"; wiz = null; window.Views.models.render(mount); };
    },
    // reset any open wizard/feature panel and open the requested one (used by the guided demo)
    demoOpen: function (what) {
      if (what === "feature") { feat = "open"; wiz = null; }
      else if (what === "registry") { wiz = null; feat = null; }
      else { wiz = { step: 0, type: null, dataset: null, columns: [], trained: false }; feat = null; }
      window.APP.nav("models");
    }
  };

  // ---- feature discovery / creation (dual-classification example) ----
  function featureHtml() {
    var f = window.DP.getFeatureLibrary(), esc = window.APP.esc, ex = f.example;
    var codeChips = function (arr) { return arr.map(function (c) { return '<span class="mono" style="font-size:10.5px;padding:2px 6px;border-radius:4px;background:var(--surface);margin:2px 3px 0 0;display:inline-block">' + esc(c) + '</span>'; }).join(""); };
    var recs = f.recommended.map(function (r) {
      return '<div style="display:flex;gap:8px;padding:6px 0;border-top:0.5px solid var(--border2);font-size:11.5px"><i class="ti ti-' + (r.priorProcedure ? "history-toggle" : "point") + '" style="color:' + (r.priorProcedure ? "var(--accent-d)" : "var(--text3)") + ';margin-top:1px"></i><div style="flex:1"><b>' + esc(r.name) + '</b>' + (r.priorProcedure ? ' <span class="tag" style="background:var(--accent-l);color:var(--accent-d);font-size:9.5px">prior-procedure</span>' : '') + '<div style="font-size:10.5px;color:var(--text2)">' + esc(r.methodology) + '</div></div></div>';
    }).join("");
    var created = feat === "created";
    return '<div style="display:flex;flex-direction:column;gap:10px">' +
      '<div class="card"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px"><div style="font-weight:600;font-size:14px"><i class="ti ti-adjustments-plus" style="color:var(--accent-d)"></i> Create a feature</div><button id="feat-cancel" class="btn" style="font-size:12px"><i class="ti ti-x"></i> ' + (created ? "Done" : "Cancel") + '</button></div>' +
      '<div style="font-size:11.5px;color:var(--text2);margin-top:6px"><i class="ti ti-bulb" style="color:var(--accent-d)"></i> ' + esc(ex.trigger) + ' <b>' + esc(ex.policy) + '</b></div></div>' +
      (created ? '<div class="card" style="text-align:center;padding:16px"><i class="ti ti-circle-check" style="color:var(--low-tx);font-size:30px"></i><div style="font-weight:600;font-size:13px;margin-top:6px">Feature created &amp; attached to the model</div><div style="font-size:11.5px;color:var(--text2);margin-top:2px">The dual-classification feature now flags class-A orthotics with no prior class-B sleep study — closing the avenue for fraud.</div></div>' : "") +
      '<div class="card"><div style="font-weight:600;font-size:12.5px;margin-bottom:6px"><i class="ti ti-arrows-split-2" style="color:var(--accent-d)"></i> ' + esc(ex.type) + '</div>' +
      '<div style="display:grid;grid-template-columns:1fr auto 1fr;gap:10px;align-items:center">' +
      '<div style="border:1px solid var(--border);border-radius:8px;padding:9px 11px"><div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.04em">Class A</div><div style="font-weight:600;font-size:12px">' + esc(ex.classA.label) + '</div><div style="margin-top:3px">' + codeChips(ex.classA.codes) + '</div><div style="font-size:10px;color:var(--text3);margin-top:3px">' + esc(ex.classA.system) + '</div></div>' +
      '<div style="text-align:center;color:var(--accent-d)"><i class="ti ti-arrow-right"></i><div style="font-size:9.5px;color:var(--text3)">requires</div></div>' +
      '<div style="border:1px solid var(--border);border-radius:8px;padding:9px 11px"><div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.04em">Class B</div><div style="font-weight:600;font-size:12px">' + esc(ex.classB.label) + '</div><div style="margin-top:3px">' + codeChips(ex.classB.codes) + '</div><div style="font-size:10px;color:var(--text3);margin-top:3px">' + esc(ex.classB.system) + '</div></div>' +
      '</div>' +
      '<div style="background:var(--surface);border-radius:7px;padding:8px 10px;font-size:11.5px;margin-top:9px"><i class="ti ti-info-circle" style="color:var(--accent-d)"></i> ' + esc(ex.measure) + '</div>' +
      (created ? "" : '<div style="margin-top:10px;text-align:right"><button id="feat-create" class="btn primary" style="font-size:12px"><i class="ti ti-check"></i> Create feature</button></div>') + '</div>' +
      '<div class="card"><div style="font-weight:600;font-size:12.5px;margin-bottom:2px"><i class="ti ti-list-check" style="color:var(--accent-d)"></i> Recommended features <span class="muted" style="font-weight:400;font-size:11px">· ' + esc(f.note) + '</span></div>' + recs + '</div>' +
      '<div style="font-size:10.5px;color:var(--text3)"><i class="ti ti-sparkles"></i> Demonstration feature-creation flow — deterministic.</div></div>';
  }
  function wireFeature(mount) {
    var re = function () { window.Views.models.render(mount); };
    var c = mount.querySelector("#feat-cancel"); if (c) c.onclick = function () { feat = null; re(); };
    var cr = mount.querySelector("#feat-create"); if (cr) cr.onclick = function () { feat = "created"; window.APP.auditLog("FEATURE_CREATED", "Dual-classification feature: dental orthotics require a prior sleep study"); re(); };
  }

  // ---- create-model wizard (scripted, deterministic) ----
  function wizardHtml() {
    var esc = window.APP.esc;
    var head = '<div class="card"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px"><div style="font-weight:600;font-size:14px"><i class="ti ti-plus" style="color:var(--accent-d)"></i> Create a new model</div>' +
      '<button id="wiz-cancel" class="btn" style="font-size:12px"><i class="ti ti-x"></i> Cancel</button></div>' +
      '<div style="display:flex;gap:6px;margin-top:9px;flex-wrap:wrap">' + ["Model type", "Training data", "Train & deploy"].map(function (s, i) {
        var on = i === wiz.step, done = i < wiz.step;
        return '<span class="tag" style="background:' + (on ? "var(--accent)" : done ? "var(--low-bg)" : "var(--surface)") + ';color:' + (on ? "#fff" : done ? "var(--low-tx)" : "var(--text3)") + '">' + (done ? "✓ " : (i + 1) + ". ") + s + '</span>';
      }).join("") + '</div></div>';

    var body = "";
    if (wiz.step === 0) {
      body = '<div class="card"><div style="font-weight:600;font-size:12.5px;margin-bottom:8px">Choose a modeling approach</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' +
        MODEL_TYPES.map(function (t) {
          return '<button class="wiz-type" data-t="' + t.id + '" style="text-align:left;border:1px solid ' + (wiz.type === t.id ? "var(--accent)" : "var(--border)") + ';background:' + (wiz.type === t.id ? "var(--accent-l)" : "#fff") + ';border-radius:9px;padding:11px 12px;cursor:pointer;font-family:inherit">' +
            '<div style="display:flex;align-items:center;gap:8px"><i class="ti ti-' + t.icon + '" style="color:var(--accent-d);font-size:17px"></i><span style="font-weight:600;font-size:12.5px">' + esc(t.name) + '</span>' + (t.ai ? '<span class="tag" style="background:var(--accent-l);color:var(--accent-d);font-size:9.5px">AI</span>' : '') + '</div>' +
            '<div style="font-size:11px;color:var(--text2);margin-top:3px">' + esc(t.sub) + '</div></button>';
        }).join("") + '</div>' +
        '<div style="margin-top:10px;text-align:right"><button id="wiz-next" class="btn primary" style="font-size:12px"' + (wiz.type ? '' : ' disabled') + '>Next <i class="ti ti-chevron-right"></i></button></div></div>';
    } else if (wiz.step === 1) {
      var t = MODEL_TYPES.filter(function (x) { return x.id === wiz.type; })[0];
      var dsOpts = DATASETS.map(function (d) { return '<option value="' + d.id + '"' + (wiz.dataset === d.id ? " selected" : "") + '>' + esc(d.name) + (d.labeled ? " · fraud-labeled" : "") + '</option>'; }).join("");
      var ds = DATASETS.filter(function (d) { return d.id === wiz.dataset; })[0];
      var labeledWarn = (t.supervised && ds && !ds.labeled) ? '<div style="background:var(--med-bg);color:var(--med-tx);border-radius:7px;padding:8px 10px;font-size:11px;margin-top:7px"><i class="ti ti-alert-triangle"></i> Predictive/supervised models must train on a dataset where fraud has already been labeled — choose a fraud-labeled dataset.</div>' : "";
      var cols = t.ai ? "" : '<div style="margin-top:10px"><div style="font-size:11px;color:var(--text2);margin-bottom:5px">Select the data columns (features) to include:</div><div style="display:flex;flex-wrap:wrap;gap:6px">' +
        COLUMNS.map(function (c) { var on = wiz.columns.indexOf(c) >= 0; return '<button class="wiz-col" data-c="' + esc(c) + '" style="border:1px solid ' + (on ? "var(--accent)" : "var(--border)") + ';background:' + (on ? "var(--accent-l)" : "#fff") + ';color:' + (on ? "var(--accent-d)" : "var(--ink)") + ';border-radius:14px;padding:4px 10px;font-size:11px;cursor:pointer;font-family:inherit">' + (on ? "✓ " : "") + esc(c) + '</button>'; }).join("") + '</div></div>';
      // AI auto-recommend
      var aiRec = "";
      if (t.ai && ds) {
        var recs = ["Provider-behavior features", "Utilization features", "Prior-authorization signals", "Member-cost signals"];
        var surgical = ds.id === "pt";
        aiRec = '<div style="margin-top:10px;background:var(--accent-l);border-radius:8px;padding:10px 12px"><div style="font-weight:600;font-size:11.5px;color:var(--accent-d)"><i class="ti ti-sparkles"></i> The system recommended these features for your data</div>' +
          '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:7px">' + recs.map(function (r) { return '<span class="tag" style="background:#fff;border:0.5px solid var(--border)">' + esc(r) + '</span>'; }).join("") +
          (surgical ? '<span class="tag" style="background:var(--high-bg);color:var(--high-tx)"><i class="ti ti-alert-triangle"></i> Surgical-procedure features (auto-added)</span>' : '') + '</div>' +
          (surgical ? '<div style="font-size:11px;color:var(--text2);margin-top:6px">The model automatically added surgical features because it detected a physical-therapy provider billing for surgery in the selected data.</div>' : '') + '</div>';
      }
      body = '<div class="card"><div style="font-weight:600;font-size:12.5px;margin-bottom:8px">' + esc(t.name) + ' · select training data</div>' +
        '<div style="font-size:11px;color:var(--text2);margin-bottom:5px">Historical dataset to train on:</div>' +
        '<select id="wiz-ds" class="input" style="width:100%"><option value="">— choose a dataset —</option>' + dsOpts + '</select>' +
        labeledWarn + cols + aiRec +
        '<div style="margin-top:12px;display:flex;justify-content:space-between"><button id="wiz-back" class="btn" style="font-size:12px"><i class="ti ti-chevron-left"></i> Back</button>' +
        '<button id="wiz-train" class="btn primary" style="font-size:12px"' + (canTrain(t, ds) ? '' : ' disabled') + '><i class="ti ti-player-play"></i> Train model</button></div></div>';
    } else {
      var t2 = MODEL_TYPES.filter(function (x) { return x.id === wiz.type; })[0];
      var ds2 = DATASETS.filter(function (d) { return d.id === wiz.dataset; })[0];
      body = '<div class="card"><div style="text-align:center;padding:8px 0"><i class="ti ti-circle-check" style="color:var(--low-tx);font-size:34px"></i>' +
        '<div style="font-weight:600;font-size:14px;margin-top:6px">Model trained</div>' +
        '<div style="font-size:12px;color:var(--text2);margin-top:2px">' + esc(t2.name) + ' trained on ' + esc(ds2 ? ds2.name : "the selected data") + (t2.ai ? '' : ' · ' + wiz.columns.length + ' features') + '.</div></div>' +
        '<div style="background:var(--surface);border-radius:8px;padding:10px 12px;font-size:11.5px;margin-top:6px"><div style="display:flex;justify-content:space-between;padding:3px 0"><span style="color:var(--text2)">Validation AUC</span><b class="mono">0.92</b></div><div style="display:flex;justify-content:space-between;padding:3px 0;border-top:0.5px solid var(--border2)"><span style="color:var(--text2)">Precision / recall</span><b class="mono">0.86 / 0.81</b></div><div style="display:flex;justify-content:space-between;padding:3px 0;border-top:0.5px solid var(--border2)"><span style="color:var(--text2)">Status</span>' + (wiz.deployed ? '<span class="tag" style="background:var(--accent-l);color:var(--accent-d)"><i class="ti ti-bolt"></i> Deployed to prepay</span>' : '<span class="tag" style="background:var(--med-bg);color:var(--med-tx)">Trained — ready to deploy</span>') + '</div></div>' +
        '<div style="margin-top:12px;display:flex;justify-content:space-between">' + (wiz.deployed ? '<span></span><button id="wiz-done" class="btn primary" style="font-size:12px"><i class="ti ti-check"></i> Done</button>' : '<button id="wiz-back2" class="btn" style="font-size:12px"><i class="ti ti-chevron-left"></i> Back</button><button id="wiz-deploy" class="btn primary" style="font-size:12px"><i class="ti ti-bolt"></i> Deploy to prepay</button>') + '</div></div>';
    }
    return '<div style="display:flex;flex-direction:column;gap:10px">' + head + body +
      '<div style="font-size:10.5px;color:var(--text3)"><i class="ti ti-sparkles"></i> Demonstration model-creation flow — deterministic, no live training.</div></div>';
  }
  function canTrain(t, ds) { if (!ds) return false; if (t.supervised && !ds.labeled) return false; if (!t.ai && wiz.columns.length < 1) return false; return true; }
  function wireWizard(mount) {
    var re = function () { window.Views.models.render(mount); };
    var q = function (s) { return mount.querySelector(s); };
    if (q("#wiz-cancel")) q("#wiz-cancel").onclick = function () { wiz = null; re(); };
    mount.querySelectorAll(".wiz-type").forEach(function (b) { b.onclick = function () { wiz.type = b.getAttribute("data-t"); re(); }; });
    if (q("#wiz-next")) q("#wiz-next").onclick = function () { wiz.step = 1; re(); };
    if (q("#wiz-back")) q("#wiz-back").onclick = function () { wiz.step = 0; re(); };
    if (q("#wiz-back2")) q("#wiz-back2").onclick = function () { wiz.step = 1; re(); };
    if (q("#wiz-ds")) q("#wiz-ds").onchange = function () { wiz.dataset = this.value; re(); };
    mount.querySelectorAll(".wiz-col").forEach(function (b) { b.onclick = function () { var c = b.getAttribute("data-c"); var i = wiz.columns.indexOf(c); if (i >= 0) wiz.columns.splice(i, 1); else wiz.columns.push(c); re(); }; });
    if (q("#wiz-train")) q("#wiz-train").onclick = function () { wiz.trained = true; wiz.step = 2; window.APP.auditLog("MODEL_TRAINED", MODEL_TYPES.filter(function (x) { return x.id === wiz.type; })[0].name + " trained on " + wiz.dataset); re(); };
    if (q("#wiz-deploy")) q("#wiz-deploy").onclick = function () { wiz.deployed = true; window.APP.auditLog("MODEL_DEPLOYED", "New model deployed to prepay"); re(); };
    if (q("#wiz-done")) q("#wiz-done").onclick = function () { wiz = null; re(); };
  }

  function chip(icon, label) { return '<span class="tag" style="background:var(--surface)"><i class="ti ti-' + icon + '"></i> ' + window.APP.esc(label) + '</span>'; }

  function detailHtml(m) {
    if (!m) return '<div class="card muted" style="font-size:12px">Select a model.</div>';
    var esc = window.APP.esc;

    // ---- properties
    var kv = function (k, v) { return '<div style="display:flex;gap:8px;padding:4px 0;font-size:11.5px;border-top:0.5px solid var(--border2)"><span style="color:var(--text2);min-width:120px;flex:none">' + k + '</span><span style="flex:1">' + v + '</span></div>'; };
    var propsInner = kv("Type", esc(m.type)) +
      kv("Version", '<span class="mono">' + esc(m.version) + '</span>') +
      kv("Status", statPill(m.status)) +
      kv("Training method", esc(m.trainingMethod)) +
      kv("Prepay-enabled", m.prepayEnabled ? '<span style="color:var(--accent-d)"><i class="ti ti-bolt"></i> Yes — runs before payment</span>' : '<span style="color:var(--text3)">No — post-pay / advisory</span>') +
      kv("Training data period", esc(m.dataPeriod)) +
      kv("Last trained", '<span class="mono">' + esc(m.lastTrained) + '</span>');

    // ---- feature driver table
    var fRows = (m.features || []).map(function (x) {
      return '<tr><td style="font-weight:500;white-space:nowrap">' + esc(x.name) + '</td><td style="color:var(--text2)">' + esc(x.methodology) + '</td></tr>';
    }).join("");
    var featInner = '<div style="overflow-x:auto"><table style="width:100%"><thead><tr><th style="width:32%">Feature</th><th>Calculation methodology</th></tr></thead><tbody>' + fRows + '</tbody></table></div>';

    // ---- performance
    var perf = m.performance || {};
    var pLabel = { auc: "AUC", precision: "Precision", recall: "Recall", flagRate: "Flag rate", topOneAccuracy: "Top-1 accuracy", silhouette: "Silhouette", clusters: "Clusters", coverage: "Coverage", agreement: "Agreement", faithfulness: "Faithfulness", groundedness: "Groundedness", humanRating: "Human rating" };
    var perfCards = Object.keys(perf).map(function (k) {
      return '<div style="flex:1;min-width:96px;background:#fff;border:0.5px solid var(--border);border-radius:7px;padding:8px 10px"><div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.04em">' + esc(pLabel[k] || k) + '</div><div style="font-weight:600;font-size:15px">' + esc(perf[k]) + '</div></div>';
    }).join("");
    var perfInner = '<div style="display:flex;gap:8px;flex-wrap:wrap">' + perfCards + '</div>' +
      '<div style="font-size:10.5px;color:var(--text3);margin-top:8px"><i class="ti ti-info-circle"></i> Representative offline-evaluation metrics on held-out synthetic claims.</div>';

    // ---- versions
    var vRows = (m.versions || []).map(function (v) {
      return '<div style="display:flex;gap:8px;align-items:baseline;padding:5px 0;border-top:0.5px solid var(--border2)">' +
        '<span class="mono" style="font-size:10.5px;color:var(--text3);min-width:44px">' + esc(v.version) + '</span>' +
        '<span class="mono" style="font-size:10.5px;color:var(--text3);min-width:76px">' + esc(v.date) + '</span>' +
        '<span style="font-size:11px;flex:1;color:var(--text2)">' + esc(v.change) + '</span></div>';
    }).join("");
    var verInner = vRows || '<div style="font-size:11px;color:var(--text3)">No prior versions on file.</div>';

    return '<div style="display:flex;flex-direction:column">' +
      '<div class="card" style="margin:0 0 10px"><div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap">' +
      '<div style="flex:1;min-width:0"><div style="font-weight:600;font-size:14px;line-height:1.35"><i class="ti ti-' + (TYPE_ICON[m.type] || "point") + '" style="color:var(--accent-d)"></i> ' + esc(m.name) + '</div>' +
      '<div style="display:flex;gap:6px;align-items:center;margin-top:6px;flex-wrap:wrap">' + statPill(m.status) + '<span class="mono" style="font-size:11px;color:var(--text2)">' + esc(m.version) + '</span><span class="tag" style="background:var(--surface)">' + esc(m.type) + '</span></div></div>' +
      '</div>' +
      '<div style="font-size:11.5px;color:var(--text);line-height:1.6;margin-top:8px"><b>Healthcare task:</b> ' + esc(m.healthcareTask) + '</div></div>' +
      block("adjustments", "Model properties", "type · training · versioning", propsInner) +
      block("table", "Feature driver table", "each input and the calculation behind it", featInner) +
      block("gauge", "Performance", "offline evaluation", perfInner) +
      block("history", "Version history", null, verInner) +
      '</div>';
  }
})();
