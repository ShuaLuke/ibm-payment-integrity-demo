/* Provider portal — the simulated provider-facing screen a records request hands
   off to. It is deliberately a context switch: the analyst "becomes" the provider,
   uploads the requested records, and the upload flows back into the lead's evidence
   with the request marked Received. Reached only via APP.openPortal(leadId). */
(function () {
  window.Views = window.Views || {};

  function fileRow(f, i) {
    return '<div class="pt-file" data-i="' + i + '" style="display:flex;align-items:center;gap:9px;padding:8px 10px;border:0.5px solid var(--border);border-radius:7px;margin-top:6px;background:#fff">' +
      '<i class="ti ti-file-description" style="color:#0043ce;font-size:18px"></i>' +
      '<div style="flex:1;min-width:0"><div style="font-size:12.5px;font-weight:500">' + window.APP.esc(f.name) + '</div>' +
      '<div class="muted" style="font-size:10.5px">' + (f.size ? Math.max(1, Math.round(f.size / 1024)) + " KB" : "") + ' · ready to submit</div></div>' +
      '<span class="pt-rm" data-i="' + i + '" style="color:var(--text3);cursor:pointer;font-size:14px" title="Remove"><i class="ti ti-x"></i></span></div>';
  }

  window.Views.portal = {
    render: function (mount, params) {
      var id = params.id || window.APP.state.portalLeadId;
      var r = window.APP.recordsRequestFor(id);
      var a = window.DP.getAllegation(id) || {};
      var p = a.provider || {};
      // opening the portal means the provider is now engaged — advance the clock state
      if (r && r.status === "sent") window.APP.markRecordsAwaiting(id);
      r = window.APP.recordsRequestFor(id);

      if (!r) { mount.innerHTML = '<div class="page"><p>No active records request.</p></div>'; return; }

      var received = r.status === "received";
      var daysLeft = window.APP.recordsDaysLeft(r);
      var overdue = daysLeft != null && daysLeft < 0;
      // staged (not-yet-submitted) uploads live only for this screen session
      var staged = window.APP.state._portalStaged || (window.APP.state._portalStaged = []);

      mount.innerHTML =
        '<div style="min-height:calc(100vh - 120px);background:linear-gradient(180deg,#0d1f33 0 150px,var(--surface) 150px)">' +
        '<div style="max-width:820px;margin:0 auto;padding:20px 24px 40px">' +

        // provider-portal banner (distinct chrome — you are the provider now)
        '<div style="display:flex;align-items:center;gap:12px;color:#fff;padding:6px 0 20px">' +
        '<div style="width:38px;height:38px;border-radius:9px;background:rgba(255,255,255,0.12);display:flex;align-items:center;justify-content:center"><i class="ti ti-building-hospital" style="font-size:20px;color:#7fd7cc"></i></div>' +
        '<div><div style="font-weight:600;font-size:15px;letter-spacing:-0.01em">Provider Portal</div>' +
        '<div style="font-size:11.5px;color:#c6c6c6">Records request response · secure document submission</div></div>' +
        '<span style="flex:1"></span>' +
        '<span class="pill" style="background:rgba(255,255,255,0.14);color:#e0e0e0"><i class="ti ti-flask"></i> Simulated portal</span></div>' +

        // who's logged in (the provider)
        '<div class="card" style="display:flex;align-items:center;gap:12px;margin-bottom:12px">' +
        '<div class="avatar" style="width:34px;height:34px;flex:none;background:#0043ce">' + (String(p.name || "P").split(" ").map(function (w) { return w[0]; }).join("").slice(0, 2).toUpperCase()) + '</div>' +
        '<div style="flex:1;min-width:0"><div style="font-weight:600;font-size:13.5px">' + window.APP.esc(p.name || "Provider") + '</div>' +
        '<div class="mono" style="font-size:11px;color:var(--text2)">NPI ' + (p.npi || "—") + ' · ' + window.APP.esc(p.city || "") + (p.state ? ", " + p.state : "") + '</div></div>' +
        '<span class="btn" id="pt-exit" style="font-size:11.5px"><i class="ti ti-arrow-left"></i> Return to Payment Integrity</span></div>' +

        // the request the provider is responding to
        '<div class="card" style="margin-bottom:12px">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:9px">' +
        '<div style="font-weight:600;font-size:13.5px"><i class="ti ti-file-text" style="color:var(--accent-d)"></i> Records request from Payment Integrity</div>' +
        '<span class="tag" style="background:' + (received ? "var(--low-bg)" : "var(--med-bg)") + ';color:' + (received ? "var(--low-tx)" : "var(--med-tx)") + '">' + (received ? "Received" : overdue ? "Overdue" : "Response requested") + '</span></div>' +
        '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;font-size:11.5px">' +
        kv("Request ID", r.confirmation) + kv("Received via", window.APP.recordsChannel(r.channel).l) +
        kv("Sent", window.APP.fmtDate(r.sentAt)) + kv("Response due", window.APP.fmtDate(r.dueAt) + (received ? "" : (overdue ? " · " + Math.abs(daysLeft) + "d overdue" : " · " + daysLeft + "d remaining"))) + '</div>' +
        '<div style="margin-top:9px;padding:9px 11px;background:var(--surface);border:0.5px solid var(--border);border-radius:7px;font-size:12px;color:var(--text)">' +
        '<div style="font-size:10px;color:var(--text2);text-transform:uppercase;letter-spacing:.04em;margin-bottom:3px">Documentation requested</div>' + window.APP.esc(r.items || "Supporting medical records for the services billed.") + '</div></div>' +

        // submission area (or the received receipt)
        (received ? receivedCard(r)
          : '<div class="card">' +
          '<div style="font-weight:600;font-size:13.5px;margin-bottom:3px">Upload records</div>' +
          '<div class="muted" style="font-size:11.5px;margin-bottom:10px">Attach the requested documentation. Files are transmitted securely to the requesting analyst.</div>' +
          '<div id="pt-drop" style="border:1.5px dashed var(--border);border-radius:9px;padding:22px;text-align:center;cursor:pointer;background:#fff">' +
          '<i class="ti ti-cloud-upload" style="font-size:26px;color:var(--accent-d)"></i>' +
          '<div style="font-size:12.5px;font-weight:500;margin-top:6px">Drop files here or click to browse</div>' +
          '<div class="muted" style="font-size:10.5px;margin-top:2px">PDF, TIFF or image · up to 25 MB each</div>' +
          '<input type="file" id="pt-input" multiple style="display:none"></div>' +
          '<div id="pt-list">' + staged.map(fileRow).join("") + '</div>' +
          '<div style="display:flex;gap:8px;margin-top:12px">' +
          '<button class="btn" id="pt-demo" style="font-size:11.5px"><i class="ti ti-file-plus"></i> Add a sample record</button>' +
          '<span style="flex:1"></span>' +
          '<button class="btn primary" id="pt-submit" style="font-size:12px"' + (staged.length ? "" : " disabled") + '><i class="ti ti-send"></i> Submit ' + (staged.length || "") + ' record' + (staged.length === 1 ? "" : "s") + '</button></div></div>') +

        '</div></div>';

      // ---- wiring ----
      document.getElementById("pt-exit").addEventListener("click", function () { exit(id); });

      if (!received) {
        var input = document.getElementById("pt-input"), drop = document.getElementById("pt-drop");
        drop.addEventListener("click", function () { input.click(); });
        drop.addEventListener("dragover", function (e) { e.preventDefault(); drop.style.borderColor = "var(--accent)"; });
        drop.addEventListener("dragleave", function () { drop.style.borderColor = "var(--border)"; });
        drop.addEventListener("drop", function (e) {
          e.preventDefault(); drop.style.borderColor = "var(--border)";
          addFiles(e.dataTransfer.files); rerender(id);
        });
        input.addEventListener("change", function () { addFiles(input.files); rerender(id); });
        document.getElementById("pt-demo").addEventListener("click", function () {
          staged.push({ name: sampleName(a), size: 240000 + staged.length * 60000 }); rerender(id);
        });
        mount.querySelectorAll(".pt-rm").forEach(function (el) {
          el.addEventListener("click", function () { staged.splice(+el.getAttribute("data-i"), 1); rerender(id); });
        });
        var submit = document.getElementById("pt-submit");
        if (submit) submit.addEventListener("click", function () {
          if (!staged.length) return;
          // first file becomes the primary received record; extras are filed too
          staged.forEach(function (f, i) {
            if (i === 0) window.APP.receiveRecords(id, { name: f.name, size: f.size, via: "portal" });
            else window.APP.addUpload(id, f.name, f.size);
          });
          window.APP.state._portalStaged = [];
          rerender(id);
        });
      }
    }
  };

  function addFiles(list) {
    var staged = window.APP.state._portalStaged || (window.APP.state._portalStaged = []);
    [].slice.call(list || []).forEach(function (f) { staged.push({ name: f.name, size: f.size }); });
  }
  function sampleName(a) {
    var m = {
      "Upcoding": "progress-notes_E-M-documentation.pdf",
      "Unbundling": "operative-report.pdf",
      "Residential length-of-stay abuse": "admission-discharge-records.pdf",
      "Phantom billing": "attendance-logs.pdf"
    };
    return m[a.fwaType] || "medical-records.pdf";
  }
  function receivedCard(r) {
    return '<div class="card" style="border-color:#a7f0ba">' +
      '<div style="display:flex;align-items:center;gap:10px"><i class="ti ti-circle-check" style="color:var(--low);font-size:26px"></i>' +
      '<div><div style="font-weight:600;font-size:13.5px">Records submitted</div>' +
      '<div style="font-size:11.5px;color:var(--text2)">“' + window.APP.esc(r.receivedFile.name) + '” was transmitted to the requesting analyst on ' + window.APP.fmtDate(r.receivedAt) + '. No further action is required.</div></div></div></div>';
  }
  function kv(l, v) { return '<div><div style="font-size:10px;color:var(--text2);text-transform:uppercase;letter-spacing:.04em">' + l + '</div><div class="mono" style="font-size:11.5px;margin-top:1px">' + window.APP.esc(v) + '</div></div>'; }

  function rerender(id) { window.Views.portal.render(document.getElementById("view"), { id: id }); }
  // Leave the portal and return to the analyst's view of the lead.
  function exit(id) {
    window.APP.state._portalStaged = [];
    window.APP.openAllegation(id);
  }
})();
