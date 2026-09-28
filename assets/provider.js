/* DataProvider — the swappable seam. Reads window.PIVOT_DATA (build-time snapshot).
   Later: a Neo4jProvider returning the same shapes. Attaches to window.DP. */
(function () {
  var D = window.PIVOT_DATA;
  var idx = function (arr) { var o = {}; arr.forEach(function (x) { o[x.id] = x; }); return o; };
  var providers = idx(D.providers), claims = idx(D.claims), veterans = idx(D.veterans),
      rules = idx(D.rules), models = idx(D.models);

  function band(r) { return r >= 80 ? "high" : r >= 50 ? "med" : "low"; }
  // Lead source taxonomy — answers "leads aren't all data-driven; some are manual."
  // data-mining · rules · ML/AI (automated) + hotline/tip · referral · OIG · email · phone (manual).
  var SOURCES = ["ML/AI", "Rules", "Data mining", "Hotline / tip", "Referral", "OIG", "Email", "Phone / call"];
  function sourceOf(a) {
    if (!a) return "ML/AI";
    if (a.sourceType) return a.sourceType;              // explicit (manual / created leads)
    if (a.source === "Rules Engine") return "Rules";
    return "ML/AI";                                     // Pattern Recognition / Both → ML/AI-driven
  }

  // Lead → Case model: a flagged item is a LEAD; once the supervisor APPROVES the
  // analyst's Confirm or Escalate decision, the lead joins or opens the provider's CASE.
  // Leads with status "Pending review" are awaiting supervisor approval and do NOT yet
  // appear in the Cases list. Dismissed leads never open a case.
  var CASE_STATUS = { "Confirmed": 1, "Escalated": 1 };
  var CLOSED_STATUS = { "Dismissed": 1, "Cleared to pay": 1, "Denied": 1 };
  function isCaseLead(a) {
    return !!CASE_STATUS[a.status];
  }
  function usd(n) { return "$" + Math.round(n).toLocaleString(); }
  function usdShort(n) {
    if (n >= 1e6) return "$" + (n / 1e6).toFixed(2) + "M";
    if (n >= 1e3) return "$" + (n / 1e3).toFixed(1) + "K";
    return "$" + Math.round(n).toLocaleString();
  }

  window.DP = {
    raw: D,
    meta: D.meta,
    disclaimer: D.meta.disclaimer,
    band: band, usd: usd, usdShort: usdShort,
    SOURCES: SOURCES, sourceOf: sourceOf,
    getKpis: function () { return D.kpis; },
    getAnomalyBreakdown: function () { return D.anomalyBreakdown; },
    getGraph: function () { return D.graph; },
    getPeerBenchmark: function (k) { return D.peerBenchmarks[k]; },
    getProvider: function (id) { return providers[id] || null; },
    getClaim: function (id) { return claims[id] || null; },
    getVeteran: function (id) { return veterans[id] || null; },
    listProviders: function () { return D.providers; },
    listPeers: function () { return D.providers.filter(function (p) { return p.role === "peer"; }); },

    // Historical adjudicated cases of the same FWA type, for reviewer precedent.
    getSimilarAdjudicated: function (fwaType, limit) {
      var rows = (D.precedents || []).filter(function (p) { return p.fwaType === fwaType; })
        .sort(function (a, b) { return a.adjudicatedDate < b.adjudicatedDate ? 1 : -1; });
      return typeof limit === "number" ? rows.slice(0, limit) : rows;
    },

    // ---- subject of investigation (Round 6 Phase B) ----
    // Who/what is under review on a lead: the Provider, the Beneficiary (member), or
    // the Pharmacy. Derived from an explicit subjectType on the lead, defaulting to
    // Provider (every data-driven lead today is provider-subject).
    SUBJECT_TYPES: {
      Provider: { label: "Provider", icon: "building-hospital", tone: "asg", desc: "The billing or rendering provider is the subject of the review." },
      Beneficiary: { label: "Beneficiary", icon: "user-heart", tone: "esc", desc: "The member / beneficiary is the subject — identity, eligibility or utilization pattern." },
      Pharmacy: { label: "Pharmacy", icon: "prescription", tone: "rev", desc: "The dispensing pharmacy is the subject — NCPDP / NDC prescription claims." }
    },
    subjectTypeOf: function (a) { return (a && a.subjectType && this.SUBJECT_TYPES[a.subjectType]) ? a.subjectType : "Provider"; },

    getAllegation: function (id) {
      var a = D.allegations.find(function (x) { return x.id === id; });
      if (!a) return null;
      var provider = providers[a.providerId] || null;
      var claim = a.claimId ? claims[a.claimId] : null;
      // beneficiary-subject leads carry the member directly (no single claim); fall
      // back to the claim's member for provider/pharmacy leads.
      var veteran = (claim ? veterans[claim.veteranId] : null) || (a.subjectVeteranId ? veterans[a.subjectVeteranId] : null) || null;
      return Object.assign({}, a, {
        provider: provider, claim: claim, veteran: veteran, subjectType: this.subjectTypeOf(a),
        model: a.modelId ? models[a.modelId] : null,
        rules: (a.ruleIds || []).map(function (rid) { return rules[rid]; }).filter(Boolean)
      });
    },

    listAllegations: function (f) {
      f = f || {};
      var self = this;
      var rows = D.allegations.map(function (a) {
        var p = providers[a.providerId];
        return {
          id: a.id, fwaType: a.fwaType, riskScore: a.riskScore, confidence: a.confidence,
          source: a.source, sourceType: sourceOf(a), status: a.status, assignee: a.assignee, claimType: a.claimType,
          exposurePost: a.exposurePost, exposurePre: a.exposurePre, createdDate: a.createdDate, providerId: a.providerId,
          mode: a.mode || "retrospective", recommendedAction: a.recommendedAction, manual: !!a.manual,
          providerName: p ? p.name : "—", providerNpi: p ? p.npi : "", providerState: p ? p.state : "",
          subjectType: self.subjectTypeOf(a),
          hero: ["20481", "20517", "20463"].indexOf(a.id) >= 0 ? 1 : 0
        };
      });
      // default to the retrospective (post-payment) population; "prepay" or "all" opt in.
      var mode = f.mode || "retrospective";
      if (mode !== "all") rows = rows.filter(function (r) { return r.mode === mode; });
      if (f.fwaType) rows = rows.filter(function (r) { return r.fwaType === f.fwaType; });
      if (f.status) rows = rows.filter(function (r) { return r.status === f.status; });
      if (f.source) rows = rows.filter(function (r) { return r.sourceType === f.source; });
      if (typeof f.minRisk === "number") rows = rows.filter(function (r) { return r.riskScore >= f.minRisk; });
      if (f.query) {
        var q = f.query.toLowerCase();
        rows = rows.filter(function (r) { return [r.providerName, r.fwaType, r.providerNpi, r.id].join(" ").toLowerCase().indexOf(q) >= 0; });
      }
      rows.sort(function (a, b) { return b.riskScore - a.riskScore; });
      return rows;
    },

    getTrends: function () { return D.trends || []; },

    // ---- rule taxonomy (derived, no data regen) ----
    // Every rule is classifiable along five dimensions the compliance program uses.
    // Existing generator rules get their tags here; a few catalog-only rules are
    // appended so each dimension value has real coverage (exclusion, anti-kickback,
    // phantom billing, DME, beneficiary have no firing rule in the seed data).
    RULE_DIMENSIONS: [
      { key: "regulatorySource", label: "Regulatory source", values: ["CMS NCCI edits", "CMS payment rules", "Payer policy", "False Claims Act", "Anti-Kickback Statute", "OIG advisories"] },
      { key: "entityType", label: "Entity type", values: ["Provider", "DME supplier", "Pharmacy", "Beneficiary"] },
      { key: "fraudType", label: "Fraud type", values: ["Upcoding", "Unbundling", "Phantom billing", "Medically unnecessary", "Duplicate billing", "Exclusion violations", "Kickback / self-referral", "Authorization / coverage", "Overpayment / pricing", "Workflow"] },
      { key: "detectionLevel", label: "Detection level", values: ["Claim-level", "Provider-pattern", "Network-level"] },
      { key: "severity", label: "Severity", values: ["Critical", "High", "Medium", "Low"] }
    ],
    // taxonomy for the 8 generator rules, keyed by rule id
    RULE_TAXONOMY: {
      rule_ncci_43235_43239: { regulatorySource: "CMS NCCI edits", entityType: "Provider", fraudType: "Unbundling", detectionLevel: "Claim-level", severity: "High" },
      rule_mue: { regulatorySource: "CMS NCCI edits", entityType: "Provider", fraudType: "Medically unnecessary", detectionLevel: "Claim-level", severity: "Medium" },
      rule_mod59: { regulatorySource: "CMS NCCI edits", entityType: "Provider", fraudType: "Unbundling", detectionLevel: "Provider-pattern", severity: "High" },
      rule_mppr: { regulatorySource: "CMS payment rules", entityType: "Provider", fraudType: "Overpayment / pricing", detectionLevel: "Claim-level", severity: "Low" },
      rule_fee: { regulatorySource: "Payer policy", entityType: "Provider", fraudType: "Overpayment / pricing", detectionLevel: "Claim-level", severity: "Medium" },
      rule_dup: { regulatorySource: "Payer policy", entityType: "Provider", fraudType: "Duplicate billing", detectionLevel: "Claim-level", severity: "High" },
      rule_auth: { regulatorySource: "Payer policy", entityType: "Provider", fraudType: "Authorization / coverage", detectionLevel: "Claim-level", severity: "Medium" },
      rule_payreport: { regulatorySource: "Payer policy", entityType: "Provider", fraudType: "Workflow", detectionLevel: "Claim-level", severity: "Low" },
      rule_rx_nondispense: { regulatorySource: "Payer policy", entityType: "Pharmacy", fraudType: "Phantom billing", detectionLevel: "Provider-pattern", severity: "High" },
      rule_ben_identity: { regulatorySource: "Payer policy", entityType: "Beneficiary", fraudType: "Duplicate billing", detectionLevel: "Network-level", severity: "High" }
    },
    // catalog-only rules that broaden coverage across every dimension
    RULE_CATALOG_EXTRA: [
      { id: "rule_em_level", code: "EM-LEVEL", name: "E/M level validation", source: "CMS payment rules", category: "Coding", description: "Evaluation & management level billed exceeds the documented history/exam/decision-making and the provider's peer-group distribution.", version: "2.1", effectiveDate: "2025-01-01", environment: "Production", regulatorySource: "CMS payment rules", entityType: "Provider", fraudType: "Upcoding", detectionLevel: "Provider-pattern", severity: "High" },
      { id: "rule_phantom", code: "SVC-RENDERED", name: "Services-not-rendered screen", source: "False Claims Act", category: "Integrity", description: "Billed service has no corroborating encounter, attendance or delivery record for the date of service.", version: "1.3", effectiveDate: "2024-11-01", environment: "Production", regulatorySource: "False Claims Act", entityType: "Provider", fraudType: "Phantom billing", detectionLevel: "Claim-level", severity: "Critical" },
      { id: "rule_mednec", code: "MED-NEC", name: "Medical-necessity / level-of-care", source: "Payer policy", category: "Coverage", description: "Level of care or length of stay exceeds evidence-based clinical criteria for the documented condition.", version: "1.6", effectiveDate: "2024-12-01", environment: "Production", regulatorySource: "Payer policy", entityType: "Provider", fraudType: "Medically unnecessary", detectionLevel: "Provider-pattern", severity: "High" },
      { id: "rule_excl", code: "EXCL-LEIE", name: "OIG LEIE exclusion screening", source: "OIG advisories", category: "Integrity", description: "Rendering or billing provider (or ordering physician) appears on the OIG List of Excluded Individuals/Entities — claims paid during exclusion are recoverable in full.", version: "2.0", effectiveDate: "2025-01-01", environment: "Production", regulatorySource: "OIG advisories", entityType: "Provider", fraudType: "Exclusion violations", detectionLevel: "Provider-pattern", severity: "Critical" },
      { id: "rule_aks", code: "AKS-STARK", name: "Anti-kickback / self-referral", source: "Anti-Kickback Statute", category: "Integrity", description: "Referral or financial-arrangement pattern between linked entities indicates a prohibited inducement or self-referral.", version: "1.1", effectiveDate: "2024-10-15", environment: "Production", regulatorySource: "Anti-Kickback Statute", entityType: "Provider", fraudType: "Kickback / self-referral", detectionLevel: "Network-level", severity: "Critical" },
      { id: "rule_dme", code: "DME-NEC", name: "DME medical necessity & delivery", source: "Payer policy", category: "Coverage", description: "Durable medical equipment billed without a supporting order, proof of delivery, or documented medical necessity.", version: "1.2", effectiveDate: "2024-09-15", environment: "Production", regulatorySource: "Payer policy", entityType: "DME supplier", fraudType: "Medically unnecessary", detectionLevel: "Claim-level", severity: "Medium" },
      { id: "rule_benelig", code: "BEN-ELIG", name: "Beneficiary eligibility & identity", source: "Payer policy", category: "Coverage", description: "Service billed for a date the beneficiary was ineligible, deceased, or where identity could not be verified.", version: "1.0", effectiveDate: "2025-02-01", environment: "Production", regulatorySource: "Payer policy", entityType: "Beneficiary", fraudType: "Phantom billing", detectionLevel: "Claim-level", severity: "High" },
      { id: "rule_hh_noa", code: "HH-NOA", name: "Home Health Notice of Admission", source: "CMS payment rules", category: "Coding", description: "Home health period billed without a timely-filed Notice of Admission — the NOA must post within 5 calendar days of the start of care or the period incurs a per-day payment reduction.", version: "1.1", effectiveDate: "2025-01-01", environment: "Production", regulatorySource: "CMS payment rules", entityType: "Provider", fraudType: "Workflow", detectionLevel: "Claim-level", severity: "Medium", configLevel: "Contract — Home Health program (from the template default)" },
      { id: "rule_dup_prof", code: "DUP-PROF", name: "Possible duplicate professional claim edit", source: "CMS payment rules", category: "Duplicate", description: "A professional (837P) line matches a previously adjudicated line on rendering provider, beneficiary, date of service and procedure/modifier — a suspected duplicate held for review before a second payment.", version: "1.4", effectiveDate: "2024-12-01", environment: "Production", regulatorySource: "CMS payment rules", entityType: "Provider", fraudType: "Duplicate billing", detectionLevel: "Claim-level", severity: "Medium", configLevel: "Template — all programs" },
      { id: "rule_ncd", code: "NCD-MEDNEC", name: "NCD medical-necessity edit", source: "CMS payment rules", category: "Coverage", description: "Service billed against a CMS National Coverage Determination without a covered indication — the diagnoses do not meet the NCD's medical-necessity criteria for the procedure.", version: "1.2", effectiveDate: "2024-10-01", environment: "Production", regulatorySource: "CMS payment rules", entityType: "Provider", fraudType: "Medically unnecessary", detectionLevel: "Claim-level", severity: "Medium", configLevel: "Template — national; LCD overrides per MAC jurisdiction" }
    ],
    ruleTaxonomyFor: function (id) { return this.RULE_TAXONOMY[id] || null; },
    // full catalog: generator rules enriched with taxonomy + the catalog-only rules.
    getRuleCatalog: function () {
      var tax = this.RULE_TAXONOMY;
      var base = (D.rules || []).map(function (r) { return Object.assign({}, r, tax[r.id] || {}); });
      return base.concat(this.RULE_CATALOG_EXTRA);
    },
    getRules: function () { return D.rules; },

    // ---- rule drill-down (Round 6 Phase D) --------------------------------
    // For a selected rule: its decision LOGIC (criteria / pseudo-logic), the required
    // DATA INPUTS it reads (claim fields → 837/NCPDP segments + external references),
    // and its OUTPUT structure (flag / score / disposition + what it feeds downstream).
    // Rich, hand-authored specs for the rules that matter in the demo; a generic spec
    // derived from the rule's dimensions for the rest. Synthetic — real edit logic
    // (Wendy's FAMS examples) drops in later behind this same shape.
    RULE_DETAIL: {
      rule_ncci_43235_43239: {
        logic: {
          summary: "NCCI procedure-to-procedure (PTP) edit: a column-2 code billed with its column-1 code on the same date by the same provider is bundled unless a valid override modifier documents a distinct service.",
          criteria: [
            { when: "Two lines on the claim form an NCCI PTP pair (column-1 / column-2), same DOS & rendering provider", then: "The pair is subject to the edit" },
            { when: "Modifier indicator = 0", then: "No modifier may override — deny the column-2 line" },
            { when: "Indicator = 1 and no 59 / X{EPSU} modifier present", then: "Bundle — column-2 not separately payable" },
            { when: "Indicator = 1 and a 59 / X modifier present", then: "Payable only if the record documents a distinct procedural service — route to review" }
          ],
          pseudocode: "for each PTP pair (c1,c2) on claim:\n  if indicator==0: deny(c2)\n  elif no override_modifier(c2): bundle(c2)\n  else: review(c2, 'distinct service?')"
        },
        inputs: [
          { field: "Procedure code (HCPCS/CPT)", source: "837P · 2400 · SV1-01", example: "43235, 43239" },
          { field: "Line modifiers", source: "837P · 2400 · SV1-01 (2–5)", example: "59" },
          { field: "Date of service", source: "837P · 2400 · DTP*472", example: "2025-04-22" },
          { field: "Rendering provider NPI", source: "837P · 2310B · NM1*82", example: "1…" },
          { field: "NCCI PTP edit file", source: "External reference · CMS (quarterly)", example: "v31.1" }
        ],
        output: { signal: "flag", emits: "NCCI_PTP_VIOLATION", disposition: "Column-2 line not separately payable — recover as bundled", downstream: "Line adjudication CARC CO-97 · lead created (Unbundling)" }
      },
      rule_mod59: {
        logic: {
          summary: "Modifier-59 / X{EPSU} misuse: an override modifier applied where no distinct procedural service is documented, or a provider whose 59-modifier rate far exceeds the peer norm.",
          criteria: [
            { when: "A 59/X modifier is applied to a line", then: "Confirm an NCCI PTP edit actually exists to override" },
            { when: "No PTP edit exists for the pair", then: "The override is unnecessary — flag as potential unbundling mask" },
            { when: "Provider 59-modifier rate > 3σ above specialty peers", then: "Escalate to a provider-pattern review" }
          ],
          pseudocode: "if modifier in {59,XE,XP,XS,XU}:\n  if not ptp_edit(line): flag('unsupported override')\n  if provider.mod59_rate > peer_mean + 3*peer_sd: flag('pattern')"
        },
        inputs: [
          { field: "Line modifiers", source: "837P · 2400 · SV1-01 (2–5)", example: "59, XU" },
          { field: "Procedure code", source: "837P · 2400 · SV1-01", example: "43235" },
          { field: "Provider 59-modifier rate", source: "Derived · provider claim history", example: "31% vs peer 4%" },
          { field: "NCCI PTP edit file", source: "External reference · CMS", example: "v31.1" }
        ],
        output: { signal: "flag + score", emits: "MODIFIER_59_MISUSE (+ pattern score)", disposition: "Route to review — payable only if the record documents a distinct service", downstream: "Line adjudication · provider-pattern lead" }
      },
      rule_em_level: {
        logic: {
          summary: "E/M upcoding: the evaluation & management level billed exceeds both the documented history/exam/decision-making and the provider's peer-group level distribution.",
          criteria: [
            { when: "Billed E/M level (e.g. 99215) share is far above the specialty peer median", then: "Compute a peer-deviation score (σ)" },
            { when: "Linked diagnoses map to low clinical complexity", then: "Documentation unlikely to support the level" },
            { when: "Deviation ≥ threshold sustained across months", then: "Flag for provider-pattern review + downcode basis" }
          ],
          pseudocode: "share = pct(level5_visits)\nsigma = (share - peer_mean)/peer_sd\nif sigma >= 4 and dx_complexity == 'low': flag(score=sigma)"
        },
        inputs: [
          { field: "E/M procedure code", source: "837P · 2400 · SV1-01", example: "99215" },
          { field: "Diagnosis pointers / codes", source: "837P · 2300 · HI (ABK/ABF)", example: "K21.9" },
          { field: "Provider E/M distribution", source: "Derived · provider claim history", example: "90% level-5 vs peer 14%" },
          { field: "Peer-group benchmark", source: "External reference · specialty peer set", example: "Internal Medicine" }
        ],
        output: { signal: "score → flag", emits: "EM_UPCODE (peer-deviation σ)", disposition: "Downcode to the supported level — recover the differential", downstream: "Lead created (Upcoding) · remittance RARC N657" }
      },
      rule_mednec: {
        logic: {
          summary: "Medical-necessity / level-of-care: the billed level of care or length of stay exceeds evidence-based clinical criteria for the documented condition.",
          criteria: [
            { when: "Billed level of care > guideline-recommended level for the diagnosis", then: "Flag the excess" },
            { when: "Length of stay > authorized / continued-stay criteria", then: "Recover the unauthorized days" },
            { when: "Continued-stay criteria not met on review day", then: "Step-down indicated" }
          ],
          pseudocode: "if los.actual > auth.days and not continued_stay_criteria_met():\n  flag(excess_days = los.actual - auth.days)"
        },
        inputs: [
          { field: "Revenue / procedure code", source: "837I · 2400 · SV2", example: "H0018" },
          { field: "Statement dates (admit–discharge)", source: "837I · 2300 · DTP*434", example: "2025-01-03 – 01-31" },
          { field: "Prior authorization", source: "External reference · UM auth record", example: "14 days approved" },
          { field: "Clinical care guideline", source: "External reference · clinical care guidelines", example: "BHG-RES" }
        ],
        output: { signal: "flag", emits: "LOC_LOS_EXCEEDED", disposition: "Recover the days beyond the authorized / criteria-met stay", downstream: "Lead (Residential LOS) · remittance RARC N130" }
      },
      rule_excl: {
        logic: {
          summary: "OIG LEIE exclusion screening: the rendering or billing provider (or ordering physician) appears on the OIG List of Excluded Individuals/Entities for a date of service — claims paid during exclusion are recoverable in full.",
          criteria: [
            { when: "Provider NPI/name matches an active LEIE exclusion", then: "Any claim with a DOS during the exclusion is an automatic finding" },
            { when: "Exclusion effective ≤ DOS ≤ reinstatement (or open)", then: "Recover 100% — no medical review needed" }
          ],
          pseudocode: "hit = LEIE.match(provider.npi | provider.name)\nif hit and hit.effective <= dos: flag('excluded', recover=paid)"
        },
        inputs: [
          { field: "Billing / rendering provider NPI", source: "837 · 2010AA / 2310B · NM1", example: "1…" },
          { field: "Ordering physician", source: "837 · 2420E · NM1*DK", example: "—" },
          { field: "Date of service", source: "837 · 2400 · DTP*472/434", example: "…" },
          { field: "OIG LEIE list", source: "External reference · OIG (monthly)", example: "exclusion since 2023-08" }
        ],
        output: { signal: "flag", emits: "LEIE_EXCLUSION (critical)", disposition: "Automatic finding — recover in full; refer to OIG", downstream: "Lead (Exclusion) · supervisor referral" }
      },
      rule_rx_nondispense: {
        logic: {
          summary: "Prescription non-dispensing / DAW screen: a prescription billed with no matching dispensing (pickup) record, or a brand billed under DAW-1 without documented medical necessity where a generic equivalent exists.",
          criteria: [
            { when: "Claim paid but no dispensing / pickup record within the fill window", then: "Flag as non-dispensed — recoverable" },
            { when: "Brand billed with DAW 1 and a generic equivalent exists", then: "Require documented medical necessity" },
            { when: "Quantity billed exceeds the days-supply norm for the drug", then: "Flag excess quantity" }
          ],
          pseudocode: "if paid and not pickup_record(rx): flag('non-dispensed')\nif daw==1 and generic_exists(ndc) and not medical_necessity(): flag('DAW misuse')"
        },
        inputs: [
          { field: "Drug (NDC)", source: "NCPDP D.0 · Claim · 407-D7", example: "00000-0471-30" },
          { field: "DAW / product-selection code", source: "NCPDP D.0 · Claim · 408-D8", example: "1" },
          { field: "Quantity dispensed / days supply", source: "NCPDP D.0 · Claim · 442-E7 / 405-D5", example: "30 mL / 30 days" },
          { field: "Dispensing (pickup) record", source: "External reference · pharmacy dispensing log", example: "none on file" }
        ],
        output: { signal: "flag + score", emits: "RX_NONDISPENSE / DAW_MISUSE", disposition: "Recover as non-dispensed / DAW misuse", downstream: "Lead (Non-dispensed) · remittance RARC M123 / CARC CO-16" }
      },
      rule_ben_identity: {
        logic: {
          summary: "Beneficiary identity / card-sharing screen: one member ID billed across multiple unrelated providers with overlapping dates of service or duplicate high-cost services — indicates identity misuse or card sharing.",
          criteria: [
            { when: "One member ID appears on claims from ≥ N distinct providers within a short window", then: "Compute a dispersion score" },
            { when: "Overlapping / same-day services at different providers or states", then: "Physically implausible — flag" },
            { when: "Duplicate high-cost services on the identity", then: "Flag duplicate exposure" }
          ],
          pseudocode: "grp = claims.group_by(member_id, window=21d)\nif grp.distinct_providers >= 6 or grp.has_overlapping_dos(): flag(score)"
        },
        inputs: [
          { field: "Member ID (subscriber)", source: "837 · 2010BA · NM1*IL / NCPDP 302-C2", example: "MBR-…" },
          { field: "Billing provider NPI", source: "837 · 2010AA · NM1*85", example: "multiple" },
          { field: "Date / place of service", source: "837 · 2400 · DTP / CLM05", example: "overlapping · TX·AZ·NM" },
          { field: "Enrollment / eligibility record", source: "External reference · enrollment", example: "single beneficiary" }
        ],
        output: { signal: "flag + score", emits: "BENEFICIARY_IDENTITY_MISUSE", disposition: "Investigate identity misuse / card sharing across the involved providers", downstream: "Lead (Beneficiary subject) · network review" }
      },
      rule_hh_noa: {
        logic: {
          summary: "Home Health Notice of Admission (NOA) timely-filing edit: a home-health period billed without an NOA accepted within 5 calendar days of the start of care incurs a per-day payment reduction until the NOA posts.",
          criteria: [
            { when: "A home-health period (TOB 032x) is submitted", then: "Look up a matching accepted NOA for the beneficiary + start-of-care date" },
            { when: "No NOA on file, or NOA accepted > 5 calendar days after the start of care", then: "Apply the late-NOA per-day payment reduction from SOC to NOA receipt" },
            { when: "NOA accepted within 5 days", then: "No reduction — the period prices normally" }
          ],
          pseudocode: "noa = find_noa(member, soc_date)\nif not noa or (noa.received - soc_date).days > 5:\n  reduce(period, per_diem_days = days(soc_date, noa.received or bill_date))"
        },
        inputs: [
          { field: "Type of bill", source: "837I · 2300 · CLM05-1", example: "0322" },
          { field: "Start of care / admission date", source: "837I · 2300 · DTP*435", example: "2026-01-06" },
          { field: "Notice of Admission receipt", source: "External reference · NOA tracking", example: "none on file" },
          { field: "Home health period dates", source: "837I · 2300 · DTP*434", example: "2026-01-06 – 02-04" }
        ],
        output: { signal: "flag", emits: "HH_NOA_LATE", disposition: "Apply the per-day late-NOA payment reduction until the NOA posts", downstream: "Payment reduction applied · lead (Home health billing)" }
      },
      rule_dup_prof: {
        logic: {
          summary: "Possible duplicate professional claim: an 837P line matches a previously adjudicated line on rendering provider, beneficiary, date of service, procedure code and modifiers — an exact or suspect duplicate held before a second payment is made.",
          criteria: [
            { when: "Rendering NPI + member + DOS + CPT + modifiers match an adjudicated line", then: "Exact duplicate — deny the second line" },
            { when: "All keys match except billed amount or place of service", then: "Suspect duplicate — route to review" },
            { when: "Same key across two claims within a short window", then: "Hold the later claim pending review" }
          ],
          pseudocode: "key = (rendering_npi, member, dos, cpt, sorted(modifiers))\nif key in adjudicated_lines: deny('exact duplicate')\nelif near_match(key): review('suspect duplicate')"
        },
        inputs: [
          { field: "Rendering provider NPI", source: "837P · 2310B · NM1*82", example: "1…" },
          { field: "Member ID", source: "837P · 2010BA · NM1*IL", example: "MBR-…" },
          { field: "Date of service", source: "837P · 2400 · DTP*472", example: "2026-02-11" },
          { field: "Procedure + modifiers", source: "837P · 2400 · SV1-01", example: "99214" },
          { field: "Adjudicated-claim history", source: "External reference · claim data store", example: "prior paid line" }
        ],
        output: { signal: "flag", emits: "DUP_PROFESSIONAL", disposition: "Deny exact duplicates; hold suspect duplicates for review before a second payment", downstream: "Line adjudication CARC CO-18 (duplicate) · lead (Duplicate billing)" }
      },
      rule_ncd: {
        logic: {
          summary: "NCD medical-necessity edit: a service governed by a CMS National Coverage Determination is payable only when a covered indication is present — the claim's diagnoses must meet the NCD's medical-necessity criteria for the procedure.",
          criteria: [
            { when: "The procedure is governed by an NCD", then: "Load the NCD's covered ICD-10 indication list" },
            { when: "None of the claim's diagnoses is a covered indication", then: "Deny as not medically necessary under the NCD" },
            { when: "A covered indication is present but frequency limits are exceeded", then: "Review against the NCD frequency criteria" }
          ],
          pseudocode: "ncd = ncd_for(cpt)\nif ncd and not (claim.dx & ncd.covered_dx): deny('NCD not met')\nelif ncd and over_frequency(cpt, ncd): review('NCD frequency')"
        },
        inputs: [
          { field: "Procedure code (HCPCS/CPT)", source: "837 · 2400 · SV1/SV2", example: "G0297" },
          { field: "Diagnosis codes", source: "837 · 2300 · HI (ABK/ABF)", example: "Z87.891" },
          { field: "NCD policy + covered indications", source: "External reference · CMS NCD (e.g. 210.14)", example: "covered dx list" },
          { field: "Frequency / history", source: "Derived · beneficiary claim history", example: "1 / 12 mo" }
        ],
        output: { signal: "flag", emits: "NCD_MEDNEC_NOT_MET", disposition: "Deny lines with no covered indication; review frequency exceedances", downstream: "Line adjudication CARC CO-50 (not medically necessary) · lead (Medical necessity)" }
      }
    },
    getRuleDetail: function (ruleId) {
      var rule = this.getRuleCatalog().find(function (r) { return r.id === ruleId; });
      if (!rule) return null;
      var spec = this.RULE_DETAIL[ruleId];
      if (!spec) {
        // generic spec derived from the rule's own dimensions
        var claimLevel = rule.detectionLevel === "Claim-level";
        spec = {
          logic: {
            summary: rule.description,
            criteria: [
              { when: "The claim/provider matches the " + (rule.fraudType || "").toLowerCase() + " pattern this rule screens for", then: "Evaluate against the rule threshold" },
              { when: "The condition is met at the " + (rule.detectionLevel || "claim") + " level", then: "Raise a " + (rule.severity || "") + "-severity flag" }
            ],
            pseudocode: null
          },
          inputs: [
            { field: "Procedure / service code", source: claimLevel ? "837 · 2400 · SV1/SV2" : "Derived · claim history", example: "—" },
            { field: "Provider identifiers", source: "837 · 2010AA / 2310B · NM1", example: "NPI / TIN" },
            { field: rule.regulatorySource + " reference", source: "External reference", example: "—" }
          ],
          output: { signal: rule.detectionLevel === "Claim-level" ? "flag" : "flag + score", emits: rule.code + "_FLAG", disposition: "Route to " + (rule.detectionLevel === "Network-level" ? "network" : rule.detectionLevel === "Provider-pattern" ? "provider-pattern" : "claim") + " review", downstream: "Lead created (" + rule.fraudType + ")" }
        };
      }
      // applicable claim type + output process code (derived from the rule's dimensions)
      var claimTypeMap = { "Institutional": "837I (UB-04)", "Professional": "837P (CMS-1500)", "Pharmacy": "NCPDP D.0", "Provider": "837P / 837I", "Beneficiary": "837P / 837I / NCPDP" };
      var applicableClaimType = claimTypeMap[rule.entityType] || "837P / 837I";
      var opc = { flag: "PEND-01", "flag + score": "PEND-02" };
      var outputProcessCode = (spec.output && /deny|recover|bundled/i.test((spec.output.disposition || "") + (spec.output.emits || ""))) ? "DENY-01" : (opc[spec.output && spec.output.signal] || "PEND-01");
      return {
        id: rule.id, code: rule.code, name: rule.name, version: rule.version, effectiveDate: rule.effectiveDate, environment: rule.environment,
        effectiveDates: rule.effectiveDate + " → current", applicableClaimType: applicableClaimType, outputProcessCode: outputProcessCode,
        configScope: rule.configLevel || "Template — all programs; overridable per contract / plan",
        regulatorySource: rule.regulatorySource, entityType: rule.entityType, fraudType: rule.fraudType, detectionLevel: rule.detectionLevel, severity: rule.severity,
        logic: spec.logic, inputs: spec.inputs, output: spec.output
      };
    },

    getModels: function () { return D.models; },

    // ---- Emerging-rule discovery (Element 3.2.ii/iii) ----------------------
    // A pattern the models keep surfacing becomes a candidate RULE: proposed
    // logic, the data it needs, a suggested trigger, the expected output, and a
    // REPLAY over recent claims estimating the impact — then a human approves,
    // returns, or rejects it (HIL governance) before it can be promoted. All
    // deterministic/synthetic (no data.js regen). Mirrors the rule-detail shape
    // (logic / inputs / output) so an approved candidate drops straight into the
    // Rules Library and the release pipeline.
    getRuleCandidates: function () {
      return [
        {
          id: "cand_em_l5", name: "E/M level-5 over-representation → recode review",
          fraudType: "Upcoding", severity: "High", confidence: 88, status: "under-review",
          reviewer: "Dana Whitmore", discoveredAt: "2026-07-24",
          sourcePattern: { modelId: "model_em_peer", model: "E/M Peer-Group Profile", type: "Anomaly Detection",
            finding: "A cohort of internal-medicine providers bills 99215 (level 5) at a 90% share — > 3σ above the specialty peer mean of 11% — sustained across 11 consecutive months, not a one-quarter blip." },
          logic: {
            summary: "When a provider's level-5 established-office-visit share exceeds three standard deviations above the specialty peer mean over a rolling window, route the level-5 claims for documentation/recode review.",
            criteria: [
              { when: "Rendering specialty = Internal Medicine (or peer group of record)", then: "Load the specialty peer distribution for 99211–99215" },
              { when: "99215 share ≥ peer mean + 3σ across a rolling 6-month window", then: "Flag the provider cohort" },
              { when: "Pattern persists ≥ 6 of the trailing 12 months", then: "Emit recode-review candidate for each level-5 line" }
            ],
            pseudocode: "share = count(99215) / count(99211..99215)\nif share >= peer.mean + 3*peer.sigma\n   and months_persisted >= 6:\n     for line in claim.lines where line.cpt == '99215':\n        emit REVIEW(line, target='99213', basis='peer+doc')"
          },
          inputs: [
            { field: "Procedure code / level", source: "837P · SV101-1 (HC qualifier)", example: "99215" },
            { field: "Rendering specialty / taxonomy", source: "Provider registry · taxonomy", example: "207R00000X" },
            { field: "Peer distribution", source: "Analytics · specialty benchmark", example: "mean 11% · σ 4%" },
            { field: "Date of service", source: "837P · DTP*472", example: "2025-03-11" }
          ],
          trigger: "Post-pay retrospective · monthly provider-cohort scan",
          output: { signal: "Recode-review candidate", emits: "REVIEW · target 99213 · CARC 45 basis", disposition: "Route level-5 lines to documentation review; recover the level-of-service differential where unsupported", downstream: "Lead queue → case, with the recovery basis pre-computed" },
          impact: { window: "trailing 12 months", claimsMatched: 1240,
            dispositions: [{ label: "Flag for recode review", count: 1240, tone: "med" }],
            exposure: 512480 }
        },
        {
          id: "cand_res_los", name: "Residential stay beyond authorized LOS → recover unauthorized days",
          fraudType: "Length-of-stay abuse", severity: "Critical", confidence: 87, status: "approved",
          reviewer: "Karen Boyd", discoveredAt: "2026-07-19",
          sourcePattern: { modelId: "model_los", model: "Residential LOS & Network", type: "Anomaly Detection",
            finding: "Clusters of residential (H0018) stays bill 24–27 per-diem days against a 14-day authorization, with shared patients/registration across facilities in a holding-company chain." },
          logic: {
            summary: "When residential per-diem days billed exceed the authorized/continued-stay-approved length of stay, deny the days beyond authorization and set the recovery basis to those days × the per-diem rate.",
            criteria: [
              { when: "Bill contains H0018 residential per-diem units", then: "Read the prior-authorization approved days" },
              { when: "Units billed > approved days AND no continued-stay approval on file", then: "Compute unauthorized days = units − approved" },
              { when: "Unauthorized days > 0", then: "Deny those days; emit recovery = unauthorized days × per-diem rate" }
            ],
            pseudocode: "auth = priorAuth.approvedDays  # e.g. 14\nover = units - auth\nif over > 0 and not continuedStayApproved:\n   emit DENY(days=over, amount=over*perDiemRate, carc='16', rarc='N130')"
          },
          inputs: [
            { field: "Per-diem units (days)", source: "837I · SV205 units", example: "24" },
            { field: "Revenue code", source: "837I · SV2 rev code", example: "1002" },
            { field: "Authorized days", source: "UM / prior-auth record", example: "14" },
            { field: "Continued-stay review", source: "Clinical criteria · care guideline", example: "not met (day 15+)" }
          ],
          trigger: "Prepay edit + post-pay retrospective",
          output: { signal: "Unauthorized-days recovery", emits: "DENY · CARC 16 · RARC N130", disposition: "Deny days beyond authorization; recover per-diem × unauthorized days", downstream: "Release pipeline (approved) · case recovery basis" },
          impact: { window: "trailing 90 days", claimsMatched: 52,
            dispositions: [{ label: "Deny days over authorization", count: 52, tone: "high" }],
            exposure: 486200 }
        },
        {
          id: "cand_mod59", name: "Modifier-59 override rate spike → prepay unbundling edit",
          fraudType: "Unbundling", severity: "High", confidence: 84, status: "draft",
          reviewer: null, discoveredAt: "2026-07-28",
          sourcePattern: { modelId: "model_mod", model: "Modifier Abuse Pattern", type: "Anomaly Detection",
            finding: "A provider applies modifier 59 / X{EPSU} to NCCI column-2 codes at 6× the peer override rate — overrides concentrated on the 43235/43239 endoscopy pair." },
          logic: {
            summary: "When a provider's modifier-59 override rate on NCCI PTP edits exceeds the peer benchmark, pend the overridden lines pre-payment for documentation of a distinct procedural service.",
            criteria: [
              { when: "Line carries an NCCI PTP edit with modifier indicator 1", then: "Check for a 59 / X{EPSU} override" },
              { when: "Provider 59-override rate ≥ peer mean + 3σ", then: "Do not auto-honor the override" },
              { when: "Override present without distinct-service documentation", then: "Pend the column-2 line; deny as bundled if undocumented" }
            ],
            pseudocode: "if ptp.indicator == 1 and line.hasOverride(['59','XE','XS','XP','XU']):\n   if provider.overrideRate >= peer.mean + 3*peer.sigma:\n      emit PEND(line, need='distinct-service doc', elseDeny='bundled', carc='97')"
          },
          inputs: [
            { field: "CPT + modifiers", source: "837P · SV101-1..5", example: "43235-59" },
            { field: "NCCI PTP edit + indicator", source: "NCCI edit file", example: "43239→43235 · ind 1" },
            { field: "Provider override rate", source: "Analytics · modifier benchmark", example: "48% vs peer 8%" },
            { field: "Supporting documentation", source: "Records / provider portal", example: "not on file" }
          ],
          trigger: "Prepay · at adjudication (before payment)",
          output: { signal: "Unbundling prepay edit", emits: "PEND → DENY (bundled) · CARC 97 · RARC N19", disposition: "Pend for documentation; deny the column-2 line as bundled if undocumented", downstream: "Prepay hold queue; releases to pay on documented distinct service" },
          impact: { window: "trailing 6 months", claimsMatched: 210,
            dispositions: [{ label: "Pend for documentation", count: 210, tone: "med" }, { label: "Deny if undocumented", count: 156, tone: "high" }],
            exposure: 233900 }
        },
        {
          id: "cand_daw1_nondispense", name: "Brand DAW-1, generic available, no pickup → non-dispense pend",
          fraudType: "Pharmacy / non-dispense", severity: "High", confidence: 81, status: "draft",
          reviewer: null, discoveredAt: "2026-07-27",
          sourcePattern: { modelId: "model_freq", model: "Pharmacy dispensing-pattern monitor", type: "Anomaly Detection",
            finding: "Brand drugs billed with DAW 1 (dispense-as-written) when an A-rated generic is available, with no corresponding pickup/refill-adherence signal for the quantity billed." },
          logic: {
            summary: "When a brand NDC is billed with DAW 1 while an A-rated generic equivalent exists and there is no dispensing/pickup record for the billed quantity, pend the claim for pharmacy verification before payment.",
            criteria: [
              { when: "NDC is brand and DAW code = 1", then: "Check the generic-equivalence (orange-book) table" },
              { when: "An A-rated generic exists AND no documented medical necessity", then: "Flag DAW misuse" },
              { when: "No pickup / adherence record for the billed days-supply", then: "Pend as potential non-dispense" }
            ],
            pseudocode: "if ndc.isBrand and claim.daw == 1 and generic.available(ndc)\n   and not medicalNecessity and not pickupRecord(qty):\n     emit PEND(reason='DAW-misuse/non-dispense', carc='16', rarc='M123')"
          },
          inputs: [
            { field: "NDC + DAW code", source: "NCPDP D.0 · 407-D7 / 408-D8", example: "00000-0000-00 · DAW 1" },
            { field: "Generic equivalence", source: "Orange Book reference", example: "A-rated generic available" },
            { field: "Quantity / days supply", source: "NCPDP D.0 · 442-E7 / 405-D5", example: "90 · 30d" },
            { field: "Pickup / adherence signal", source: "Dispensing / refill record", example: "none on file" }
          ],
          trigger: "Prepay · pharmacy point-of-sale edit",
          output: { signal: "DAW-misuse / non-dispense", emits: "PEND · CARC 16 · RARC M123", disposition: "Pend for pharmacy verification; deny if non-dispense confirmed", downstream: "Pharmacy verification queue" },
          impact: { window: "trailing 90 days", claimsMatched: 86,
            dispositions: [{ label: "Pend for pharmacy verification", count: 86, tone: "med" }],
            exposure: 74300 }
        },
        {
          id: "cand_identity_shared", name: "One member ID across ≥6 providers in 21 days → identity review",
          fraudType: "Identity / eligibility", severity: "Critical", confidence: 79, status: "under-review",
          reviewer: "Dana Whitmore", discoveredAt: "2026-07-26",
          sourcePattern: { modelId: "model_los", model: "Beneficiary identity graph", type: "Anomaly Detection",
            finding: "A single member ID appears on claims from ≥ 6 distinct providers within a 21-day window across ≥ 3 states — a velocity/geography pattern inconsistent with one member's care." },
          logic: {
            summary: "When one member ID is billed by an improbable number of distinct providers across multiple states in a short window, route the beneficiary's claims to identity/eligibility review before further payment.",
            criteria: [
              { when: "Group claims by member ID over a rolling 21-day window", then: "Count distinct billing providers and states" },
              { when: "Distinct providers ≥ 6 AND distinct states ≥ 3", then: "Flag the member-ID cluster" },
              { when: "Velocity inconsistent with continuity-of-care", then: "Emit identity-review candidate for the cluster" }
            ],
            pseudocode: "g = claims.groupBy(memberId, window='21d')\nif g.distinct(provider) >= 6 and g.distinct(state) >= 3:\n   emit REVIEW(memberId, type='identity/eligibility', hold=true)"
          },
          inputs: [
            { field: "Member ID", source: "837 · subscriber 2010BA NM109", example: "MBR-148697" },
            { field: "Billing provider NPI", source: "837 · 2010AA NM109", example: "1326579229" },
            { field: "Provider state", source: "Provider registry", example: "TX / CA / NV" },
            { field: "Date of service", source: "837 · DTP*472", example: "2025-03-11" }
          ],
          trigger: "Prepay + post-pay · nightly beneficiary-graph scan",
          output: { signal: "Identity / eligibility review", emits: "REVIEW · hold · route to eligibility", disposition: "Hold and route the member-ID cluster to identity/eligibility review", downstream: "Identity review queue; cross-links the provider network" },
          impact: { window: "trailing 21 days", claimsMatched: 34,
            dispositions: [{ label: "Route to identity review", count: 34, tone: "high" }],
            exposure: 129600 }
        }
      ].map(function (c) {
        // each recommendation also carries provider attributes + a historical lookback
        var extra = {
          cand_em_l5: { providerAttributes: "Specialty · taxonomy · claim volume · established-patient panel size", lookback: "Rolling 12 months (min. 6 months of history)" },
          cand_res_los: { providerAttributes: "Facility type · licensed/staffed beds · prior-auth pattern · chain affiliation", lookback: "Trailing 90 days + auth history" },
          cand_mod59: { providerAttributes: "Specialty · peer override rate · NCCI-pair concentration · documentation-support rate", lookback: "Trailing 6 months" },
          cand_daw1_nondispense: { providerAttributes: "Pharmacy type · brand/generic mix · adherence/pickup cadence", lookback: "Trailing 90 days" },
          cand_identity_shared: { providerAttributes: "Distinct billers · states · velocity · shared-member overlap", lookback: "Rolling 21-day window" }
        }[c.id] || { providerAttributes: "Specialty · taxonomy · volume", lookback: "Trailing 12 months" };
        c.providerAttributes = extra.providerAttributes; c.lookback = extra.lookback;
        return c;
      });
    },

    // ---- feature discovery / creation (Element 3.2.ii) ---------------------
    // When a running model surfaces an anomaly, users can create a new FEATURE to
    // capture it. The flagship example: a K-means model on Sleep Apnea surfaces
    // anomalous expensive dental orthotics; a dual-classification feature ties the
    // orthotic HCPCS to a required prior sleep-study procedure. Deterministic.
    getFeatureLibrary: function () {
      return {
        totalRecommended: 88,
        note: "The solution recommends up to 88 features/metrics as the best fit for a dual-classification feature; several measure whether a prior procedure was performed.",
        example: {
          trigger: "K-means model on Sleep Apnea diagnoses began flagging anomalous claims for expensive dental orthotics.",
          policy: "New policy: these orthotics may not be prescribed without a prior sleep study.",
          type: "Dual-classification feature",
          classA: { label: "Expensive dental orthotics", codes: ["E0486", "D5911", "D5912"], system: "HCPCS / CDT" },
          classB: { label: "Prior sleep study (required)", codes: ["95810", "95811", "G0398"], system: "CPT / HCPCS" },
          measure: "Flags a class-A orthotic when no class-B sleep study is found in the member's prior claim history — closing the avenue for fraud.",
          priorProcedure: true
        },
        recommended: [
          { name: "Prior procedure performed", methodology: "Boolean — was a required predecessor procedure billed in the lookback window", priorProcedure: true },
          { name: "Days since prior procedure", methodology: "Interval between the required predecessor and the current service", priorProcedure: true },
          { name: "Dual-classification match", methodology: "Class-A code present AND class-B code absent in history", priorProcedure: true },
          { name: "Provider specialty mismatch", methodology: "Billed procedure outside the provider's taxonomy scope", priorProcedure: false },
          { name: "Unit-per-day z-score", methodology: "Standardized units vs code/day norm", priorProcedure: false },
          { name: "Peer-cost percentile", methodology: "Line cost vs specialty peer distribution", priorProcedure: false }
        ]
      };
    },

    // ---- PEND-activity analysis (Element 3.2.ii) ---------------------------
    // Which rules fire, how often, and with what downstream disposition — surfacing
    // rule gaps, redundant pends, and automation opportunities. Deterministic.
    getPendActivity: function () {
      return {
        window: "trailing 90 days",
        rows: [
          { rule: "EM-LEVEL", name: "E/M level validation", fired: 4820, pend: 4820, overturnRate: "61%", disposition: "Pend → records; 61% upheld", flag: "High overturn — tighten threshold" },
          { rule: "NCCI-PTP", name: "NCCI procedure-to-procedure", fired: 3110, pend: 0, overturnRate: "4%", disposition: "Auto-deny (bundled)", flag: "Stable — candidate to keep automated" },
          { rule: "MOD-59", name: "Modifier-59 / X{EPSU} misuse", fired: 2740, pend: 2610, overturnRate: "38%", disposition: "Pend → documentation", flag: "Redundant with NCCI-PTP on 43235/43239 — consolidate" },
          { rule: "MUE", name: "Medically unlikely edits", fired: 1290, pend: 40, overturnRate: "2%", disposition: "Auto-adjust units", flag: "Stable" },
          { rule: "LEIE-EXCL", name: "OIG LEIE exclusion", fired: 61, pend: 0, overturnRate: "0%", disposition: "Auto-deny + refer", flag: "Stable" },
          { rule: "AUTH-LOS", name: "Residential LOS vs authorization", fired: 512, pend: 512, overturnRate: "12%", disposition: "Pend → continued-stay review", flag: "Automation opportunity — auto-deny days over auth" }
        ],
        insights: [
          { kind: "gap", text: "No rule currently screens beneficiary-identity velocity — a rule gap the models surfaced (see candidate below)." },
          { kind: "redundant", text: "MOD-59 and NCCI-PTP both fire on the 43235/43239 pair 38% of the time — consolidate to cut redundant pends." },
          { kind: "automation", text: "AUTH-LOS pends every stay but only 12% overturn — days beyond authorization can be auto-denied, freeing reviewer time." }
        ]
      };
    },

    // ---- AI model registry (Element 3.1.i/ii) ------------------------------
    // The models behind the analytics, as a governed catalog: type, version,
    // status, the healthcare task each performs, how it was trained, its feature
    // DRIVER TABLE (each input + the calculation methodology behind it), the data
    // period it learned from, and its performance. Superset of getModels() — the
    // four production anomaly models keep their ids/names. Static/deterministic.
    MODEL_TYPE_ORDER: ["Anomaly Detection", "Predictive (supervised)", "Clustering (unsupervised)", "Natural Language Processing", "Ensemble"],
    getModelRegistry: function () {
      var f = function (name, methodology, weight) { return { name: name, methodology: methodology, weight: weight }; };
      return [
        // ---------- Anomaly Detection (the four production models) ----------
        {
          id: "model_em_peer", name: "E/M Peer-Group Profile", type: "Anomaly Detection", version: "v2.1", status: "production",
          healthcareTask: "Detect E/M up-coding — providers whose evaluation-and-management level mix deviates from specialty peers.",
          trainingMethod: "Unsupervised · robust z-scoring against specialty peer cohorts", dataPeriod: "2023-01 → 2025-06 (30 mo)", lastTrained: "2026-06-18",
          performance: { flagRate: "1.7%", precision: "0.84", recall: "0.79", auc: "0.91" }, prepayEnabled: false,
          features: [
            f("Level-5 share", "count(99215) ÷ count(99211..99215), per provider per month"),
            f("Peer deviation (σ)", "(provider share − peer mean) ÷ peer σ, specialty-matched"),
            f("Persistence", "consecutive months share ≥ mean + 3σ over trailing 12"),
            f("Volume weight", "log(claim volume) — damps low-volume noise")
          ],
          versions: [{ version: "v2.1", date: "2026-06-18", change: "Specialty peer cohorts refreshed to CY2025 taxonomy" }, { version: "v2.0", date: "2026-01-12", change: "Switched mean/σ to robust (median/MAD) estimators" }]
        },
        {
          id: "model_freq", name: "Per-Patient Frequency", type: "Anomaly Detection", version: "v1.6", status: "production",
          healthcareTask: "Detect over-utilization — procedure frequency far above per-patient norms.",
          trainingMethod: "Unsupervised · Poisson rate model per code × cohort", dataPeriod: "2023-01 → 2025-06", lastTrained: "2026-05-30",
          performance: { flagRate: "0.9%", precision: "0.71", recall: "0.83", auc: "0.88" }, prepayEnabled: true,
          features: [
            f("Per-patient rate", "units of code ÷ distinct patients ÷ period"),
            f("Expected rate", "cohort Poisson λ for the code + diagnosis"),
            f("Rate ratio", "observed ÷ expected, capped and log-scaled"),
            f("Clinical-standing offset", "down-weights standing orders (e.g. ESRD dialysis M/W/F)")
          ],
          versions: [{ version: "v1.6", date: "2026-05-30", change: "Added standing-order offset to cut ESRD false positives" }]
        },
        {
          id: "model_mod", name: "Modifier Abuse Pattern", type: "Anomaly Detection", version: "v1.3", status: "production",
          healthcareTask: "Detect unbundling — abnormal modifier-59 / X{EPSU} override rates vs peers.",
          trainingMethod: "Unsupervised · peer-relative override-rate scoring", dataPeriod: "2023-06 → 2025-06", lastTrained: "2026-06-02",
          performance: { flagRate: "1.1%", precision: "0.77", recall: "0.74", auc: "0.86" }, prepayEnabled: true,
          features: [
            f("59-override rate", "lines with 59/X{EPSU} on a PTP edit ÷ eligible lines"),
            f("Peer deviation (σ)", "provider override rate vs specialty peer mean/σ"),
            f("PTP-pair concentration", "Herfindahl index over which code pairs are overridden"),
            f("Documentation-support rate", "prior overrides upheld on records review")
          ],
          versions: [{ version: "v1.3", date: "2026-06-02", change: "Weighted by NCCI modifier indicator (0 vs 1)" }]
        },
        {
          id: "model_los", name: "Residential LOS & Network", type: "Anomaly Detection", version: "v1.4", status: "production",
          healthcareTask: "Detect residential length-of-stay abuse + shared-patient clusters across facilities.",
          trainingMethod: "Unsupervised · threshold-clustering + bipartite patient-sharing graph", dataPeriod: "2023-01 → 2025-06", lastTrained: "2026-06-10",
          performance: { flagRate: "0.6%", precision: "0.82", recall: "0.80", auc: "0.90" }, prepayEnabled: true,
          features: [
            f("Days-over-authorization", "per-diem units billed − prior-auth approved days"),
            f("Just-under-threshold density", "share of stays clustered just below review thresholds"),
            f("Shared-patient edges", "count of members appearing at ≥2 facilities in a window"),
            f("Common-registration signal", "shared address / phone / ownership across facilities")
          ],
          versions: [{ version: "v1.4", date: "2026-06-10", change: "Added common-registration signal to the network layer" }]
        },
        {
          id: "model_pharmacy_daw", name: "Pharmacy Non-Dispense Detector", type: "Anomaly Detection", version: "v0.9", status: "training",
          healthcareTask: "Detect DAW-1 brand billing with no dispensing/pickup signal for the billed quantity.",
          trainingMethod: "Unsupervised · adherence-gap scoring on NCPDP claims", dataPeriod: "2024-01 → 2025-06", lastTrained: "2026-07-20",
          performance: { flagRate: "0.4%", precision: "0.68", recall: "0.72", auc: "0.83" }, prepayEnabled: false,
          features: [
            f("DAW-1 brand rate", "share of brand fills with DAW 1 where an A-rated generic exists"),
            f("Adherence gap", "billed days-supply ÷ observed refill/pickup cadence"),
            f("Quantity anomaly", "z-score of billed quantity vs drug/day norms"),
            f("Generic-availability flag", "Orange Book A-rating for the NDC")
          ],
          versions: [{ version: "v0.9", date: "2026-07-20", change: "Initial training build — pending QA before promotion" }]
        },
        // ---------- Predictive (supervised) ----------
        {
          id: "model_drg_predict", name: "DRG Prediction", type: "Predictive (supervised)", version: "v1.2", status: "production",
          healthcareTask: "Predict the expected MS-DRG from coded diagnoses/procedures to catch mis-grouping (e.g. unsupported MCC).",
          trainingMethod: "Supervised · gradient-boosted trees on grouped inpatient claims", dataPeriod: "2022-10 → 2025-06", lastTrained: "2026-06-14",
          performance: { topOneAccuracy: "0.93", precision: "0.90", recall: "0.88", auc: "0.95" }, prepayEnabled: true,
          features: [
            f("Principal diagnosis", "ICD-10-CM principal → DRG base category (MDC)"),
            f("Secondary dx / CC-MCC", "presence + POA of complication/comorbidity codes"),
            f("ICD-10-PCS procedures", "procedure cluster embeddings"),
            f("Discharge status / LOS", "disposition + length of stay features")
          ],
          versions: [{ version: "v1.2", date: "2026-06-14", change: "Retrained on FFY2025 MS-DRG definitions" }]
        },
        {
          id: "model_fraud_sim", name: "Known-Scheme Similarity", type: "Predictive (supervised)", version: "v2.0", status: "production",
          healthcareTask: "Score a provider/claim's similarity to previously adjudicated FWA schemes.",
          trainingMethod: "Supervised · gradient boosting on labeled closed cases (confirmed vs cleared)", dataPeriod: "2021-01 → 2025-06", lastTrained: "2026-06-20",
          performance: { flagRate: "1.3%", precision: "0.86", recall: "0.81", auc: "0.93" }, prepayEnabled: false,
          features: [
            f("Scheme fingerprint distance", "distance to centroids of confirmed-fraud case clusters"),
            f("Billing-pattern vector", "code mix, modifier mix, POS mix embedding"),
            f("Network exposure", "graph proximity to sanctioned / excluded entities"),
            f("Temporal burst", "claim velocity spikes vs the provider's own baseline")
          ],
          versions: [{ version: "v2.0", date: "2026-06-20", change: "Rebuilt on expanded labeled case set (+1,940 closed cases)" }]
        },
        // ---------- Clustering (unsupervised) ----------
        {
          id: "model_dx_cluster", name: "Diagnosis-Cohort Clustering", type: "Clustering (unsupervised)", version: "v1.1", status: "production",
          healthcareTask: "Cluster providers by diagnosis/procedure mix to surface outliers against their true peer group.",
          trainingMethod: "Unsupervised · k-means (k=48) on TF-IDF code-mix vectors", dataPeriod: "2023-01 → 2025-06", lastTrained: "2026-05-22",
          performance: { silhouette: "0.61", clusters: "48", flagRate: "2.0%", coverage: "0.97" }, prepayEnabled: false,
          features: [
            f("Code-mix vector", "TF-IDF over the provider's CPT/HCPCS distribution"),
            f("Diagnosis profile", "ICD-10-CM chapter distribution"),
            f("Cluster distance", "distance from the assigned k-means centroid"),
            f("Silhouette / fit", "how well the provider fits its nearest cluster")
          ],
          versions: [{ version: "v1.1", date: "2026-05-22", change: "Re-fit centroids; k tuned 40 → 48 by silhouette" }]
        },
        // ---------- Natural Language Processing ----------
        {
          id: "model_doc_nlp", name: "Documentation–Coding Consistency", type: "Natural Language Processing", version: "v0.8", status: "candidate",
          healthcareTask: "Read the clinical record and check whether documentation supports the coded service level.",
          trainingMethod: "Fine-tuned clinical language model on note ↔ code pairs", dataPeriod: "2024-01 → 2025-06", lastTrained: "2026-07-15",
          performance: { agreement: "0.87", precision: "0.83", recall: "0.80", auc: "0.89" }, prepayEnabled: false,
          features: [
            f("Documented complexity", "extracted history/exam/MDM elements → supported E/M level"),
            f("Code-vs-note gap", "billed level − documentation-supported level"),
            f("Missing-element flags", "required elements absent from the note"),
            f("Confidence / abstention", "model self-confidence; abstains to human review when low")
          ],
          versions: [{ version: "v0.8", date: "2026-07-15", change: "Candidate build — in shadow evaluation, not enforcing" }]
        },
        {
          id: "model_pattern_summ", name: "Pattern Summarization (xAI)", type: "Natural Language Processing", version: "v1.0", status: "production",
          healthcareTask: "Generate the plain-language explanation of why a lead was flagged (the xAI narrative).",
          trainingMethod: "Retrieval-grounded generation over the firing rules + model drivers", dataPeriod: "grounded (no training on claims)", lastTrained: "2026-06-25",
          performance: { faithfulness: "0.95", groundedness: "0.97", humanRating: "4.5 / 5" }, prepayEnabled: false,
          features: [
            f("Driver retrieval", "top contributing features + fired rules for the lead"),
            f("Evidence grounding", "cites claim lines, edits and thresholds — no free invention"),
            f("Readability control", "reviewer-grade plain-language generation"),
            f("Hallucination guard", "answers only from retrieved evidence; abstains otherwise")
          ],
          versions: [{ version: "v1.0", date: "2026-06-25", change: "Groundedness guard added; faithfulness 0.95" }]
        },
        // ---------- Ensemble ----------
        {
          id: "model_risk_ensemble", name: "Provider Risk Ensemble", type: "Ensemble", version: "v2.2", status: "production",
          healthcareTask: "Combine the anomaly, predictive and network models into the single provider risk score.",
          trainingMethod: "Ensemble · stacked logistic meta-learner over member-model scores", dataPeriod: "2022-01 → 2025-06", lastTrained: "2026-06-28",
          performance: { flagRate: "1.5%", precision: "0.88", recall: "0.85", auc: "0.94" }, prepayEnabled: true,
          features: [
            f("Member-model scores", "calibrated outputs of the anomaly + predictive models"),
            f("Network risk", "graph exposure to excluded/sanctioned/collusive entities"),
            f("Exposure magnitude", "dollar exposure of the underlying flagged claims"),
            f("Meta-learner weights", "stacked logistic regression combining the signals")
          ],
          versions: [{ version: "v2.2", date: "2026-06-28", change: "Re-calibrated weights after DRG-prediction model added" }, { version: "v2.1", date: "2026-03-05", change: "Isotonic calibration of member-model scores" }]
        }
      ];
    },

    // ---- Code libraries (Element 1.1.iv / 1.2) -----------------------------
    // The reference code sets the system reads a claim against — each with its code
    // system, edition, update cycle, effective date, an approximate published
    // size, and sample entries. Entries reuse the maps already in the DP (ICD10,
    // ICD10PCS, CARC/RARC, modifiers) so nothing is duplicated or regenerated.
    CPT_DESC: {
      "99211": "Office/outpatient visit, established, level 1", "99212": "Office/outpatient visit, established, level 2",
      "99213": "Office/outpatient visit, established, level 3", "99214": "Office/outpatient visit, established, level 4",
      "99215": "Office/outpatient visit, established, level 5", "99283": "Emergency department visit, level 3",
      "99284": "Emergency department visit, level 4", "93000": "Electrocardiogram, complete (with interpretation)",
      "71046": "Radiologic exam, chest, 2 views", "70551": "MRI, brain (including brain stem), without contrast",
      "43235": "Esophagogastroduodenoscopy (EGD), diagnostic", "43239": "EGD with biopsy, single/multiple",
      "90935": "Hemodialysis procedure with single physician evaluation", "20610": "Arthrocentesis, major joint/bursa",
      "97110": "Therapeutic exercise, each 15 minutes", "97140": "Manual therapy techniques, each 15 minutes",
      "H0018": "Behavioral health, short-term residential, per diem (HCPCS)", "E1390": "Oxygen concentrator, single delivery (HCPCS)",
      "D0120": "Periodic oral evaluation, established patient (CDT)", "D1110": "Prophylaxis, adult (CDT)"
    },
    REVENUE_DESC: {
      "0250": "Pharmacy — general", "0300": "Laboratory — general", "0350": "CT scan — general",
      "0450": "Emergency room — general", "0636": "Drugs requiring detailed coding",
      "0900": "Behavioral health treatment/services — general", "1002": "Behavioral health — residential treatment (per diem)"
    },
    TOB_DESC: {
      "111": "Hospital · inpatient · admit-through-discharge claim", "131": "Hospital · outpatient · admit-through-discharge claim",
      "851": "Critical access hospital · admit-through-discharge", "861": "Special facility · residential · admit-through-discharge",
      "721": "Clinic · ESRD (renal dialysis) · admit-through-discharge"
    },
    TAXONOMY_DESC: {
      "207R00000X": "Internal Medicine — physician", "207RC0000X": "Cardiovascular Disease — physician",
      "2084N0400X": "Psychiatry & Neurology — Neurology", "324500000X": "Substance Abuse Rehabilitation Facility",
      "282N00000X": "General Acute Care Hospital", "2472R0900X": "Independent Diagnostic Testing Facility"
    },
    MOD_EXTRA: { "XE": "Separate encounter", "XP": "Separate practitioner" },
    VALUE_CODE_DESC: {
      "01": "Most common semi-private room rate", "05": "Professional component included in charges",
      "14": "No-fault including auto/other", "24": "New technology add-on payment",
      "80": "Covered days", "81": "Non-covered days", "A2": "Home health inpatient deductible", "D3": "Estimated responsibility — payer"
    },
    CONDITION_CODE_DESC: {
      "01": "Military service related", "02": "Condition is employment related",
      "04": "Information only bill", "20": "Beneficiary requested billing",
      "44": "Inpatient admission changed to outpatient", "A6": "Pneumococcal/influenza vaccine",
      "C1": "Approved as billed (medical review)", "D9": "Any other change (claim adjustment)", "W2": "Duplicate of original bill"
    },
    getCodeLibraries: function () {
      return [
        { id: "cpt", name: "CPT / HCPCS Level II", system: "AMA CPT® + CMS HCPCS", edition: "CY2025", cycle: "Annual (Jan) + quarterly HCPCS updates", effective: "2025-01-01", approxCount: "~10,900", icon: "code" },
        { id: "icd10cm", name: "ICD-10-CM diagnoses", system: "CDC/CMS ICD-10-CM", edition: "FY2025", cycle: "Annual (Oct 1) + April addenda", effective: "2024-10-01", approxCount: "~73,000", icon: "stethoscope" },
        { id: "icd10pcs", name: "ICD-10-PCS procedures", system: "CMS ICD-10-PCS", edition: "FY2025", cycle: "Annual (Oct 1)", effective: "2024-10-01", approxCount: "~78,200", icon: "medical-cross" },
        { id: "revenue", name: "Revenue codes (UB-04)", system: "NUBC UB-04", edition: "2025", cycle: "As published by the NUBC", effective: "2025-01-01", approxCount: "~800", icon: "receipt" },
        { id: "tob", name: "Type of bill (UB-04)", system: "NUBC UB-04", edition: "2025", cycle: "As published by the NUBC", effective: "2025-01-01", approxCount: "~120", icon: "file-invoice" },
        { id: "value", name: "Value codes (UB-04)", system: "NUBC UB-04", edition: "2025", cycle: "As published by the NUBC", effective: "2025-01-01", approxCount: "~180", icon: "coin" },
        { id: "condition", name: "Condition codes (UB-04)", system: "NUBC UB-04", edition: "2025", cycle: "As published by the NUBC", effective: "2025-01-01", approxCount: "~110", icon: "clipboard-list" },
        { id: "modifiers", name: "CPT / HCPCS modifiers", system: "AMA CPT® + CMS NCCI", edition: "CY2025", cycle: "Annual + quarterly NCCI", effective: "2025-01-01", approxCount: "~360", icon: "adjustments-alt" },
        { id: "carc", name: "Claim Adjustment Reason Codes", system: "X12 / WPC (CARC)", edition: "2025", cycle: "Triannual (X12)", effective: "2025-03-01", approxCount: "~400", icon: "arrows-diff" },
        { id: "rarc", name: "Remittance Advice Remark Codes", system: "CMS / WPC (RARC)", edition: "2025", cycle: "Triannual (X12)", effective: "2025-03-01", approxCount: "~1,100", icon: "message-report" },
        { id: "taxonomy", name: "Provider taxonomy (NUCC)", system: "NUCC Health Care Provider Taxonomy", edition: "2025", cycle: "Semi-annual (Jan / Jul)", effective: "2025-01-01", approxCount: "~870", icon: "id-badge" }
      ];
    },
    getCodeLibrary: function (id) {
      var self = this, meta = this.getCodeLibraries().filter(function (l) { return l.id === id; })[0];
      if (!meta) return null;
      var fromMap = function (m, cat) { return Object.keys(m).map(function (k) { var v = m[k]; return typeof v === "string" ? { code: k, description: v, category: cat } : { code: k, description: v.label || v.name || k, category: cat || v.group }; }); };
      var entries = [];
      if (id === "cpt") entries = fromMap(this.CPT_DESC);
      else if (id === "icd10cm") entries = fromMap(this.ICD10);
      else if (id === "icd10pcs") entries = fromMap(this.ICD10PCS);
      else if (id === "revenue") entries = fromMap(this.REVENUE_DESC);
      else if (id === "tob") entries = fromMap(this.TOB_DESC);
      else if (id === "value") entries = fromMap(this.VALUE_CODE_DESC);
      else if (id === "condition") entries = fromMap(this.CONDITION_CODE_DESC);
      else if (id === "taxonomy") entries = fromMap(this.TAXONOMY_DESC);
      else if (id === "modifiers") entries = Object.keys(this.CPT_XWALK.mod).map(function (k) { var d = self.CPT_XWALK.mod[k]; return { code: k, description: d.name, category: d.note }; }).concat(Object.keys(this.MOD_EXTRA).map(function (k) { return { code: k, description: self.MOD_EXTRA[k], category: "NCCI-specific subset of modifier 59" }; }));
      else if (id === "carc") entries = Object.keys(this.CARC_CATALOG).map(function (k) { var d = self.CARC_CATALOG[k]; return { code: k, description: d.label, category: d.group + " · " + d.kind }; });
      else if (id === "rarc") entries = fromMap(this.RARC_CATALOG);
      entries.sort(function (a, b) { return String(a.code).localeCompare(String(b.code), undefined, { numeric: true }); });
      return { meta: meta, entries: entries, sampleNote: "Sample entries — the full " + meta.name + " set (" + meta.approxCount + " codes) is loaded in production; a representative slice is shown here." };
    },

    // ---- CMS pricing methodologies registry (Element 2.1.i) ----------------
    // The pricing methodologies the platform supports, and how the right one is
    // selected for a claim. Static/deterministic. Un-attributed.
    getPricingMethodologies: function () {
      var M = function (name, claimType, basis, status, note) { return { name: name, claimType: claimType, basis: basis, status: status, note: note }; };
      return {
        selectionFactors: [
          "Date of service (selects the effective fee schedule / pricer version)",
          "Provider & facility attributes (type, specialty, network participation)",
          "Geographic locality / CBSA wage index",
          "Site of service (facility vs non-facility)",
          "Applicable fee schedule or contracted rate"
        ],
        methodologies: [
          M("IPPS — MS-DRG", "837I inpatient", "MS-DRG relative weight × wage-adjusted base + capital + DSH + IME", "active", "Acute inpatient prospective payment."),
          M("OPPS — APC", "837I outpatient", "APC payment rate × wage/locality; status-indicator driven", "active", "Hospital outpatient prospective payment."),
          M("MPFS", "837P professional", "Σ(RVU × GPCI) × conversion factor × modifiers", "active", "Medicare Physician Fee Schedule."),
          M("DMEPOS fee schedule", "837P / DME", "DMEPOS fee-schedule amount × locality", "active", "Durable medical equipment, prosthetics, orthotics & supplies."),
          M("Ambulance fee schedule", "837P", "Base rate + mileage × geographic adjustment", "active", "Ground/air ambulance transport."),
          M("Clinical laboratory fee schedule", "837P", "CLFS amount per test (NLA where applicable)", "active", "Clinical diagnostic laboratory."),
          M("ASP drug pricing", "837P / 837I", "ASP + 6% (quarterly file), per HCPCS/NDC", "active", "Part B drug pricing — quarterly ASP."),
          M("IRF PPS", "837I", "CMG relative weight × IRF base rate", "active", "Inpatient rehabilitation facility."),
          M("LTCH PPS", "837I", "MS-LTC-DRG × LTCH standard rate", "active", "Long-term care hospital."),
          M("IPF PPS", "837I", "Per-diem base × patient/facility adjustments", "active", "Inpatient psychiatric facility."),
          M("SNF PPS (PDPM)", "837I", "PDPM case-mix per-diem components", "active", "Skilled nursing facility."),
          M("ASC payment", "837I / 837P", "ASC rate (APC-derived) × wage index", "active", "Ambulatory surgical center."),
          M("ESRD PPS", "837I", "Per-treatment base × case-mix + adjustments", "active", "End-stage renal disease / dialysis."),
          M("Home Health PPS (PDGM)", "837I", "30-day period payment × case-mix (PDGM)", "active", "Home health.")
        ]
      };
    },

    // ---- EDI dashboard (Element 1.1.i/iii/iv) ------------------------------
    // Transaction-set volumes, acknowledgment stats and status by X12 set —
    // the intake health of the claims pipeline. Static/deterministic (no regen).
    getEdiDashboard: function () {
      var set = function (code, name, dir, vol, accepted, rejected, pending, ackHrs) {
        return { code: code, name: name, direction: dir, volume: vol, accepted: accepted, rejected: rejected, pending: pending, acceptRate: Math.round((accepted / vol) * 1000) / 10, ackHrs: ackHrs };
      };
      var sets = [
        set("837P", "Professional claim", "inbound", 48210, 47180, 612, 418, 1.4),
        set("837I", "Institutional claim", "inbound", 12640, 12190, 351, 99, 1.8),
        set("837D", "Dental claim", "inbound", 3120, 3038, 61, 21, 1.5),
        set("835", "Remittance advice", "outbound", 57340, 57340, 0, 0, 0.6),
        set("834", "Benefit enrollment", "inbound", 2210, 2189, 12, 9, 3.2),
        set("270/271", "Eligibility inquiry/response", "both", 61870, 61540, 44, 286, 0.3),
        set("276/277", "Claim status inquiry/response", "both", 18450, 18280, 31, 139, 0.5),
        set("999", "Functional acknowledgment", "outbound", 66180, 66180, 0, 0, 0.2)
      ];
      var inbound = sets.filter(function (s) { return s.direction !== "outbound"; });
      var totalVol = sets.reduce(function (a, s) { return a + s.volume; }, 0);
      var totalRej = sets.reduce(function (a, s) { return a + s.rejected; }, 0);
      var totalAcc = inbound.reduce(function (a, s) { return a + s.accepted; }, 0);
      var inVol = inbound.reduce(function (a, s) { return a + s.volume; }, 0);
      // 14-day inbound-claim volume trend (deterministic, for a sparkline)
      var trend = [6100, 6320, 5980, 6410, 6550, 6180, 3210, 2980, 6480, 6720, 6600, 6390, 6510, 6240];
      var rejReasons = [
        { code: "IK3/IK4 · segment", label: "Invalid/missing segment or element", pct: 34 },
        { code: "AK9 · rejected", label: "Functional group rejected (structure)", pct: 22 },
        { code: "277CA · A3", label: "Returned as unprocessable — payer/member mismatch", pct: 19 },
        { code: "277CA · A7", label: "Invalid provider identifier (NPI)", pct: 14 },
        { code: "999 · IK5", label: "Implementation-guide non-compliance", pct: 11 }
      ];
      return {
        asOf: "trailing 30 days", standard: "X12 005010 · HIPAA / CAQH CORE",
        totals: { transactions: totalVol, inboundClaims: inVol, acceptRate: Math.round((totalAcc / inVol) * 1000) / 10, rejected: totalRej, avgAckHrs: 0.9, ta1Errors: 3 },
        sets: sets, trend: trend, rejReasons: rejReasons
      };
    },

    // ---- CI/CD & release management (Round 6 Phase E) ---------------------
    // Simulated release pipeline for the app + rule-promotion history through the
    // controlled environments (dev → test → pre-prod → prod). Static / deterministic
    // (no data regen). All personas synthetic. Fixed timestamps (no Date.now).
    // ---- Payer Setup (Element 1.1.iv · Slide 8) ----------------------------
    // Configuration surface: service categories, reference codes, providers,
    // networks and fee schedules that feed the deterministic processing paths.
    getPayerSetup: function () {
      return {
        serviceCategories: [
          { name: "Professional / physician", codeRange: "CPT 99xxx, 1xxxx–6xxxx", pricer: "MPFS", status: "Active" },
          { name: "Institutional — inpatient", codeRange: "TOB 11x · MS-DRG", pricer: "IPPS", status: "Active" },
          { name: "Institutional — outpatient", codeRange: "TOB 13x · APC", pricer: "OPPS", status: "Active" },
          { name: "Pharmacy", codeRange: "NDC · NCPDP D.0", pricer: "NADAC / ASP", status: "Active" },
          { name: "DME", codeRange: "HCPCS E/K", pricer: "DMEPOS", status: "Active" }
        ],
        referenceCodes: [
          { set: "CPT / HCPCS", edition: "CY2025", cycle: "Annual + quarterly" },
          { set: "ICD-10-CM / PCS", edition: "FY2025", cycle: "Annual (Oct 1)" },
          { set: "Revenue / TOB / value / condition", edition: "2025", cycle: "As published (NUBC)" },
          { set: "NCCI edits", edition: "v31.1", cycle: "Quarterly" }
        ],
        networks: [
          { name: "Health Plan Network — Region 1", type: "In-network", providers: "42,180", status: "Active" },
          { name: "Health Plan Network — Region 2", type: "In-network", providers: "38,905", status: "Active" },
          { name: "Direct-care referral network", type: "In-network", providers: "5,120", status: "Active" }
        ],
        feeSchedules: [
          { name: "Payer contracted allowance", version: "2025 · v3.1", effective: "2025-01-15" },
          { name: "MPFS locality 05", version: "CY2025", effective: "2025-01-01" },
          { name: "OPPS APC weights", version: "CY2025", effective: "2025-01-01" },
          { name: "ASP drug pricing", version: "2026 Q3", effective: "2026-07-01" }
        ]
      };
    },
    // ---- Customer Care 360 member view (Element 1.1.iv · Slide 10) ----------
    getMember360: function (vetId) {
      var ve = veterans[vetId] || veterans["V0001"]; if (!ve) return null;
      var vid = ve.id;
      var mClaims = D.claims.filter(function (c) { return c.veteranId === vid; }).slice(0, 8).map(function (c) {
        return { id: c.id, number: c.claimNumber, type: c.type, dos: c.dateOfService, status: c.claimStatus || "Paid", paid: c.paidAmount || c.allowedAmount || 0 };
      });
      var seed = 0; for (var i = 0; i < vid.length; i++) seed = (seed * 31 + vid.charCodeAt(i)) >>> 0;
      var rnd = function () { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
      var teams = ["Care Team Gold — Northside Medical Center", "Care Team Blue — Hill Country Clinic", "Care Team Green — Austin Primary Care"];
      return {
        profile: { name: ve.name, memberId: ve.memberId, dob: ve.dob, sex: ve.sex, city: ve.city, state: ve.state, enrollment: "Enrolled · Priority Group 3" },
        pact: { team: teams[Math.floor(rnd() * teams.length)], pcp: ["Dr. A. Morgan", "Dr. L. Chen", "Dr. R. Patel"][Math.floor(rnd() * 3)], rn: "RN Case Manager on file" },
        lineOfBusiness: "Health Plan (HPN)",
        claims: mClaims,
        priorAuths: [
          { id: "A" + (10000 + Math.floor(rnd() * 89999)), service: "Outpatient specialty referral", status: "Approved", valid: "2025-01-01 – 2025-12-31" },
          { id: "A" + (10000 + Math.floor(rnd() * 89999)), service: "Physical therapy — 12 visits", status: "Approved", valid: "2025-03-01 – 2025-09-01" }
        ]
      };
    },

    // ---- CMS content release repository + effective-dated pricing (Element 2.2) --
    // Distinct from the app CI/CD pipeline: this tracks CMS regulatory/pricing
    // CONTENT releases (fee schedules, pricers, edits) and effective-dated content.
    getCmsContentReleases: function () {
      return {
        releases: [
          { source: "CY2025 OPPS/APC final rule", pkg: "OPPS-2025-Q1", effective: "2025-01-01", impacted: "OPPS pricer · APC weights · SI table", status: "Live", validation: "Passed — 1,842 test claims", notes: "Annual APC reweighting; 12 new SI assignments." },
          { source: "MPFS CY2025 final rule", pkg: "MPFS-2025", effective: "2025-01-01", impacted: "MPFS pricer · RVU file · conversion factor", status: "Live", validation: "Passed — 3,190 test claims", notes: "Conversion factor −3.4% ($32.74); RVU updates." },
          { source: "NCCI edit file v31.1", pkg: "NCCI-2025Q1", effective: "2025-01-01", impacted: "NCCI PTP/MUE edits", status: "Live", validation: "Passed — 940 test claims", notes: "212 PTP pairs added, 47 removed." },
          { source: "ASP drug pricing file Q3 2026", pkg: "ASP-2026Q3", effective: "2026-07-01", impacted: "ASP drug pricer", status: "Staged — effective 2026-07-01", validation: "In validation — 610 test claims", notes: "Quarterly ASP + 6% refresh." },
          { source: "IPPS FFY2025 final rule", pkg: "IPPS-FY2025", effective: "2024-10-01", impacted: "MS-DRG grouper · IPPS base · wage index", status: "Live", validation: "Passed — 1,455 test claims", notes: "MS-DRG v42; wage-index update." }
        ],
        note: "Each release records the CMS source publication, package number, impacted pricer/rule set, effective date, implementation status, validation results and notes — so it's clear what changed, when, and which components were affected. Prior versions are retained through effective-dated content."
      };
    },
    getAspEffectiveDating: function () {
      return {
        code: "J1745", desc: "Infliximab injection, 10 mg (HCPCS)",
        periods: [
          { period: "Q2 2026 (Apr 1 – Jun 30)", file: "ASP-2026Q2", rate: 92.34, current: false },
          { period: "Q3 2026 (Jul 1 – Sep 30)", file: "ASP-2026Q3", rate: 94.87, current: true }
        ],
        examples: [
          { dos: "2026-06-18", selected: "Q2 2026", file: "ASP-2026Q2", rate: 92.34, note: "Earlier date of service continues to use the prior-quarter ASP." },
          { dos: "2026-07-01", selected: "Q3 2026", file: "ASP-2026Q3", rate: 94.87, note: "July 1 date of service uses the third-quarter ASP file and CMS-published rate." }
        ],
        note: "The applicable date of service automatically selects the correct historical or current rate — the prior version is not overwritten, so any past claim reprices exactly as it did on its original date of service."
      };
    },

    getReleasePipeline: function () {
      var env = function (key, label, appVer, ruleSet, deployedAt, gate, health) { return { key: key, label: label, appVersion: appVer, ruleSet: ruleSet, deployedAt: deployedAt, gate: gate, health: health }; };
      var stage = function (name, status, dur) { return { name: name, status: status, duration: dur }; };
      return {
        environments: [
          env("dev", "Development", "v2.7.0-rc3", "R2025.07", "2026-07-22 08:14", "Auto-deploy on merge", "healthy"),
          env("test", "Test / QA", "v2.7.0-rc2", "R2025.07", "2026-07-21 16:02", "QA sign-off", "healthy"),
          env("preprod", "Pre-prod / UAT", "v2.6.4", "R2025.06", "2026-07-18 11:30", "UAT sign-off", "healthy"),
          env("prod", "Production", "v2.6.3", "R2025.06", "2026-07-15 09:05", "Change Advisory Board", "healthy")
        ],
        builds: [
          {
            id: "#1487", version: "v2.7.0-rc3", branch: "round6-claim-detail", commit: "e029039", trigger: "Merge → main", startedAt: "2026-07-22 08:10", duration: "4m 21s", status: "Succeeded", target: "dev",
            stages: [stage("Checkout", "passed", "3s"), stage("Build (static site — no bundler)", "passed", "18s"), stage("Unit / view checks", "passed", "1m 12s"), stage("Secret scan — IBM Vault Radar", "passed", "22s"), stage("SAST", "passed", "48s"), stage("Deploy → dev (GitHub Pages)", "passed", "41s"), stage("Smoke test", "passed", "57s")],
            log: [
              "[checkout] round6-claim-detail @ e029039",
              "[build] static site — no build step; 42 assets verified",
              "[test] 134 view/DP checks passed",
              "[scan] IBM Vault Radar — no secrets detected",
              "[scan] SAST — 0 high · 0 medium · 2 low (accepted)",
              "[deploy:dev] published to GitHub Pages in 41s",
              "[smoke] boot OK · 6 areas reachable · 0 console errors",
              "[done] build #1487 succeeded"
            ]
          },
          {
            id: "#1486", version: "v2.7.0-rc2", branch: "round6-claim-detail", commit: "5e98131", trigger: "Merge → main", startedAt: "2026-07-21 15:52", duration: "4m 08s", status: "Succeeded", target: "test",
            stages: [stage("Checkout", "passed", "3s"), stage("Build", "passed", "17s"), stage("Unit / view checks", "passed", "1m 06s"), stage("Secret scan", "passed", "21s"), stage("SAST", "passed", "47s"), stage("Deploy → dev", "passed", "39s"), stage("Integration tests", "passed", "1m 02s"), stage("Promote → test", "passed", "13s")],
            log: [
              "[checkout] round6-claim-detail @ 5e98131",
              "[build] static site — 42 assets verified",
              "[test] 128 checks passed",
              "[scan] IBM Vault Radar — no secrets detected",
              "[deploy:dev] published in 39s",
              "[integration] subject badges + pharmacy NCPDP claim verified",
              "[promote:test] QA sign-off — Priya Nair",
              "[done] build #1486 succeeded"
            ]
          },
          {
            id: "#1481", version: "v2.6.4", branch: "main", commit: "ccec722", trigger: "Release cut", startedAt: "2026-07-18 11:18", duration: "6m 44s", status: "Succeeded", target: "preprod",
            stages: [stage("Checkout", "passed", "3s"), stage("Build", "passed", "19s"), stage("Unit / view checks", "passed", "1m 10s"), stage("Secret scan", "passed", "23s"), stage("SAST", "passed", "51s"), stage("Deploy → dev", "passed", "40s"), stage("Integration tests", "passed", "1m 08s"), stage("Deploy → test", "passed", "38s"), stage("UAT sign-off", "passed", "—"), stage("Promote → pre-prod", "passed", "15s")],
            log: [
              "[checkout] main @ ccec722",
              "[test] 121 checks passed",
              "[scan] IBM Vault Radar — no secrets detected",
              "[uat] pre-prod UAT sign-off — Dana Whitmore",
              "[promote:preprod] rule set R2025.06 attached",
              "[done] build #1481 succeeded"
            ]
          },
          {
            id: "#1468", version: "v2.6.2-hotfix", branch: "hotfix/pricing-locality", commit: "a91d004", trigger: "Hotfix", startedAt: "2026-07-09 13:40", duration: "2m 51s", status: "Failed", target: "test",
            stages: [stage("Checkout", "passed", "3s"), stage("Build", "passed", "16s"), stage("Unit / view checks", "failed", "1m 20s"), stage("Secret scan", "skipped", "—"), stage("Deploy → dev", "skipped", "—")],
            log: [
              "[checkout] hotfix/pricing-locality @ a91d004",
              "[test] FAIL — pricing locality regression (2 checks)",
              "[test] expected MPFS locality 05 · got 04",
              "[gate] pipeline halted — fix required before deploy",
              "[done] build #1468 failed"
            ]
          }
        ],
        rulePromotions: [
          { code: "EM-LEVEL", name: "E/M level validation", version: "v2.1", steps: [
            { env: "dev", version: "v2.1", at: "2026-06-20 10:02", approver: "Auto (merge)", status: "promoted" },
            { env: "test", version: "v2.1", at: "2026-06-24 14:11", approver: "Priya Nair (QA)", status: "promoted" },
            { env: "preprod", version: "v2.1", at: "2026-06-28 09:40", approver: "Dana Whitmore (UAT)", status: "promoted" },
            { env: "prod", version: "v2.1", at: "2026-07-01 09:05", approver: "CAB — Karen Boyd", status: "live" }
          ] },
          { code: "NCCI-PTP", name: "NCCI PTP edit set", version: "v31.1", steps: [
            { env: "dev", version: "v31.1", at: "2026-06-30 08:00", approver: "Auto (quarterly load)", status: "promoted" },
            { env: "test", version: "v31.1", at: "2026-07-02 13:20", approver: "Priya Nair (QA)", status: "promoted" },
            { env: "preprod", version: "v31.1", at: "2026-07-05 10:15", approver: "Dana Whitmore (UAT)", status: "promoted" },
            { env: "prod", version: "v31.1", at: "2026-07-08 09:00", approver: "CAB — Karen Boyd", status: "live" }
          ] },
          { code: "RX-NONDISP", name: "Prescription non-dispensing / DAW screen", version: "v1.0", steps: [
            { env: "dev", version: "v1.0", at: "2026-07-19 11:00", approver: "Auto (merge)", status: "promoted" },
            { env: "test", version: "v1.0", at: "2026-07-21 15:30", approver: "Priya Nair (QA)", status: "promoted" },
            { env: "preprod", version: "v1.0", at: "—", approver: "Pending UAT", status: "pending" },
            { env: "prod", version: "—", at: "—", approver: "—", status: "blocked" }
          ] },
          { code: "MED-NEC", name: "Medical-necessity / level-of-care", version: "v1.6", steps: [
            { env: "dev", version: "v1.6", at: "2026-06-15 09:30", approver: "Auto (merge)", status: "promoted" },
            { env: "test", version: "v1.6", at: "2026-06-18 14:00", approver: "Priya Nair (QA)", status: "promoted" },
            { env: "preprod", version: "v1.6", at: "2026-06-22 10:00", approver: "Dana Whitmore (UAT)", status: "promoted" },
            { env: "prod", version: "v1.6", at: "2026-06-25 09:05", approver: "CAB — Karen Boyd", status: "live" }
          ] },
          { code: "EXCL-LEIE", name: "OIG LEIE exclusion screening", version: "v2.0", steps: [
            { env: "dev", version: "v2.0", at: "2026-06-27 08:10", approver: "Auto (monthly LEIE load)", status: "promoted" },
            { env: "test", version: "v2.0", at: "2026-06-29 13:00", approver: "Priya Nair (QA)", status: "promoted" },
            { env: "preprod", version: "v2.0", at: "2026-07-01 10:30", approver: "Dana Whitmore (UAT)", status: "promoted" },
            { env: "prod", version: "v2.0", at: "2026-07-03 09:00", approver: "CAB — Karen Boyd", status: "live" }
          ] }
        ]
      };
    },

    getPrecedent: function (pid) { return (D.precedents || []).find(function (p) { return p.id === pid; }) || null; },
    // ---- business entities: providers grouped by a shared
    // business registration (holding company) or a shared TIN (one billing entity). ----
    listBusinesses: function (opts) {
      opts = opts || {};
      var groups = {};
      D.providers.forEach(function (p) {
        var key = p.registrationId || p.tin;
        var g = groups[key] || (groups[key] = { id: key, providers: [], regName: p.registration || null, officer: p.officer || null, tin: p.tin });
        g.providers.push(p);
      });
      return Object.keys(groups).map(function (k) { return groups[k]; })
        .filter(function (g) { return opts.all ? true : g.providers.length >= 2; })
        .map(function (g) {
          var provs = g.providers;
          var allegs = []; provs.forEach(function (p) { D.allegations.forEach(function (a) { if (a.providerId === p.id && (a.mode || "retrospective") === "retrospective") allegs.push(a); }); });
          return {
            id: g.id, name: g.regName || ("Billing entity · TIN " + g.tin),
            kind: g.regName ? "Holding company" : "Shared-TIN billing entity",
            officer: g.officer, registrationId: g.regName ? g.id : null, tin: g.regName ? provs[0].tin : g.tin,
            sharedTin: !g.regName, providers: provs, providerCount: provs.length,
            states: provs.map(function (p) { return p.state; }).filter(function (s, i, a) { return s && a.indexOf(s) === i; }),
            totalPaid: provs.reduce(function (s, p) { return s + (p.totalPaid || 0); }, 0),
            flaggedExposure: allegs.reduce(function (s, a) { return s + (a.exposurePost || 0); }, 0),
            openAllegations: allegs.length,
            riskScore: Math.max.apply(null, provs.map(function (p) { return p.riskScore || 0; }).concat([0]))
          };
        }).sort(function (a, b) { return b.flaggedExposure - a.flaggedExposure; });
    },
    getBusiness: function (id) { return this.listBusinesses({ all: true }).find(function (b) { return b.id === id; }) || null; },

    listClaimsByProvider: function (providerId) { return D.claims.filter(function (c) { return c.providerId === providerId; }); },
    listAllegationsByProvider: function (providerId, mode) { return D.allegations.filter(function (a) { return a.providerId === providerId && (mode === "all" || (a.mode || "retrospective") === (mode || "retrospective")); }); },
    listInvestigations: function () { return D.allegations.filter(function (a) { return a.status === "Escalated"; }); },
    isCaseLead: isCaseLead,

    // ---- Cases (provider-level) ----------------------------------------------
    // A Case exists for a provider ONLY once ≥1 of its leads is reviewed & confirmed
    // (or escalated). It aggregates that provider's confirmed leads; the provider's
    // still-open leads "feed in" (they join the case if/when confirmed). `listCases`
    // = one row per provider that HAS a case; `getCase` = that provider (or a shell
    // with leadCount 0 if no case yet). Internal keys stay "allegation".
    listCases: function (opts) {
      opts = opts || {};
      var mode = opts.mode || "retrospective";
      var exposureKey = mode === "prepay" ? "exposurePre" : "exposurePost";
      var closedOf = function (pid) { return !!(window.APP && window.APP.isCaseClosed && window.APP.isCaseClosed(pid)); };
      // A lead's case key: the analyst's EXPLICIT case link (chosen on the Decision
      // tab — new case or an existing one) if set, else the provider's ring key
      // (shared registration / TIN → one multi-provider case) or its own solo case.
      var ringKey = function (pid) {
        var p = providers[pid] || {};
        if (p.registrationId) return "reg:" + p.registrationId;
        var sharedTin = p.tin && D.providers.filter(function (x) { return x.tin === p.tin; }).length > 1;
        return sharedTin ? "tin:" + p.tin : "solo:" + pid;
      };
      var linkOf = function (id) { return (window.APP && window.APP.state.caseLinks && window.APP.state.caseLinks[id]) || null; };
      var keyOf = function (a) { return linkOf(a.id) || ringKey(a.providerId); };
      // group leads (confirmed + still-open) by resolved case key
      var groups = {};
      D.allegations.forEach(function (a) {
        if (mode !== "all" && (a.mode || "retrospective") !== mode) return;
        var k = keyOf(a);
        var g = groups[k] || (groups[k] = { caseLeads: [], openLeads: [] });
        if (isCaseLead(a)) g.caseLeads.push(a);
        else if (!CLOSED_STATUS[a.status]) g.openLeads.push(a);
      });
      var byRisk = function (a, b) { return b.riskScore - a.riskScore; };
      return Object.keys(groups).map(function (k) {
        var g = groups[k];
        var caseLeads = g.caseLeads.slice().sort(byRisk);
        var src = (caseLeads.length ? caseLeads : g.openLeads).slice().sort(byRisk);
        var provIds = src.map(function (a) { return a.providerId; }).filter(function (v, i, arr) { return arr.indexOf(v) === i; });
        var primary = providers[(src[0] || {}).providerId] || {};
        var escalated = caseLeads.some(function (a) { return a.status === "Escalated"; });
        var closed = provIds.some(closedOf);
        return {
          caseKey: k,
          providerId: primary.id, provider: primary, name: primary.name || "—", npi: primary.npi || "", state: primary.state || "",
          providerIds: provIds, providers: provIds.map(function (pid) { return providers[pid] || {}; }),
          multiProvider: provIds.length > 1, providerCount: provIds.length,
          leads: caseLeads, caseLeads: caseLeads, openLeads: g.openLeads,
          leadCount: caseLeads.length, openCount: g.openLeads.length,
          exposure: caseLeads.reduce(function (s, a) { return s + (a[exposureKey] || 0); }, 0),
          riskScore: Math.max.apply(null, caseLeads.map(function (a) { return a.riskScore || 0; }).concat([0])),
          fwaTypes: caseLeads.map(function (a) { return a.fwaType; }).filter(function (t, i, arr) { return t && arr.indexOf(t) === i; }),
          assignee: (caseLeads.find(function (a) { return a.assignee; }) || {}).assignee || null,
          subjectType: (src.find(function (a) { return a.subjectType && a.subjectType !== "Provider"; }) || {}).subjectType || "Provider",
          escalated: escalated, closed: closed,
          status: closed ? "Closed" : escalated ? "Under investigation" : "Open case"
        };
      }).filter(function (c) { return opts.all ? true : c.leadCount > 0; })
        .sort(function (a, b) { return b.exposure - a.exposure; });
    },
    getCase: function (providerId, mode) { return this.listCases({ all: true, mode: mode || "all" }).find(function (c) { return c.providerId === providerId || (c.providerIds && c.providerIds.indexOf(providerId) >= 0); }) || null; },

    // ---- secondary scoring / external enrichment --------------
    // Synthetic external-data profile (business registry + individual/officer OSINT)
    // used to corroborate a claims-based flag with outside signals. Deterministic
    // per provider. Seam: a real feed can populate p.secondaryProfile to override.
    getSecondaryProfile: function (id) {
      var p = providers[id]; if (!p) return null;
      if (p.secondaryProfile) return p.secondaryProfile;
      var seed = 0; for (var i = 0; i < id.length; i++) seed = (seed * 31 + id.charCodeAt(i)) >>> 0;
      var rnd = function () { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
      var money = function (min, max) { return Math.round((min + rnd() * (max - min)) / 1000) * 1000; };
      var chain = p.role === "chain";
      var ring = D.providers.filter(function (x) { return x.tin === p.tin; }).length > 1;
      var tier = chain ? "chain" : ring ? "ring" : (p.riskScore || 0) >= 78 ? "risky" : "clean";
      var base = { chain: { regs: 3, liens: 2, judg: 1, bank: 1, dock: 2, score: 88 }, ring: { regs: 2, liens: 1, judg: 1, bank: 0, dock: 1, score: 73 }, risky: { regs: 1, liens: 1, judg: 0, bank: 0, dock: 1, score: 61 }, clean: { regs: 0, liens: 0, judg: 0, bank: 0, dock: 0, score: 24 } }[tier];
      var bizOsint = [];
      if (chain) { bizOsint.push("Registered agent shared with 3 affiliated facilities"); bizOsint.push("Principal address is a commercial mail-drop (CMRA)"); }
      else if (ring) { bizOsint.push("Suite # matches an unrelated billing company at the same address"); }
      else if (tier === "risky") { bizOsint.push("No active web presence; listed phone disconnected"); }
      else { bizOsint.push("No adverse business records found"); }
      var offOsint = [];
      if (p.officer) {
        if (chain) { offOsint.push("Named on " + base.regs + " other active registrations (Enformion)"); offOsint.push("Linked to a dissolved behavioral-health entity (2019)"); }
        else if (ring) { offOsint.push("Associated with the partner provider on state filings"); }
        offOsint.push("No SSA Death Master File match");
      }
      return {
        tier: tier, score: Math.min(99, base.score + Math.floor(rnd() * 8)),
        business: {
          name: p.registration || ("Billing entity · TIN " + p.tin),
          registryStatus: tier === "risky" ? "Delinquent" : "Active",
          state: p.state || "—",
          incorporated: (2011 + Math.floor(rnd() * 11)) + "-" + String(1 + Math.floor(rnd() * 9)).padStart(2, "0"),
          entityNo: (p.state || "US") + "-" + (1000000 + Math.floor(rnd() * 8999999)),
          openCorporatesRelated: base.regs,
          liens: base.liens, lienAmount: base.liens ? money(8000, 90000) : 0,
          judgments: base.judg, judgmentAmount: base.judg ? money(5000, 120000) : 0,
          bankruptcies: base.bank,
          courtDockets: base.dock,
          osint: bizOsint
        },
        officer: p.officer ? {
          name: p.officer,
          lexisConfidence: 82 + Math.floor(rnd() * 17),
          addresses: 2 + Math.floor(rnd() * 4),
          enformionBusinesses: base.regs + 1 + Math.floor(rnd() * 2),
          relatives: 2 + Math.floor(rnd() * 5),
          licenseStatus: chain ? "Active — 3 states" : "Active",
          ssdiMatch: false,
          osint: offOsint
        } : null
      };
    },

    // ---- Risk intelligence (Element 3.2.i) — deeper external/OSINT profile ----
    // A categorized risk-intelligence dossier corroborating the claims-based flag
    // with outside signals: findings by category (exclusion, sanction, license,
    // ownership, adverse media, network, legal, geographic, identity), each with
    // severity / source / date; an overall risk score; a plain-language summary;
    // and a chronological findings feed. Un-attributed (no partner/vendor name) —
    // sources are generic capability labels. Derived from the existing signals
    // (LEIE, licensure, secondary profile, ring/chain) — deterministic, no regen.
    RISK_SOURCES: {
      exclusion: "Federal exclusions list", sanction: "Federal award-management registry",
      license: "State licensing board", ownership: "Corporate registry & beneficial ownership",
      media: "Adverse-media monitoring", network: "Provider network graph",
      legal: "Litigation & court records", geographic: "Provider address intelligence",
      identity: "Public-records / identity graph", enrollment: "Provider enrollment (PECOS)",
      revocation: "Enrollment revocation list", criminal: "Criminal & legal records",
      osint: "Open-source intelligence", derogatory: "Derogatory-findings index", caseReview: "Prior case-review history"
    },
    // The dimensions screened across (shown in the panel framing).
    RISK_DIMENSIONS: ["Provider enrollment", "Exclusions", "Revocations", "Licensing", "Sanctions", "Business registrations & ownership", "Criminal & legal history", "Network analysis", "Open-source intelligence risk", "Geographic analysis", "Adverse news", "Derogatory findings", "Case-review details", "AI summaries"],
    getRiskIntel: function (id) {
      var p = providers[id]; if (!p) return null;
      var self = this, sec = this.getSecondaryProfile(id), excl = this.LEIE_EXCLUSIONS[id] || null;
      var ring = D.providers.filter(function (x) { return x.tin === p.tin; }).length > 1;
      var chain = p.role === "chain";
      var S = this.RISK_SOURCES, seed = 0; for (var i = 0; i < id.length; i++) seed = (seed * 31 + id.charCodeAt(i) + 3) >>> 0;
      var rnd = function () { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
      var dt = function (yLo, yHi) { var y = yLo + Math.floor(rnd() * (yHi - yLo + 1)); var m = 1 + Math.floor(rnd() * 12); var d = 1 + Math.floor(rnd() * 27); return y + "-" + String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0"); };
      var F = [], add = function (cat, key, title, sev, date, desc) { F.push({ category: cat, title: title, severity: sev, source: S[key], date: date, description: desc }); };
      var st = p.state || "TX";

      // Provider enrollment (screened on every provider)
      add("Provider enrollment", "enrollment", excl ? "PECOS enrollment deactivated" : "PECOS enrollment on file", excl ? "high" : "info", dt(2022, 2025), excl ? "Medicare/PECOS enrollment shows a deactivation tied to the exclusion action." : "Medicare/PECOS enrollment is active for the billed specialty and location.");
      if (excl) {
        add("Exclusion", "exclusion", "OIG LEIE exclusion — active", "critical", excl.since, "Listed on the federal List of Excluded Individuals/Entities under " + excl.basis + " (" + excl.reason.toLowerCase() + "). Any claim with a date of service during the exclusion is recoverable in full" + (excl.reinstatement ? "; earliest reinstatement " + excl.reinstatement + "." : "; no reinstatement date on file."));
        add("Sanction", "sanction", "Federal award exclusion (debarment)", "high", dt(2023, 2024), "Active exclusion record in the federal award-management registry — ineligible for federal awards and payments while listed.");
        add("License", "license", "State license revoked / suspended", "high", dt(2023, 2024), "Primary state professional license shows a revocation/suspension action, consistent with the exclusion basis.");
        add("Revocations", "revocation", "Medicare enrollment revocation", "high", dt(2023, 2024), "Provider appears on the enrollment-revocation list; billing privileges were revoked with a re-enrollment bar.");
        add("Criminal & legal", "criminal", "Health-care fraud conviction on record", "critical", dt(2022, 2023), "Public criminal-records screening surfaced a felony health-care-fraud conviction associated with a principal.");
        add("Adverse media", "media", "Adverse press — enforcement action", "high", dt(2023, 2025), "News monitoring surfaced coverage of an enforcement/settlement action naming the entity or a principal.");
        add("Derogatory findings", "derogatory", "Multiple derogatory findings aggregated", "high", dt(2023, 2025), "The derogatory-findings index aggregates exclusion, revocation and conviction signals into a sustained high-risk indicator.");
        add("Case review", "caseReview", "Prior payment-integrity case on file", "medium", dt(2022, 2024), "This entity was the subject of a prior adjudicated payment-integrity case — relevant precedent for the current review.");
      }
      if (chain) {
        add("Ownership", "ownership", "Common ownership across facilities", "high", dt(2018, 2022), "Beneficial-ownership records tie this facility to " + (sec.business.openCorporatesRelated || 3) + " affiliated facilities under a shared holding company and registered agent.");
        add("Network", "network", "Shared-patient cluster across the chain", "high", dt(2025, 2026), "Network analysis shows members appearing at multiple facilities in the chain within short windows — a coordinated-utilization signal.");
        add("Geographic", "geographic", "Principal address is a commercial mail-drop", "medium", dt(2019, 2023), "The registered principal address resolves to a commercial mail-receiving agency (CMRA), not a treatment site.");
        add("License", "license", "Multi-state licensure — verify scope", "medium", dt(2022, 2025), "Principal holds licenses in multiple states; confirm each covers the services billed at this facility.");
        add("OSINT risk", "osint", "Undisclosed family ownership across affiliates", "high", dt(2019, 2024), "Open-source intelligence links the principal's family members to affiliated facilities not disclosed on ownership filings — a concealment pattern.");
        add("Derogatory findings", "derogatory", "Elevated derogatory-findings score", "medium", dt(2023, 2025), "Aggregated ownership-concealment and utilization signals raise the derogatory-findings score above the peer threshold.");
      }
      if (ring && !chain) {
        add("Network", "network", "Shared-TIN provider ring", "high", dt(2024, 2026), "Two or more billing NPIs share this Tax ID and co-bill overlapping members — a provider-ring pattern.");
        add("Ownership", "ownership", "Co-registration with an unrelated biller", "medium", dt(2020, 2024), "The suite/address matches an unrelated billing company on state filings — possible shell/pass-through billing.");
        add("OSINT risk", "osint", "Officer linked to the partner provider", "medium", dt(2019, 2023), "Open-source and public-records graphs link the named officer to the co-located partner provider through prior filings.");
      }
      if (!excl && (p.riskScore || 0) >= 78 && !chain && !ring) {
        add("License", "license", "Credential friction — verify standing", "medium", dt(2024, 2026), "One or more credentials (license / DEA / board certification) show a lapse or pending status; confirm active standing for the dates billed.");
        add("Adverse media", "media", "Thin external footprint", "low", dt(2023, 2025), "Limited web presence and stale contact records — an integrity soft-signal, not adverse on its own.");
      }
      if (sec.business.liens || sec.business.judgments || sec.business.courtDockets) {
        add("Legal", "legal", "Civil liens / judgments / dockets on file", (sec.business.judgments ? "medium" : "low"), dt(2021, 2025), (sec.business.liens || 0) + " lien(s), " + (sec.business.judgments || 0) + " judgment(s) and " + (sec.business.courtDockets || 0) + " court docket(s) associated with the business entity.");
      }
      if (!F.length) add("Clear", "identity", "No adverse external findings", "info", dt(2025, 2026), "External screening across exclusions, sanctions, licensure, ownership, media, litigation and network signals returned no adverse records.");

      // overall score: anchor on the secondary score, lift for critical/high findings
      var sevW = { critical: 26, high: 15, medium: 7, low: 3, info: 0 };
      var lift = F.reduce(function (a, f) { return a + (sevW[f.severity] || 0); }, 0);
      var score = Math.max(0, Math.min(99, Math.round((sec.score || 30) * 0.5 + lift)));
      var band = score >= 75 ? "high" : score >= 45 ? "medium" : "low";
      var counts = {}; F.forEach(function (f) { counts[f.severity] = (counts[f.severity] || 0) + 1; });

      // plain-language AI summary
      var top = F.filter(function (f) { return f.severity === "critical" || f.severity === "high"; });
      var summary;
      if (excl) summary = p.name + " carries a CRITICAL external risk profile driven by an active federal exclusion; claims paid during the exclusion period are recoverable in full and the entity should be referred for administrative action. Corroborating sanction, licensure and adverse-media signals reinforce the finding.";
      else if (chain) summary = p.name + " shows a HIGH external risk profile centered on common ownership and shared-patient movement across affiliated facilities — a chain pattern that concentrates length-of-stay and utilization exposure. Address and licensure signals warrant verification before further payment.";
      else if (ring) summary = p.name + " shows an ELEVATED external risk profile: a shared-TIN provider ring with co-registration and identity links to a co-located biller — consistent with coordinated or pass-through billing.";
      else if (top.length) summary = p.name + " shows a MODERATE external risk profile — credential and footprint signals suggest verifying active standing for the dates billed, but no exclusion or sanction is present.";
      else summary = p.name + " shows a LOW external risk profile — external screening returned no adverse exclusion, sanction, licensure, ownership or litigation records.";

      var feed = F.slice().sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
      return {
        score: score, band: band, tier: sec.tier, findingCount: F.length, severityCounts: counts,
        summary: summary, findings: F, feed: feed,
        categories: (function () { var c = {}; F.forEach(function (f) { c[f.category] = (c[f.category] || 0) + 1; }); return c; })(),
        dimensions: this.RISK_DIMENSIONS, recordCount: "1B+ public records",
        approach: "Screened top-down (exclusion / revocation / provider master files) and bottom-up (from high-risk claim behavior surfaced by the models).",
        note: "Synthetic external intelligence for the demo — sources are shown as capability categories. The DataProvider seam accepts a real external-intelligence feed."
      };
    },

    // ---- licensure & credentials (incl. OIG LEIE exclusion) ----
    // Derived here (static, seeded per provider — no data.js regen). Identifiers are
    // impossible-to-be-real by construction: license numbers carry a 0000 block, DEA
    // numbers deliberately fail the checksum. Excluded-while-billing is an automatic
    // finding, so the OIG LEIE exclusions are a small curated list (LEIE is itself a
    // specific list) and surface as the headline credential signal.
    LEIE_EXCLUSIONS: {
      PR301: { basis: "1128(b)(4)", reason: "Licensure revocation / suspension in another state", since: "2024-08-19", reinstatement: null, npiOnList: true },
      PR205: { basis: "1128(a)(3)", reason: "Felony conviction — health-care fraud", since: "2023-11-02", reinstatement: "2028-11-02", npiOnList: true }
    },
    getLicensure: function (id) {
      var p = providers[id]; if (!p) return null;
      var tax = p.taxonomyCode || "";
      var isOrg = /^3/.test(tax) || /^28/.test(tax) || /^251/.test(tax);
      var seed = 0; for (var i = 0; i < id.length; i++) seed = (seed * 31 + id.charCodeAt(i)) >>> 0;
      var rnd = function () { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
      var yr = function (min, max) { return (min + Math.floor(rnd() * (max - min + 1))); };
      var n4 = function () { return String(1000 + Math.floor(rnd() * 8999)); };
      var st = p.state || "TX";
      var excl = this.LEIE_EXCLUSIONS[id] || null;
      var risk = p.riskScore || 0;

      // Credential friction is reserved for high-risk providers so a clean peer reads
      // as genuinely clear. A lapsed license/DEA/board cert is a softer signal than
      // exclusion; a revalidation-due is benign/administrative. Deterministic per seed.
      var lapse = !excl && risk >= 82 && rnd() > 0.45;
      var deaExpired = !excl && risk >= 82 && rnd() > 0.5;
      var boardExpired = !excl && risk >= 85 && rnd() > 0.5;
      var revalDue = !excl && risk >= 65 && rnd() > 0.5;

      var creds = [];
      if (isOrg) {
        creds.push({ type: "State facility license", authority: st + " Dept. of Health", number: st + "-FAC-0000" + n4().slice(-3), status: (excl ? "Suspended" : lapse ? "Lapsed — renewal pending" : "Active"), expires: yr(2026, 2028) + "-0" + (1 + Math.floor(rnd() * 8)) + "-15" });
        creds.push({ type: "Accreditation", authority: rnd() > 0.5 ? "CARF" : "The Joint Commission", number: "ACR-0000" + n4().slice(-3), status: excl ? "Under review" : "Accredited", expires: yr(2026, 2027) + "-11-30" });
      } else {
        creds.push({ type: "State medical license", authority: st + " Medical Board", number: st + "-MD-0000" + n4().slice(-3), status: (excl ? "Suspended" : lapse ? "Lapsed — renewal pending" : "Active"), expires: yr(2026, 2028) + "-0" + (1 + Math.floor(rnd() * 8)) + "-31" });
        creds.push({ type: "DEA registration", authority: "DEA", number: "B" + String.fromCharCode(65 + Math.floor(rnd() * 26)) + "0000000", status: (excl ? "Retired" : deaExpired ? "Expired" : "Active"), expires: yr(2025, 2027) + "-06-30" });
        creds.push({ type: "Board certification", authority: p.taxonomyLabel || "Specialty board", number: "ABMS-0000" + n4().slice(-3), status: excl ? "Not certified" : boardExpired ? "Expired" : "Certified", expires: yr(2026, 2030) + "-12-31" });
      }
      creds.push({ type: "Medicare/PECOS enrollment", authority: "CMS", number: "PECOS-" + (p.npi || id), status: excl ? "Deactivated" : revalDue ? "Revalidation due" : "Enrolled", expires: revalDue ? yr(2026, 2026) + "-09-30" : yr(2027, 2028) + "-03-31" });

      // alerts, most severe first
      var alerts = [];
      if (excl) alerts.push({ sev: "high", text: "OIG LEIE exclusion — excluded from all federal health-care programs; claims paid during exclusion are recoverable in full." });
      creds.forEach(function (c) {
        if (/Suspended|Lapsed|Expired|Deactivated|Retired|Under review/.test(c.status) && !(excl && c.status === "Suspended"))
          alerts.push({ sev: c.status === "Expired" && c.type === "Board certification" ? "med" : "med", text: c.type + " " + c.status.toLowerCase() + " (" + c.authority + ")." });
        if (c.status === "Revalidation due") alerts.push({ sev: "low", text: "Medicare revalidation due " + c.expires + "." });
      });

      return {
        isOrg: isOrg,
        entityType: isOrg ? "Facility / organization" : "Individual practitioner",
        credentials: creds,
        exclusion: excl ? { basis: excl.basis, reason: excl.reason, since: excl.since, reinstatement: excl.reinstatement, npiOnList: excl.npiOnList } : null,
        excluded: !!excl,
        alerts: alerts,
        // a benign revalidation-due (low sev) alone does not warrant "Action needed"
        status: excl ? "Excluded" : alerts.some(function (x) { return x.sev !== "low"; }) ? "Action needed" : "Clear"
      };
    },
    isExcluded: function (id) { return !!this.LEIE_EXCLUSIONS[id]; },

    // ---- provider report card (radar spokes + drill-down) ----
    getGroups: function () { var p = D.providers.find(function (x) { return x.groupScores; }); return p ? p.groupScores.map(function (g) { return g.group; }) : []; },
    getReportCard: function (id) { var p = providers[id]; return p ? { groups: p.groupScores || [], attributes: p.groupAttributes || {} } : null; },
    // Providers ranked by a single group's score (outlier comparison / ranking).
    rankByGroup: function (group) {
      return D.providers.filter(function (p) { return p.groupScores; })
        .map(function (p) { var gs = p.groupScores.find(function (g) { return g.group === group; }); return { id: p.id, name: p.name, specialty: p.taxonomyLabel, role: p.role, score: gs ? gs.score : 0, peer: gs ? gs.peer : 0, outlier: gs ? gs.outlier : false }; })
        .sort(function (a, b) { return b.score - a.score; });
    },

    // ---- collusion network: providers connected to `id` by shared identifiers ----
    // Traverses SHARES_TIN / SHARES_OFFICER / SHARES_REGISTRATION / REFERRED_TO /
    // SHARES_PATIENT_WITH (provider↔provider) plus TREATED_BY (member→provider).
    getCollusionNetwork: function (id) {
      var provEdge = { SHARES_TIN: 1, SHARES_OFFICER: 1, SHARES_REGISTRATION: 1, REFERRED_TO: 1, SHARES_PATIENT_WITH: 1 };
      var E = D.graph.edges, adj = {};
      E.forEach(function (e) {
        if (provEdge[e.type] && providers[e.source] && providers[e.target]) {
          (adj[e.source] = adj[e.source] || []).push(e.target);
          (adj[e.target] = adj[e.target] || []).push(e.source);
        }
      });
      var seen = {}, queue = [id]; seen[id] = 1;
      while (queue.length) { var cur = queue.shift(); (adj[cur] || []).forEach(function (n) { if (!seen[n]) { seen[n] = 1; queue.push(n); } }); }
      var provIds = Object.keys(seen);
      var links = E.filter(function (e) { return provEdge[e.type] && seen[e.source] && seen[e.target]; });
      var vetLinks = E.filter(function (e) { return e.type === "TREATED_BY" && seen[e.target] && veterans[e.source]; });
      var vetSeen = {}; vetLinks.forEach(function (e) { vetSeen[e.source] = 1; });
      return {
        providers: provIds.map(function (x) { return providers[x]; }),
        links: links,
        veterans: Object.keys(vetSeen).map(function (x) { return veterans[x]; }),
        vetLinks: vetLinks,
        isRing: provIds.length > 1
      };
    },

    // ---- 837 EDI / CMS Pricing / Utilization Mgmt mocks ----
    // Deterministic per-claim synthetic data. Seams for real third-party feeds:
    // a real 837 parser, a CMS pricing service, and clinical care guidelines.
    _seed: function (id, salt) { var s = 0; id = String(id) + (salt || ""); for (var i = 0; i < id.length; i++) s = (s * 31 + id.charCodeAt(i)) >>> 0; return function () { s = (s * 1103515245 + 12345) >>> 0; return s / 4294967296; }; },

    // Map an internal claim to X12 837 loops/segments (837P professional / 837I institutional).
    get837: function (claimId) {
      var cl = claims[claimId]; if (!cl) return null;
      var p = providers[cl.providerId] || {}, ve = veterans[cl.veteranId] || {};
      var inst = cl.type === "837I", resid = (cl.lines || []).some(function (l) { return l.cpt === "H0018"; });
      var rnd = this._seed(claimId, "edi"), npi = function () { return "1" + String(100000000 + Math.floor(rnd() * 899999999)); };
      var pos = inst ? (resid ? "55" : "21") : ((cl.lines || []).some(function (l) { return l.cpt === "90935"; }) ? "65" : "11");
      var posLabel = { "11": "Office", "21": "Inpatient Hospital", "22": "Outpatient Hospital", "55": "Residential Facility", "65": "ESRD Facility", "12": "Home" }[pos] || pos;
      var rp = { "Dr. A. Morgan": 0, "Dr. L. Chen": 0, "Dr. R. Patel": 0, "Dr. S. Okafor": 0 };
      var refName = Object.keys(rp)[Math.floor(rnd() * 4)];
      return {
        transaction: { setId: "837", implementationGuide: inst ? "005010X223A2 (Institutional)" : "005010X222A1 (Professional)", purpose: "CH — Chargeable", controlNumber: "0" + (1001 + Math.floor(rnd() * 8999)) },
        submitter: { name: "Health Plan Network", id: "HPN01" },
        receiver: { name: "Payment Integrity Unit", id: "PIU" },
        billingProvider: { loop: "2010AA · NM1*85", npi: p.npi, name: p.name, taxIdType: "EI", taxId: p.tin, taxonomy: p.taxonomyCode || "—", address: (p.city || "") + ", " + (p.state || "") },
        renderingProvider: { loop: "2310B · NM1*82", npi: npi(), name: p.name },
        referringProvider: { loop: "2310A · NM1*DN", npi: npi(), name: refName },
        subscriber: { loop: "2010BA · NM1*IL", memberId: ve.memberId || "—", name: ve.name || "—", dob: ve.dob || "—", gender: ve.sex || "—", relationship: "18 — Self", responsibility: "P — Primary" },
        payer: { loop: "2010BB · NM1*PR", name: "HPN", id: "HPN", claimControlNumber: "HPN" + (1000000 + Math.floor(rnd() * 8999999)) },
        claim: {
          loop: "2300 · CLM", patientControlNumber: cl.claimNumber, totalClaimCharge: cl.billedAmount,
          placeOfService: pos + " — " + posLabel, facilityQualifier: inst ? "A — Institutional" : "B — Professional",
          frequencyCode: "1 — Original", providerSignature: "Y", assignmentOfBenefits: "Y", benefitAssignment: "Y", releaseOfInfo: "I — Informed consent",
          billType: inst ? (resid ? "86X — Special facility (residential)" : "111 — Hospital inpatient") : null,
          admissionType: inst ? "3 — Elective" : null,
          statementDates: inst ? (cl.dateOfService + " – " + cl.dateOfService) : null,
          diagnoses: (cl.diagnosisCodes || []).map(function (dx, i) { return { pointer: i + 1, qualifier: i === 0 ? "ABK — Principal (ICD-10-CM)" : "ABF — Other (ICD-10-CM)", code: dx }; })
        },
        serviceLines: (cl.lines || []).map(function (l, i) {
          return {
            lineNumber: i + 1, segment: inst ? "SV2 (2400)" : "SV1 (2400)",
            procedure: "HC:" + l.cpt + ((l.modifiers || []).length ? ":" + l.modifiers.join(":") : ""),
            revenueCode: inst ? (l.cpt === "H0018" ? "1002" : "0" + (250 + i * 50)) : null,
            chargeAmount: l.billed, unitBasis: "UN", units: l.units || 1,
            placeOfService: pos, diagnosisPointers: "1", serviceDate: "472 — " + cl.dateOfService,
            flagged: (l.violatesRuleIds || []).length > 0
          };
        })
      };
    },

    // CMS reference pricing: submitted charge vs CMS-allowed per line + methodology.
    getCmsPricing: function (claimId) {
      var cl = claims[claimId]; if (!cl) return null;
      if (cl.type === "NCPDP") return null;
      var p = providers[cl.providerId] || {}, inst = cl.type === "837I";
      // Inpatient DRG-priced claims are priced at the CLAIM (DRG) level, not per CPT line.
      if (cl.inpatientSurgical) {
        var corrected = 28595.58, submitted = Math.round(cl.billedAmount * 100) / 100;
        var pl = { cpt: "MS-DRG " + (cl.correctedDrg || "026"), description: "Inpatient prospective payment (IPPS) — regrouped from DRG " + (cl.submittedDrg || "030"), modifiers: [], submittedCharge: submitted, cmsAllowed: corrected, paid: cl.paidAmount || corrected, variance: Math.round((submitted - corrected) * 100) / 100, variancePct: Math.round(((submitted - corrected) / corrected) * 100), overPaid: (cl.paidAmount || 0) > corrected + 0.5, methodology: "IPPS / MS-DRG", flagged: true };
        return {
          source: "CMS reference pricing", asOf: "FFY2025 IPPS", locality: (p.state || "TX") + " · CBSA wage index",
          lines: [pl],
          totals: { submitted: pl.submittedCharge, cmsAllowed: corrected, paid: pl.paid, variance: pl.variance, overpayment: Math.round(Math.max(0, (cl.paidAmount || 0) - corrected) * 100) / 100 },
          rulesApplied: ["MS-DRG grouper (v42)", "IPPS operating + capital", "CBSA wage-index adjustment", "DSH / IME add-ons", "Medicare Code Editor (MCE) — invalid-DRG check"],
          ruleVersions: this.getPricingRuleVersions(claimId)
        };
      }
      var rnd = this._seed(claimId, "cms");
      var method = function (l) {
        if (inst) return l.cpt === "H0018" ? "Per-diem (residential)" : "OPPS / APC";
        if (/^7/.test(l.cpt)) return "MPFS — Radiology";
        if (/^9[0-3]/.test(l.cpt) && !/^99/.test(l.cpt)) return "MPFS — Medicine";
        if (/^99/.test(l.cpt)) return "MPFS — E/M";
        if (/^E/.test(l.cpt)) return "DMEPOS fee schedule";
        return "MPFS";
      };
      var lines = (cl.lines || []).map(function (l) {
        var flagged = (l.violatesRuleIds || []).length > 0;
        // CMS reference pricing: a flagged line prices LOWER than paid (correct code /
        // bundled / MUE-limited); clean lines price at the fee-schedule allowed.
        var cms = flagged ? Math.round(l.allowed * (0.4 + rnd() * 0.2) * 100) / 100 : l.allowed;
        var charge = Math.max(l.billed, Math.round(l.allowed * (1.7 + rnd() * 1.1)));
        return {
          cpt: l.cpt, description: l.description, modifiers: l.modifiers || [],
          submittedCharge: charge, cmsAllowed: cms, paid: l.paid,
          variance: Math.round((charge - cms) * 100) / 100, variancePct: cms ? Math.round(((charge - cms) / cms) * 100) : 0,
          overPaid: l.paid > cms + 0.5, methodology: method(l), flagged: flagged
        };
      });
      var sum = function (k) { return Math.round(lines.reduce(function (s, l) { return s + l[k]; }, 0) * 100) / 100; };
      return {
        source: "CMS reference pricing", asOf: "2025 CMS fee schedules", locality: (p.state || "TX") + " · locality 05",
        lines: lines,
        totals: { submitted: sum("submittedCharge"), cmsAllowed: sum("cmsAllowed"), paid: sum("paid"), variance: Math.round((sum("submittedCharge") - sum("cmsAllowed")) * 100) / 100, overpayment: Math.round(Math.max(0, sum("paid") - sum("cmsAllowed")) * 100) / 100 },
        rulesApplied: ["MPFS locality adjustment (" + (p.state || "TX") + " 05)", inst ? "OPPS status-indicator pricing" : "RVU × conversion factor ($32.74)", "MPPR — multiple-procedure payment reduction", "NCCI PTP bundling edits", "Site-of-service differential"],
        ruleVersions: this.getPricingRuleVersions(claimId)
      };
    },
    // Version history for the pricing rules that priced the claim. Static / synthetic
    // (no data regen). A claim's date of service could fall under a prior version —
    // this surfaces what changed and when, so the reviewer can see the lineage of the
    // rates applied. Effective as of DOS is the one that priced the claim.
    getPricingRuleVersions: function (claimId) {
      var cl = claims[claimId]; if (!cl) return [];
      var p = providers[cl.providerId] || {}, st = p.state || "TX", inst = cl.type === "837I";
      return [
        {
          name: "MPFS conversion factor", authority: "CMS", current: { version: "CY2025", effective: "2025-01-01", value: "$32.74 / RVU" },
          note: "The dollar multiplier applied to each code's relative value units. Updated annually in the Medicare Physician Fee Schedule final rule.",
          history: [
            { version: "CY2024", effective: "2024-01-01", value: "$33.89 / RVU", change: "−3.4% CF reduction (CY2025 final rule)" },
            { version: "CY2023", effective: "2023-01-01", value: "$33.06 / RVU", change: "CF set by CY2024 final rule" }
          ]
        },
        {
          name: "GPCI locality adjustment", authority: "CMS", current: { version: "CY2025 GPCI", effective: "2025-01-01", value: st + " · locality 05" },
          note: "Geographic Practice Cost Index — adjusts the fee for local cost differences.",
          history: [
            { version: "CY2024 GPCI", effective: "2024-01-01", value: st + " · locality 05", change: "Work/PE/MP indices refreshed" },
            { version: "CY2023 GPCI", effective: "2023-01-01", value: st + " · locality 05", change: "Prior triennial GPCI update" }
          ]
        },
        {
          name: "MPPR — multiple-procedure payment reduction", authority: "CMS", current: { version: "v1.0", effective: "2024-07-01", value: "50% on 2nd+ procedure" },
          note: "Reduces payment for the second and subsequent procedures billed in the same session.",
          history: [
            { version: "v0.9", effective: "2023-01-01", value: "25% on 2nd+ procedure", change: "Reduction increased 25% → 50%" }
          ]
        },
        {
          name: inst ? "OPPS status-indicator pricing" : "RVU relative value file", authority: "CMS", current: { version: inst ? "CY2025 OPPS" : "CY2025 RVU", effective: "2025-01-01", value: inst ? "APC weights CY2025" : "RVUs CY2025" },
          note: inst ? "Outpatient Prospective Payment System — APC weights and status indicators." : "Work / practice-expense / malpractice RVUs per code.",
          history: [
            { version: inst ? "CY2024 OPPS" : "CY2024 RVU", effective: "2024-01-01", value: inst ? "APC weights CY2024" : "RVUs CY2024", change: "Annual valuation update" }
          ]
        },
        {
          name: "NCCI PTP edit set", authority: "CMS NCCI", current: { version: "v31.1", effective: "2025-01-01", value: "Q1 CY2025 edit file" },
          note: "Procedure-to-procedure bundling edits, refreshed quarterly.",
          history: [
            { version: "v30.3", effective: "2024-10-01", value: "Q4 CY2024 edit file", change: "212 pairs added, 47 removed" },
            { version: "v30.0", effective: "2024-01-01", value: "Q1 CY2024 edit file", change: "Annual baseline refresh" }
          ]
        },
        {
          name: "Payer fee schedule / contracted allowance", authority: "Payer contract", current: { version: "v3.1", effective: "2025-01-15", value: "Fee table 2025" },
          note: "Payer contracted allowance table used where it governs over MPFS.",
          history: [
            { version: "v3.0", effective: "2024-07-01", value: "Fee table 2024 H2", change: "Mid-year fee-table refresh" },
            { version: "v2.4", effective: "2024-01-01", value: "Fee table 2024 H1", change: "Annual fee-table update" }
          ]
        }
      ];
    },

    // ---- provider contact (for records requests) ----
    // Deterministic, and impossible-to-be-real by construction: fax numbers sit in the
    // 555-01xx block reserved for fiction, and email uses the reserved example.com
    // domain. Derived here rather than generated so the dataset stays byte-stable.
    AREA_BY_STATE: { TX: "210", AZ: "602", CA: "619", NV: "702", NM: "505", OK: "405", LA: "504", AR: "501" },
    getProviderContact: function (pid) {
      var p = providers[pid]; if (!p) return null;
      var digits = String(pid).replace(/\D/g, "") || "0";
      var last2 = String(Number(digits) % 100).padStart(2, "0");
      var area = this.AREA_BY_STATE[p.state] || "210";
      var slug = String(p.name || "provider").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").split("-").slice(0, 3).join("-");
      return {
        fax: "+1 (" + area + ") 555-01" + last2,
        email: "records@" + slug + ".example.com",
        portal: "Provider Portal · " + (p.npi || pid),
        attention: "Health Information Management / Release of Information"
      };
    },

    // ---- facility capacity (beds vs patient-days billed) ----
    // Only meaningful for bedded facilities (residential / inpatient). The fraud
    // signal is billing more patient-days than the staffed bed count can physically
    // hold over a period — impossible days that no coding review would surface,
    // and a peak-concurrent census above the staffed beds. Derived (no data regen).
    getFacilityCapacity: function (id) {
      var p = providers[id]; if (!p) return null;
      var tax = p.taxonomyCode || "";
      var residential = /^3245/.test(tax);   // substance-abuse residential
      var hospital = /^282N/.test(tax);      // general hospital
      if (!residential && !hospital) return null;
      var seed = 0; for (var i = 0; i < id.length; i++) seed = (seed * 31 + id.charCodeAt(i) + 7) >>> 0;
      var rnd = function () { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
      var chain = p.role === "chain";
      var periodDays = 90;
      var licensedBeds = residential ? 36 + Math.floor(rnd() * 10) : 140 + Math.floor(rnd() * 60);
      var staffedBeds = Math.round(licensedBeds * (residential ? 0.72 : 0.86));
      var capacityDays = staffedBeds * periodDays;
      // a chain residential facility bills beyond what its beds can hold; others sit within
      var util = chain ? 1.10 + rnd() * 0.09 : 0.58 + rnd() * 0.22;
      var patientDaysBilled = Math.round(capacityDays * util);
      var peakConcurrent = chain ? staffedBeds + 4 + Math.floor(rnd() * 5) : Math.round(staffedBeds * (0.68 + rnd() * 0.18));
      return {
        periodLabel: "trailing 90 days", periodDays: periodDays,
        licensedBeds: licensedBeds, staffedBeds: staffedBeds,
        capacityDays: capacityDays, patientDaysBilled: patientDaysBilled,
        utilization: Math.round(util * 100),
        overCapacity: patientDaysBilled > capacityDays,
        excessDays: Math.max(0, patientDaysBilled - capacityDays),
        peakConcurrent: peakConcurrent, peakOverStaffed: peakConcurrent > staffedBeds,
        peakExcess: Math.max(0, peakConcurrent - staffedBeds)
      };
    },

    // ---- CPT crosswalk: is THIS code payable billed with THIS modifier? ----
    // Three reference checks per claim line, the way a coder reads a claim:
    //   PTP  — NCCI procedure-to-procedure edits. A column-2 code billed with its
    //          column-1 code on the same day is bundled and not separately payable.
    //          Modifier indicator 1 means a 59/X{EPSU} modifier may override it *if*
    //          a distinct service is documented; 0 means no override is permitted.
    //   MUE  — medically unlikely edits: the max units of a code per day.
    //   MOD  — is each modifier even valid on this code?
    // Reference tables are static (no RNG) so the hero scenarios stay byte-stable.
    CPT_XWALK: {
      // column-1 code : { column-2 codes bundled into it : NCCI modifier indicator }
      ptp: {
        "43239": { "43235": 1 },              // EGD w/ biopsy includes the diagnostic EGD
        "20610": { "99213": 1, "99214": 1 },  // E/M bundled into the injection unless separately identifiable
        "90935": { "99213": 1 },
        "97110": { "97140": 1 },
        "99283": { "93000": 0 }               // indicator 0 — no override permitted
      },
      // max units per code per day
      mue: { "99211": 1, "99212": 1, "99213": 1, "99214": 1, "99215": 1, "43239": 1, "43235": 1, "90935": 1, "93000": 1, "71046": 2, "97110": 4, "70551": 1, "20610": 2, "99283": 1, "E1390": 1, "D0120": 1, "D1110": 1, "H0018": 30 },
      mod: {
        "25": { name: "Significant, separately identifiable E/M service", appliesTo: "em", note: "Valid only on an E/M code billed alongside a procedure the same day." },
        "59": { name: "Distinct procedural service", appliesTo: "proc", note: "Valid only on a procedure code, and only to override an NCCI PTP edit when a distinct session/site is documented." },
        "XU": { name: "Unusual non-overlapping service", appliesTo: "proc", note: "NCCI-specific subset of modifier 59." },
        "XS": { name: "Separate structure", appliesTo: "proc", note: "NCCI-specific subset of modifier 59." },
        "26": { name: "Professional component", appliesTo: "pctc", note: "Valid only on codes with a professional/technical split." },
        "TC": { name: "Technical component", appliesTo: "pctc", note: "Valid only on codes with a professional/technical split." },
        "50": { name: "Bilateral procedure", appliesTo: "bilat", note: "Valid only on bilateral-eligible procedures." },
        "76": { name: "Repeat procedure by the same physician", appliesTo: "proc", note: "Valid on a repeated procedure the same day." },
        "91": { name: "Repeat clinical diagnostic laboratory test", appliesTo: "lab", note: "Valid only on clinical lab codes." }
      },
      pctc: ["70551", "71046", "93000"],
      bilat: ["20610", "71046"]
    },
    getCptCrosswalk: function (claimId) {
      var cl = claims[claimId]; if (!cl) return null;
      if (cl.type === "NCPDP") return null;
      var X = this.CPT_XWALK, lines = cl.lines || [];
      var isEm = function (c) { return /^99/.test(c); };
      var codes = lines.map(function (l) { return l.cpt; });
      var overrideMods = ["59", "XU", "XS", "XE", "XP"];

      var rows = lines.map(function (l) {
        var mods = l.modifiers || [], checks = [], verdict = "pass";
        var worse = function (v) { var rank = { pass: 0, review: 1, fail: 2 }; if (rank[v] > rank[verdict]) verdict = v; };

        // --- PTP: is this line a column-2 code of another line on the same claim?
        var ptp = null;
        Object.keys(X.ptp).forEach(function (c1) {
          if (codes.indexOf(c1) < 0 || c1 === l.cpt) return;
          var ind = X.ptp[c1][l.cpt];
          if (ind === undefined) return;
          var ovr = mods.filter(function (m) { return overrideMods.indexOf(m) >= 0; });
          ptp = { column1: c1, column2: l.cpt, indicator: ind, overrides: ovr };
          if (ind === 0) {
            ptp.status = "fail";
            ptp.note = "Bundled into " + c1 + ". Modifier indicator 0 — no modifier may override this edit; the code is not separately payable.";
            worse("fail");
          } else if (!ovr.length) {
            ptp.status = "fail";
            ptp.note = "Bundled into " + c1 + " and billed without an override modifier — not separately payable in the same session.";
            worse("fail");
          } else {
            ptp.status = "review";
            ptp.note = "Bundled into " + c1 + ", overridden with modifier " + ovr.join("/") + ". Payable only if the record documents a distinct procedural service — verify before paying.";
            worse("review");
          }
        });

        // --- MUE
        var limit = X.mue[l.cpt], mue = null;
        if (limit !== undefined) {
          mue = { limit: limit, billed: l.units, exceeded: l.units > limit };
          if (mue.exceeded) { worse("fail"); mue.note = "Billed " + l.units + " units against an MUE of " + limit + " per day."; }
        }

        // --- modifier validity
        mods.forEach(function (m) {
          var def = X.mod[m];
          if (!def) { checks.push({ mod: m, name: "Unrecognized modifier", valid: false, note: "Not a recognized modifier for this code set." }); worse("fail"); return; }
          var ok = true, note = def.note;
          if (def.appliesTo === "em") ok = isEm(l.cpt);
          else if (def.appliesTo === "proc") ok = !isEm(l.cpt);
          else if (def.appliesTo === "pctc") ok = X.pctc.indexOf(l.cpt) >= 0;
          else if (def.appliesTo === "bilat") ok = X.bilat.indexOf(l.cpt) >= 0;
          else if (def.appliesTo === "lab") ok = false;
          if (!ok) { note = "Modifier " + m + " is not valid on " + l.cpt + ". " + def.note; worse("fail"); }
          // a 59-family modifier with no PTP edit to override is an unsupported override
          else if (overrideMods.indexOf(m) >= 0 && !ptp) {
            ok = false; worse("review");
            note = "Modifier " + m + " applied but no NCCI PTP edit exists for " + l.cpt + " on this claim — the override is unnecessary and may mask an unbundling pattern.";
          }
          checks.push({ mod: m, name: def.name, valid: ok, note: note });
        });

        return {
          cpt: l.cpt, description: l.description, modifiers: mods, units: l.units,
          ptp: ptp, mue: mue, modChecks: checks, verdict: verdict,
          flagged: (l.violatesRuleIds || []).length > 0
        };
      });

      var fails = rows.filter(function (r) { return r.verdict === "fail"; }).length;
      var reviews = rows.filter(function (r) { return r.verdict === "review"; }).length;
      return {
        source: "CMS NCCI edits + AMA CPT reference", asOf: "NCCI v31.1 · effective 2025-01-01",
        lines: rows, fails: fails, reviews: reviews,
        clean: rows.length - fails - reviews,
        determination: fails ? "Coding edits failed — one or more lines are not separately payable as billed"
          : reviews ? "Overrides present — payable only if the record documents a distinct service"
            : "All lines pass NCCI PTP, MUE and modifier validity checks",
        editsApplied: ["NCCI procedure-to-procedure (PTP) edits", "Medically unlikely edits (MUE) — units per day", "Modifier-to-code validity", "Modifier 59 / X{EPSU} override review"]
      };
    },

    // ---------------------------------------------------------------------------
    // CMS pricing calculation transparency — "show the math" (Element 2.1).
    // Everything here is DERIVED and back-solved so each line's calculated result
    // RECONCILES to the CMS-allowed amount already on getCmsPricing() — no data.js
    // regen, hero dollar figures never move. Four representative methodologies:
    //   Professional (837P) : MPFS   allowed = Σ(RVU × GPCI) × conversion factor
    //   Residential per-diem (H0018) : allowed = covered days × per-diem rate
    //   Outpatient / ED lines : OPPS  APC assignment + CMS status indicator
    //   Inpatient SUD stay    : MS-DRG grouper (IPPS) cross-check, incl. the
    //     invalid-DRG regrouping example (submitted 896 w/ MCC → corrected 897)
    // pricerLog is the ordered, auditable calculation trace.
    // ---------------------------------------------------------------------------
    CF_2025: 32.74,          // MPFS conversion factor, CY2025 ($/RVU)
    OPPS_CF_2025: 89.17,     // OPPS conversion factor, CY2025 ($/weight)
    IPPS_BASE_2025: 6564.13, // operating standardized base rate, FFY2025
    // GPCI locality 05 — realistic 3-dp indices, fixed (no RNG) so the math is stable.
    GPCI_BY_STATE: {
      TX: { work: 1.000, pe: 0.917, mp: 0.845 },
      AZ: { work: 1.000, pe: 0.936, mp: 0.808 },
      CA: { work: 1.041, pe: 1.128, mp: 0.611 },
      NV: { work: 1.005, pe: 1.010, mp: 0.949 },
      NM: { work: 1.000, pe: 0.905, mp: 0.869 },
      _: { work: 1.000, pe: 0.920, mp: 0.850 }
    },
    // APC assignment + status indicator for the outpatient/institutional codes we carry.
    APC_REF: {
      "99283": { apc: "5023", desc: "Level 3 Type A ED visit", si: "V" },
      "99284": { apc: "5024", desc: "Level 4 Type A ED visit", si: "V" },
      "93000": { apc: "5721", desc: "Level 1 Diagnostic Tests", si: "S" },
      "71046": { apc: "5521", desc: "Level 1 Imaging w/o Contrast", si: "S" },
      "70551": { apc: "5523", desc: "Level 3 Imaging w/o Contrast", si: "S" }
    },
    SI_LEGEND: {
      "S": "Significant procedure — not discounted, separately paid",
      "T": "Significant procedure — multiple-procedure reduction applies",
      "V": "ED / clinic visit — separately paid",
      "N": "Packaged — payment bundled into another service ($0)",
      "Q1": "Conditionally packaged — paid only if no separately-payable service on the claim",
      "J1": "Comprehensive APC — single payment for the whole encounter"
    },
    getPricerDetail: function (claimId) {
      var cl = claims[claimId]; if (!cl) return null;
      if (cl.type === "NCPDP") return null;
      var pricing = this.getCmsPricing(claimId); if (!pricing) return null; // authoritative cmsAllowed per line
      var p = providers[cl.providerId] || {}, inst = cl.type === "837I", st = p.state || "TX";
      var CF = this.CF_2025, OCF = this.OPPS_CF_2025, gpci = this.GPCI_BY_STATE[st] || this.GPCI_BY_STATE._;
      var self = this, log = [];
      var r2 = function (n) { return Math.round(n * 100) / 100; };
      var r3 = function (n) { return Math.round(n * 1000) / 1000; };
      var resid = (cl.lines || []).some(function (l) { return l.cpt === "H0018"; });

      var lines = pricing.lines.map(function (pl, idx) {
        var raw = (cl.lines || [])[idx] || {};
        var cpt = pl.cpt, allowed = pl.cmsAllowed; // TARGET the calc must reconcile to
        // ---- inpatient DRG-priced claim: a single claim-level IPPS line ----
        if (cl.inpatientSurgical) {
          return { method: "IPPS / MS-DRG", cpt: pl.cpt, description: pl.description, allowed: allowed, drgLine: true };
        }
        // ---- residential per-diem (institutional H0018) ----
        if (cpt === "H0018") {
          var billedDays = raw.units || 24;
          var rate = billedDays ? r2(raw.allowed / billedDays) : 640;    // per-diem rate = billed ÷ days ($640)
          var billedTotal = r2(raw.allowed);                             // 24 days × $640 as billed
          var coveredEquiv = Math.max(1, Math.round(allowed / rate));    // day-equivalent of the allowed amount
          var recover = r2(billedTotal - allowed);
          log.push({ step: idx + 1, code: cpt, method: "Per-diem", detail: billedDays + " days × " + usd(rate) + "/day = " + usd(billedTotal) + " billed → reference allowance " + usd(allowed) + " (≈" + coveredEquiv + " covered days)", result: allowed });
          return {
            method: "Per-diem (residential)", cpt: cpt, description: pl.description, allowed: allowed,
            perDiem: {
              rate: rate, billedDays: billedDays, billedTotal: billedTotal,
              coveredEquiv: coveredEquiv, uncoveredDays: Math.max(0, billedDays - coveredEquiv),
              recover: recover,
              formula: billedDays + " days × " + usd(rate) + "/day = " + usd(billedTotal) + " → reference-priced allowance " + usd(allowed),
              note: billedDays > coveredEquiv ? "The reference-priced allowance equates to ≈" + coveredEquiv + " covered days at the $" + rate + " per-diem — " + (billedDays - coveredEquiv) + " of the " + billedDays + " billed days exceed the authorized length of stay." : "All billed days are within the allowance."
            }
          };
        }
        // ---- OPPS / APC (institutional outpatient & ED lines) ----
        if (inst) {
          var ap = self.APC_REF[cpt] || { apc: "—", desc: pl.description, si: "S" };
          var packaged = allowed === 0;                 // only a truly $0-allowance line is packaged
          var opResult = allowed;                        // honor the fee-schedule allowed (reconciles to Comparison)
          var weight = opResult ? r3(opResult / OCF) : 0;
          var wageFactor = 1.021;                         // CBSA wage/locality adjustment (representative)
          var nationalRate = opResult ? r2(opResult / wageFactor) : 0;   // pre-wage-adjustment APC payment rate
          log.push({ step: idx + 1, code: cpt, method: "OPPS", detail: "APC " + ap.apc + " (SI " + ap.si + "): " + (packaged ? "packaged — $0 separate payment" : "weight " + weight + " × $" + OCF + " = " + usd(opResult)), result: opResult });
          return {
            method: "OPPS / APC", cpt: cpt, description: pl.description, allowed: opResult,
            apc: {
              code: ap.apc, desc: ap.desc, si: ap.si, siLabel: self.SI_LEGEND[ap.si] || ap.si,
              modifiers: raw.modifiers || [], nationalRate: nationalRate, wageFactor: wageFactor,
              packaged: packaged, weight: weight, conversionFactor: OCF, result: opResult,
              formula: packaged ? "Packaged into the encounter APC — no separate payment" : "APC payment rate " + usd(nationalRate) + " × wage/locality " + wageFactor.toFixed(3) + " = " + usd(opResult)
            }
          };
        }
        // ---- MPFS professional line: RVU × GPCI × CF, back-solved to cmsAllowed ----
        var totAdj = r2(allowed / CF);                  // Σ(RVU×GPCI) that ties to the allowed amount
        var sd = self._seed(claimId + cpt + idx, "mpfs");
        var pW = 0.48 + sd() * 0.14, pP = 0.34 + sd() * 0.12;
        var aW = r2(totAdj * pW), aP = r2(totAdj * pP), aM = r2(totAdj - aW - aP); // parts sum to totAdj exactly
        if (aM < 0.01) { aM = 0.01; aP = r2(totAdj - aW - aM); }
        var rvuW = r2(aW / gpci.work), rvuP = r2(aP / gpci.pe), rvuM = r2(aM / gpci.mp);
        log.push({ step: idx + 1, code: cpt, method: "MPFS", detail: "[(" + rvuW + "×" + gpci.work + ")+(" + rvuP + "×" + gpci.pe + ")+(" + rvuM + "×" + gpci.mp + ")] × $" + CF + " = " + usd(allowed), result: allowed });
        return {
          method: pl.methodology, cpt: cpt, description: pl.description, allowed: allowed,
          mpfs: {
            cf: CF, gpci: gpci, totalAdjustedRvu: totAdj,
            modifiers: raw.modifiers || [],
            components: [
              { label: "Work", rvu: rvuW, gpci: gpci.work, adjusted: aW },
              { label: "Practice expense", rvu: rvuP, gpci: gpci.pe, adjusted: aP },
              { label: "Malpractice", rvu: rvuM, gpci: gpci.mp, adjusted: aM }
            ],
            siteOfService: "11 — Office (non-facility)",
            formula: "[(RVUw×GPCIw) + (RVUpe×GPCIpe) + (RVUmp×GPCImp)] × CF × modifier adjustment",
            result: allowed
          }
        };
      });

      // ---- MS-DRG grouper (IPPS) — inpatient SUD stay cross-check + invalid-DRG recalc ----
      var drgGrouper = null;
      if (resid) {
        var d = this.getClaimDetail(claimId);
        var principal = (d.diagnoses || []).filter(function (x) { return x.type === "principal"; })[0] || null;
        var secs = (d.diagnoses || []).filter(function (x) { return x.type === "secondary"; });
        var relWeight = 0.5843, baseRate = this.IPPS_BASE_2025;
        var wageIndex = 0.9187, laborShare = 0.676, nonLaborShare = 0.324;
        var adjBase = r2(baseRate * (laborShare * wageIndex + nonLaborShare));
        var drgPayment = r2(relWeight * adjBase);
        log.push({ step: lines.length + 1, code: "MS-DRG 897", method: "IPPS", detail: "weight " + relWeight + " × adjusted base " + usd(adjBase) + " = " + usd(drgPayment) + " (representative)", result: drgPayment });
        drgGrouper = {
          assignedDrg: "897", description: "Alcohol/drug abuse or dependence w/o rehabilitation therapy w/o MCC",
          mdc: "20 — Alcohol / Drug Use & Alcohol / Drug Induced Organic Mental Disorders",
          principalDx: principal ? { code: principal.code, desc: principal.description } : null,
          secondaryDx: secs.map(function (x) { return { code: x.code, desc: x.description, poa: x.poa, mcc: false }; }),
          pcs: (d.procedures || []).map(function (x) { return { code: x.code, desc: x.description }; }),
          relativeWeight: relWeight, baseRate: baseRate, wageIndex: wageIndex,
          laborShare: laborShare, nonLaborShare: nonLaborShare, adjustedBase: adjBase,
          formula: "MS-DRG relative weight × [(labor share × wage index) + non-labor share] × standardized base rate",
          payment: drgPayment,
          note: "This stay was billed per-diem (revenue code 1002 / H0018). The MS-DRG grouper is shown as an IPPS cross-check — representative figures.",
          validation: {
            invalid: true,
            submittedDrg: "896", submittedDesc: "Alcohol/drug abuse or dependence w/o rehabilitation therapy w/ MCC",
            submittedWeight: 0.8577,
            regroupedDrg: "897", regroupedDesc: "Alcohol/drug abuse or dependence w/o rehabilitation therapy w/o MCC",
            regroupedWeight: relWeight,
            reason: "Secondary diagnoses coded to carry a major complication/comorbidity (MCC) are not present-on-admission or not clinically substantiated in the record. Removing the unsupported MCC regroups the encounter from DRG 896 to 897 — a lower relative weight.",
            weightDelta: r2(0.8577 - relWeight),
            paymentDelta: r2((0.8577 - relWeight) * adjBase)
          }
        };
      } else if (cl.inpatientSurgical) {
        // ---- inpatient surgical: invalid submitted DRG 030 → regrouped 026 → IPPS $28,595.58 ----
        var d2 = this.getClaimDetail(claimId);
        var ve = veterans[cl.veteranId] || {};
        var birthYear = parseInt(String(ve.dob || "1948").slice(0, 4), 10);
        var age = 2025 - birthYear;
        var principal2 = (d2.diagnoses || []).filter(function (x) { return x.type === "principal"; })[0] || null;
        var secs2 = (d2.diagnoses || []).filter(function (x) { return x.type === "secondary"; });
        var TARGET = 28595.58;
        var baseRate2 = this.IPPS_BASE_2025, wageIndex2 = 1.0489, laborShare2 = 0.676, nonLaborShare2 = 0.324;
        var adjBase2 = r2(baseRate2 * (laborShare2 * wageIndex2 + nonLaborShare2));
        var relWeight2 = 3.3920;                                  // MS-DRG 026 (representative)
        var operating = r2(relWeight2 * adjBase2);
        var dsh = r2(operating * 0.1013);                          // Disproportionate Share Hospital add-on
        var ime = r2(operating * 0.0587);                          // Indirect Medical Education add-on
        var capital = r2(TARGET - operating - dsh - ime);          // capital + outlier — reconciling remainder
        log.push({ step: 1, code: "MCE", method: "Grouper", detail: "Submitted DRG 030 (Spinal Procedures w/o CC/MCC) invalid for coded ICD-10-PCS craniotomy — regrouped to DRG 026", result: null });
        log.push({ step: 2, code: "MS-DRG 026", method: "IPPS", detail: "operating " + usd(operating) + " (wt " + relWeight2 + " × adj base " + usd(adjBase2) + ") + capital " + usd(capital) + " + DSH " + usd(dsh) + " + IME " + usd(ime) + " = " + usd(TARGET), result: TARGET });
        drgGrouper = {
          assignedDrg: "026", description: "Craniotomy & endovascular intracranial procedures w/o CC/MCC",
          mdc: "01 — Diseases & Disorders of the Nervous System",
          grouperInputs: { age: age, sex: ve.sex || "—", dischargeStatus: "01 — Discharged to home / self-care (routine)", los: (cl.losDays || 5) + " days" },
          principalDx: principal2 ? { code: principal2.code, desc: principal2.description } : null,
          secondaryDx: secs2.map(function (x) { return { code: x.code, desc: x.description, poa: x.poa, mcc: false }; }),
          pcs: (d2.procedures || []).map(function (x) { return { code: x.code, desc: x.description }; }),
          relativeWeight: relWeight2, baseRate: baseRate2, wageIndex: wageIndex2,
          laborShare: laborShare2, nonLaborShare: nonLaborShare2, adjustedBase: adjBase2,
          components: [
            { label: "Operating base payment", detail: "relative weight " + relWeight2 + " × adjusted base " + usd(adjBase2), amount: operating },
            { label: "Capital payment", detail: "capital + outlier component", amount: capital },
            { label: "DSH — Disproportionate Share Hospital", detail: "extra payment for facilities treating a large share of low-income patients", amount: dsh },
            { label: "IME — Indirect Medical Education", detail: "extra payment to teaching hospitals", amount: ime }
          ],
          formula: "MS-DRG relative weight × [(labor share × wage index) + non-labor share] × base rate, + capital + DSH + IME",
          payment: TARGET,
          note: "Inpatient claims are priced at the DRG level under IPPS. Every component is retained in the pricer log so the final reimbursement traces back to the claim inputs and CMS methodology.",
          validation: {
            invalid: true,
            submittedDrg: "030", submittedDesc: "Spinal Procedures w/o CC/MCC",
            submittedWeight: 1.7126,
            regroupedDrg: "026", regroupedDesc: "Craniotomy & endovascular intracranial procedures w/o CC/MCC",
            regroupedWeight: relWeight2,
            reason: "The submitted MS-DRG 030 (spinal) is not supported by the coded ICD-10-PCS procedures (craniotomy) and diagnoses. The Medicare Code Editor flags the DRG as invalid; the grouper evaluates the diagnosis, procedure and patient data and reassigns the encounter to MS-DRG 026, which is then priced through IPPS.",
            correctedPayment: TARGET
          }
        };
      }

      // ---- representative OPPS / OCE outcomes (outpatient claims) --------------
      // The Outpatient Code Editor validates coding/billing relationships and assigns
      // APC + status indicator. Shown when the claim carries an OPPS/APC line.
      var oppsOutcomes = null;
      if (inst && !cl.inpatientSurgical && lines.some(function (l) { return l.apc; })) {
        oppsOutcomes = {
          note: "The Outpatient Code Editor (OCE) validates coding and billing relationships and assigns APC + CMS status indicator per line. Representative outcomes:",
          rows: [
            { code: "99284-25", desc: "ED visit, level 4", apc: "5024", si: "V", siLabel: self.SI_LEGEND["V"], disposition: "Separately payable", allowed: 236.14 },
            { code: "93005", desc: "Electrocardiogram, tracing only", apc: "—", si: "N", siLabel: self.SI_LEGEND["N"], disposition: "Packaged — bundled into the visit APC", allowed: 0 },
            { code: "36415", desc: "Routine venipuncture", apc: "—", si: "N", siLabel: self.SI_LEGEND["N"], disposition: "Packaged — no separate payment", allowed: 0 },
            { code: "43239 / 43235", desc: "EGD with biopsy vs diagnostic EGD", apc: "5303", si: "T", siLabel: self.SI_LEGEND["T"], disposition: "Mutually exclusive — column-2 line denied", allowed: 0 },
            { code: "G0289", desc: "Arthroscopy, add-on (not covered here)", apc: "—", si: "E1", siLabel: "Not paid by Medicare — non-covered service", disposition: "Non-covered — line denied", allowed: 0 }
          ]
        };
      }

      return {
        source: "CMS reference pricing", asOf: (cl.inpatientSurgical ? "FFY2025 IPPS" : "CY2025 CMS fee schedules") + " · " + (p.state || "TX") + (cl.inpatientSurgical ? " · CBSA wage index" : " locality 05"),
        conversionFactor: CF, oppsConversionFactor: OCF,
        lines: lines, drgGrouper: drgGrouper, oppsOutcomes: oppsOutcomes, pricerLog: log,
        totals: { cmsAllowed: pricing.totals.cmsAllowed },
        methods: (function () {
          var m = {}; lines.forEach(function (l) { m[l.method] = true; }); return Object.keys(m);
        })()
      };
    },

    // Utilization management (clinical care guidelines): clinical criteria, level of care, LOS.
    getUtilizationMgmt: function (claimId) {
      var cl = claims[claimId]; if (!cl) return null;
      if (cl.type === "NCPDP") return null;
      var resid = (cl.lines || []).some(function (l) { return l.cpt === "H0018"; });
      var dialysis = (cl.lines || []).some(function (l) { return l.cpt === "90935"; });
      var em = (cl.lines || []).some(function (l) { return /^99/.test(l.cpt); });
      var rnd = this._seed(claimId, "um"), base = { source: "Clinical care guidelines", edition: "2025 edition" };
      if (resid) {
        return Object.assign(base, {
          guideline: { code: "BHG-RES", title: "Residential Behavioral Health Treatment" },
          levelOfCare: { recommended: "Intensive Outpatient / Partial Hospitalization", billed: "Residential — 24-hour" },
          lengthOfStay: { recommendedDays: 14, actualDays: 27 + Math.floor(rnd() * 4), unit: "days" },
          priorAuth: { required: true, number: "UM-" + (100000 + Math.floor(rnd() * 899999)), status: "Approved — 14 days" },
          criteria: [
            { label: "24-hour supervision medically necessary", met: false, note: "Documentation does not support 24-hour level of care beyond day 14." },
            { label: "Active treatment plan with measurable goals", met: true },
            { label: "Failed a lower level of care", met: true },
            { label: "Continued-stay criteria met (day 15+)", met: false, note: "Patient stable, no worsening — step-down indicated." }
          ],
          determination: "Does not meet continued-stay criteria beyond the authorized 14 days"
        });
      }
      if (dialysis) {
        return Object.assign(base, {
          guideline: { code: "ORG-DIAL", title: "Hemodialysis — Chronic (ESRD)" },
          levelOfCare: { recommended: "Outpatient dialysis 3×/week", billed: "Outpatient dialysis" },
          priorAuth: { required: false, number: null, status: "Standing ESRD order on file" },
          criteria: [
            { label: "ESRD diagnosis documented (N18.6)", met: true },
            { label: "Frequency ≤ 3 sessions / week", met: true, note: "Standing M/W/F regimen consistent with guideline." },
            { label: "Vascular access functioning", met: true }
          ],
          determination: "Meets criteria — frequency consistent with ESRD standing order"
        });
      }
      return Object.assign(base, {
        guideline: { code: "AMB-EM", title: "Ambulatory Evaluation & Management" },
        levelOfCare: { recommended: "Outpatient office visit", billed: "Outpatient office visit" },
        priorAuth: { required: false, number: null, status: "Not required for this service" },
        criteria: [
          { label: "Service medically necessary for documented condition", met: true },
          { label: "Level of service supported by documentation", met: !em, note: em ? "Clinical guideline mapping supports a lower E/M level than billed." : undefined },
          { label: "Frequency within expected range", met: true }
        ],
        determination: em ? "Review — documented complexity maps to a lower E/M level" : "Meets criteria"
      });
    },

    // ---------------------------------------------------------------------------
    // Reviewer-grade claim record (Round 6). Everything below is DERIVED, seeded and
    // deterministic — no data.js regen — so the hero dollar figures never move.
    // The remittance reconciles to the claim's existing paidAmount by construction:
    //   submitted (gross charge)  = allowed + CO-45 contractual write-off
    //   allowed (fee schedule)    = payer-paid + patient responsibility
    //   patient responsibility    = $0  (plan design — no member cost-share)
    //   Σ payer-paid              = claim.paidAmount   (byte-stable)
    // ---------------------------------------------------------------------------

    // ICD-10-CM descriptors (principal + the comorbidity pools we derive from). Kept
    // deliberately small; anything unseen falls back to a generic label.
    ICD10: {
      "K21.9": "Gastro-esophageal reflux disease without esophagitis",
      "F10.20": "Alcohol dependence, uncomplicated",
      "N18.6": "End stage renal disease",
      // GI / GERD comorbidities
      "E78.5": "Hyperlipidemia, unspecified", "I10": "Essential (primary) hypertension",
      "E11.9": "Type 2 diabetes mellitus without complications", "K29.70": "Gastritis, unspecified, without bleeding",
      "R10.13": "Epigastric pain", "F41.1": "Generalized anxiety disorder", "Z79.899": "Other long term (current) drug therapy",
      // Behavioral health / SUD comorbidities
      "F17.210": "Nicotine dependence, cigarettes, uncomplicated", "F32.9": "Major depressive disorder, single episode, unspecified",
      "E66.9": "Obesity, unspecified", "K70.30": "Alcoholic cirrhosis of liver without ascites",
      "R45.851": "Suicidal ideations", "F10.239": "Alcohol dependence with withdrawal, unspecified",
      // ESRD / renal comorbidities
      "I12.0": "Hypertensive chronic kidney disease with stage 5 CKD or ESRD", "E11.22": "Type 2 diabetes mellitus with diabetic chronic kidney disease",
      "D63.1": "Anemia in chronic kidney disease", "E83.42": "Hypomagnesemia",
      "N25.81": "Secondary hyperparathyroidism of renal origin", "Z99.2": "Dependence on renal dialysis",
      // Inpatient neurosurgical (DRG-grouper example)
      "D33.2": "Benign neoplasm of brain, unspecified", "G91.1": "Obstructive hydrocephalus",
      "G93.6": "Cerebral edema", "R51.9": "Headache, unspecified"
    },
    // Comorbidity pools keyed by the principal's category — the derived secondary Dx.
    COMORBIDITY_POOL: {
      K: ["E78.5", "I10", "E11.9", "K29.70", "R10.13", "F41.1", "Z79.899"],
      F: ["F17.210", "F32.9", "F41.1", "E66.9", "K70.30", "R45.851", "F10.239", "Z79.899"],
      N: ["I12.0", "E11.22", "D63.1", "E83.42", "N25.81", "Z99.2", "I10"],
      _: ["I10", "E78.5", "E11.9", "Z79.899", "F41.1"]
    },
    // ICD-10-PCS procedure descriptors (institutional 837I only).
    ICD10PCS: {
      "HZ2ZZZZ": "Detoxification Services for Substance Abuse Treatment",
      "HZ30ZZZ": "Individual Counseling for Substance Abuse Treatment, Cognitive",
      "HZ63ZZZ": "Group Counseling for Substance Abuse Treatment, Interpersonal",
      "GZ56ZZZ": "Psychotherapy for Mental Health, Interactive",
      "00B70ZZ": "Excision of Cerebral Hemisphere, Open Approach",
      "009600Z": "Drainage of Cerebral Ventricle with Drainage Device, Open Approach"
    },
    // Claim Adjustment Reason Codes (CARC) + Remittance Advice Remark Codes (RARC).
    // Standard X12 835 codes — real code numbers, synthetic amounts.
    CARC_CATALOG: {
      "45": { group: "CO", label: "Charge exceeds fee schedule / maximum allowable amount", kind: "Contractual obligation" },
      "97": { group: "CO", label: "Payment is included in the allowance for another service/procedure (bundled)", kind: "Contractual obligation" },
      "16": { group: "CO", label: "Claim/service lacks information or has submission/billing error(s)", kind: "Contractual obligation" },
      "59": { group: "CO", label: "Processed based on multiple or concurrent procedure rules", kind: "Contractual obligation" },
      "1": { group: "PR", label: "Deductible amount", kind: "Patient responsibility" }
    },
    RARC_CATALOG: {
      "N657": "This should be billed with the appropriate code for these services.",
      "N19": "Procedure code incidental to primary procedure.",
      "N130": "Consult plan benefit documents/guidelines for information about restrictions for this service.",
      "M80": "Not covered when performed during the same session/date as a previously processed service.",
      "M123": "Missing/incomplete/invalid name, strength, or dosage of the drug furnished.",
      "N59": "Please refer to your provider manual for additional program and provider information."
    },
    // Post-payment integrity remark attached to a flagged line, keyed by the rule that
    // fired. These are informational on the 835 (the claim was paid); they carry the
    // recovery basis a reviewer would act on. The dialysis frequency flag is benign —
    // clinical review clears it — which is exactly the human-in-the-loop dismiss story.
    _integrityRemark: function (ruleIds) {
      var ids = ruleIds || [];
      if (ids.indexOf("model_em_peer") >= 0) return { rarc: "N657", carc: "45", text: "Level-5 E/M not substantiated by the record — documentation supports 99213. Recoverable as the level-of-service differential.", recover: true };
      if (ids.indexOf("rule_ncci_43235_43239") >= 0 || ids.indexOf("rule_mod59") >= 0) return { rarc: "N19", carc: "97", text: "Diagnostic endoscopy is a component of 43239; modifier 59 not substantiated by a distinct procedural service. Recoverable as bundled.", recover: true };
      if (ids.indexOf("model_los") >= 0) return { rarc: "N130", carc: "16", text: "Continued-stay days beyond the authorized 14 are not supported by continued-stay criteria. Recoverable for the unauthorized days.", recover: true };
      if (ids.indexOf("rule_rx_nondispense") >= 0) return { rarc: "M123", carc: "16", text: "Brand billed with DAW 1 but a generic equivalent is available with no documented medical necessity; no dispensing (pickup) record on file for the quantity billed. Recoverable as non-dispensed / DAW misuse.", recover: true };
      if (ids.indexOf("model_freq") >= 0) return { rarc: "N59", carc: null, text: "Frequency flagged by the model; clinical review found it consistent with the ESRD standing order (M/W/F). No adjustment.", recover: false };
      return { rarc: "N59", carc: null, text: "Flagged for post-payment integrity review — see the rule-engine outcomes on the Evidence tab.", recover: false };
    },

    // A stable helper — add whole days to an ISO date (deterministic in the browser).
    _addDays: function (iso, n) { var d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + (n || 0)); return d.toISOString().slice(0, 10); },

    // The consolidated claim record: header + diagnoses + procedures + adjudicated
    // service lines + remittance, all reconciled to the existing paidAmount.
    getClaimDetail: function (claimId) {
      var cl = claims[claimId]; if (!cl) return null;
      if (cl.type === "NCPDP") return this.getPharmacyDetail(claimId);
      var p = providers[cl.providerId] || {}, ve = veterans[cl.veteranId] || {};
      var inst = cl.type === "837I";
      var resid = (cl.lines || []).some(function (l) { return l.cpt === "H0018"; });
      var dialysis = (cl.lines || []).some(function (l) { return l.cpt === "90935"; });
      var rnd = this._seed(claimId, "detail");
      var self = this;

      // ---- place of service / bill type (same mapping as get837) ----
      var pos = inst ? (resid ? "55" : "21") : (dialysis ? "65" : "11");
      var posLabel = { "11": "Office", "21": "Inpatient Hospital", "22": "Outpatient Hospital", "55": "Residential Facility", "65": "ESRD Facility", "12": "Home" }[pos] || pos;
      var billType = inst ? (resid ? "86X — Special facility (residential)" : "111 — Hospital inpatient") : null;

      // ---- diagnoses: principal + seeded secondaries with POA (institutional) ----
      var principal = (cl.diagnosisCodes || [])[0] || null;
      var pool = (this.COMORBIDITY_POOL[(principal || "_").charAt(0)] || this.COMORBIDITY_POOL._).slice();
      // deterministic shuffle + count (institutional carries a fuller problem list)
      for (var s = pool.length - 1; s > 0; s--) { var j = Math.floor(rnd() * (s + 1)); var t = pool[s]; pool[s] = pool[j]; pool[j] = t; }
      var secCount = inst ? 6 + Math.floor(rnd() * 4) : 2 + Math.floor(rnd() * 3);
      var secs = pool.filter(function (c) { return c !== principal; }).slice(0, secCount);
      // inpatient-surgical claims carry an explicit coded problem list (use it verbatim)
      if (cl.inpatientSurgical && (cl.diagnosisCodes || []).length > 1) secs = cl.diagnosisCodes.slice(1);
      var poaCodes = ["Y", "Y", "Y", "N", "W", "U"];
      var diagnoses = [];
      if (principal) diagnoses.push({ seq: 1, code: principal, description: this.ICD10[principal] || "Diagnosis " + principal, type: "principal", poa: inst ? "Y" : null });
      secs.forEach(function (c, i) { diagnoses.push({ seq: diagnoses.length + 1, code: c, description: self.ICD10[c] || "Diagnosis " + c, type: "secondary", poa: inst ? poaCodes[i % poaCodes.length] : null }); });

      // ---- ICD-10-PCS procedures (institutional only) ----
      var procedures = [];
      if (inst) {
        var pcs = cl.pcsCodes ? cl.pcsCodes.slice() : (resid ? ["HZ2ZZZZ", "HZ30ZZZ", "HZ63ZZZ"] : ["GZ56ZZZ"]);
        pcs.forEach(function (code, i) { procedures.push({ seq: i + 1, code: code, description: self.ICD10PCS[code] || code, date: cl.dateOfService }); });
      }

      // ---- rendering / attending provider (deterministic, synthetic NPI) ----
      var npi = function () { return "1" + String(100000000 + Math.floor(rnd() * 899999999)); };
      var attendingNames = ["Dr. A. Morgan", "Dr. L. Chen", "Dr. R. Patel", "Dr. S. Okafor"];
      var attending = attendingNames[Math.floor(rnd() * attendingNames.length)];
      var attendingNpi = npi(), renderingNpi = npi();

      // ---- statement / admit-discharge dates + DRG + discharge status (institutional) ----
      var los = null, admitDate = null, dischargeDate = null, drg = null, dischargeStatus = null;
      if (inst) {
        if (cl.inpatientSurgical) {
          los = cl.losDays || 5;
          admitDate = cl.dateOfService; dischargeDate = this._addDays(admitDate, los);
          drg = (cl.submittedDrg || "030") + " — Spinal Procedures w/o CC/MCC (submitted)";
          dischargeStatus = "01 — Discharged to home / self-care (routine)";
        } else {
          var um = this.getUtilizationMgmt(claimId);
          los = (um && um.lengthOfStay && um.lengthOfStay.actualDays) || (resid ? 27 : 4);
          admitDate = cl.dateOfService;
          dischargeDate = this._addDays(admitDate, los);
          drg = resid ? "896 — Alcohol/drug abuse or dependence w/o rehabilitation therapy w/o MCC" : "897 — Alcohol/drug abuse or dependence w/o rehabilitation therapy";
          dischargeStatus = "01 — Discharged to home / self-care (routine)";
        }
      }

      // ---- service lines with line-level adjudication ----
      var carcUsed = {}, rarcUsed = {};
      var lines = (cl.lines || []).map(function (l, i) {
        var flagged = (l.violatesRuleIds || []).length > 0;
        var allowed = l.allowed, paid = l.paid;                 // byte-stable
        // gross submitted charge: deterministic markup over the fee-schedule allowed
        var submitted = Math.max(l.billed, Math.round(allowed * (1.6 + rnd() * 1.2)));
        var co45 = Math.round((submitted - allowed) * 100) / 100; // contractual write-off (CARC CO-45)
        var patientResp = 0;                                     // no member cost-share under this plan
        var carc = [];
        if (co45 > 0) { carc.push({ group: "CO", code: "45", amount: co45 }); carcUsed["45"] = true; }
        var remark = flagged ? self._integrityRemark(l.violatesRuleIds) : null;
        if (remark) { rarcUsed[remark.rarc] = true; if (remark.carc) carcUsed[remark.carc] = true; }
        return {
          lineNo: i + 1, cpt: l.cpt, description: l.description, modifiers: l.modifiers || [], units: l.units || 1,
          revenueCode: inst ? (l.cpt === "H0018" ? "1002" : "0" + (250 + i * 50)) : null,
          renderingNpi: renderingNpi,
          submitted: submitted, allowed: allowed, contractual: co45, patientResp: patientResp, paid: paid,
          carc: carc, remark: remark, flagged: flagged
        };
      });

      var sum = function (k) { return Math.round(lines.reduce(function (a, l) { return a + l[k]; }, 0) * 100) / 100; };
      var totals = { submitted: sum("submitted"), contractual: sum("contractual"), allowed: sum("allowed"), patientResp: sum("patientResp"), paid: sum("paid") };
      // recovery basis (post-pay) — the exposure a reviewer would pursue on the flagged lines
      var recoverable = Math.round(lines.filter(function (l) { return l.remark && l.remark.recover; }).reduce(function (a, l) { return a + l.paid; }, 0) * 100) / 100;

      var carcLegend = Object.keys(carcUsed).map(function (c) { return { code: c, group: self.CARC_CATALOG[c] ? self.CARC_CATALOG[c].group : "CO", label: self.CARC_CATALOG[c] ? self.CARC_CATALOG[c].label : c, kind: self.CARC_CATALOG[c] ? self.CARC_CATALOG[c].kind : "" }; });
      var rarcLegend = Object.keys(rarcUsed).map(function (c) { return { code: c, label: self.RARC_CATALOG[c] || c }; });

      return {
        header: {
          controlNumber: cl.claimNumber, type: cl.type, formName: inst ? "837I / UB-04 institutional" : "837P / CMS-1500 professional",
          placeOfService: pos + " — " + posLabel, billType: billType,
          dateOfService: cl.dateOfService, statementDates: inst ? (admitDate + " – " + dischargeDate) : cl.dateOfService,
          admitDate: admitDate, dischargeDate: dischargeDate, lengthOfStay: los, drg: drg, dischargeStatus: dischargeStatus,
          attending: inst ? { name: attending, npi: attendingNpi } : null,
          rendering: inst ? null : { name: p.name, npi: renderingNpi },
          billingProvider: { name: p.name, npi: p.npi, tin: p.tin, taxonomy: p.taxonomyCode || "—" },
          payer: "Health Plan Network (HPN)", subscriber: { name: ve.name || "—", memberId: ve.memberId || "—", dob: ve.dob || "—", sex: ve.sex || "—" },
          claimStatus: cl.claimStatus, paymentType: cl.paymentType, mode: cl.mode || "retrospective"
        },
        diagnoses: diagnoses, procedures: procedures, serviceLines: lines,
        benefitContract: {
          benefitPlan: "Health Plan — Medical benefit",
          coverage: "Covered service · adjudicated in-network",
          costShare: "Member cost-share $0 · no deductible / copay / coinsurance",
          network: "In-network · Health Plan Network",
          rateBasis: "Contracted rate — Payer fee schedule / CMS " + (inst ? "OPPS" : "MPFS") + " fee schedule · " + (p.state || "TX") + " locality 05",
          authorization: cl.authorizationId ? ("Prior authorization " + cl.authorizationId + " on file") : "No prior authorization required for this service"
        },
        remittance: { totals: totals, patientResponsibility: 0, recoverable: recoverable, carc: carcLegend, rarc: rarcLegend },
        reconciliation: "Submitted charge − CO-45 contractual write-off = fee-schedule allowed; allowed − $0 member cost-share = payer-paid. Payer-paid ties to the paid amount on file (" + usd(cl.paidAmount) + ")."
      };
    },

    // The same claim expressed as an HL7 FHIR R4 ExplanationOfBenefit resource (CARIN
    // Blue Button-aligned) — for the interoperability toggle on the Claim tab.
    getClaimFhir: function (claimId) {
      var d = this.getClaimDetail(claimId); if (!d) return null;
      var cl = claims[claimId], inst = d.header.type === "837I", h = d.header;
      var money = function (v) { return { value: Math.round(v * 100) / 100, currency: "USD" }; };
      var eob = {
        resourceType: "ExplanationOfBenefit",
        id: String(h.controlNumber).replace(/[^A-Za-z0-9-]/g, "-"),
        meta: { profile: ["http://hl7.org/fhir/us/carin-bb/StructureDefinition/C4BB-ExplanationOfBenefit-" + (inst ? "Inpatient-Institutional" : "Professional-NonClinician")] },
        status: "active",
        type: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/claim-type", code: inst ? "institutional" : "professional" }] },
        use: "claim",
        patient: { reference: "Patient/" + h.subscriber.memberId, display: h.subscriber.name },
        billablePeriod: inst ? { start: h.admitDate, end: h.dischargeDate } : { start: h.dateOfService, end: h.dateOfService },
        insurer: { display: "Health Plan Network" },
        provider: { display: h.billingProvider.name, identifier: { system: "http://hl7.org/fhir/sid/us-npi", value: h.billingProvider.npi } },
        outcome: "complete",
        diagnosis: d.diagnoses.map(function (dx) {
          var o = { sequence: dx.seq, diagnosisCodeableConcept: { coding: [{ system: "http://hl7.org/fhir/sid/icd-10-cm", code: dx.code, display: dx.description }] }, type: [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/ex-diagnosistype", code: dx.type }] }] };
          if (dx.poa) o.onAdmission = { coding: [{ system: "https://www.cms.gov/Medicare/Medicare-Fee-for-Service-Payment/HospitalAcqCond/Coding", code: dx.poa }] };
          return o;
        })
      };
      if (inst && d.procedures.length) eob.procedure = d.procedures.map(function (pr) { return { sequence: pr.seq, procedureCodeableConcept: { coding: [{ system: "http://www.cms.gov/Medicare/Coding/ICD10", code: pr.code, display: pr.description }] }, date: pr.date }; });
      if (inst && h.drg) eob.supportingInfo = [{ sequence: 1, category: { coding: [{ code: "drg" }] }, code: { text: h.drg } }];
      eob.item = d.serviceLines.map(function (l) {
        var adj = [
          { category: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/adjudication", code: "submitted" }] }, amount: money(l.submitted) },
          { category: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/adjudication", code: "eligible" }] }, amount: money(l.allowed) },
          { category: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/adjudication", code: "deductible" }] }, amount: money(l.patientResp) },
          { category: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/adjudication", code: "benefit" }] }, amount: money(l.paid) }
        ];
        l.carc.forEach(function (c) { adj.push({ category: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/adjudication", code: "adjustmentreason" }] }, reason: { coding: [{ system: "https://x12.org/codes/claim-adjustment-reason-codes", code: c.group + "-" + c.code }] }, amount: money(c.amount) }); });
        var item = {
          sequence: l.lineNo,
          productOrService: l.ndc
            ? { coding: [{ system: "http://hl7.org/fhir/sid/ndc", code: l.ndc, display: l.description }] }
            : { coding: [{ system: "http://www.ama-assn.org/go/cpt", code: l.cpt, display: l.description }] },
          servicedDate: cl.dateOfService, quantity: l.ndc ? { value: l.units, unit: "each" } : { value: l.units },
          unitPrice: money(l.submitted), net: money(l.submitted), adjudication: adj
        };
        if (l.ndc && l.daysSupply) item.detail = [{ sequence: 1, productOrService: item.productOrService, quantity: { value: l.daysSupply, unit: "days-supply" } }];
        if (l.modifiers.length) item.modifier = l.modifiers.map(function (m) { return { coding: [{ system: "http://www.ama-assn.org/go/cpt", code: m }] }; });
        if (l.revenueCode) item.revenue = { coding: [{ system: "https://www.nubc.org/CodeSystem/RevenueCodes", code: l.revenueCode }] };
        return item;
      });
      eob.total = [
        { category: { coding: [{ code: "submitted" }] }, amount: money(d.remittance.totals.submitted) },
        { category: { coding: [{ code: "eligible" }] }, amount: money(d.remittance.totals.allowed) },
        { category: { coding: [{ code: "benefit" }] }, amount: money(d.remittance.totals.paid) }
      ];
      eob.payment = { amount: money(d.remittance.totals.paid) };
      return eob;
    },

    // ------------------------------------------------------------------
    // Pharmacy (NCPDP / NDC) claim record — the same reviewer-grade shape as
    // getClaimDetail but for a retail-pharmacy prescription claim. NDC lives here.
    // Reconciles to the claim's paid amount the same way (member cost-share $0).
    // ------------------------------------------------------------------
    getPharmacyDetail: function (claimId) {
      var cl = claims[claimId]; if (!cl) return null;
      var p = providers[cl.providerId] || {}, ve = veterans[cl.veteranId] || {};
      var rnd = this._seed(claimId, "rx"), self = this;
      var npi = function () { return "1" + String(100000000 + Math.floor(rnd() * 899999999)); };
      var prescriberNpi = npi();
      var principal = (cl.diagnosisCodes || [])[0] || null;
      var diagnoses = principal ? [{ seq: 1, code: principal, description: this.ICD10[principal] || "Diagnosis " + principal, type: "principal", poa: null }] : [];

      var carcUsed = {}, rarcUsed = {};
      var lines = (cl.lines || []).map(function (l, i) {
        var flagged = (l.violatesRuleIds || []).length > 0;
        var allowed = l.allowed, paid = l.paid;
        var submitted = Math.max(l.billed, Math.round(allowed * (1.5 + rnd() * 0.9)));
        var co45 = Math.round((submitted - allowed) * 100) / 100;
        var carc = [];
        if (co45 > 0) { carc.push({ group: "CO", code: "45", amount: co45 }); carcUsed["45"] = true; }
        var remark = flagged ? self._integrityRemark(l.violatesRuleIds) : null;
        if (remark) { rarcUsed[remark.rarc] = true; if (remark.carc) carcUsed[remark.carc] = true; }
        return {
          lineNo: i + 1, ndc: l.ndc, cpt: l.ndc, description: l.description, drugName: l.drugName || l.description,
          modifiers: [], units: l.units || 1, qtyDispensed: l.qtyDispensed || l.units, daysSupply: l.daysSupply || null,
          daw: l.daw || "0 — No product selection indicated", rxNumber: l.rxNumber || null, refill: l.refill || "00", prescriberNpi: prescriberNpi,
          submitted: submitted, allowed: allowed, contractual: co45, patientResp: 0, paid: paid,
          carc: carc, remark: remark, flagged: flagged
        };
      });
      var sum = function (k) { return Math.round(lines.reduce(function (a, l) { return a + l[k]; }, 0) * 100) / 100; };
      var totals = { submitted: sum("submitted"), contractual: sum("contractual"), allowed: sum("allowed"), patientResp: 0, paid: sum("paid") };
      var recoverable = Math.round(lines.filter(function (l) { return l.remark && l.remark.recover; }).reduce(function (a, l) { return a + l.paid; }, 0) * 100) / 100;
      var carcLegend = Object.keys(carcUsed).map(function (c) { return { code: c, group: self.CARC_CATALOG[c] ? self.CARC_CATALOG[c].group : "CO", label: self.CARC_CATALOG[c] ? self.CARC_CATALOG[c].label : c, kind: self.CARC_CATALOG[c] ? self.CARC_CATALOG[c].kind : "" }; });
      var rarcLegend = Object.keys(rarcUsed).map(function (c) { return { code: c, label: self.RARC_CATALOG[c] || c }; });

      return {
        pharmacy: true,
        header: {
          controlNumber: cl.claimNumber, type: "NCPDP", formName: "NCPDP D.0 telecommunication (retail pharmacy)",
          placeOfService: "01 — Pharmacy", billType: null, dateOfService: cl.dateOfService, statementDates: cl.dateOfService,
          rxNumber: (lines[0] && lines[0].rxNumber) || null,
          pharmacyName: p.name, pharmacyNpi: p.npi, ncpdpId: p.ncpdp || "—", pharmacyDea: cl.pharmacyDea || null,
          binPcn: cl.binPcn || "610239 / HPNRX",
          prescriber: { name: cl.prescriber || "Dr. M. Alvarez", npi: prescriberNpi },
          billingProvider: { name: p.name, npi: p.npi, tin: p.tin, taxonomy: p.taxonomyCode || "3336C0003X" },
          payer: "Health Plan Network — Pharmacy (HPN Rx)", subscriber: { name: ve.name || "—", memberId: ve.memberId || "—", dob: ve.dob || "—", sex: ve.sex || "—" },
          claimStatus: cl.claimStatus, paymentType: cl.paymentType, mode: cl.mode || "retrospective"
        },
        diagnoses: diagnoses, procedures: [], serviceLines: lines,
        benefitContract: {
          benefitPlan: "Health Plan — Pharmacy benefit",
          coverage: "Covered drug · on formulary · adjudicated in-network",
          costShare: "Member cost-share $0 · no copay",
          network: "In-network · plan pharmacy network",
          rateBasis: "Contracted rate — NADAC / pharmacy fee schedule + dispensing fee",
          authorization: cl.authorizationId ? ("Prior authorization " + cl.authorizationId + " on file") : "No prior authorization required for this drug"
        },
        remittance: { totals: totals, patientResponsibility: 0, recoverable: recoverable, carc: carcLegend, rarc: rarcLegend },
        reconciliation: "Submitted (ingredient cost + dispensing fee) − CO-45 contractual = plan allowed; allowed − $0 member cost-share = plan-paid. Plan-paid ties to the paid amount on file (" + usd(cl.paidAmount) + ")."
      };
    },

    // NCPDP D.0 telecommunication representation (the pharmacy analog of get837).
    getNcpdp: function (claimId) {
      var cl = claims[claimId]; if (!cl || cl.type !== "NCPDP") return null;
      var d = this.getPharmacyDetail(claimId); var h = d.header;
      return {
        transaction: { standard: "NCPDP Telecommunication D.0", type: "B1 — Billing", bin: (h.binPcn.split(" / ")[0] || "610239"), pcn: (h.binPcn.split(" / ")[1] || "HPNRX"), softwareVendor: "HPN-RXSWITCH" },
        pharmacy: { qualifier: "01 — NPI", npi: h.pharmacyNpi, ncpdp: h.ncpdpId, name: h.pharmacyName, serviceProvider: "01 — Community/Retail" },
        patient: { memberId: h.subscriber.memberId, name: h.subscriber.name, dob: h.subscriber.dob, gender: h.subscriber.sex, relationship: "1 — Cardholder" },
        prescriber: { qualifier: "01 — NPI", npi: h.prescriber.npi, name: h.prescriber.name },
        claim: { rxServiceRef: h.rxNumber || "—", rxQualifier: "1 — Rx Billing", dateOfService: h.dateOfService, payer: h.payer },
        drugs: d.serviceLines.map(function (l, i) {
          return {
            line: i + 1, ndc: l.ndc, name: l.drugName, productQualifier: "03 — NDC",
            qtyDispensed: l.qtyDispensed, daysSupply: l.daysSupply, daw: l.daw, refill: l.refill,
            ingredientCost: l.submitted, dispensingFee: 1.40, patientPay: 0, planPaid: l.paid, flagged: l.flagged
          };
        })
      };
    },

    // Pharmacy claims are NCPDP, not 837 — the professional-claim engines (NCCI, MPFS,
    // clinical guidelines) don't apply. These early-outs let the Coding/Pricing/Utilization tabs show a
    // clear "not applicable" note instead of nonsensical CPT-based output.
    isPharmacyClaim: function (claimId) { var c = claims[claimId]; return !!(c && c.type === "NCPDP"); },

    // ---- Phase B seed: subject-of-investigation coverage --------------------
    // Adds a Pharmacy-subject lead (with a real NCPDP/NDC claim) and a Beneficiary-
    // subject lead so all three subject types show out of the box. Deterministic and
    // idempotent; inserts into the raw dataset AND the private lookup maps (the maps
    // are built once at init, so seeding must live here rather than in app.js).
    // All identifiers are impossible-to-be-real: NPI fails the 80840 check digit,
    // TIN uses the 00- prefix, NDC uses the 00000 labeler (never FDA-assigned).
    seedSubjects: function () {
      if (providers["PRX01"]) return; // already seeded this session

      // -- synthetic pharmacy (the Pharmacy subject) --
      var pharm = {
        id: "PRX01", name: "Lone Star Community Pharmacy", npi: "1730495861", tin: "00-4471903",
        ncpdp: "5551180", taxonomyCode: "3336C0003X", taxonomyLabel: "Community/Retail Pharmacy",
        city: "El Paso", state: "TX", peerGroup: "Pharmacy", role: "star",
        claimCount: 4120, totalPaid: 0, openAllegations: 1, riskScore: 87, groupScores: [], groupAttributes: {}, history: []
      };
      D.providers.push(pharm); providers[pharm.id] = pharm;

      // -- pharmacy NCPDP/NDC claim (NDC lives here) --
      var rxClaim = {
        id: "CPH01", claimNumber: "RX7742019-00-63", type: "NCPDP", providerId: "PRX01", veteranId: "V0001",
        dateOfService: "2025-05-14", diagnosisCodes: ["E11.9"], claimStatus: "Paid", paymentType: "POST", mode: "retrospective",
        binPcn: "610239 / HPNRX", prescriber: "Dr. Helen Ruiz",
        billedAmount: 4704, allowedAmount: 4704, paidAmount: 4704,
        authorizationId: null, paymentId: "PRX0001",
        lines: [
          { ndc: "00000-0471-30", drugName: "Insulin glargine 100 units/mL (brand)", description: "Insulin glargine 100 units/mL — 3 × 10 mL vials", units: 30, qtyDispensed: "30 mL", daysSupply: 30, daw: "1 — Substitution not allowed (brand medically necessary)", rxNumber: "RX-4471902", refill: "02", billed: 4680, allowed: 4680, paid: 4680, violatesRuleIds: ["rule_rx_nondispense"] },
          { ndc: "00000-2231-05", drugName: "Metformin HCl 500 mg tablet (generic)", description: "Metformin HCl 500 mg — 60 tablets", units: 60, qtyDispensed: "60 ea", daysSupply: 30, daw: "0 — No product selection indicated", rxNumber: "RX-4471903", refill: "05", billed: 24, allowed: 24, paid: 24, violatesRuleIds: [] }
        ]
      };
      D.claims.push(rxClaim); claims[rxClaim.id] = rxClaim;

      // -- rules the new leads reference (so Evidence resolves real rule objects) --
      [
        { id: "rule_rx_nondispense", code: "RX-NONDISP", name: "Prescription non-dispensing / DAW screen", source: "Payer policy", category: "Integrity", description: "Prescription billed with no matching dispensing (pickup) record, or brand billed under DAW-1 without documented medical necessity where a generic equivalent exists.", version: "1.0", effectiveDate: "2025-03-01", environment: "Production" },
        { id: "rule_ben_identity", code: "BEN-IDENT", name: "Beneficiary identity / card-sharing screen", source: "Payer policy", category: "Integrity", description: "One member ID billed across multiple unrelated providers with overlapping dates of service or duplicate high-cost services — indicates beneficiary identity misuse or card sharing.", version: "1.0", effectiveDate: "2025-02-01", environment: "Production" }
      ].forEach(function (r) { if (!rules[r.id]) { D.rules.push(r); rules[r.id] = r; } });

      // -- the two leads --
      [
        {
          id: "20805", providerId: "PRX01", claimId: "CPH01", subjectType: "Pharmacy", fwaType: "Non-dispensed prescriptions",
          riskScore: 87, confidence: 91, source: "Rules Engine", sourceType: "Rules", claimType: "NCPDP", status: "New", assignee: null,
          mode: "retrospective", exposurePre: 0, exposurePost: 61400, submittedForRecovery: 0, verifiedRecoupment: 0, narrative: "",
          ruleIds: ["rule_rx_nondispense"], modelId: null, createdDate: "2026-06-30",
          xai: {
            summary: "Lone Star Community Pharmacy shows a 22% rate of brand DAW-1 fills with no matching pickup (dispensing) record, concentrated in high-cost insulins and specialty drugs — 8.1σ above the retail-pharmacy peer norm. Pattern indicates billing for non-dispensed prescriptions and DAW-1 misuse.",
            factors: [
              { label: "Brand DAW-1 no-pickup rate", value: "22%", benchmark: "peer 1.3%" },
              { label: "Deviation", value: "8.1σ above peer group" },
              { label: "NDC in pattern", value: "Insulin glargine (brand)" },
              { label: "Claims in pattern", value: "906 of 4,120" }
            ]
          }
        },
        {
          id: "20806", providerId: "PR100", claimId: null, subjectType: "Beneficiary", subjectVeteranId: "V0007", fwaType: "Beneficiary identity misuse",
          riskScore: 78, confidence: 84, source: "Data mining", sourceType: "Data mining", status: "New", assignee: null,
          mode: "retrospective", exposurePre: 0, exposurePost: 18900, submittedForRecovery: 0, verifiedRecoupment: 0, narrative: "",
          ruleIds: ["rule_ben_identity"], modelId: null, createdDate: "2026-07-05",
          xai: {
            summary: "One member ID appears on claims from 6 distinct providers across TX, AZ and NM inside a 21-day window, with overlapping service dates and duplicate high-cost fills. The concentration points to beneficiary-side identity misuse / card sharing rather than any single provider's billing error.",
            factors: [
              { label: "Distinct billers · 21 days", value: "6 providers" },
              { label: "States", value: "TX · AZ · NM" },
              { label: "Overlapping DOS", value: "4 same-day pairs" },
              { label: "Duplicate high-cost fills", value: "3" }
            ]
          }
        }
      ].forEach(function (a) { if (!D.allegations.some(function (x) { return x.id === a.id; })) D.allegations.push(a); });

      // -- inpatient surgical claim with an INVALID submitted DRG (the MCE / DRG-grouper
      //    example: submitted 030 Spinal → regrouped 026 Craniotomy → IPPS $28,595.58) --
      var mceRule = { id: "rule_mce_drg", code: "MCE-DRG", name: "Invalid DRG — inpatient code edit (MCE)", source: "CMS payment rules", category: "Integrity", description: "Medicare Code Edit: the submitted MS-DRG is not supported by the claim's coded ICD-10-CM diagnoses and ICD-10-PCS procedures. The grouper reassigns the encounter to the correct DRG and the claim is repriced under IPPS.", version: "2.0", effectiveDate: "2025-01-01", environment: "Production" };
      if (!rules[mceRule.id]) { D.rules.push(mceRule); rules[mceRule.id] = mceRule; }

      var drgClaim = {
        id: "CDRG01", claimNumber: "K774X20K6-06-18", type: "837I", providerId: "PR202", veteranId: "V0006",
        dateOfService: "2025-06-18", diagnosisCodes: ["D33.2", "G91.1", "G93.6", "E11.9", "I10"],
        pcsCodes: ["00B70ZZ", "009600Z"], inpatientSurgical: true, submittedDrg: "030", correctedDrg: "026",
        dischargeStatus: "01", losDays: 5, claimStatus: "Paid", paymentType: "POST", mode: "retrospective",
        billedAmount: 41230, allowedAmount: 28595.58, paidAmount: 34210, authorizationId: "A00610", paymentId: "P00610",
        lines: [
          { lineId: "CDRG01-L1", cpt: "0360T", revenueCode: "0360", units: 1, billed: 24850, allowed: 24850, paid: 24850, description: "Operating room services (revenue 0360)", violatesRuleIds: ["rule_mce_drg"] },
          { lineId: "CDRG01-L2", cpt: "0110T", revenueCode: "0110", units: 5, billed: 11380, allowed: 11380, paid: 11380, description: "Room & board, private (revenue 0110)", violatesRuleIds: [] },
          { lineId: "CDRG01-L3", cpt: "0278T", revenueCode: "0278", units: 1, billed: 5000, allowed: 5000, paid: 5000, description: "Medical/surgical supplies — implants (revenue 0278)", violatesRuleIds: [] }
        ]
      };
      if (!claims[drgClaim.id]) { D.claims.push(drgClaim); claims[drgClaim.id] = drgClaim; }

      if (!D.allegations.some(function (x) { return x.id === "20901"; })) D.allegations.push({
        id: "20901", providerId: "PR202", claimId: "CDRG01", subjectType: "Provider", fwaType: "Invalid DRG (inpatient grouping)",
        riskScore: 81, confidence: 83, source: "Rules Engine", sourceType: "Rules", claimType: "837I", status: "New", assignee: null,
        mode: "retrospective", exposurePre: 0, exposurePost: 5614, submittedForRecovery: 0, verifiedRecoupment: 0, narrative: "",
        ruleIds: ["rule_mce_drg"], modelId: null, createdDate: "2026-07-02",
        xai: {
          summary: "Pecos Valley Hospital submitted this inpatient stay under MS-DRG 030 (Spinal Procedures w/o CC/MCC), but the coded ICD-10-PCS procedures (craniotomy) and diagnoses do not support that assignment. The Medicare Code Edit flagged the DRG as invalid; the grouper reassigns the encounter to MS-DRG 026 and reprices it under IPPS to $28,595.58.",
          factors: [
            { label: "Submitted DRG", value: "030 — Spinal Procedures w/o CC/MCC" },
            { label: "Grouper result", value: "Invalid for coded procedures" },
            { label: "Corrected DRG", value: "026 — Craniotomy w/o CC/MCC" },
            { label: "Repriced (IPPS)", value: "$28,595.58" }
          ]
        }
      });

      // -- Home Health Notice of Admission (NOA) example lead: a 30-day home-health
      //    period billed with no timely NOA → per-day payment reduction (rule_hh_noa).
      //    Gives the HH-NOA rule a real flagged claim to click through to (Element 1.2.ii). --
      var hhAgency = {
        id: "PR250", name: "Rio Verde Home Health Services", npi: "1902847761", tin: "00-7729104",
        taxonomyCode: "251E00000X", taxonomyLabel: "Home Health Agency",
        city: "McAllen", state: "TX", peerGroup: "251E00000X", role: "background", flagged: true,
        claimCount: 9, totalPaid: 0, openAllegations: 1, riskScore: 66, groupScores: [], groupAttributes: {}, history: []
      };
      if (!providers[hhAgency.id]) { D.providers.push(hhAgency); providers[hhAgency.id] = hhAgency; }

      var hhClaim = {
        id: "CHH01", claimNumber: "H551027K3-01-06", type: "837I", providerId: "PR250", veteranId: "V0009",
        dateOfService: "2026-01-06", diagnosisCodes: ["I50.9", "E11.9", "I10", "Z79.899"],
        typeOfBill: "0322", statementFrom: "2026-01-06", statementThrough: "2026-02-04",
        claimStatus: "Paid", paymentType: "POST", mode: "retrospective",
        billedAmount: 3860, allowedAmount: 3088, paidAmount: 3088, authorizationId: "A00622", paymentId: "P00622",
        lines: [
          { lineId: "CHH01-L1", cpt: "G0299", revenueCode: "0551", units: 6, billed: 1710, allowed: 1368, paid: 1368, description: "Skilled nursing — RN visit (revenue 0551)", violatesRuleIds: ["rule_hh_noa"] },
          { lineId: "CHH01-L2", cpt: "G0151", revenueCode: "0421", units: 4, billed: 1140, allowed: 912, paid: 912, description: "Physical therapy visit (revenue 0421)", violatesRuleIds: [] },
          { lineId: "CHH01-L3", cpt: "G0156", revenueCode: "0571", units: 5, billed: 1010, allowed: 808, paid: 808, description: "Home health aide visit (revenue 0571)", violatesRuleIds: [] }
        ]
      };
      if (!claims[hhClaim.id]) { D.claims.push(hhClaim); claims[hhClaim.id] = hhClaim; }

      // register the catalog-only NOA rule in the rule map so Evidence resolves it on the lead
      var hhNoaRule = this.RULE_CATALOG_EXTRA.find(function (r) { return r.id === "rule_hh_noa"; });
      if (hhNoaRule && !rules["rule_hh_noa"]) rules["rule_hh_noa"] = hhNoaRule;

      if (!D.allegations.some(function (x) { return x.id === "20812"; })) D.allegations.push({
        id: "20812", providerId: "PR250", claimId: "CHH01", subjectType: "Provider", fwaType: "Late Notice of Admission (home health)",
        riskScore: 66, confidence: 88, source: "Rules Engine", sourceType: "Rules", claimType: "837I", status: "New", assignee: null,
        mode: "retrospective", exposurePre: 0, exposurePost: 772, submittedForRecovery: 0, verifiedRecoupment: 0, narrative: "",
        ruleIds: ["rule_hh_noa"], modelId: null, createdDate: "2026-07-06",
        xai: {
          summary: "Rio Verde Home Health Services billed a 30-day home-health period (start of care 2026-01-06) with no Notice of Admission accepted within the required 5 calendar days. The Home Health NOA edit applies a per-day payment reduction from the start of care until the NOA posts — the skilled-nursing line is reduced accordingly.",
          factors: [
            { label: "Type of bill", value: "0322 — home health" },
            { label: "Start of care", value: "2026-01-06" },
            { label: "NOA on file", value: "None within 5 days" },
            { label: "Per-day reduction", value: "$772 recoverable" }
          ]
        }
      });
    }
  };
})();
