/* Networks — the portfolio of detected provider networks behind Insights › Network
   › All networks. Two come from the core dataset (the Meridian residential chain and
   the Alamo/Rio Grande shared-TIN ring) and are computed live, so their figures match
   every other screen. The other 18 are synthetic seed networks, fictional like all
   demo data (TINs use the 00- prefix, NPIs are not issued). Members are generated
   deterministically. Exposure = flagged paid + pending claims at the network's
   providers. Attaches to window.NETWORKS. */
(function () {
  var SCHEMES = {
    chain: { label: "Common-ownership chain", short: "Ownership chain", top: "OWNER", mid: "FACILITIES", bizKind: "Holding company", link: "Common ownership" },
    ring: { label: "Shared-TIN ring", short: "Shared TIN", top: "BILLING ENTITY", mid: "PROVIDERS", bizKind: "Billing entity", link: "Shared TIN" },
    agent: { label: "Shared billing agent", short: "Billing agent", top: "BILLING AGENT", mid: "PROVIDERS", bizKind: "Billing agent", link: "Same billing agent" },
    recruit: { label: "Patient recruiting", short: "Recruiting", top: "RECRUITER", mid: "PROVIDERS", bizKind: "Recruiter", link: "Paid referrals" },
    shell: { label: "Shell entities · shared address", short: "Shell entities", top: "SHARED ADDRESS", mid: "PROVIDERS", bizKind: "Shared mailing address", link: "Same mailing address" }
  };
  var SCHEME_ORDER = ["chain", "ring", "agent", "recruit", "shell"];

  // f: [name, state, excluded?]   vets: affected members   paid/pending: flagged $
  var SEED = [
    { id: "N03", scheme: "chain", owner: "Palmetto Shoals Care Partners LLC", officer: "Diane R. Kessler", type: "Residential rehab", status: "Under review", risk: 91, vets: 9, paid: 412800, pending: 38400,
      f: [["Palmetto Shoals Recovery", "FL"], ["Sandhill Crossing Treatment", "GA"], ["Magnolia Bend Residential", "AL"], ["Cypress Hollow Recovery", "FL"], ["Red Clay Wellness House", "GA"]] },
    { id: "N04", scheme: "chain", owner: "Cedar Ridge Health Holdings", officer: "Paul T. Varga", type: "Home health", status: "New", risk: 84, vets: 6, paid: 188300, pending: 22150,
      f: [["Cedar Ridge Home Health", "WA"], ["Willamette Home Care", "OR"], ["Columbia Gorge Home Health", "WA"]] },
    { id: "N05", scheme: "chain", owner: "Bluestem Therapy Group Inc.", officer: "Lorraine Okafor", type: "Physical therapy", status: "New", risk: 79, vets: 7, paid: 126900, pending: 14300,
      f: [["Bluestem PT Wichita", "KS"], ["Bluestem PT Joplin", "MO"], ["Prairie Motion Therapy", "OK"], ["Flint Hills Rehab", "KS"]] },
    { id: "N06", scheme: "chain", owner: "Maple Terrace Senior Living LLC", officer: "Gordon E. Pruitt", type: "Skilled nursing", status: "Under review", risk: 76, vets: 5, paid: 231400, pending: 0,
      f: [["Maple Terrace of Dayton", "OH"], ["Maple Terrace of Akron", "OH"], ["Buckeye Hollow Care Center", "OH"]] },
    { id: "N07", scheme: "ring", tin: "00-7314402", type: "Clinics", status: "Case open", risk: 88, vets: 6, paid: 97650, pending: 6200, referrals: 11,
      f: [["Harlan Street Medical", "NY"], ["Ferncliff Family Practice", "NY"], ["Eastbank Urgent Care", "NY"]] },
    { id: "N08", scheme: "ring", tin: "00-5528190", type: "Clinical labs", status: "New", risk: 72, vets: 4, paid: 58200, pending: 9900, referrals: 6,
      f: [["Lakeshore Diagnostic Lab", "IL"], ["Prairie State Pathology", "IL"]] },
    { id: "N09", scheme: "ring", tin: "00-4471635", type: "Clinics", status: "Under review", risk: 81, vets: 5, paid: 143500, pending: 12750, referrals: 8,
      f: [["Delaware Valley Pain Center", "PA"], ["Pinelands Spine & Pain", "NJ"], ["Schuylkill Interventional", "PA"]] },
    { id: "N10", scheme: "agent", owner: "Allegheny Ridge Claims Services", type: "DME suppliers", status: "Referred to OIG", risk: 93, vets: 8, paid: 356200, pending: 41800,
      f: [["Ridgeline Mobility Supply", "PA"], ["Ohio Valley Orthotics", "OH"], ["Mountaineer Medical Equipment", "WV"], ["Three Rivers DME", "PA"]] },
    { id: "N11", scheme: "agent", owner: "Red Mesa Revenue Partners", type: "Home health", status: "New", risk: 77, vets: 6, paid: 174900, pending: 19600,
      f: [["Front Range Home Health", "CO"], ["Wasatch Visiting Nurses", "UT"], ["Rio Abajo Home Care", "NM"]] },
    { id: "N12", scheme: "agent", owner: "Bayline Medical Billing", type: "Clinical labs", status: "Under review", risk: 74, vets: 5, paid: 88400, pending: 7300,
      f: [["Great Lakes Toxicology", "MI"], ["Hoosier Reference Lab", "IN"], ["Saginaw Bay Diagnostics", "MI"]] },
    { id: "N13", scheme: "agent", owner: "Prairie Billing Solutions", type: "Clinics", status: "New", risk: 63, vets: 3, paid: 41700, pending: 3100,
      f: [["Platte River Clinic", "NE"], ["Sandhills Family Medicine", "NE"]] },
    { id: "N14", scheme: "recruit", owner: "Lighthouse Path Outreach LLC", type: "Residential rehab", status: "Under review", risk: 89, vets: 8, paid: 298700, pending: 26400,
      f: [["Seabreeze Recovery Lodge", "FL"], ["Okefenokee Treatment Center", "GA"], ["Emerald Coast Detox", "FL"], ["Savannah Pines Recovery", "GA"]] },
    { id: "N15", scheme: "recruit", owner: "Foxglove Outreach Group", type: "Residential rehab", status: "New", risk: 80, vets: 6, paid: 165300, pending: 15800,
      f: [["Cumberland Ridge Recovery", "TN"], ["Bluegrass Haven Treatment", "KY"], ["Smoky Hollow Residential", "TN"]] },
    { id: "N16", scheme: "recruit", owner: "Bayou Lantern Recruiting", type: "Clinical labs", status: "New", risk: 69, vets: 5, paid: 72600, pending: 8800,
      f: [["Crescent Genetics Lab", "LA"], ["Acadiana Molecular", "LA"], ["Delta Point Diagnostics", "LA"]] },
    { id: "N17", scheme: "recruit", owner: "Coral Point Marketing LLC", type: "Pharmacies", status: "Case open", risk: 83, vets: 4, paid: 119800, pending: 11200,
      f: [["Biscayne Compounding Rx", "FL", true], ["Keys Specialty Pharmacy", "FL"]] },
    { id: "N18", scheme: "shell", owner: "PO Box 4471 · shared mailing address", type: "DME suppliers", status: "Under review", risk: 86, vets: 6, paid: 203100, pending: 24500,
      f: [["Mojave Medical Supply", "NV"], ["Saguaro Orthopedic Supply", "AZ"], ["Red Rock Respiratory", "NV"], ["Painted Desert DME", "AZ"]] },
    { id: "N19", scheme: "shell", owner: "PO Box 9120 · shared mailing address", type: "Clinical labs", status: "New", risk: 78, vets: 5, paid: 134200, pending: 12900,
      f: [["Hudson Gate Laboratories", "NJ"], ["Palisades Reference Lab", "NY"], ["Meadowlands Diagnostics", "NJ", true]] },
    { id: "N20", scheme: "shell", owner: "PO Box 2215 · shared mailing address", type: "Home health", status: "New", risk: 67, vets: 4, paid: 66300, pending: 5400,
      f: [["Chattahoochee Home Health", "GA"], ["Peachtree Visiting Care", "GA"], ["Altamaha Home Services", "GA"]] }
  ];

  // Cross-network links (synthetic): the same billing agent, recruiter, officer or
  // mailing address turning up in two detected networks. Drawn on the full map.
  var BRIDGES = [
    { a: "N14", b: "N03", type: "Paid referrals", detail: "Lighthouse Path Outreach also steers members to Palmetto Shoals facilities in FL and GA." },
    { a: "N15", b: "N03", type: "Shared members", detail: "Three members recruited by Foxglove Outreach were later billed by Palmetto Shoals facilities." },
    { a: "N10", b: "N09", type: "Same billing agent", detail: "Allegheny Ridge Claims Services also submits claims for Delaware Valley Pain Center." },
    { a: "N12", b: "N08", type: "Same billing agent", detail: "Bayline Medical Billing also submits claims for Lakeshore Diagnostic Lab." },
    { a: "N04", b: "N05", type: "Same registered agent", detail: "Cedar Ridge Health Holdings and Bluestem Therapy Group use the same registered agent and filing address." },
    { a: "N01", b: "N18", type: "Same mailing address", detail: "Desert Bloom Behavioral (Meridian) and Painted Desert DME list the same Arizona mailing address." },
    { a: "N19", b: "N07", type: "Shared members", detail: "Four members billed by the PO Box 9120 labs were also billed by the TIN 00-7314402 clinics." },
    { a: "N11", b: "N18", type: "Same billing agent", detail: "Red Mesa Revenue Partners also submits claims for Mojave Medical Supply." }
  ];

  var FIRST = ["James", "Maria", "Robert", "Linda", "Michael", "Patricia", "David", "Barbara", "William", "Elizabeth", "Richard", "Susan", "Joseph", "Jessica", "Thomas", "Sarah", "Charles", "Karen", "Daniel", "Nancy", "Anthony", "Lisa", "Mark", "Betty", "Steven", "Sandra", "Kevin", "Donna", "Brian", "Carol", "George", "Ruth", "Edward", "Sharon", "Ronald", "Michelle", "Kenneth", "Laura", "Gary", "Angela"];
  var LAST = ["Alvarez", "Brennan", "Castillo", "Dawson", "Ellison", "Fairbanks", "Gallagher", "Hollis", "Ingram", "Jarvis", "Kowalczyk", "Lindqvist", "Mercado", "Nakamura", "Oyelaran", "Pritchard", "Quintero", "Rasmussen", "Sokolov", "Thibodeaux", "Underwood", "Valdez", "Whitfield", "Yancey", "Zimmerman", "Abernathy", "Bustamante", "Cordova", "Delacroix", "Espinoza"];

  function rng(seed) { var x = seed; return function () { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; }; }
  function hash(s) { var h = 7; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 2147483647; return h; }

  // build a Collusion-graph model from a seed network
  function buildModel(n) {
    var sc = SCHEMES[n.scheme], r = rng(hash(n.id));
    var providers = n.f.map(function (f, i) {
      var tin = n.scheme === "ring" ? n.tin : "00-" + String(1000000 + Math.floor(r() * 8999999));
      return { id: n.id + "-P" + (i + 1), name: f[0], state: f[1], tin: tin, npi: "—", riskScore: Math.max(52, n.risk - Math.floor(r() * 14)), excluded: !!f[2] };
    });
    var veterans = [], vetLinks = [];
    for (var v = 0; v < n.vets; v++) {
      var id = n.id + "-V" + (v + 1), home = providers[Math.floor(r() * providers.length)];
      veterans.push({ id: id, name: FIRST[Math.floor(r() * FIRST.length)] + " " + LAST[Math.floor(r() * LAST.length)], city: "", state: home.state });
      var k = Math.min(providers.length, providers.length === 2 ? 2 : 2 + Math.floor(r() * 2)), start = Math.floor(r() * providers.length);
      for (var j = 0; j < k; j++) vetLinks.push({ source: id, target: providers[(start + j) % providers.length].id });
    }
    var links = [];
    if (n.referrals) for (var q = 0; q < n.referrals; q++) links.push({ source: providers[0].id, target: providers[1].id, type: "REFERRED_TO" });
    var states = providers.map(function (p) { return p.state; }).filter(function (s, i, a) { return a.indexOf(s) === i; });
    var nP = providers.length;
    var bizName = n.scheme === "ring" ? "TIN " + n.tin : n.owner;
    var subs = {
      chain: function (c) { return "Holding company" + (n.officer ? " · officer " + n.officer : "") + " · controls " + c; },
      ring: function (c) { return "One billing entity · " + c + " providers bill under it"; },
      agent: function (c) { return "Bills on behalf of " + c + " providers under separate TINs"; },
      recruit: function (c) { return "Steers members to " + c + " providers for paid referrals"; },
      shell: function (c) { return c + " providers registered to one mailing address"; }
    };
    return {
      synthetic: true, isRing: true, kind: n.scheme === "chain" ? "chain" : "ring",
      sharedTin: n.scheme === "ring", officer: n.officer || null, states: states,
      business: { id: n.id, name: bizName, kind: sc.bizKind },
      providers: providers, providerCount: nP, referralCount: n.referrals || 0,
      net: { providers: providers, veterans: veterans, vetLinks: vetLinks, links: links },
      labels: { top: sc.top, mid: sc.mid, bizKind: sc.bizKind, link: sc.link, bizSub: subs[n.scheme], bizTip: function (c) { return subs[n.scheme](c) + " · " + states.join(", "); } }
    };
  }

  // the two core-dataset networks, computed from the live data
  function coreRow(id, scheme, focus, status) {
    var s = window.Collusion.analyze(focus);
    var ids = s.providers.map(function (p) { return p.id; });
    var al = window.DP.raw.allegations.filter(function (a) { return ids.indexOf(a.providerId) >= 0; });
    var paid = al.reduce(function (t, a) { return t + (a.exposurePost || 0); }, 0);
    var pending = al.reduce(function (t, a) { return t + (a.exposurePre || 0); }, 0);
    var excl = s.providers.filter(function (p) { return window.DP.LEIE_EXCLUSIONS && window.DP.LEIE_EXCLUSIONS[p.id]; }).length;
    return {
      id: id, core: true, scenario: id === "N01" ? "chain" : "ring", scheme: scheme,
      name: s.business ? s.business.name : "", type: scheme === "chain" ? "Residential rehab" : "Clinics",
      states: s.states, facilities: s.providerCount, veterans: s.vetCount, excluded: excl,
      paid: paid, pending: pending, exposure: paid + pending, status: status,
      risk: Math.max.apply(null, s.providers.map(function (p) { return p.riskScore || 0; }))
    };
  }
  function seedRow(n) {
    var st = n.f.map(function (f) { return f[1]; }).filter(function (s, i, a) { return a.indexOf(s) === i; });
    return {
      id: n.id, core: false, scheme: n.scheme, name: n.scheme === "ring" ? "TIN " + n.tin : n.owner, type: n.type,
      states: st, facilities: n.f.length, veterans: n.vets, excluded: n.f.filter(function (f) { return f[2]; }).length,
      paid: n.paid, pending: n.pending, exposure: n.paid + n.pending, status: n.status, risk: n.risk
    };
  }

  // graph shape for the two core-dataset networks
  function coreModel(r) {
    var s = window.Collusion.analyze(r.scenario === "chain" ? "PR300" : "PR001");
    var ids = {}; s.providers.forEach(function (p) { ids[p.id] = 1; });
    return { providers: s.providers, net: { veterans: s.net.veterans, vetLinks: (s.net.vetLinks || []).filter(function (e) { return ids[e.target]; }) } };
  }

  var cache = null;
  var NETWORKS = {
    SCHEMES: SCHEMES, SCHEME_ORDER: SCHEME_ORDER,
    list: function () {
      if (!cache) {
        cache = [coreRow("N01", "chain", "PR300", "Under review"), coreRow("N02", "ring", "PR001", "Case open")].concat(SEED.map(seedRow));
        cache.forEach(function (r) { r.crossState = r.states.length > 1; });
      }
      return cache;
    },
    BRIDGES: BRIDGES,
    // Every network on one graph: hubs (owner / billing entity / agent / recruiter /
    // address), their providers, the affected members, and cross-network links.
    fullGraph: function () {
      var nodes = [], links = [], seen = {};
      var add = function (n) { if (!seen[n.id]) { seen[n.id] = 1; nodes.push(n); } };
      NETWORKS.list().forEach(function (r) {
        var m = r.core ? coreModel(r) : NETWORKS.model(r.id);
        var hub = "H-" + r.id;
        add({ id: hub, kind: "hub", net: r.id, name: r.name, scheme: r.scheme, exposure: r.exposure, states: r.states, core: r.core, scenario: r.scenario });
        m.providers.forEach(function (p) {
          add({ id: p.id, kind: "provider", net: r.id, name: p.name, state: p.state, risk: p.riskScore || 0, excluded: !!(p.excluded || (window.DP.LEIE_EXCLUSIONS && window.DP.LEIE_EXCLUSIONS[p.id])) });
          links.push({ source: hub, target: p.id, kind: "hub" });
        });
        m.net.veterans.filter(Boolean).forEach(function (v) { add({ id: v.id, kind: "veteran", net: r.id, name: v.name, state: v.state }); });
        (m.net.vetLinks || []).forEach(function (e) { if (seen[e.source] && seen[e.target]) links.push({ source: e.source, target: e.target, kind: "vet", net: r.id }); });
      });
      BRIDGES.forEach(function (b) { links.push({ source: "H-" + b.a, target: "H-" + b.b, kind: "bridge", type: b.type, detail: b.detail }); });
      return { nodes: nodes, links: links };
    },
    model: function (id) { var n = SEED.filter(function (x) { return x.id === id; })[0]; return n ? buildModel(n) : null; },
    // portfolio stats: totals, cross-state share, and the split by scheme type
    stats: function () {
      var rows = NETWORKS.list(), sum = function (k) { return rows.reduce(function (t, r) { return t + r[k]; }, 0); };
      var cross = rows.filter(function (r) { return r.crossState; }).length;
      var byScheme = SCHEME_ORDER.map(function (k) {
        var rs = rows.filter(function (r) { return r.scheme === k; }), c = rs.filter(function (r) { return r.crossState; }).length;
        return { scheme: k, label: SCHEMES[k].label, total: rs.length, cross: c, inState: rs.length - c, exposure: rs.reduce(function (t, r) { return t + r.exposure; }, 0) };
      });
      return { networks: rows.length, cross: cross, inState: rows.length - cross, crossPct: Math.round(cross / rows.length * 100),
        facilities: sum("facilities"), veterans: sum("veterans"), exposure: sum("exposure"), byScheme: byScheme };
    }
  };
  window.NETWORKS = NETWORKS;
})();
