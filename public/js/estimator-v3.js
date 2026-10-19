/* ==============================================================
   Fabric Project Estimator v3 - engine, presets, renderers, glue.

   Ported from the standalone estimator into the app as the Project
   Estimate view. Everything is wrapped in an IIFE because the original
   declared very generic globals (S, compute, esc, line, wp, n) that
   would otherwise collide with index.html. The only export is
   window.FabricEstimatorV3 at the bottom of this file.
   ============================================================== */
(function () {
/* ===== Fabric Project Estimator v3 – calculation engine (pure, no DOM) ===== */
const RATE_DEFS = [
 // key, group, label, unit, v21, hist, basis
 ['workshop','Discovery','Workshop (prep, run, write-up)','h / workshop',6,6,'v2.1 retained; ePlus up to 6 workshops within 40h business discovery'],
 ['srcAssess','Discovery','Source system assessed','h / source',3,5,'ePlus source & connectivity assessment 20h / 4 sources'],
 ['objSample','Discovery','Object sampled (representative)','h / object',0.18,0.18,'v2.1 retained (sample-based)'],
 ['assetInventory','Discovery','Legacy asset inventoried (full lineage)','h / asset',0,0.65,'ePlus 500h / 626 SSIS packages + procedures = 0.8h incl. reverse-engineering factor 1.25'],
 ['procSample','Discovery','Process sampled','h / process',1.2,1.2,'v2.1 retained'],
 ['reportAssess','Discovery','Report assessed (usage, KPI criticality)','h / report',0.35,0.8,'ePlus 40h / 38 reports incl. KPI criticality and SLA'],
 ['archBase','Discovery','Target architecture & design (x complexity)','h',32,40,'ePlus 72h (high complexity); Forteq 26h non-functional design'],
 ['secAssessConceptual','Discovery','Security assessment – conceptual','h',16,16,'v2.1 retained'],
 ['secAssessDetailed','Discovery','Security assessment – detailed','h',32,32,'v2.1 retained'],
 ['pocLight','Discovery','PoC validation – light','h',32,32,'v2.1 retained'],
 ['pocTechnical','Discovery','PoC validation – technical','h',64,64,'v2.1 retained; DB PoVs 60–125h'],
 ['foundationBasic','Platform','Foundation – basic setup','h',24,24,'ePlus platform setup 24h'],
 ['foundationProduction','Platform','Foundation – production (envs, Git, metadata framework)','h',60,84,'ePlus platform 24h + metadata framework 60h'],
 ['foundationEnterprise','Platform','Foundation – enterprise','h',100,116,'Energy Saving Trust platform foundation 116h'],
 ['srcConnector','Ingestion','Source connector (x connectivity)','h / source',12,12,'v2.1 retained; ePlus 16h/source (ODBC/SFTP), KB calibration 1–8h'],
 ['ingestObj','Ingestion','Ingestion object (x connectivity x load)','h / object',1.2,1.0,'ePlus 156h / 225 objects with metadata framework (0.7h); Forteq ~2.3h'],
 ['transformObj','Transformation','Transformation (x type x complexity)','h / transformation',2,2,'Medium-complexity Silver-layer transformation (notebook / dataflow incl. unit test); new in v3'],
 ['etlLow','Legacy','Low-complexity ETL asset','h / asset',0.8,0.8,'ePlus 150h / 200 key-mapping packages (0.75h)'],
 ['etlMed','Legacy','Medium ETL asset','h / asset',2.2,2.0,'ePlus 400h / 200 fact/dimension packages'],
 ['etlHigh','Legacy','High ETL / controller','h / asset',7,7,'v2.1 retained'],
 ['spSimple','Legacy','Simple stored procedure','h / proc',1.8,1.8,'v2.1 retained'],
 ['spComplex','Legacy','Complex stored procedure (>500 lines)','h / proc',12,24,'ePlus 240h / 10 complex procedures (e.g. commission logic)'],
 ['viewMig','Legacy','View migrated','h / view',0.6,0.5,'ePlus 70h / 137 Mart views'],
 ['dimension','Gold','Dimension','h / dimension',3.5,4,'KB calibration median (ePlus 6, Ali 4, Dilmon 5, EST 3, Forteq 3)'],
 ['fact','Gold','Fact','h / fact',6,6,'KB calibration 4–8 (ePlus 8, Ali 6, Dilmon 5, EST 4, Forteq 5)'],
 ['businessRule','Gold','Complex business rule','h / rule',12,12,'v2.1 retained'],
 ['consumptionView','Gold','Consumption view','h / view',0.8,0.5,'ePlus 70h / 137 views'],
 ['smBase','Semantic','Semantic model base','h / model',24,16,'KB hrsPerSemanticModel median 16 (Forteq 16, EST 16, ePlus 10, Ali 24)'],
 ['smTable','Semantic','Model table','h / table',1.1,1.1,'v2.1 retained; ePlus 120h for 50 tables / 440 measures'],
 ['smMeasureMig','Semantic','Migrated measure (DAX reused)','h / measure',0.22,0.22,'ePlus measures reused largely as-is'],
 ['smMeasureNew','Semantic','New measure / KPI (DAX authored)','h / measure',0.22,1,'Forteq 1h/KPI (back-test fit); KB hrsPerKpi range 1–3'],
 ['smCalc','Semantic','Calculation object','h / object',1.5,1.5,'v2.1 retained'],
 ['secStatic','Semantic','Security – static RLS','h / model',16,16,'v2.1 retained'],
 ['secDynamic','Semantic','Security – dynamic RLS','h / model',40,40,'v2.1 retained'],
 ['secHierarchy','Semantic','Security – hierarchy / OLS / CLS','h / model',64,60,'ePlus dynamic RLS 8-level hierarchy 60h'],
 ['reportBase','Reports','Report base','h / report',5,12,'KB hrsPerReport median 12 (ePlus 12, Ali 16, EST 16, Forteq 10)'],
 ['reportPage','Reports','Additional page','h / page',1.2,3,'KB tab impact ~30% of report base'],
 ['reconcileObj','Quality','Object reconciled','h / object',0.45,0.25,'ePlus 60h reconciliation framework / 366 objects (0.16h); higher on small scopes (Forteq)'],
 ['measureValidate','Quality','Measure validated (parity)','h / measure',0.12,0.08,'ePlus 40h / 540 measures'],
 ['securityTest','Quality','Security scenario tested','h / scenario',2,2,'v2.1 retained; ePlus 20h security testing'],
 ['schedule','Quality','Schedule / orchestration','h / schedule',4,6,'ePlus orchestration 24h / 4 SQL Agent jobs'],
 ['monitoringBasic','Quality','Monitoring – basic alerts','h',16,10,'ePlus failure notifications'],
 ['monitoringDashboard','Quality','Monitoring – dashboard + alerts','h',32,20,'ePlus monitoring & alerting 20h'],
 ['monitoringFramework','Quality','Monitoring – operational framework','h',56,44,'ePlus orchestration & monitoring WP 44h'],
 ['ktSession','Production','Knowledge-transfer session','h / session',6,6,'v2.1 retained; ePlus KT 24h'],
 ['purviewScan','Quality','Purview – workspace scan','h',16,16,'v2.1 retained'],
 ['purviewLineage','Quality','Purview – scan + lineage','h',40,40,'Milwaukee scanning + lineage 40h'],
 ['purviewIntegration','Quality','Purview – governance integration','h',72,74,'Milwaukee Purview governance scope 74h'],
 ['govBasic','Quality','Governance – basic standards','h',16,16,'v2.1 retained'],
 ['govOperational','Quality','Governance – operational','h',40,40,'v2.1 retained'],
 ['govEnterprise','Quality','Governance – enterprise design','h',80,80,'v2.1 retained'],
 ['testSetup','UAT','TEST environment setup','h',16,16,'v2.1 retained'],
 ['uatCycle','UAT','UAT cycle (plan, support, triage, close)','h / cycle',16,15,'ePlus UAT support 30h / 2 cycles'],
 ['uatTester','UAT','Tester preparation & support','h / tester',1.5,1.5,'v2.1 retained (ORS 15 users)'],
 ['uatDefectPct','UAT','Defect remediation allowance','% of build',10,7.5,'Midpoint of ePlus uatPct 10% and Forteq uatPct 5%'],
 ['testEvidence','UAT','Test evidence pack','h',16,16,'v2.1 retained'],
 ['prodSetup','Production','PROD environment setup','h',20,20,'v2.1 retained'],
 ['prodWave','Production','Deployment wave','h / wave',18,20,'ePlus production deployment 40h / 2 waves'],
 ['cutover','Production','Cutover planning','h',16,16,'v2.1 retained'],
 ['parallelWeek','Production','Parallel-run week','h / week',12,8,'ePlus 5-week UAT & parallel run covered by 30h UAT support + reconciliation'],
 ['hypercareWeek','Production','Hypercare week','h / week',10,10,'ePlus 30h / 3 weeks'],
 ['decommission','Production','Decommissioning plan','h',8,10,'ePlus decommissioning plan 10h'],
 ['otherSetup','Other env','OTHER environment setup','h',16,16,'v2.1 retained'],
 ['otherDeploy','Other env','OTHER environment deployment','h',12,12,'v2.1 retained'],
 ['otherSupport','Other env','OTHER environment support','h',8,8,'v2.1 retained'],
];
const DEFAULT_RATES = Object.fromEntries(RATE_DEFS.map(r => [r[0], r[5]]));
const V21_RATES = Object.fromEntries(RATE_DEFS.map(r => [r[0], r[4]]));
/* Organisation-wide calibration, loaded from the admin panel. Only the rates an
   administrator actually changed live here, so the engine's own defaults still
   apply to everything else. */
let ORG_RATES = {};
function baseRates() { return Object.assign({}, DEFAULT_RATES, ORG_RATES); }

const LEVELS = {
  foundation: {none: null, basic: 'foundationBasic', production: 'foundationProduction', enterprise: 'foundationEnterprise'},
  governance: {none: null, basic: 'govBasic', operational: 'govOperational', enterprise: 'govEnterprise'},
  monitoring: {none: null, basic: 'monitoringBasic', dashboard: 'monitoringDashboard', framework: 'monitoringFramework'},
  purview: {none: null, scan: 'purviewScan', lineage: 'purviewLineage', integration: 'purviewIntegration'},
  assessSecurity: {none: null, conceptual: 'secAssessConceptual', detailed: 'secAssessDetailed'},
  poc: {none: null, light: 'pocLight', technical: 'pocTechnical'},
  security: {none: null, static: 'secStatic', dynamic: 'secDynamic', hierarchy: 'secHierarchy'},
};
const MATURITY = {rom: {label: 'ROM / limited evidence', mult: 1.2, risk: 20}, planning: {label: 'Planning estimate', mult: 1.1, risk: 15}, validated: {label: 'Validated after Discovery', mult: 1.0, risk: 10}};

/* Historical benchmarks from the estimation database (implementation projects with stored volumes) */
const BENCH = {
  perIngest: {label: 'Hours per ingested object', min: 10.0, median: 22.0, max: 93.3},
  perGold: {label: 'Hours per Gold object (dims + facts)', min: 26.7, median: 45.3, max: 58.6},
  perReport: {label: 'Hours per report', min: 99.2, median: 215, max: 385},
};
const TSHIRT = [['XS', 100], ['S', 250], ['M', 500], ['L', 1600], ['XL', Infinity]];

function n(v) { const x = Number(v); return isFinite(x) ? x : 0; }

function compute(s) {
  const R = Object.assign({}, baseRates(), s.rates || {});
  const lv = (group, key) => { const rk = LEVELS[group][key]; return rk ? n(R[rk]) : 0; };
  const docQ = n(s.settings.docQ) || 1;
  const wps = [];
  const ov = s.overrides || {};
  function wp(key, name, desc) { const w = {key, name, desc, lines: [], hours: 0}; wps.push(w); return w; }
  function line(w, id, label, qty, rate, mult, formula) {
    const m = mult === undefined ? 1 : n(mult);
    const calc = n(qty) * n(rate) * m;
    const o = ov[id];
    const has = o !== undefined && o !== '' && o !== null;
    const hours = has ? n(o) : calc;
    w.lines.push({id, label, qty: n(qty), rate: n(rate), mult: m, calc, hours, overridden: has, formula: formula || ''});
    w.hours += hours;
  }
  const d = s.discovery || {};
  if (s.show.discovery) {
    const w = wp('discovery', 'Discovery & Detailed Design', 'Workshops, inventory, representative analysis, architecture, security and roadmap');
    line(w, 'd.workshops', 'Workshops', d.workshops, R.workshop, docQ);
    line(w, 'd.sources', 'Source systems assessed', d.assessedSources, R.srcAssess, docQ);
    line(w, 'd.objects', 'Objects sampled', d.sampledObjects, R.objSample, docQ);
    line(w, 'd.assets', 'Legacy assets inventoried (full lineage)', d.inventoriedAssets, R.assetInventory, docQ);
    line(w, 'd.processes', 'Processes sampled', d.sampledProcesses, R.procSample, docQ);
    line(w, 'd.reports', 'Reports assessed', d.assessedReports, R.reportAssess, docQ);
    line(w, 'd.arch', 'Target architecture & design', 1, R.archBase, n(d.archComplexity) * docQ, 'x complexity ' + d.archComplexity + ' x documentation ' + docQ);
    line(w, 'd.security', 'Security / governance assessment', 1, lv('assessSecurity', d.assessSecurity), docQ);
    line(w, 'd.poc', 'PoC validation', 1, lv('poc', d.poc), docQ);
  }
  let ingestObjects = 0;
  if (s.show.sources) {
    const w = wp('platform', 'Platform Foundation & Ingestion', 'Environments, Git / deployment, framework and source ingestion');
    line(w, 'p.foundation', 'Platform foundation (' + s.foundation + ')', 1, lv('foundation', s.foundation), 1);
    (s.sources || []).forEach((src, i) => {
      ingestObjects += n(src.objects);
      const nm = src.name || 'Source ' + (i + 1);
      line(w, 'p.conn.' + i, 'Connector: ' + nm, 1, R.srcConnector, n(src.connect), 'x connectivity ' + src.connect);
      line(w, 'p.obj.' + i, 'Ingestion objects: ' + nm, src.objects, R.ingestObj, n(src.connect) * n(src.load), 'x connectivity ' + src.connect + ' x load ' + src.load);
    });
  }
  let transformCount = 0;
  if (s.show.transform) {
    const w = wp('transform', 'Transformation Layer', 'Cleansing, conforming, business rules and history handling between ingestion and Gold');
    (s.transforms || []).forEach((t, i) => {
      transformCount += n(t.count);
      const src = sourceName(s, t.source);
      line(w, 't.' + i, 'Transformations: ' + (t.name || 'Group ' + (i + 1)) + ' (' + src + ')', t.count, R.transformObj, n(t.type || 1) * n(t.complexity || 1),
        'x type ' + n(t.type || 1) + ' x complexity ' + n(t.complexity || 1) + ' · source: ' + src);
    });
  }
  if (s.show.legacy) {
    const L = s.legacy || {};
    const f = Math.max(0, 1 - n(L.retirement) / 100) * n(L.framework || 1) * docQ;
    const fx = 'x active ' + Math.max(0, 1 - n(L.retirement) / 100) + ' x framework ' + n(L.framework || 1) + ' x documentation ' + docQ;
    const w = wp('legacy', 'Legacy Transformation Rebuild', 'Re-engineering of active ETL, procedures, views and orchestration logic');
    line(w, 'l.low', 'Low-complexity ETL assets', L.etlLow, R.etlLow, f, fx);
    line(w, 'l.med', 'Medium ETL assets', L.etlMed, R.etlMed, f, fx);
    line(w, 'l.high', 'High ETL / controllers', L.etlHigh, R.etlHigh, f, fx);
    line(w, 'l.sps', 'Simple stored procedures', L.spSimple, R.spSimple, f, fx);
    line(w, 'l.spc', 'Complex stored procedures', L.spComplex, R.spComplex, f, fx);
    line(w, 'l.views', 'Views migrated', L.views, R.viewMig, f, fx);
  }
  const G = s.gold || {};
  if (s.show.models) {
    const w = wp('gold', 'Gold Data Products & Semantic Models', 'Curated facts / dimensions, business logic, semantic models and security');
    line(w, 'g.dims', 'Dimensions', G.dimensions, R.dimension, n(G.complexity || 1), 'x complexity ' + n(G.complexity || 1));
    line(w, 'g.facts', 'Facts', G.facts, R.fact, n(G.complexity || 1), 'x complexity ' + n(G.complexity || 1));
    line(w, 'g.rules', 'Complex business rules', G.businessRules, R.businessRule, 1);
    line(w, 'g.views', 'Consumption views', G.consumptionViews, R.consumptionView, 1);
    (s.models || []).forEach((m, i) => {
      const sec = lv('security', m.security);
      const base = n(R.smBase) + n(m.tables) * n(R.smTable) + n(m.measuresMig) * n(R.smMeasureMig) + n(m.measuresNew) * n(R.smMeasureNew) + n(m.calcs) * n(R.smCalc) + sec;
      line(w, 'g.sm.' + i, 'Semantic model: ' + (m.name || 'Model ' + (i + 1)), 1, base, n(m.mode),
        `(${R.smBase} + ${n(m.tables)}x${R.smTable} + ${n(m.measuresMig)}x${R.smMeasureMig} + ${n(m.measuresNew)}x${R.smMeasureNew} + ${n(m.calcs)}x${R.smCalc} + security ${sec}) x mode ${m.mode}`);
    });
  }
  let reportCount = 0;
  if (s.show.reports) {
    const w = wp('reports', 'Report Migration / Development', 'Repoint, migrate, rebuild or redesign of the reporting portfolio');
    (s.reports || []).forEach((r, i) => {
      reportCount += n(r.count);
      const extra = Math.max(0, n(r.pages) - 1);
      const per = n(R.reportBase) + extra * n(R.reportPage);
      line(w, 'r.' + i, 'Reports: ' + (r.name || 'Group ' + (i + 1)), r.count, per, n(r.complexity) * n(r.action),
        `(${R.reportBase} + ${extra} pages x ${R.reportPage}) x complexity ${r.complexity} x action ${r.action}`);
    });
  }
  if (s.show.ops) {
    const O = s.ops || {};
    const w = wp('quality', 'Quality & Operations', 'Reconciliation, security validation, orchestration, monitoring and governance');
    line(w, 'q.recon', 'Objects reconciled', O.reconcileObjects, R.reconcileObj, 1);
    line(w, 'q.measures', 'Measures validated', O.validateMeasures, R.measureValidate, 1);
    line(w, 'q.sec', 'Security scenarios tested', O.securityTests, R.securityTest, 1);
    line(w, 'q.sched', 'Schedules / orchestrations', O.schedules, R.schedule, 1);
    line(w, 'q.mon', 'Monitoring (' + O.monitoring + ')', 1, lv('monitoring', O.monitoring), 1);
    /* KT is a launch activity, so it lives under Production Launch & Hypercare.
       Without a PROD environment there is no such package, so it stays here. */
    if (!s.settings.envProd) line(w, 'q.kt', 'Knowledge-transfer sessions', O.ktSessions, R.ktSession, 1);
    line(w, 'q.purview', 'Purview / catalogue (' + O.purview + ')', 1, lv('purview', O.purview), 1);
    line(w, 'q.gov', 'Governance (' + s.governance + ')', 1, lv('governance', s.governance), 1);
  }
  /* ---- additional activities (outside the predefined scope) ---- */
  const CUS = (s.custom || []).map((c, i) => Object.assign({i}, c));
  const cLine = (w, c) => { line(w, 'c.' + c.i, c.name || ('Additional activity ' + (c.i + 1)), c.qty, c.rate, 1, 'Additional activity · ' + n(c.qty) + ' × ' + n(c.rate) + ' h'); w.lines[w.lines.length - 1].custom = true; };
  const later = [s.settings.envTest && 'uat', s.settings.envProd && 'prod', s.settings.envOther && 'other'].filter(Boolean);
  const valid = new Set(wps.map(w => w.key).concat(later));
  CUS.forEach(c => { c.target = (c.wp && c.wp !== 'new' && valid.has(c.wp)) ? c.wp : 'x:' + (String(c.group || '').trim() || 'Additional activities'); });
  wps.forEach(w => CUS.filter(c => c.target === w.key).forEach(c => cLine(w, c)));
  [...new Set(CUS.filter(c => c.target.startsWith('x:')).map(c => c.target))].forEach(k => {
    const w = wp(k, k.slice(2), 'Additional work package outside the predefined scope'); w.custom = true;
    CUS.filter(c => c.target === k).forEach(c => cLine(w, c));
  });
  const addLater = w => CUS.filter(c => c.target === w.key).forEach(c => cLine(w, c));
  const build = wps.reduce((a, w) => a + w.hours, 0);
  const T = s.test || {}, P = s.prod || {};
  if (s.settings.envTest) {
    const w = wp('uat', 'TEST Environment & UAT', 'TEST setup, UAT cycles, tester support, defect allowance and evidence');
    line(w, 'u.setup', 'TEST environment setup', 1, R.testSetup, 1);
    line(w, 'u.cycles', 'UAT cycles', T.uatCycles, R.uatCycle, 1);
    line(w, 'u.testers', 'UAT testers', T.testers, R.uatTester, 1);
    line(w, 'u.defects', 'Defect remediation allowance', build, n(R.uatDefectPct) / 100, 1, build.toFixed(1) + ' build h x ' + R.uatDefectPct + '%');
    line(w, 'u.evidence', 'Test evidence pack', 1, R.testEvidence, 1);
    addLater(w);
  }
  if (s.settings.envProd) {
    const w = wp('prod', 'Production Launch & Hypercare', 'PROD setup, deployment waves, cutover, parallel run, hypercare, knowledge transfer and decommissioning plan');
    line(w, 'pr.setup', 'PROD environment setup', 1, R.prodSetup, 1);
    line(w, 'pr.waves', 'Deployment waves', P.waves, R.prodWave, 1);
    line(w, 'pr.cutover', 'Cutover planning', 1, R.cutover, 1);
    line(w, 'pr.parallel', 'Parallel-run weeks (all waves)', P.parallelWeeks, R.parallelWeek, 1);
    line(w, 'pr.hypercare', 'Hypercare weeks (all waves)', P.hypercareWeeks, R.hypercareWeek, 1);
    // Keeps the 'q.kt' id so overrides saved before KT moved here still apply.
    if (s.show.ops) line(w, 'q.kt', 'Knowledge-transfer sessions', (s.ops || {}).ktSessions, R.ktSession, 1);
    line(w, 'pr.decom', 'Decommissioning plan', P.decommission ? 1 : 0, R.decommission, 1);
    addLater(w);
  }
  if (s.settings.envOther) {
    const w = wp('other', s.settings.otherName || 'OTHER Environment', 'Additional environment setup, deployment and support');
    const m = n(s.settings.otherComplexity || 1);
    line(w, 'o.setup', 'Setup', 1, R.otherSetup, m);
    line(w, 'o.deploy', 'Deployment', 1, R.otherDeploy, m);
    line(w, 'o.support', 'Support', 1, R.otherSupport, m);
    addLater(w);
  }
  const mat = MATURITY[s.settings.maturity] || MATURITY.planning;
  const matMult = s.settings.maturityAsMultiplier ? mat.mult : 1;
  wps.forEach(w => { w.hours *= matMult; w.lines.forEach(l => { l.final = l.hours * matMult; }); });
  const delivery = wps.reduce((a, w) => a + w.hours, 0);
  const pm = delivery * n(s.settings.pmPct) / 100, doc = delivery * n(s.settings.docPct) / 100, risk = delivery * n(s.settings.riskPct) / 100;
  const total = delivery + pm + doc + risk;
  const team = (s.team || []).filter(t => n(t.fte) > 0);
  const fte = team.reduce((a, t) => a + n(t.fte), 0) || 1;
  const weeks = total / (fte * (n(s.settings.hoursPerWeek) || 40));
  const roles = team.map(t => ({role: t.role, fte: n(t.fte), hours: total * n(t.fte) / fte}));
  const goldObjects = n(G.dimensions) + n(G.facts);
  const ratios = {
    perIngest: ingestObjects ? total / ingestObjects : null,
    perGold: goldObjects ? total / goldObjects : null,
    perReport: reportCount ? total / reportCount : null,
  };
  const tshirt = TSHIRT.find(t => total <= t[1])[0];
  return {wps, build, delivery, pm, doc, risk, total, weeks, fte, roles, ratios, tshirt, ingestObjects, transformCount, goldObjects, reportCount, matMult};
}
/* A transformation group points at a source by its row index; '' means it spans several sources. */
function sourceName(s, idx) {
  if (idx === '' || idx === null || idx === undefined) return 'Multiple sources';
  const src = (s.sources || [])[Number(idx)];
  return src ? (src.name || 'Source ' + (Number(idx) + 1)) : 'Multiple sources';
}
if (typeof module !== 'undefined') module.exports = {compute, RATE_DEFS, DEFAULT_RATES, V21_RATES, LEVELS, MATURITY, BENCH, TSHIRT};

/* ===== Presets ===== */
const SHOW_ALL = {discovery: true, sources: true, transform: true, legacy: true, models: true, reports: true, ops: true};
function baseState(over) {
  return Object.assign({
    meta: {client: '', projectType: 'platformMigration', architecture: 'Medallion Lakehouse', notes: ''},
    settings: {docQ: 1.0, maturity: 'planning', maturityAsMultiplier: false, pmPct: 10, docPct: 10, riskPct: 15, envDev: true, envTest: true, envProd: true, envOther: false, otherName: 'Training / Pre-production', otherComplexity: 1, hoursPerWeek: 32},
    show: Object.assign({}, SHOW_ALL), foundation: 'production', governance: 'operational',
    discovery: {workshops: 5, assessedSources: 4, sampledObjects: 0, inventoriedAssets: 0, sampledProcesses: 0, assessedReports: 0, archComplexity: 1, assessSecurity: 'detailed', poc: 'none'},
    sources: [], transforms: [], legacy: {etlLow: 0, etlMed: 0, etlHigh: 0, spSimple: 0, spComplex: 0, views: 0, framework: 1, retirement: 0},
    gold: {dimensions: 0, facts: 0, businessRules: 0, consumptionViews: 0, complexity: 1}, models: [], reports: [],
    ops: {reconcileObjects: 0, validateMeasures: 0, securityTests: 0, schedules: 2, monitoring: 'basic', ktSessions: 2, purview: 'none'},
    test: {uatCycles: 1, testers: 5}, prod: {waves: 1, parallelWeeks: 0, hypercareWeeks: 2, decommission: false},
    team: [{role: 'Data Engineer', fte: 0.8}, {role: 'Data Engineer', fte: 0.8}], rates: {}, overrides: {}, schedule: {}, order: [], removed: [], custom: [],
  }, over);
}
const PRESETS = {};
PRESETS.blank = {label: 'Blank estimation', state: baseState({meta: {client: '', projectType: 'platformMigration', architecture: 'Medallion Lakehouse', notes: ''},
  sources: [{name: 'Source 1', objects: 10, connect: 1, load: 1}], transforms: [{name: 'Cleansing & conformance', source: 0, count: 10, type: 1, complexity: 1}], models: [{name: 'Model 1', tables: 10, measuresMig: 0, measuresNew: 20, calcs: 0, security: 'static', mode: 1}],
  reports: [{name: 'Power BI reports', count: 5, pages: 3, complexity: 1, action: 1}]})};
if (typeof module !== 'undefined') module.exports = {PRESETS, baseState};

/* ===== UI layer: HTML-string renderers ===== */
const fmt = (x, d = 0) => (x === null || x === undefined || !isFinite(x)) ? '–' : Number(x).toLocaleString('en-GB', {minimumFractionDigits: d, maximumFractionDigits: d});
const esc = s => String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const opt = (v, t, cur) => `<option value="${esc(v)}"${String(v) === String(cur) ? ' selected' : ''}>${esc(t)}</option>`;
const numIn = (path, v, step) => `<input type="number" data-bind="${path}" value="${esc(v)}"${step ? ` step="${step}"` : ''}>`;
const txtIn = (path, v, ph) => `<input data-bind="${path}" value="${esc(v)}" placeholder="${esc(ph || '')}">`;
const sel = (path, cur, options) => `<select data-bind="${path}">${options.map(o => opt(o[0], o[1], cur)).join('')}</select>`;
const CONNECT = [[0.8, 'Native / simple'], [1, 'Standard gateway'], [1.35, 'API / ODBC / files'], [1.7, 'Custom / constrained']];
const LOAD = [[0.8, 'Full load'], [1, 'Incremental'], [1.25, 'History + incremental'], [1.6, 'Near-real-time']];
const SECURITY = [['none', 'None'], ['static', 'Static RLS'], ['dynamic', 'Dynamic RLS'], ['hierarchy', 'Hierarchy / OLS / CLS']];
const MODE = [[1, 'New build'], [0.65, 'Reuse / migrate'], [1.2, 'Redesign']];
const RCOMPLEX = [[0.75, 'Low'], [1, 'Medium'], [1.25, 'Medium-high'], [1.5, 'High']];
const RACTION = [[0.25, 'Repoint'], [0.6, 'Migrate as-is'], [1, 'Rebuild'], [1.3, 'Redesign']];
const TTYPE = [[0.8, 'Cleansing / standardisation'], [1, 'Conforming / joins / dedup'], [1.1, 'Aggregation / snapshot'], [1.3, 'Business rules / derivations'], [1.5, 'History / SCD']];
const TCOMPLEX = [[0.6, 'Low'], [1, 'Medium'], [1.6, 'High'], [2.4, 'Very high']];
const WP_COLORS = {discovery: '#1f3a5f', platform: '#2f6690', transform: '#3b7d9c', legacy: '#4a6fa5', gold: '#16697a', reports: '#3d8a8a', quality: '#5c6f82', uat: '#b07d2b', prod: '#8c4b4b', other: '#6b5b95'};
/* Relative order of the standard work packages on the timeline. Durations are
   never taken from here – they come from each package's hours and its FTE. */
const GANTT_TEMPLATE = {discovery: [0, .12], platform: [.08, .30], transform: [.15, .60], legacy: [.20, .72], gold: [.22, .80], reports: [.35, .85], quality: [.25, .92], uat: [.55, .92], prod: [.60, 1], other: [.85, 1]};
/* People assumed to work on one package when nothing else is said. */
const DEFAULT_WP_FTE = 1;

function renderSources(s) {
  return s.sources.map((r, i) => `<div class="row src">${txtIn(`sources.${i}.name`, r.name, 'SQL, API, SaaS...')}${numIn(`sources.${i}.objects`, r.objects)}${sel(`sources.${i}.connect`, r.connect, CONNECT)}${sel(`sources.${i}.load`, r.load, LOAD)}<button class="btn danger" data-del="sources.${i}" title="Remove">×</button></div>`).join('');
}
function renderTransforms(s) {
  const srcOpts = [['', 'Multiple sources']].concat((s.sources || []).map((src, i) => [i, src.name || 'Source ' + (i + 1)]));
  return (s.transforms || []).map((t, i) => `<div class="row trans">${txtIn(`transforms.${i}.name`, t.name, 'Cleansing, customer merge...')}${sel(`transforms.${i}.source`, t.source === undefined ? '' : t.source, srcOpts)}${numIn(`transforms.${i}.count`, t.count)}${sel(`transforms.${i}.type`, t.type, TTYPE)}${sel(`transforms.${i}.complexity`, t.complexity, TCOMPLEX)}<button class="btn danger" data-del="transforms.${i}" title="Remove">×</button></div>`).join('') || '<p class="small">No transformations yet.</p>';
}
function renderModels(s) {
  return s.models.map((m, i) => `<div class="row model">${txtIn(`models.${i}.name`, m.name, 'Model name')}${numIn(`models.${i}.tables`, m.tables)}${numIn(`models.${i}.measuresMig`, m.measuresMig)}${numIn(`models.${i}.measuresNew`, m.measuresNew)}${numIn(`models.${i}.calcs`, m.calcs)}${sel(`models.${i}.security`, m.security, SECURITY)}${sel(`models.${i}.mode`, m.mode, MODE)}<button class="btn danger" data-del="models.${i}" title="Remove">×</button></div>`).join('');
}
function renderReports(s) {
  return s.reports.map((r, i) => `<div class="row report">${txtIn(`reports.${i}.name`, r.name, 'Power BI, Tableau...')}${numIn(`reports.${i}.count`, r.count)}${numIn(`reports.${i}.pages`, r.pages)}${sel(`reports.${i}.complexity`, r.complexity, RCOMPLEX)}${sel(`reports.${i}.action`, r.action, RACTION)}<button class="btn danger" data-del="reports.${i}" title="Remove">×</button></div>`).join('');
}
function renderTeam(s, res) {
  const byRole = res ? res.roles : [];
  return s.team.map((t, i) => `<div class="row team">${txtIn(`team.${i}.role`, t.role, 'Role')}${numIn(`team.${i}.fte`, t.fte, '0.05')}<span class="pill">${fmt(byRole[i] ? byRole[i].hours : 0)} h</span><button class="btn danger" data-del="team.${i}" title="Remove">×</button></div>`).join('');
}
function renderSummary(res, s, sch) {
  const rows = [['Delivery effort', res.delivery], ['Project management (' + s.settings.pmPct + '%)', res.pm], ['Documentation (' + s.settings.docPct + '%)', res.doc], ['Contingency (' + s.settings.riskPct + '%)', res.risk]];
  return rows.map(r => `<div class="metric"><span>${esc(r[0])}</span><strong>${fmt(r[1])} h</strong></div>`).join('') +
    `<div class="metric total"><span>Total</span><strong>${fmt(res.total)} h</strong></div>` +
    `<div class="kpis"><div><b>${fmt(res.fte, 2)}</b><span>Team FTE</span></div><div><b>${fmt(res.weeks, 1)}</b><span>Capacity weeks</span></div><div><b>${fmt(sch.total)}</b><span>Scheduled weeks</span></div></div>` +
    (res.matMult !== 1 ? `<p class="small warn-text">Maturity multiplier ×${res.matMult} applied to delivery effort.</p>` : '');
}

/* ---------- Additional activities ---------- */
function renderCustom(s, res) {
  const std = res.wps.filter(w => !w.custom).map(w => [w.key, w.name]);
  const lineHours = {}; res.wps.forEach(w => w.lines.forEach(l => { lineHours[l.id] = l.final; }));
  return (s.custom || []).map((c, i) => {
    const isNew = !c.wp || c.wp === 'new' || !std.some(o => o[0] === c.wp);
    const opts = std.concat([['new', 'Own work package (new timeline bar)']]);
    return `<div class="row custom">${txtIn(`custom.${i}.name`, c.name, 'e.g. Data migration of archive, extra workshop…')}
      <select data-bind="custom.${i}.wp">${opts.map(o => opt(o[0], o[0] === 'new' ? o[1] : 'Add to: ' + o[1], isNew ? 'new' : c.wp)).join('')}</select>
      <input data-bind="custom.${i}.group" value="${esc(c.group)}" placeholder="New work package name"${isNew ? '' : ' disabled'}>
      ${numIn(`custom.${i}.qty`, c.qty, '0.5')}${numIn(`custom.${i}.rate`, c.rate, '0.5')}
      <span class="pill" data-chours="${i}">${fmt(lineHours['c.' + i] || 0, 1)} h</span><button class="btn danger" data-del="custom.${i}" title="Remove">×</button></div>`;
  }).join('') || '<p class="small">No additional activities yet.</p>';
}

/* ---------- Gantt ---------- */
function schedule(res, s) {
  const hpw = Number(s.settings.hoursPerWeek) || 40;
  const ov = s.schedule || {};
  /* Work packages the user took off the timeline. Their hours are untouched in
     the estimate – only the bar is gone, which is what a 0 h package needs. */
  const rm = new Set(s.removed || []);
  const removed = res.wps.filter(w => rm.has(w.key)).map(w => ({key: w.key, name: w.name, hours: w.hours}));
  const ord = s.order || [];
  const tpl = k => GANTT_TEMPLATE[k] ? GANTT_TEMPLATE[k][0] : 9;
  let rows = res.wps.filter(w => !rm.has(w.key)).map((w, idx) => {
    const o = ov[w.key] || {};
    const planFte = Number(o.fte) > 0 ? Number(o.fte) : DEFAULT_WP_FTE;
    const autoDur = Math.max(1, Math.ceil(w.hours / (planFte * hpw)));
    const resized = Number(o.dur) > 0 && Math.round(Number(o.dur)) !== autoDur;
    const dur = resized ? Math.max(1, Math.round(Number(o.dur))) : autoDur;
    return {key: w.key, name: w.name, hours: w.hours, dur, autoDur, resized, planFte, additional: !!w.custom, idx};
  });
  const pos = r => { const i = ord.indexOf(r.key); return i >= 0 ? i : 1000 + tpl(r.key) * 10 + r.idx / 1000; };
  rows.sort((a, b) => pos(a) - pos(b));
  /* Place every bar as early as the team's capacity allows: a week can never
     carry more FTE than the team has. That is what makes the duration of the
     whole engagement follow the resources that are actually available. */
  const cap = Math.max(0.1, Number(res.fte) || 1);
  const used = [];
  const load = r => Math.min(r.planFte, cap);
  const fits = (st, r) => { for (let w = st; w < st + r.dur; w++) if ((used[w] || 0) + load(r) > cap + 1e-9) return false; return true; };
  const occupy = (st, r) => { for (let w = st; w < st + r.dur; w++) used[w] = (used[w] || 0) + load(r); };
  rows.forEach(r => {
    let st = 1;
    while (st < 5000 && !fits(st, r)) st++;
    r.autoStart = st;
    const o = ov[r.key] || {};
    r.moved = Number(o.start) > 0 && Math.round(Number(o.start)) !== r.autoStart;
    r.start = Number(o.start) > 0 ? Math.max(1, Math.round(Number(o.start))) : r.autoStart;
    r.end = r.start + r.dur - 1;
    r.fte = r.dur > 0 ? r.hours / (r.dur * hpw) : 0;
    occupy(r.start, r);
  });
  const total = Math.max(1, ...rows.map(r => r.end));
  const mgmt = res.pm + res.doc + res.risk;
  return {rows, removed, total, mgmt, avgFte: res.total / (total * hpw)};
}
/* Move a work package: shift = weeks left/right (start never below week 1, duration unchanged); targetKey = row to drop on */
function applyGanttMove(s, sch, key, shift, targetKey, placeAfter) {
  s.schedule = s.schedule || {};
  const r = sch.rows.find(x => x.key === key); if (!r) return false;
  let changed = false;
  if (shift) { const ns = Math.max(1, r.start + shift); if (ns !== r.start) { s.schedule[key] = Object.assign({}, s.schedule[key], {start: ns}); changed = true; } }
  if (targetKey && targetKey !== key) {
    const keys = sch.rows.map(x => x.key).filter(k => k !== key);
    let i = keys.indexOf(targetKey); if (i < 0) i = keys.length; else if (placeAfter) i++;
    keys.splice(i, 0, key); s.order = keys; changed = true;
  }
  return changed;
}
function moveOrder(s, sch, key, dir) {
  const keys = sch.rows.map(x => x.key); const i = keys.indexOf(key), j = i + dir;
  if (i < 0 || j < 0 || j >= keys.length) return false;
  [keys[i], keys[j]] = [keys[j], keys[i]]; s.order = keys; return true;
}
function renderGantt(res, s, sch) {
  const T = sch.total;
  const pct = w => (w / T * 100).toFixed(3) + '%';
  let axis = '';
  if (T <= 26) {
    for (let w = 1; w <= T; w++) axis += `<span class="tick" style="left:${pct(w - 1)};width:${pct(1)}">${w}</span>`;
  } else {
    const months = Math.ceil(T / 4.33);
    for (let m = 0; m < months; m++) { const a = m * 4.33, b = Math.min(T, (m + 1) * 4.33); axis += `<span class="tick m" style="left:${pct(a)};width:${pct(b - a)}">M${m + 1}</span>`; }
  }
  const colorOf = r => r.additional ? '#7a5c99' : (WP_COLORS[r.key] || '#5c6f82');
  const bar = (r, color, drag) => `<div class="g-bar${drag ? ' drag' : ''}"${drag ? ` data-key="${esc(r.key)}"` : ''} style="left:${pct(r.start - 1)};width:${pct(r.dur)};background:${color}" title="${esc(r.name)}: weeks ${r.start}–${r.end}, ${fmt(r.hours)} h${drag ? ' – drag to move' : ''}"><span>${fmt(r.hours)} h</span></div>`;
  const badges = r => (r.additional ? '<i class="badge add">Additional</i>' : '') + (r.moved ? '<i class="badge mv">Moved</i>' : '') + (r.resized ? '<i class="badge ex">Custom length</i>' : '');
  const rows = sch.rows.map(r => `<div class="g-row" data-key="${esc(r.key)}"><div class="g-label" title="Drag to reorder"><b><span class="grip">⋮⋮</span>${esc(r.name)}${badges(r)}</b><span>W${r.start}–W${r.end} · ${fmt(r.dur)} wk · ${fmt(r.fte, 2)} FTE</span><button type="button" class="g-del" data-wpdel="${esc(r.key)}" title="Remove ${esc(r.name)} from the timeline" aria-label="Remove ${esc(r.name)} from the timeline">×</button></div><div class="g-track" style="--weeks:${T}">${bar(r, colorOf(r), true)}</div></div>`).join('');
  const mg = {name: 'Project management, documentation & contingency', start: 1, dur: T, end: T, hours: sch.mgmt};
  const mgRow = sch.mgmt > 0 ? `<div class="g-row g-mgmt"><div class="g-label"><b>${esc(mg.name)}</b><span>W1–W${T} · runs across the engagement</span></div><div class="g-track" style="--weeks:${T}">${bar(mg, 'repeating-linear-gradient(135deg,#94a3b8 0 6px,#a8b5c6 6px 12px)', false)}</div></div>` : '';
  const chart = `<div class="g-hint small">Drag a bar <b>left / right</b> to change its start week, or drag a bar or its name <b>up / down</b> to change the order. Moving never changes hours or duration. Use <b>×</b> to take a work package off the timeline – its hours stay in the estimate.</div><div class="gantt" id="ganttChart"><div class="g-row g-head"><div class="g-label">Work package</div><div class="g-track g-axis" style="--weeks:${T}">${axis}</div></div>${rows}${mgRow}</div>`;
  const removed = (sch.removed || []).length ? `<div class="g-removed small"><span>Off the timeline:</span>${sch.removed.map(r => `<button type="button" class="chip" data-wprestore="${esc(r.key)}" title="Put ${esc(r.name)} back on the timeline">${esc(r.name)} · ${fmt(r.hours)} h <b>+</b></button>`).join('')}<button type="button" class="btn ghost mini" data-wprestore="*">Restore all</button></div>` : '';
  const table = `<details class="sched"><summary><span>Adjust schedule</span><span class="small">order, people, start week and duration · blank = automatic</span></summary>
    <table class="grid"><thead><tr><th>Order</th><th>Work package</th><th class="r">People (FTE)</th><th class="r">Start week</th><th class="r">Duration (weeks)</th><th class="r">End week</th><th class="r">Hours</th><th class="r">Actual FTE</th></tr></thead><tbody>
    ${sch.rows.map((r, i) => { const o = (s.schedule || {})[r.key] || {}; return `<tr class="${r.moved || r.resized ? 'ovr' : ''}"><td class="nowrap"><button class="btn mini" data-move="${esc(r.key)}|-1"${i === 0 ? ' disabled' : ''} title="Move up">↑</button><button class="btn mini" data-move="${esc(r.key)}|1"${i === sch.rows.length - 1 ? ' disabled' : ''} title="Move down">↓</button></td><td>${esc(r.name)}${badges(r)}</td><td class="r"><input type="number" min="0.1" step="0.1" data-sched="${esc(r.key)}.fte" value="${Number(o.fte) > 0 ? r.planFte : ''}" placeholder="${DEFAULT_WP_FTE}" title="People working on this package – drives the automatic duration"></td><td class="r"><input type="number" min="1" data-sched="${esc(r.key)}.start" value="${r.moved ? r.start : ''}" placeholder="${r.autoStart}"></td><td class="r"><input type="number" min="1" data-sched="${esc(r.key)}.dur" value="${r.resized ? r.dur : ''}" placeholder="${r.autoDur}" title="Override the number of weeks for this package"></td><td class="r">${r.end}</td><td class="r">${fmt(r.hours)}</td><td class="r">${fmt(r.fte, 2)}</td></tr>`; }).join('')}
    </tbody></table><div class="actions"><button class="btn ghost" data-action="reset-schedule">Reset schedule and order</button></div></details>`;
  return chart + removed + `<div class="g-foot small">Total duration <b>${T} weeks</b> · average team <b>${fmt(sch.avgFte, 2)} FTE</b> at ${fmt(Number(s.settings.hoursPerWeek) || 40)} productive h/week. Each bar is as long as its hours need at the people assigned to it (${DEFAULT_WP_FTE} FTE unless you change it), and packages only run in parallel while the team has capacity for them.</div>` + table;
}

function renderBreakdown(res) {
  return res.wps.map(w => `<details class="wp" open style="--wp:${w.custom ? '#7a5c99' : (WP_COLORS[w.key] || '#5c6f82')}"><summary><span>${esc(w.name)}</span><span class="pill strong">${fmt(w.hours, 1)} h</span></summary><p class="small">${esc(w.desc)}</p>
    <table class="grid"><thead><tr><th>Activity</th><th class="r">Qty</th><th class="r">Rate (h)</th><th class="r">Multiplier</th><th class="r">Calculated</th><th class="r">Override h</th><th class="r">Final</th></tr></thead><tbody>
    ${w.lines.map(l => `<tr class="${l.overridden ? 'ovr' : ''}${l.calc === 0 && !l.overridden ? ' zero' : ''}"><td>${esc(l.label)}${l.custom ? ' <i class="badge add">Additional</i>' : ''}${l.formula ? `<div class="small">${esc(l.formula)}</div>` : ''}</td><td class="r">${fmt(l.qty, l.qty % 1 ? 1 : 0)}</td><td class="r">${fmt(l.rate, 2)}</td><td class="r">${fmt(l.mult, 2)}</td><td class="r">${fmt(l.calc, 1)}</td><td class="r"><input class="ov" type="number" step="0.5" data-ov="${esc(l.id)}" value="${l.overridden ? esc(l.hours) : ''}" placeholder="auto"></td><td class="r"><b>${fmt(l.final, 1)}</b></td></tr>`).join('')}
    </tbody></table></details>`).join('') + `<p class="small">Type hours in <b>Override h</b> to fix any activity; leave blank to use the calculated value. Overridden lines are highlighted.</p>`;
}
function renderCalibration(s) {
  const groups = [...new Set(RATE_DEFS.map(r => r[1]))];
  const BASE = baseRates();
  const R = Object.assign({}, BASE, s.rates);
  return groups.map(g => `<details class="cal" ${g === 'Discovery' ? 'open' : ''}><summary>${esc(g)}</summary><table class="grid"><thead><tr><th>Activity</th><th>Unit</th><th class="r">Rate in use</th><th class="r">Default</th></tr></thead><tbody>
    ${RATE_DEFS.filter(r => r[1] === g).map(r => { const cur = R[r[0]]; const def = BASE[r[0]]; const chg = Number(cur) !== Number(def); return `<tr class="${chg ? 'ovr' : ''}"><td>${esc(r[2])}</td><td class="small">${esc(r[3])}</td><td class="r"><input class="rate" type="number" step="0.01" data-rate="${r[0]}" value="${esc(cur)}"></td><td class="r muted">${esc(def)}</td></tr>`; }).join('')}
    </tbody></table></details>`).join('');
}
if (typeof module !== 'undefined') module.exports = {renderSources, renderTransforms, renderModels, renderReports, renderTeam, renderSummary, renderCustom, schedule, applyGanttMove, moveOrder, renderGantt, renderBreakdown, renderCalibration};

/* ===== App glue ===== */
const TYPES = {
  discovery: {name: 'Discovery & Assessment', show: ['discovery']},
  pov: {name: 'Proof of Value / Pilot', show: ['discovery', 'sources', 'transform', 'models', 'ops']},
  greenfield: {name: 'Greenfield Fabric Implementation', show: ['discovery', 'sources', 'transform', 'models', 'reports', 'ops']},
  platformMigration: {name: 'Data Platform Migration / Rebuild', show: ['discovery', 'sources', 'transform', 'legacy', 'models', 'reports', 'ops']},
  biMigration: {name: 'BI / Reporting Migration', show: ['discovery', 'sources', 'models', 'reports', 'ops']},
  hybrid: {name: 'Discovery + Conditional Deployment', show: ['discovery', 'sources', 'transform', 'legacy', 'models', 'reports', 'ops']},
};
const NEW_ROW = {sources: {name: '', objects: 10, connect: 1, load: 1}, transforms: {name: '', source: '', count: 10, type: 1, complexity: 1}, models: {name: '', tables: 10, measuresMig: 0, measuresNew: 20, calcs: 0, security: 'static', mode: 1},
  reports: {name: '', count: 5, pages: 3, complexity: 1, action: 1}, team: {role: 'Data Engineer', fte: 0.8},
  custom: {name: '', wp: 'new', group: 'Additional activities', qty: 1, rate: 8}};
const clone = o => JSON.parse(JSON.stringify(o));
/* Every DOM lookup is confined to the estimator view. The estimator lives
   inside a page that already owns generic selectors like .card, .row and
   [data-bind], so a document-wide query here would reach into the sizing
   workspace and the modals. */
let ROOT = null;
const $ = id => (ROOT || document).querySelector('#' + id);
const qsa = sel => (ROOT || document).querySelectorAll(sel);
let S = clone(PRESETS.blank.state), RES = null, SCH = null;

function getPath(o, p) { return p.split('.').reduce((a, k) => (a === undefined || a === null) ? undefined : a[k], o); }
function setPath(o, p, v) { const ks = p.split('.'); let a = o; ks.slice(0, -1).forEach(k => { if (a[k] === undefined) a[k] = {}; a = a[k]; }); a[ks[ks.length - 1]] = v; }
function readVal(el) {
  if (el.type === 'checkbox') return el.checked;
  const v = el.value;
  if (v === 'true') return true; if (v === 'false') return false;
  if (el.type === 'number') return v === '' ? 0 : Number(v);
  if (el.tagName === 'SELECT' && v !== '' && !isNaN(Number(v))) return Number(v);
  return v;
}
function writeVal(el, v) {
  if (el.type === 'checkbox') { el.checked = !!v; return; }
  if (el.tagName === 'SELECT') {
    const want = String(v); const o = [...el.options].find(x => x.value === want || (x.value !== '' && !isNaN(Number(x.value)) && Number(x.value) === Number(v)));
    if (o) el.value = o.value; return;
  }
  el.value = v === undefined || v === null ? '' : v;
}
function bindStatic() { qsa('[data-bind]').forEach(el => { if (!el.closest('#de3-sourceRows,#de3-transformRows,#de3-modelRows,#de3-reportRows,#de3-teamRows,#de3-customRows')) writeVal(el, getPath(S, el.dataset.bind)); }); }
function applyVisibility() {
  const show = (TYPES[S.meta.projectType] || TYPES.platformMigration).show;
  S.show = {discovery: false, sources: false, transform: false, legacy: false, models: false, reports: false, ops: false};
  show.forEach(k => { S.show[k] = true; });
  qsa('[data-show]').forEach(c => c.classList.toggle('hidden', !S.show[c.dataset.show]));
  qsa('.testOnly').forEach(c => c.classList.toggle('hidden', !S.settings.envTest));
  qsa('.prodOnly').forEach(c => c.classList.toggle('hidden', !S.settings.envProd));
  qsa('.otherOnly').forEach(c => c.classList.toggle('hidden', !S.settings.envOther));
}
function renderTables() {
  $('de3-sourceRows').innerHTML = renderSources(S); $('de3-transformRows').innerHTML = renderTransforms(S); $('de3-modelRows').innerHTML = renderModels(S); $('de3-reportRows').innerHTML = renderReports(S); $('de3-teamRows').innerHTML = renderTeam(S, RES);
  $('de3-customRows').innerHTML = renderCustom(S, RES || compute(S));
}
const splitLast = (str, ch) => { const p = str.lastIndexOf(ch); return [str.slice(0, p), str.slice(p + 1)]; };
function update(opts) {
  opts = opts || {};
  RES = compute(S);
  SCH = schedule(RES, S);
  $('de3-summary').innerHTML = renderSummary(RES, S, SCH);
  const schedOpen = $('de3-gantt') && (ROOT || document).querySelector('#de3-gantt details.sched[open]');
  $('de3-gantt').innerHTML = renderGantt(RES, S, SCH);
  if (schedOpen) { const d = (ROOT || document).querySelector('#de3-gantt details.sched'); if (d) d.open = true; }
  $('de3-breakdown').innerHTML = renderBreakdown(RES);
  if (opts.calibration) $('de3-calibration').innerHTML = renderCalibration(S);
  qsa('#de3-teamRows .row').forEach((r, i) => { const p = r.querySelector('.pill'); if (p && RES.roles[i]) p.textContent = Math.round(RES.roles[i].hours).toLocaleString('en-GB') + ' h'; });
  const lh = {}; RES.wps.forEach(w => w.lines.forEach(l => { lh[l.id] = l.final; }));
  qsa('[data-chours]').forEach(p => { p.textContent = (lh['c.' + p.dataset.chours] || 0).toLocaleString('en-GB', {maximumFractionDigits: 1}) + ' h'; });
  $('de3-heroClient').textContent = S.meta.client || 'Unnamed opportunity';
  $('de3-heroTotal').textContent = Math.round(RES.total).toLocaleString('en-GB') + ' h';
  $('de3-statPD').textContent = (RES.total / 8).toLocaleString('en-GB', {maximumFractionDigits: 1});
  $('de3-statWeeks').textContent = SCH.total;
  $('de3-statWeeksLbl').textContent = 'Weeks · avg ' + SCH.avgFte.toFixed(2) + ' FTE';
  $('de3-statSize').textContent = RES.tshirt;
  $('de3-heroSub').textContent = 'T-shirt size · delivery ' + Math.round(RES.delivery).toLocaleString('en-GB') + ' h';
  applyReadOnly();
}
/* The renderers rebuild their controls from scratch on every update, so a
   one-off disable from the page would be wiped out. Re-apply it here instead.
   Tabs and the page's own header buttons stay live so a shared estimate can
   still be browsed, exported and copied.
   Only controls this function disabled are re-enabled when read-only is
   lifted: the renderers legitimately disable some buttons themselves (the
   Gantt's nudge arrows at the ends of the timeline), and a blanket
   `disabled = false` would silently switch those back on. */
function applyReadOnly() {
  const ro = isReadOnly();
  qsa('input,select,textarea,button').forEach(el => {
    if (el.closest('.de-header') || el.classList.contains('tab')) return;
    if (ro) {
      if (!el.disabled) { el.disabled = true; el.dataset.roDisabled = '1'; }
    } else if (el.dataset.roDisabled) {
      el.disabled = false;
      delete el.dataset.roDisabled;
    }
  });
}
function loadState(st) {
  S = clone(st); S.rates = S.rates || {}; S.overrides = S.overrides || {}; S.schedule = S.schedule || {}; S.order = S.order || []; S.removed = S.removed || []; S.custom = S.custom || []; S.transforms = S.transforms || [];
  bindStatic(); applyVisibility(); RES = compute(S); renderTables(); update({calibration: true});
}

function init(rootEl) {
  if (ROOT) return;                      // the view is created once, with the page
  ROOT = rootEl || document.getElementById('detailed-estimation-view');
  if (!ROOT) return;
  $('de3-projectType').innerHTML = Object.entries(TYPES).map(([k, t]) => `<option value="${k}">${t.name}</option>`).join('');
  ROOT.addEventListener('input', e => {
    const el = e.target;
    if (el.dataset.bind) {
      setPath(S, el.dataset.bind, readVal(el));
      if (el.dataset.bind === 'settings.maturity') { S.settings.riskPct = MATURITY[S.settings.maturity].risk; writeVal($('de3-riskPct'), S.settings.riskPct); }
      if (/^sources\.\d+\.name$/.test(el.dataset.bind)) $('de3-transformRows').innerHTML = renderTransforms(S);   // the source pickers show these names
      if (/^(meta\.projectType|settings\.env)/.test(el.dataset.bind)) { applyVisibility(); RES = compute(S); $('de3-customRows').innerHTML = renderCustom(S, RES); }
      update();
    } else if (el.dataset.rate) {
      const base = baseRates();
      S.rates[el.dataset.rate] = el.value === '' ? base[el.dataset.rate] : Number(el.value);
      el.closest('tr').classList.toggle('ovr', Number(S.rates[el.dataset.rate]) !== Number(base[el.dataset.rate]));
      update();
    }
  });
  ROOT.addEventListener('change', e => {
    const el = e.target;
    if (isReadOnly()) return;
    if (el.dataset.ov) { if (el.value === '') delete S.overrides[el.dataset.ov]; else S.overrides[el.dataset.ov] = Number(el.value); update(); }
    if (el.dataset.sched) {
      const [k, f] = splitLast(el.dataset.sched, '.');
      S.schedule[k] = S.schedule[k] || {};
      const v = Number(el.value);
      if (el.value === '' || !(v > 0)) delete S.schedule[k][f];
      else S.schedule[k][f] = f === 'fte' ? Math.round(v * 100) / 100 : Math.round(v);
      if (!Object.keys(S.schedule[k]).length) delete S.schedule[k];
      update();
    }
    if (el.dataset.bind && el.tagName === 'SELECT') {
      setPath(S, el.dataset.bind, readVal(el));
      if (/^custom\.\d+\.wp$/.test(el.dataset.bind)) { RES = compute(S); $('de3-customRows').innerHTML = renderCustom(S, RES); }
      update();
    }
  });
  ROOT.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (isReadOnly() && !b.dataset.tab && !b.dataset.tabJump) return;
    if (b.dataset.del) { const [k, i] = b.dataset.del.split('.'); S[k].splice(Number(i), 1); if (k === 'sources') unlinkSource(Number(i)); Object.keys(S.overrides).filter(x => /^(p\.|t\.|g\.sm\.|r\.|c\.)/.test(x)).forEach(x => delete S.overrides[x]); RES = compute(S); renderTables(); update(); }
    if (b.dataset.add) { S[b.dataset.add].push(clone(NEW_ROW[b.dataset.add])); RES = compute(S); renderTables(); update(); }
    if (b.dataset.cal === 'reset') { S.rates = {}; update({calibration: true}); }
    if (b.dataset.wpdel) { S.removed = (S.removed || []).concat(S.removed.includes(b.dataset.wpdel) ? [] : [b.dataset.wpdel]); update(); }
    if (b.dataset.wprestore) { S.removed = b.dataset.wprestore === '*' ? [] : (S.removed || []).filter(k => k !== b.dataset.wprestore); update(); }
    if (b.dataset.action === 'reset-schedule') { S.schedule = {}; S.order = []; S.removed = []; update(); }
    if (b.dataset.move) { const [k, d] = splitLast(b.dataset.move, '|'); if (moveOrder(S, SCH, k, Number(d))) update(); }
    if (b.dataset.tabJump) { const t = (ROOT || document).querySelector('[data-tab="' + b.dataset.tabJump + '"]'); if (t) t.click(); }
    if (b.dataset.tab) {
      qsa('.tab').forEach(t => t.classList.toggle('active', t === b));
      qsa('.tabpane').forEach(p => p.classList.toggle('active', p.id === 'de3-pane-' + b.dataset.tab));
    }
  });
  $('de3-loadPreset').onclick = () => { if (!isReadOnly()) loadState(PRESETS.blank.state); };
  $('de3-clearOverrides').onclick = () => { if (!isReadOnly()) { S.overrides = {}; update(); } };
  initGanttDrag();
  loadState(PRESETS.blank.state);
}

/* A shared estimation is read-only. Disabled inputs already block typing, but
   buttons and the Gantt drag are driven by click/pointer handlers, so they have
   to check the flag the page sets on the view. */
/* Transformation groups point at sources by index, so removing a source has to
   re-point the groups below it and send the ones on it to "Multiple sources". */
function unlinkSource(i) {
  (S.transforms || []).forEach(t => {
    if (t.source === '' || t.source === null || t.source === undefined) return;
    const v = Number(t.source);
    if (v === i) t.source = ''; else if (v > i) t.source = v - 1;
  });
}
function isReadOnly() { return Boolean(ROOT && ROOT.classList.contains('de-readonly')); }

/* ---------- Gantt drag & drop: bars left/right (start week) and up/down (order); hours and duration never change ---------- */
function initGanttDrag() {
  let D = null;
  const clearMarks = () => document.querySelectorAll('#de3-gantt .g-row.drop-before, #de3-gantt .g-row.drop-after').forEach(r => r.classList.remove('drop-before', 'drop-after'));
  document.addEventListener('pointerdown', e => {
    if (e.button !== 0 || isReadOnly()) return;
    if (e.target.closest && e.target.closest('#de3-gantt button')) return;   // the remove control is a click, not a drag
    const bar = e.target.closest && e.target.closest('#de3-gantt .g-bar.drag');
    const lab = !bar && e.target.closest && e.target.closest('#de3-gantt .g-row[data-key] .g-label');
    if (!bar && !lab) return;
    const row = (bar || lab).closest('.g-row'), key = row.dataset.key, r = SCH.rows.find(x => x.key === key);
    if (!r) return;
    const track = row.querySelector('.g-track');
    D = {key, r, bar, row, x0: e.clientX, y0: e.clientY, ww: track.getBoundingClientRect().width / SCH.total, shift: 0, target: null, after: false, movedPx: 0};
    (bar || lab).setPointerCapture(e.pointerId);
    row.classList.add('dragging');
    e.preventDefault();
  });
  document.addEventListener('pointermove', e => {
    if (!D) return;
    const dx = e.clientX - D.x0, dy = e.clientY - D.y0;
    D.movedPx = Math.max(D.movedPx, Math.abs(dx), Math.abs(dy));
    if (D.bar) {
      let shift = Math.round(dx / D.ww);
      if (D.r.start + shift < 1) shift = 1 - D.r.start;            // cannot move before week 1
      D.shift = shift;
      D.bar.style.transform = `translate(${shift * D.ww}px, ${dy}px)`;
      const sp = D.bar.querySelector('span'); if (sp) sp.textContent = `W${D.r.start + shift}–W${D.r.end + shift}`;
    } else {
      D.row.style.transform = `translateY(${dy}px)`;
    }
    clearMarks(); D.target = null;
    if (Math.abs(dy) > 8) {
      for (const row of document.querySelectorAll('#de3-gantt .g-row[data-key]')) {
        if (row === D.row) continue;
        const rc = row.getBoundingClientRect();
        if (e.clientY >= rc.top && e.clientY <= rc.bottom) { D.target = row.dataset.key; D.after = e.clientY > rc.top + rc.height / 2; row.classList.add(D.after ? 'drop-after' : 'drop-before'); break; }
      }
    }
  });
  const finish = commit => {
    if (!D) return;
    const d = D; D = null; clearMarks();
    d.row.classList.remove('dragging'); d.row.style.transform = ''; if (d.bar) d.bar.style.transform = '';
    if (commit && d.movedPx > 3) applyGanttMove(S, SCH, d.key, d.shift, d.target, d.after);
    update();
  };
  document.addEventListener('pointerup', () => finish(true));
  document.addEventListener('pointercancel', () => finish(false));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') finish(false); });
}

/* ===== Embedding API =====
   The standalone estimator booted itself on load. Inside the app it is one view
   among several and its state is owned by the saved estimation, so the page
   drives it through this surface instead. */
window.FabricEstimatorV3 = {
  init,
  // Snapshot for persistence. Versioned so a later engine change can migrate
  // rather than silently misread an old document.
  getState() { return {estimatorVersion: '3.1', state: clone(S)}; },
  // Anything that is not a v3 document (including every estimate saved by the
  // previous layer-based estimator) opens on a clean v3 scenario instead of
  // throwing or half-populating the form.
  setState(payload) {
    const st = payload && payload.estimatorVersion === '3.1' && payload.state ? payload.state : null;
    loadState(st || PRESETS.blank.state);
    return Boolean(st);
  },
  recalc() { if (ROOT) update({calibration: true}); },
  /* The page toggles the read-only class on the view; the estimator owns the
     control states, so it has to be told to re-apply them without a full
     recalculation. */
  refreshReadOnly() { if (ROOT) applyReadOnly(); },
  // Totals the page needs for the HTML export and the saved summary.
  getResult() { return RES ? {total: RES.total, delivery: RES.delivery, pm: RES.pm, doc: RES.doc, risk: RES.risk, weeks: SCH ? SCH.total : 0, fte: RES.fte, tshirt: RES.tshirt, wps: RES.wps.map(w => ({key: w.key, name: w.name, hours: w.hours}))} : null; },
  getClientName() { return S.meta.client || ''; },
  setClientName(name) { if (!ROOT) return; S.meta.client = name || ''; bindStatic(); update(); },
  /* Organisation calibration, owned by the admin panel. The rate card itself
     is static, so the admin UI reads the definitions from here rather than
     keeping a second copy. */
  getRateDefs() { return RATE_DEFS.map(r => ({key: r[0], group: r[1], label: r[2], unit: r[3], builtIn: r[5]})); },
  getOrgRates() { return Object.assign({}, ORG_RATES); },
  setOrgRates(rates) {
    ORG_RATES = {};
    Object.entries(rates || {}).forEach(([k, v]) => { if (DEFAULT_RATES[k] !== undefined && isFinite(Number(v))) ORG_RATES[k] = Number(v); });
    if (ROOT) update({calibration: true});
  },
};
})();
