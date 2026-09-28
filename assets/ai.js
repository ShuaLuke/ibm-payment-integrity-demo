/* Deterministic "Gen AI" — the AIProvider seam. Pre-scripted, streamed to feel live.
   Backlog: swap for a live Gemini call via a serverless proxy (no UI change).
   Attaches to window.AI. */
(function () {
  function draftRationale(a, outcome) {
    var p = a.provider || {}, exp = window.DP.usd(a.exposurePost || 0);
    var C = {
      confirm: "Confirmed " + a.fwaType.toLowerCase() + ". " + p.name + " (NPI " + (p.npi || "—") +
        ") shows the flagged pattern with supporting rule and peer evidence; documentation does not justify the billed services. " +
        "Recommend recovery of " + exp + " in improper post-payment amounts and update of the provider risk profile.",
      dismiss: "Reviewed and dismissed. On examination of the record, the flagged pattern is clinically and contractually supported; no improper payment is identified. " +
        "Logging as a false positive so the outcome feeds model retraining and reduces similar low-confidence flags.",
      escalate: "Escalating to a Case. The pattern combined with network signals (shared identifiers / referrals) suggests coordinated behavior warranting a provider-level case beyond single-claim recovery.",
      // pre-payment triage — the money has not left yet, so the wording is about
      // releasing, holding, or stopping payment rather than recovering it.
      pay: "Cleared for payment. Reviewed the flagged lines against the submitted documentation and " + p.name +
        "'s billing history; the coding and medical necessity are supported. Releasing " + window.DP.usd(a.exposurePre || 0) +
        " for payment. Logging the outcome as a false positive so the pre-pay model is retrained on this pattern.",
      hold: "Held pending records. The flagged " + a.fwaType.toLowerCase() + " pattern cannot be adjudicated on the face of the claim. " +
        "Requesting the supporting medical records from " + p.name + " before releasing " + window.DP.usd(a.exposurePre || 0) +
        ". Payment remains suspended until the documentation is reviewed.",
      deny: "Denied. " + p.name + " (NPI " + (p.npi || "—") + ") billed services that the submitted documentation does not support, " +
        "consistent with the flagged " + a.fwaType.toLowerCase() + " pattern. Denying the claim prevents " + window.DP.usd(a.exposurePre || 0) +
        " from being paid — no recovery action is required because the funds never leave. Provider may appeal with supporting records."
    };
    // scenario-specific overrides
    if (a.id === "20517") {
      C.confirm = "Confirmed unbundling. Rio Grande Surgical Partners (NPI 1487653920) billed 43235 with modifier 59 alongside 43239 on 28 of 31 paired claims, bypassing the NCCI PTP edit with no documentation of a distinct procedural service. Component 43235 ($410/claim) is not separately payable in the same session. Recommend recovery of $11,480.";
      C.escalate = "Escalating to a Case. The 90% modifier-59 override rate combined with a shared billing TIN (00-6820473) with Alamo Internal Medicine (PR001) suggests coordinated behavior warranting a provider-level case.";
    }
    if (a.id === "20463") {
      C.dismiss = "Reviewed and dismissed. The medical record confirms end-stage renal disease (N18.6) with a standing order for thrice-weekly in-center hemodialysis — 36 sessions/quarter is clinically appropriate. No improper payment. Logged as a false positive to condition-adjust the frequency model for ESRD.";
    }
    if (a.id === "20481") {
      C.confirm = "Confirmed upcoding. Alamo Internal Medicine bills 99215 on ~90% of established-patient visits vs a 14% specialty-peer median (5.8σ), with linked diagnoses showing low clinical complexity. Recommend recovery of the overpayment differential (~$22,815) and a targeted claim review.";
    }
    return C[outcome] || "";
  }

  // The case narrative: the story that spans a case's leads. A lead's justification
  // explains one claim; this explains why these leads are one case.
  function caseNarrative(c) {
    if (!c) return "";
    var leads = (c.caseLeads || []).concat(c.openLeads || []);
    var types = c.fwaTypes || [];
    var L = [];
    var who = c.multiProvider
      ? c.providerCount + " providers billing under a shared identifier (" + (c.provider && c.provider.tin ? "TIN " + c.provider.tin : "common registration") + "), led by " + c.name
      : c.name + " (NPI " + ((c.provider || {}).npi || "—") + ")";

    L.push("This case covers " + who + ". It consolidates " + c.leadCount + " confirmed lead" + (c.leadCount === 1 ? "" : "s") +
      (c.openCount ? " with a further " + c.openCount + " still under review" : "") +
      ", carrying " + window.DP.usd(c.exposure || 0) + " in confirmed exposure.");

    if (types.length === 1) {
      L.push("Every lead shows the same pattern — " + types[0].toLowerCase() + " — which is what binds them into a single case rather than isolated claim errors.");
    } else if (types.length > 1) {
      L.push("The leads span " + types.length + " distinct patterns (" + types.join(", ").toLowerCase() + "), indicating systemic billing behavior rather than a single coding error.");
    }

    if (c.multiProvider) {
      L.push("The providers are linked through a shared billing identifier and are treated as one case because the exposure and the conduct cross entity boundaries — recovering against one provider alone would leave the scheme intact.");
    }

    // the strongest lead anchors the narrative
    var top = leads.slice().sort(function (x, y) { return (y.riskScore || 0) - (x.riskScore || 0); })[0];
    if (top && top.xai && top.xai.summary) {
      L.push("The strongest evidence sits on lead #" + top.id + " (risk " + top.riskScore + "/100): " + top.xai.summary);
    }

    var refs = (window.APP.caseRelations ? window.APP.caseRelations(c.providerId) : []) || [];
    if (refs.length) {
      L.push("This case is linked to " + refs.length + " other case" + (refs.length === 1 ? "" : "s") + " (" +
        refs.map(function (r) { return window.APP.caseLinkLabel(r.type).toLowerCase() + " " + r.otherPid; }).join("; ") + ").");
    }

    L.push(c.escalated
      ? "The case is under investigation; recommend continued development before a recovery or referral decision."
      : "Recommend recovery of the confirmed exposure and a targeted review of this provider's remaining claims.");
    return L.join(" ");
  }

  // A formal, attachable justification memo for a decision. This is the artifact
  // that travels with the case — to a supervisor, a provider notice, or an appeal —
  // so it states the finding, the evidence behind it, and the basis for the call.
  function justificationMemo(a, o) {
    o = o || {};
    var p = a.provider || {}, cl = a.claim, prepay = a.mode === "prepay";
    var exp = window.DP.usd((prepay ? a.exposurePre : a.exposurePost) || 0);
    var L = [];
    var head = {
      confirm: "IMPROPER PAYMENT CONFIRMED", dismiss: "FLAG DISMISSED — NO IMPROPER PAYMENT",
      escalate: "ESCALATED FOR INVESTIGATION", pay: "CLEARED FOR PAYMENT",
      hold: "PAYMENT HELD PENDING RECORDS", deny: "PAYMENT DENIED"
    }[o.outcome] || "DECISION";

    L.push("JUSTIFICATION FOR DECISION — " + head);
    L.push("");
    L.push((prepay ? "Pending claim" : "Lead") + " #" + a.id + "   ·   " + a.fwaType);
    L.push("Provider:   " + (p.name || "—") + "  ·  NPI " + (p.npi || "—") + "  ·  TIN " + (p.tin || "—"));
    if (cl) L.push("Claim:      " + cl.claimNumber + "  ·  DOS " + cl.dateOfService + "  ·  " + cl.type);
    L.push("Exposure:   " + exp + "  (" + (prepay ? "pre-pay — not yet disbursed" : "post-pay — recoverable") + ")");
    if (o.reason) L.push("Reason:     " + o.reason + " · " + (o.reasonText || ""));
    L.push("");

    L.push("1. FINDING");
    L.push("   " + wrap((a.xai && a.xai.summary) || (p.name + " was flagged for " + a.fwaType.toLowerCase() + ".")));
    L.push("");

    L.push("2. EVIDENCE RELIED ON");
    var bullet = function (s) { L.push("   · " + wrap(s, 88).replace(/\n   /g, "\n     ")); };
    (a.rules || []).forEach(function (r) { bullet("Rule fired: " + r.name + " (" + r.code + ") — " + r.source); });
    if (a.model) bullet("ML/AI model: " + a.model.name + " (" + a.model.type + ")");
    (a.xai && a.xai.factors || []).forEach(function (f) {
      bullet(f.label + ": " + f.value + (f.benchmark ? " vs " + f.benchmark : ""));
    });
    // coding crosswalk — the code/modifier pairing detail
    if (cl && window.DP.getCptCrosswalk) {
      var x = window.DP.getCptCrosswalk(cl.id);
      if (x) (x.lines || []).forEach(function (l) {
        if (l.verdict === "pass") return;
        var tag = "Coding: " + l.cpt + (l.modifiers.length ? "-" + l.modifiers.join(",") : "") + " — ";
        if (l.ptp) bullet(tag + l.ptp.note);
        if (l.mue && l.mue.exceeded) bullet(tag + l.mue.note);
        (l.modChecks || []).forEach(function (c) { if (!c.valid) bullet(tag + c.note); });
      });
    }
    // pricing variance
    if (cl && window.DP.getCmsPricing) {
      var pr = window.DP.getCmsPricing(cl.id);
      if (pr && pr.totals.overpayment > 0) bullet("Pricing: " + window.DP.usd(pr.totals.overpayment) + " above the CMS-allowed amount (" + pr.source + ").");
    }
    if (!(a.rules || []).length && !a.model) bullet("Analyst-sourced lead — see attached records.");
    L.push("");

    // network
    var ring = window.Collusion && p.id ? window.Collusion.analyze(p.id) : null;
    if (ring && ring.isRing) {
      var others = Math.max(0, (ring.providerCount || 1) - 1);
      L.push("3. NETWORK");
      L.push("   " + wrap("Provider is linked to " + others + " other provider" + (others === 1 ? "" : "s") +
        (ring.sharedTin ? " through a shared billing TIN (" + (ring.tin || p.tin) + ")" : "") +
        ". Coordinated billing behavior is indicated; the exposure above reflects this provider only."));
      L.push("");
    }

    var sims = window.DP.getSimilarAdjudicated ? window.DP.getSimilarAdjudicated(a.fwaType, 8) : [];
    if (sims.length) {
      var conf = sims.filter(function (s) { return s.outcome === "Confirmed"; });
      L.push((ring && ring.isRing ? "4" : "3") + ". PRECEDENT");
      L.push("   " + conf.length + " of " + sims.length + " prior " + a.fwaType.toLowerCase() + " cases were confirmed" +
        (conf.length ? ", recovering " + window.DP.usd(conf.reduce(function (s, x) { return s + (x.recovered || 0); }, 0)) + "." : "."));
      sims.slice(0, 3).forEach(function (s) { L.push("   · #" + s.id + " " + s.provider + " — " + s.outcome + " (" + s.adjudicatedDate + ")"); });
      L.push("");
    }

    L.push("BASIS FOR DECISION");
    L.push("   " + wrap(o.justification && o.justification.trim() ? o.justification.trim() : draftRationale(a, o.outcome) || "See finding and evidence above."));
    L.push("");
    L.push("PREPARED BY");
    L.push("   " + (o.user || "Dana Whitmore") + "  ·  " + window.APP.fmtTs(new Date()) + "  ·  drafted by the Investigative Assistant and adopted by the reviewer.");
    L.push("");
    L.push("Synthetic data — for demonstration only. Not a real member, provider, or claim.");
    return L.join("\n");
  }
  // soft-wrap a paragraph at ~92 chars so the memo reads like a document
  function wrap(s, w) {
    w = w || 92;
    var words = String(s || "").split(/\s+/), out = [], line = "";
    words.forEach(function (word) {
      if ((line + " " + word).trim().length > w) { out.push(line.trim()); line = word; }
      else line += " " + word;
    });
    if (line.trim()) out.push(line.trim());
    return out.join("\n   ");
  }

  // Structured "Summarize this case for adjudication" brief: talks through the
  // anomaly, the evidence, the network signal, precedent, and a recommended action.
  function adjudicationSummary(a) {
    var p = a.provider || {}, exp = window.DP.usd((a.mode === "prepay" ? a.exposurePre : a.exposurePost) || 0);

    // 1) anomaly
    var anomaly = (a.xai && a.xai.summary) || (p.name + " was flagged for " + a.fwaType.toLowerCase() + " at risk " + a.riskScore + "/100.");

    // 2) evidence — rules fired, model, and the strongest XAI factors
    var evidence = [];
    (a.rules || []).forEach(function (r) { evidence.push({ label: "Rule fired", detail: r.name + " (" + r.code + ")" }); });
    if (a.model) evidence.push({ label: "ML/AI model", detail: a.model.name + " · " + a.model.type });
    (a.xai && a.xai.factors || []).slice(0, 4).forEach(function (f) {
      evidence.push({ label: f.label, detail: f.value + (f.benchmark ? " (vs " + f.benchmark + ")" : ""), outlier: /σ|vs|threshold|separate|97th|100%|71%/.test((f.value || "") + (f.benchmark || "")) });
    });

    // 3) network signal
    var net = window.Collusion ? window.Collusion.analyze(p.id) : null;
    var network;
    if (net && net.isRing) {
      network = net.kind === "chain"
        ? "Not a one-off. This provider is one of " + net.providerCount + " facilities under " + (net.registration || "a single holding company") + " (officer " + (net.officer || "—") + ") cycling " + net.sharedPct + "% of the same members across " + net.states.join("/") + " under separate TINs — a coordinated residential-stay scheme."
        : "Not a one-off. " + net.providerCount + " flagged providers act as one billing entity" + (net.sharedTin ? " (shared TIN " + (net.tin || "") + ")" : "") + ", sharing " + net.sharedPct + "% of members" + (net.referralCount ? " and " + net.referralCount + " referrals" : "") + " — coordinated behavior beyond a single claim.";
    } else {
      network = "No collusion network — this provider bills in isolation, so the case rests on the claim's own evidence.";
    }

    // 4) precedent
    var sims = window.DP.getSimilarAdjudicated(a.fwaType) || [];
    var confirmed = sims.filter(function (s) { return s.outcome === "Confirmed"; });
    var recovered = confirmed.reduce(function (s, x) { return s + (x.recovered || 0); }, 0);
    var precedents = {
      total: sims.length, confirmed: confirmed.length, recovered: recovered,
      cases: sims.slice(0, 2),
      text: sims.length
        ? confirmed.length + " of " + sims.length + " prior " + a.fwaType.toLowerCase() + " cases were confirmed" + (recovered ? ", recovering " + window.DP.usd(recovered) : "") + "."
        : "No prior adjudicated cases of this type — treat as a precedent-setter."
    };

    // 5) recommendation — scenario overrides, else a rule over risk/confidence/network
    var rec;
    var isRing = net && net.isRing;
    if (a.mode === "prepay") {
      var pa = a.recommendedAction || "hold";
      var plabel = { pay: "Pay", hold: "Hold for records", deny: "Deny" }[pa];
      var prat = {
        pay: "Low risk and the amount matches the fee schedule — release " + window.DP.usd(a.exposurePre || 0) + " for payment.",
        hold: "Confidence is " + a.confidence + "% — hold the claim and pull the supporting records before " + window.DP.usd(a.exposurePre || 0) + " is paid.",
        deny: "The anomaly is corroborated" + (isRing ? " and the provider sits in a collusion network" : "") + " — deny to stop the " + window.DP.usd(a.exposurePre || 0) + " payment before it leaves."
      }[pa];
      rec = { action: pa, label: plabel, rationale: prat };
    }
    else if (a.id === "20463") rec = { action: "request-records", label: "Request records first", rationale: "Confidence is only " + a.confidence + "% and frequency alone drives the flag. If the medical record shows an ESRD dialysis regimen, dismiss as a false positive — recovering here would be an error." };
    else if (a.id === "20517") rec = { action: "confirm-escalate", label: "Confirm & escalate", rationale: "Two rules fired and the shared-TIN link to a partner provider lifts this above single-claim recovery. Confirm the " + exp + " and escalate the ring to a Case." };
    else if (a.id === "20544") rec = { action: "confirm-escalate", label: "Confirm & escalate", rationale: "The length-of-stay abuse is corroborated by rule + model, and the 4-facility holding-company chain makes this coordinated. Confirm " + exp + " and escalate the chain to a Case." };
    else if (a.id === "20481") rec = { action: "confirm", label: "Confirm", rationale: "Upcoding is 5.8σ above the specialty-peer median with low documented complexity. Confirm and recover the overpayment differential." };
    else if (isRing && a.riskScore >= 75) rec = { action: "confirm-escalate", label: "Confirm & escalate", rationale: "High risk plus a collusion network means this shouldn't be closed as one claim — confirm " + exp + " and escalate the network to a Case." };
    else if (a.confidence < 65) rec = { action: "request-records", label: "Request records first", rationale: "Confidence is " + a.confidence + "% — pull the supporting record before deciding; dismiss if the billing is clinically justified." };
    else if (a.riskScore >= 80) rec = { action: "confirm", label: "Confirm", rationale: "Risk " + a.riskScore + "/100 with " + a.confidence + "% confidence and corroborating rule/peer evidence. Confirm and recover " + exp + "." };
    else rec = { action: "confirm", label: "Confirm if evidence holds", rationale: "Moderate risk (" + a.riskScore + "/100). Confirm if the rule and peer evidence stand on record review; otherwise dismiss." };

    return { headline: "Adjudication brief · #" + a.id + " — " + a.fwaType, provider: p.name, exposure: exp, anomaly: anomaly, evidence: evidence, network: network, isRing: !!isRing, precedents: precedents, recommendation: rec };
  }

  // Simple intent-matched copilot answers grounded in the allegation/provider.
  function copilot(a, question) {
    var q = (question || "").toLowerCase();
    var p = a.provider || {};
    var band = window.DP.band(a.riskScore);
    var lvl = band === "high" ? "high" : band === "med" ? "moderate" : "low";
    if (q.indexOf("peer") >= 0 || q.indexOf("compare") >= 0) {
      if (a.id === "20481") return "Alamo Internal Medicine bills 99215 on ~90% of established-patient visits. The Internal-Medicine peer median is 14% (range 9–18% across 6 TX peers). That places this provider ~5.8σ above the peer group — the single strongest driver of the risk score.";
      return p.name + " scores " + a.riskScore + "/100 (" + lvl + ") for " + a.fwaType.toLowerCase() + ", above the peer norm for its specialty. See the Network view for shared-identifier context.";
    }
    if (q.indexOf("recommend") >= 0 || q.indexOf("action") >= 0 || q.indexOf("should") >= 0) {
      if (a.id === "20463") return "Recommendation: request the medical record first. The confidence is low (61%) and frequency alone drives the flag. If the record shows an ESRD dialysis regimen, dismiss as a false positive — recovering here would be an error.";
      if (a.id === "20517") return "Recommendation: confirm and escalate. Two rules fired (NCCI PTP + modifier-59) and the shared-TIN link to PR001 raises this above a single-claim recovery — a provider-level Case is warranted.";
      return "Recommendation: given a " + lvl + " risk score of " + a.riskScore + " with " + a.confidence + "% confidence, confirm if the rule/peer evidence holds, and escalate if network signals suggest coordination.";
    }
    if (q.indexOf("why") >= 0 || q.indexOf("flag") >= 0 || q.indexOf("explain") >= 0) {
      return a.xai ? a.xai.summary : "This item was flagged as " + a.fwaType.toLowerCase() + " with a risk of " + a.riskScore + "/100.";
    }
    if (q.indexOf("draft") >= 0 || q.indexOf("rationale") >= 0) {
      return draftRationale(a, "confirm");
    }
    if (q.indexOf("exposure") >= 0 || q.indexOf("recover") >= 0 || q.indexOf("amount") >= 0 || q.indexOf("dollar") >= 0) {
      return "Estimated post-payment exposure is " + window.DP.usd(a.exposurePost || 0) + ". If confirmed, that amount moves to Submitted for recovery.";
    }
    return "This is a " + a.fwaType.toLowerCase() + " lead on " + p.name + " with risk " + a.riskScore + "/100 and " + a.confidence + "% confidence. Ask me to summarize the risk, compare to peers, recommend an action, or draft a rationale.";
  }

  // Typewriter streamer for the "live" feel.
  function stream(el, text, done) {
    el.textContent = "";
    var i = 0;
    var iv = setInterval(function () {
      i += 3; el.textContent = text.slice(0, i);
      if (i >= text.length) { clearInterval(iv); el.textContent = text; if (done) done(); }
    }, 12);
    return iv;
  }

  // ---- Agentic case-assist: role-specialized agents (Element 3.2.iii) --------
  // Three agents look at the same lead through different lenses and each return a
  // grounded set of findings + the sources they read. Deterministic — built from
  // the same DP the human sees (rules, model, xAI, network, pricing, coding,
  // risk intelligence), so nothing is invented.
  function agentReports(a) {
    var p = a.provider || {}, cl = a.claim, out = [];
    // --- Investigative: entity · network · OSINT ---
    var inv = [], invSrc = ["Provider registry", "Network graph", "Risk intelligence"];
    var net = window.Collusion ? window.Collusion.analyze(p.id) : null;
    if (net && net.isRing) {
      inv.push({ sev: "high", text: net.kind === "chain"
        ? p.name + " is one of " + net.providerCount + " facilities under " + (net.registration || "a shared holding company") + " cycling " + net.sharedPct + "% of the same members across " + (net.states || []).join("/") + " under separate TINs."
        : net.providerCount + " NPIs act as one billing entity" + (net.sharedTin ? " (shared TIN " + (net.tin || p.tin) + ")" : "") + ", sharing " + net.sharedPct + "% of members — coordinated behavior." });
    } else { inv.push({ sev: "low", text: p.name + " bills in isolation — no collusion network detected; the case rests on the claim's own evidence." }); }
    var ri = window.DP.getRiskIntel ? window.DP.getRiskIntel(p.id) : null;
    if (ri) {
      inv.push({ sev: ri.band === "high" ? "high" : ri.band === "medium" ? "medium" : "low", text: "External risk " + ri.score + "/100 across " + ri.findingCount + " findings. " + ri.summary.split(". ")[0] + "." });
      (ri.findings || []).filter(function (f) { return f.severity === "critical" || f.severity === "high"; }).slice(0, 2).forEach(function (f) { inv.push({ sev: f.severity === "critical" ? "high" : "high", text: f.category + ": " + f.title + " (" + f.source + ")." }); });
      invSrc.push("Federal exclusions / sanctions", "Corporate registry");
    }
    out.push({ role: "Investigative", icon: "user-search", focus: "entity · network · OSINT", findings: inv, sources: invSrc });

    // --- Claims: billing · coding · pricing ---
    var clm = [], clmSrc = ["837 claim", "NCCI edits", "CMS fee schedules"];
    if (cl && window.DP.getCptCrosswalk) {
      var x = window.DP.getCptCrosswalk(cl.id);
      if (x) {
        if (x.fails) clm.push({ sev: "high", text: x.fails + " line(s) fail NCCI/MUE coding edits — " + x.determination.toLowerCase() + "." });
        (x.lines || []).forEach(function (l) { if (l.ptp && l.ptp.status !== "pass") clm.push({ sev: "high", text: "Coding: " + l.cpt + (l.modifiers.length ? "-" + l.modifiers.join(",") : "") + " — " + l.ptp.note }); });
      }
    }
    if (cl && window.DP.getCmsPricing) {
      var pr = window.DP.getCmsPricing(cl.id);
      if (pr && pr.totals.overpayment > 0) clm.push({ sev: "high", text: "Pricing: " + window.DP.usd(pr.totals.overpayment) + " above the CMS-allowed amount — recoverable per CMS reference pricing." });
    }
    if (a.id === "20481") clm.push({ sev: "high", text: "Upcoding: 99215 billed on ~90% of established visits vs a 14% peer median (5.8σ) with low documented complexity." });
    if (!clm.length) clm.push({ sev: "medium", text: "No hard coding/pricing edit failed on the face of the claim; the flag rests on the utilization/frequency pattern — pull records to confirm." });
    out.push({ role: "Claims", icon: "file-invoice", focus: "billing · coding · pricing", findings: clm, sources: clmSrc });

    // --- Policy: rules · thresholds · authorities ---
    var pol = [], polSrc = [];
    (a.rules || []).forEach(function (r) { pol.push({ sev: "medium", text: r.name + " (" + r.code + ") — authority: " + r.source + "." }); if (polSrc.indexOf(r.source) < 0) polSrc.push(r.source); });
    if (a.model) pol.push({ sev: "medium", text: "Model in play: " + a.model.name + " (" + a.model.type + ") — flags the pattern for human review." });
    if (a.mode === "prepay") pol.push({ sev: "medium", text: "Pre-payment posture — 42 CFR 405 payment-suspension authority applies where a credible allegation exists; nothing has been disbursed." });
    else pol.push({ sev: "medium", text: "Post-payment posture — overpayment is recoverable; determination + demand with appeal rights is the applicable path." });
    if (!polSrc.length) polSrc.push("Payer medical policy");
    polSrc.push("Medicare Claims Processing Manual");
    out.push({ role: "Policy", icon: "gavel", focus: "rules · thresholds · authorities", findings: pol, sources: polSrc });
    return out;
  }

  // ---- Knowledge base the assist grounds against (representative) ----
  function knowledgeBase() {
    return [
      { title: "Medicare Claims Processing Manual, Ch. 12 (MPFS)", cite: "CMS Pub. 100-04", summary: "Physician fee-schedule pricing — RVU × GPCI × conversion factor." },
      { title: "National Correct Coding Initiative Policy Manual", cite: "CMS NCCI", summary: "Procedure-to-procedure edits, modifier indicators, MUE limits." },
      { title: "List of Excluded Individuals/Entities", cite: "OIG LEIE", summary: "Providers excluded from federal health-care programs; claims paid during exclusion are recoverable." },
      { title: "Payment suspension — credible allegation of fraud", cite: "42 CFR 405.371", summary: "Authority to suspend payments pending investigation." },
      { title: "Health plan network provider agreement", cite: "Payer contract", summary: "Contracted rates, records-access and audit provisions." }
    ];
  }

  // ---- Correspondence generation (Element 3.2.iii) ---------------------------
  // Templated notices populated with the case specifics. Each returns a formatted
  // letter body that can be reviewed, attached to the case (as an artifact), or
  // exported. Clearly synthetic (reserved identifiers + demonstration footer).
  var CORRESPONDENCE_TYPES = [
    { id: "records", label: "Records / clarification request", icon: "file-text", blurb: "Request the medical records supporting the flagged lines." },
    { id: "suspension", label: "Temporary payment suspension", icon: "player-pause", blurb: "Notice of a pre-payment suspension pending review." },
    { id: "determination", label: "Overpayment determination", icon: "gavel", blurb: "Determination + demand for the recoverable amount." },
    { id: "followup", label: "Follow-up notice", icon: "clock", blurb: "Follow-up on an unanswered prior notice." }
  ];
  function correspondence(a, type) {
    var p = a.provider || {}, cl = a.claim, prepay = a.mode === "prepay";
    var contact = window.DP.getProviderContact ? window.DP.getProviderContact(p.id) : null;
    var exp = window.DP.usd((prepay ? a.exposurePre : a.exposurePost) || 0);
    var meta = CORRESPONDENCE_TYPES.filter(function (t) { return t.id === type; })[0] || CORRESPONDENCE_TYPES[0];
    var ref = "Lead #" + a.id + (cl ? " · Claim " + cl.claimNumber + " (DOS " + cl.dateOfService + ")" : "");
    var finding = (a.xai && a.xai.summary) || (p.name + " was flagged for " + a.fwaType.toLowerCase() + ".");
    var L = [];
    L.push("Health Plan · Payment Integrity Unit");
    L.push("Payment Integrity Validation & Oversight");
    L.push("Date: " + window.APP.fmtTs(new Date()));
    L.push("");
    L.push("To:   " + (p.name || "—"));
    if (contact) L.push("      Attn: " + contact.attention);
    L.push("      NPI " + (p.npi || "—") + "  ·  TIN " + (p.tin || "—"));
    if (contact) L.push("      " + contact.email + "  ·  Fax " + contact.fax);
    L.push("");
    L.push("Re:   " + meta.label + " — " + ref);
    L.push("");
    var body = [];
    if (type === "records") {
      body.push("This office is conducting a payment-integrity review of the claim referenced above. Our analysis flagged a potential " + a.fwaType.toLowerCase() + " pattern:");
      body.push("");
      body.push("    " + finding);
      body.push("");
      body.push("Please provide, within 30 calendar days, the complete medical record supporting the services billed on this claim, including the history, examination and medical-decision-making documentation for each procedure code, any orders, and the treatment plan. Absent sufficient documentation, the flagged lines may be adjusted or the associated payment recovered.");
    } else if (type === "suspension") {
      body.push("Pursuant to the payment-suspension authority at 42 CFR 405.371, this notice advises you that payment on the referenced claim (and substantially similar pending claims) is TEMPORARILY SUSPENDED pending a payment-integrity review. The review concerns:");
      body.push("");
      body.push("    " + finding);
      body.push("");
      body.push("The amount held pending this review is " + exp + ". This is a temporary hold, not a final determination. You may submit documentation rebutting the finding at any time; a determination will follow the review.");
    } else if (type === "determination") {
      body.push("Following a payment-integrity review of the referenced claim, this office has determined that an improper payment of " + exp + " was made in connection with a " + a.fwaType.toLowerCase() + " pattern:");
      body.push("");
      body.push("    " + finding);
      body.push("");
      body.push("Demand is hereby made for repayment of " + exp + ". You have the right to submit a rebuttal and to appeal this determination within the timeframe stated in your provider agreement. Supporting evidence and the basis for this determination are available in the case file.");
    } else { // followup
      body.push("Our records indicate that a prior notice regarding the referenced claim has not received a response within the requested timeframe. The matter concerns:");
      body.push("");
      body.push("    " + finding);
      body.push("");
      body.push("Please respond within 14 calendar days. If no response is received, this office will proceed with the applicable determination on the record available, which may result in " + (prepay ? "denial of the pending payment" : "recovery of " + exp) + ".");
    }
    body.forEach(function (line) { L.push(line.length > 96 ? wrap(line, 96) : line); });
    L.push("");
    L.push("Sincerely,");
    var signer = (window.APP.ROLES[window.APP.state.role] || {}).name || "Dana Whitmore";
    L.push(signer + ", Payment Integrity Analyst");
    L.push("IBM Payment Integrity");
    L.push("");
    L.push("Drafted by the agentic assist and subject to reviewer adoption.");
    L.push("Synthetic data — for demonstration only. Not a real member, provider, or claim.");
    return { type: type, label: meta.label, ref: ref, body: L.join("\n") };
  }

  window.AI = { draftRationale: draftRationale, justificationMemo: justificationMemo, caseNarrative: caseNarrative, adjudicationSummary: adjudicationSummary, copilot: copilot, stream: stream, agentReports: agentReports, knowledgeBase: knowledgeBase, correspondence: correspondence, CORRESPONDENCE_TYPES: CORRESPONDENCE_TYPES };
})();
