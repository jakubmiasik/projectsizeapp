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
  const cLine = (w, c) => { line(w, 'c.' + c.i, c.name || ('Additional activity ' + (c.i + 1)), c.qty, c.rate, 1, 'Additional activity · ' + n(c.qty) + ' × ' + n(c.rate) + ' h'); const l = w.lines[w.lines.length - 1]; l.custom = true; l.notes = String(c.notes || '').trim(); };
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
      <span class="pill" data-chours="${i}">${fmt(lineHours['c.' + i] || 0, 1)} h</span><button class="btn danger" data-del="custom.${i}" title="Remove">×</button>
      <textarea class="c-notes" data-bind="custom.${i}.notes" rows="2" placeholder="What is included – scope, assumptions, deliverables…">${esc(c.notes)}</textarea></div>`;
  }).join('') || '<p class="small">No additional activities yet.</p>';
}

/* ---------- Gantt ---------- */
function schedule(res, s) {
  const hpw = Number(s.settings.hoursPerWeek) || 40;
  const ov = s.schedule || {};
  /* Work packages the user took off the timeline. Their hours are untouched in
     the estimate – only the bar is gone, which is what a 0 h package needs. */
  const rm = new Set(s.removed || []);
  const removed = res.wps.filter(w => rm.has(w.key)).map(w => ({key: w.key, name: wpLabel(s, w), hours: w.hours}));
  const ord = s.order || [];
  const tpl = k => GANTT_TEMPLATE[k] ? GANTT_TEMPLATE[k][0] : 9;
  let rows = res.wps.filter(w => !rm.has(w.key)).map((w, idx) => {
    const o = ov[w.key] || {};
    const planFte = Number(o.fte) > 0 ? Number(o.fte) : DEFAULT_WP_FTE;
    const autoDur = Math.max(1, Math.ceil(w.hours / (planFte * hpw)));
    const resized = Number(o.dur) > 0 && Math.round(Number(o.dur)) !== autoDur;
    const dur = resized ? Math.max(1, Math.round(Number(o.dur))) : autoDur;
    return {key: w.key, name: wpLabel(s, w), original: w.name, renamed: wpLabel(s, w) !== w.name, hours: w.hours, dur, autoDur, resized, planFte, additional: !!w.custom, idx};
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
/* The business-friendly name someone gave a work package on the timeline, or its own. */
function wpLabel(s, w) { const v = String(((s.wpNames || {})[w.key]) || '').trim(); return v || w.name; }
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
  const rows = sch.rows.map(r => `<div class="g-row" data-key="${esc(r.key)}"><div class="g-label" title="Drag to reorder"><b title="${esc(r.renamed ? 'Original name: ' + r.original : r.name)}"><span class="grip">⋮⋮</span>${esc(r.name)}${badges(r)}</b><span>W${r.start}–W${r.end} · ${fmt(r.dur)} wk · ${fmt(r.fte, 2)} FTE</span><button type="button" class="g-ren" data-wpedit="${esc(r.key)}" title="Give ${esc(r.name)} a business-friendly name" aria-label="Rename ${esc(r.name)}">✎</button><button type="button" class="g-del" data-wpdel="${esc(r.key)}" title="Remove ${esc(r.name)} from the timeline" aria-label="Remove ${esc(r.name)} from the timeline">×</button></div><div class="g-track" style="--weeks:${T}">${bar(r, colorOf(r), true)}</div></div>`).join('');
  const mg = {name: 'Project management, documentation & contingency', start: 1, dur: T, end: T, hours: sch.mgmt};
  const mgRow = sch.mgmt > 0 ? `<div class="g-row g-mgmt"><div class="g-label"><b>${esc(mg.name)}</b><span>W1–W${T} · runs across the engagement</span></div><div class="g-track" style="--weeks:${T}">${bar(mg, 'repeating-linear-gradient(135deg,#94a3b8 0 6px,#a8b5c6 6px 12px)', false)}</div></div>` : '';
  const chart = `<div class="g-hint small">Drag a bar <b>left / right</b> to change its start week, or drag a bar or its name <b>up / down</b> to change the order. Moving never changes hours or duration. Use <b>✎</b> to give a work package a business-friendly name (hover the name to see the original) and <b>×</b> to take it off the timeline – its hours stay in the estimate.</div><div class="gantt" id="ganttChart"><div class="g-row g-head"><div class="g-label">Work package</div><div class="g-track g-axis" style="--weeks:${T}">${axis}</div></div>${rows}${mgRow}</div>`;
  const removed = (sch.removed || []).length ? `<div class="g-removed small"><span>Off the timeline:</span>${sch.removed.map(r => `<button type="button" class="chip" data-wprestore="${esc(r.key)}" title="Put ${esc(r.name)} back on the timeline">${esc(r.name)} · ${fmt(r.hours)} h <b>+</b></button>`).join('')}<button type="button" class="btn ghost mini" data-wprestore="*">Restore all</button></div>` : '';
  /* A new package is an additional activity with its own bar, so it is also
     listed (and can be split up) under Additional activities. */
  const addWp = `<div class="g-addwp"><input data-newwp="name" placeholder="New work package name, e.g. Data migration of archive" aria-label="New work package name"><input type="number" min="0" step="1" data-newwp="hours" placeholder="Hours" aria-label="Hours for the new work package"><button type="button" class="btn secondary" data-action="add-wp">+ Add work package</button><span class="small">Added packages count towards delivery effort and are listed under <b>Additional activities</b> on Scope inputs, where you can describe or split them.</span></div>`;
  const table = `<details class="sched"><summary><span>Adjust schedule</span><span class="small">name, order, people, start week and duration · blank = automatic</span></summary>
    <table class="grid"><thead><tr><th>Order</th><th>Work package</th><th>Business-friendly name</th><th class="r">People (FTE)</th><th class="r">Start week</th><th class="r">Duration (weeks)</th><th class="r">End week</th><th class="r">Hours</th><th class="r">Actual FTE</th></tr></thead><tbody>
    ${sch.rows.map((r, i) => { const o = (s.schedule || {})[r.key] || {}; return `<tr class="${r.moved || r.resized ? 'ovr' : ''}"><td class="nowrap"><button class="btn mini" data-move="${esc(r.key)}|-1"${i === 0 ? ' disabled' : ''} title="Move up">↑</button><button class="btn mini" data-move="${esc(r.key)}|1"${i === sch.rows.length - 1 ? ' disabled' : ''} title="Move down">↓</button></td><td>${esc(r.original)}${badges(r)}</td><td><input class="wpname" data-wpname="${esc(r.key)}" value="${r.renamed ? esc(r.name) : ''}" placeholder="${esc(r.original)}" title="Name shown on the timeline – the original name stays in the tooltip"></td><td class="r"><input type="number" min="0.1" step="0.1" data-sched="${esc(r.key)}.fte" value="${Number(o.fte) > 0 ? r.planFte : ''}" placeholder="${DEFAULT_WP_FTE}" title="People working on this package – drives the automatic duration"></td><td class="r"><input type="number" min="1" data-sched="${esc(r.key)}.start" value="${r.moved ? r.start : ''}" placeholder="${r.autoStart}"></td><td class="r"><input type="number" min="1" data-sched="${esc(r.key)}.dur" value="${r.resized ? r.dur : ''}" placeholder="${r.autoDur}" title="Override the number of weeks for this package"></td><td class="r">${r.end}</td><td class="r">${fmt(r.hours)}</td><td class="r">${fmt(r.fte, 2)}</td></tr>`; }).join('')}
    </tbody></table><div class="actions"><button class="btn ghost" data-action="reset-schedule">Reset schedule, order and names</button></div></details>`;
  return chart + removed + addWp + `<div class="g-foot small">Total duration <b>${T} weeks</b> · average team <b>${fmt(sch.avgFte, 2)} FTE</b> at ${fmt(Number(s.settings.hoursPerWeek) || 40)} productive h/week. Each bar is as long as its hours need at the people assigned to it (${DEFAULT_WP_FTE} FTE unless you change it), and packages only run in parallel while the team has capacity for them.</div>` + table;
}

function renderBreakdown(res) {
  return res.wps.map(w => `<details class="wp" open style="--wp:${w.custom ? '#7a5c99' : (WP_COLORS[w.key] || '#5c6f82')}"><summary><span>${esc(w.name)}</span><span class="pill strong">${fmt(w.hours, 1)} h</span></summary><p class="small">${esc(w.desc)}</p>
    <table class="grid"><thead><tr><th>Activity</th><th class="r">Qty</th><th class="r">Rate (h)</th><th class="r">Multiplier</th><th class="r">Calculated</th><th class="r">Override h</th><th class="r">Final</th></tr></thead><tbody>
    ${w.lines.map(l => `<tr class="${l.overridden ? 'ovr' : ''}${l.calc === 0 && !l.overridden ? ' zero' : ''}"><td>${esc(l.label)}${l.custom ? ' <i class="badge add">Additional</i>' : ''}${l.formula ? `<div class="small">${esc(l.formula)}</div>` : ''}${l.notes ? `<div class="small l-notes">${esc(l.notes)}</div>` : ''}</td><td class="r">${fmt(l.qty, l.qty % 1 ? 1 : 0)}</td><td class="r">${fmt(l.rate, 2)}</td><td class="r">${fmt(l.mult, 2)}</td><td class="r">${fmt(l.calc, 1)}</td><td class="r"><input class="ov" type="number" step="0.5" data-ov="${esc(l.id)}" value="${l.overridden ? esc(l.hours) : ''}" placeholder="auto"></td><td class="r"><b>${fmt(l.final, 1)}</b></td></tr>`).join('')}
    </tbody></table></details>`).join('') + `<p class="small">Type hours in <b>Override h</b> to fix any activity; leave blank to use the calculated value. Overridden lines are highlighted.</p>`;
}
/* A changed rate asks for a justification. The field is always rendered and
   only shown on changed rows, so typing a rate never rebuilds the table. */
function renderCalibration(s) {
  const groups = [...new Set(RATE_DEFS.map(r => r[1]))];
  const BASE = baseRates();
  const R = Object.assign({}, BASE, s.rates);
  const notes = s.rateNotes || {};
  return groups.map(g => `<details class="cal" ${g === 'Discovery' ? 'open' : ''}><summary>${esc(g)}</summary><table class="grid"><thead><tr><th>Activity</th><th>Unit</th><th class="r">Rate in use</th><th class="r">Default</th><th class="just">Justification of the change</th></tr></thead><tbody>
    ${RATE_DEFS.filter(r => r[1] === g).map(r => { const cur = R[r[0]]; const def = BASE[r[0]]; const chg = Number(cur) !== Number(def); return `<tr class="${chg ? 'ovr' : ''}"><td>${esc(r[2])}</td><td class="small">${esc(r[3])}</td><td class="r"><input class="rate" type="number" step="0.01" data-rate="${r[0]}" value="${esc(cur)}"></td><td class="r muted">${esc(def)}</td><td class="just"><input class="just" data-ratenote="${r[0]}" value="${esc(notes[r[0]])}" placeholder="Why the rate differs from the default"></td></tr>`; }).join('')}
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
/* The scope sections a project type can include. Each type's built-in list is
   the fallback; an administrator can recalibrate it in Admin → Calibration. */
const SECTIONS = [['discovery', 'B · Discovery and assessment'], ['sources', 'C · Sources and ingestion'], ['transform', 'D · Transformation layer'], ['legacy', 'E · Legacy migration estate'],
  ['models', 'F · Gold, semantic models and security'], ['reports', 'G · Reporting portfolio'], ['ops', 'H · Quality, operations and release']];
let ORG_TYPES = {};
function typeSections(k) {
  const key = TYPES[k] ? k : 'platformMigration';
  return Array.isArray(ORG_TYPES[key]) ? ORG_TYPES[key] : TYPES[key].show;
}

/* ---------- What each input means and how it moves the estimate ----------
   {rateKey} is replaced with the rate in use when the tip opens, so the
   numbers follow the calibration. `cx` lists the levels of a complexity-type
   input from CX below. */
const CX = {
  docQ: ['Documentation quality', [['Good', '×1.00', 'Up-to-date design docs, data dictionary and lineage exist; owners can answer questions.'], ['Partial', '×1.10', 'A gap workbook or partial specs exist, but key definitions conflict or are missing.'], ['Limited / reverse-engineering', '×1.25', 'Logic lives only in code (SSIS, procedures, Cognos); it has to be read to be understood.']]],
  arch: ['Architecture complexity', [['Low', '×0.8', 'One source family, standard medallion lakehouse, no special security or latency needs.'], ['Medium', '×1.0', 'Several sources and a few integration patterns, an existing platform to extend.'], ['High', '×1.35', 'Many sources, hybrid lakehouse / warehouse or near-real-time, several domains, strict regulatory constraints.']]],
  connect: ['Connectivity', [['Native / simple', '×0.8', 'Fabric shortcut, mirroring, Azure SQL, Dataverse.'], ['Standard gateway', '×1.0', 'On-premises SQL Server or Oracle through the data gateway / self-hosted IR.'], ['API / ODBC / files', '×1.35', 'REST APIs, ODBC, SFTP, CSV / Excel / TXT drops.'], ['Custom / constrained', '×1.7', 'SAP, mainframe, throttled or paged APIs, VPN-only access, custom views nobody owns.']]],
  load: ['Load pattern', [['Full load', '×0.8', 'Small reference tables reloaded every run.'], ['Incremental', '×1.0', 'Watermark or CDC on a modified date / key.'], ['History + incremental', '×1.25', 'Years of history backfilled once, then daily deltas.'], ['Near-real-time', '×1.6', 'Eventstreams or frequent micro-batches, minutes of latency.']]],
  ttype: ['Transformation type', [['Cleansing / standardisation', '×0.8', 'Trim, cast, null handling, code-to-description lookups.'], ['Conforming / joins / dedup', '×1.0', 'Key mapping, merging customers from two systems, removing duplicates.'], ['Aggregation / snapshot', '×1.1', 'Monthly snapshots, summary tables, period-end balances.'], ['Business rules / derivations', '×1.3', 'Gross margin, allocations, currency conversion, stand decomposition.'], ['History / SCD', '×1.5', 'Slowly changing dimensions, as-of and bitemporal logic.']]],
  tcomplex: ['Transformation complexity', [['Low', '×0.6', 'One source table, a handful of columns, no lookups.'], ['Medium', '×1.0', 'A few joins and standard rules, well-understood source.'], ['High', '×1.6', 'Many joins, conditional rules, data-quality handling and exceptions.'], ['Very high', '×2.4', 'Multi-step logic, heavy performance tuning or a poorly understood source.']]],
  legacy: ['Legacy asset tiers', [['Low-complexity ETL', '{etlLow} h', 'Copy or key-mapping package, one source to one target.'], ['Medium ETL', '{etlMed} h', 'Loads a fact or dimension with lookups and a few rules.'], ['High ETL / controller', '{etlHigh} h', 'Orchestrates other packages, script tasks, heavy branching.'], ['Simple stored procedure', '{spSimple} h', 'Under ~500 lines of straightforward SQL.'], ['Complex stored procedure', '{spComplex} h', 'Over ~500 lines, cursors, dynamic SQL, business-critical logic such as commissions.']]],
  framework: ['Reusable framework', [['No framework benefit', '×1.0', 'Every asset is rebuilt by hand.'], ['Moderate reuse', '×0.75', 'Templates or patterns cover part of the estate.'], ['Strong metadata / template reuse', '×0.55', 'A metadata-driven framework generates most loads from configuration.']]],
  gold: ['Gold complexity', [['Standard', '×1.0', 'Star schema straight from the transformed layer, one currency, simple hierarchies.'], ['Complex', '×1.5', 'Many-to-many, several currencies, ragged hierarchies, reuse across divisions.'], ['Very complex', '×2.2', 'Snapshot or bitemporal history, heavy allocation logic, very large volumes.']]],
  smMode: ['Semantic model mode', [['New build', '×1.0', 'A new model designed from Gold.'], ['Reuse / migrate', '×0.65', 'An existing model moved to Fabric with its measures largely reused.'], ['Redesign', '×1.2', 'An existing model restructured for new requirements.']]],
  rcomplex: ['Report complexity', [['Low', '×0.75', 'A table, a few cards and one or two slicers.'], ['Medium', '×1.0', 'Several visuals, slicers, drill-through to a detail page.'], ['Medium-high', '×1.25', 'Bookmarks, tooltip pages, dynamic titles, conditional formatting.'], ['High', '×1.5', 'Field parameters, calculation-group selectors, complex interactions or pixel-perfect layout.']]],
  raction: ['Report action', [['Repoint', '×0.25', 'Point an existing Power BI report at the new model.'], ['Migrate as-is', '×0.6', 'Re-create the same layout in Power BI (e.g. from Tableau or Cognos).'], ['Rebuild', '×1.0', 'Rebuild with improvements to layout and logic.'], ['Redesign', '×1.3', 'New UX from new requirements, with user workshops.']]],
  other: ['OTHER environment complexity', [['Low', '×0.8', 'A copy of TEST with the same deployment pipeline.'], ['Medium', '×1.0', 'Its own capacity, connections and data refresh.'], ['High', '×1.3', 'Separate tenant or network, data masking or a training data set to prepare.']]],
};
const INFO = {
  'sec.endorse': 'Where the estimate stands. Draft while it is worked on, Proposed when it is submitted for endorsement, Final once endorsed – a Final estimate is locked. Each step records who moved it, when and an optional comment. No effect on hours.',
  'sec.strategy': 'How the engagement is framed. Project type decides which sections below are included; maturity, documentation quality and the PM / documentation / contingency percentages scale the whole estimate.',
  'sec.discovery': 'Effort to understand the current estate and design the target before building. Hours mostly scale with documentation quality.',
  'sec.sources': 'One row per source system or group of similar sources. Each row costs one connector plus an amount per object, both scaled by connectivity and load pattern.',
  'sec.transform': 'Logic between ingestion and Gold. Hours = transformations × {transformObj} h × type × complexity.',
  'sec.legacy': 'Existing ETL, procedures and views that have to be rebuilt on the new platform. Retired assets and a reusable framework reduce the hours; poor documentation increases them.',
  'sec.models': 'Curated facts and dimensions, business rules and the Power BI semantic models with their security.',
  'sec.reports': 'Reports grouped by technology or kind. Hours per report = base + extra pages, scaled by complexity and by what has to happen to the report.',
  'sec.ops': 'Testing, operations and release: reconciliation, security tests, schedules, monitoring, KT, catalogue, UAT and the production launch.',
  'sec.custom': 'Anything the sections above do not cover. Hours = quantity × hours per unit; they count as delivery effort, so PM, documentation and contingency apply.',
  'sec.team': 'Who delivers the work. FTE does not change total hours – it decides how long the timeline is and how hours split between roles.',
  'meta.client': 'The opportunity this estimate belongs to. It comes from Client Name on the sizing page and follows it, so it cannot be changed here. No effect on hours.',
  'meta.projectType': 'The kind of engagement. It decides which scope sections (B–H) are included – sections that are left out add no hours. Administrators set the sections per type in Admin → Calibration.',
  'meta.architecture': 'The target architecture pattern. It is recorded for reviewers and the proposal and does not change hours by itself – reflect its effort through architecture complexity and the scope inputs.',
  'settings.maturity': 'How much evidence the estimate rests on. It sets contingency: ROM 20%, Planning 15%, Validated after Discovery 10%. With “Apply maturity multiplier” ticked, delivery effort is also multiplied by ×1.2 / ×1.1 / ×1.0.',
  'settings.docQ': {t: 'How well the current estate is documented. Multiplies Discovery and Legacy rebuild hours.', cx: 'docQ'},
  'settings.pmPct': 'Project management as a percentage of delivery effort, added on top of it.',
  'settings.docPct': 'Documentation (design, runbooks, hand-over) as a percentage of delivery effort, added on top of it.',
  'settings.riskPct': 'Contingency as a percentage of delivery effort, added on top of it. Estimate maturity sets it; you can type your own value.',
  'settings.envDev': 'Development environment. It is where the build happens, so it adds no separate hours.',
  'settings.envTest': 'Adds the TEST Environment & UAT work package: setup {testSetup} h, {uatCycle} h per UAT cycle, {uatTester} h per tester, a {uatDefectPct}% defect allowance on build hours and a {testEvidence} h evidence pack.',
  'settings.envProd': 'Adds Production Launch & Hypercare: PROD setup, deployment waves, cutover, parallel run, hypercare, knowledge transfer and the decommissioning plan.',
  'settings.envOther': 'Adds a work package for one more environment (training, pre-production…): setup, deployment and support, scaled by OTHER complexity.',
  'settings.maturityAsMultiplier': 'Also multiplies delivery effort by the maturity factor (ROM ×1.2, Planning ×1.1, Validated ×1.0), on top of contingency. Use it when the scope itself is likely to grow.',
  'foundation': 'Platform work before ingestion: capacities, workspaces, environments, Git / deployment pipelines and a metadata framework. Existing 0 h · Basic {foundationBasic} h · Production {foundationProduction} h · Enterprise {foundationEnterprise} h.',
  'governance': 'Standards and governance design: naming, access model, ownership, glossary. Basic {govBasic} h · Operational {govOperational} h · Enterprise {govEnterprise} h, counted under Quality & Operations.',
  'settings.otherName': 'Name of the extra environment. It becomes the work package name on the timeline.',
  'settings.otherComplexity': {t: 'Scales setup ({otherSetup} h), deployment ({otherDeploy} h) and support ({otherSupport} h) of the OTHER environment.', cx: 'other'},
  'meta.notes': 'Free-text notes on scope and assumptions. No effect on hours – use the Scope tab for the full write-up.',
  'discovery.workshops': 'Scoping and design workshops including preparation and write-up. {workshop} h each × documentation quality.',
  'discovery.assessedSources': 'Source systems reviewed for connectivity, volumes and access. {srcAssess} h each × documentation quality.',
  'discovery.sampledObjects': 'Representative tables, files or attributes profiled during Discovery. {objSample} h each × documentation quality. Use either samples or the full inventory for the same assets, not both.',
  'discovery.inventoriedAssets': 'Full inventory of legacy assets (packages, procedures, jobs) with lineage. {assetInventory} h each × documentation quality.',
  'discovery.sampledProcesses': 'Business processes walked through end to end. {procSample} h each × documentation quality.',
  'discovery.assessedReports': 'Existing reports reviewed for usage and KPI criticality. {reportAssess} h each × documentation quality.',
  'discovery.archComplexity': {t: 'Multiplies the target architecture & design effort ({archBase} h base).', cx: 'arch'},
  'discovery.assessSecurity': 'Security and governance assessment. Conceptual {secAssessConceptual} h: access model on paper. Detailed {secAssessDetailed} h: RLS / OLS rules, groups and data classification.',
  'discovery.poc': 'Proof of concept before the build is committed. Light {pocLight} h: validate one pattern. Technical {pocTechnical} h: a working end-to-end slice.',
  'src.name': 'A source system or a group of sources that behave the same way.',
  'src.objects': 'Tables, views, files or API endpoints to ingest. Hours = objects × {ingestObj} h × connectivity × load pattern, plus one connector ({srcConnector} h × connectivity) per row.',
  'src.connect': {t: 'How hard the source is to reach. Multiplies the connector and every object on the row.', cx: 'connect'},
  'src.load': {t: 'How the data is loaded. Multiplies the object hours on the row.', cx: 'load'},
  'trans.name': 'A group of similar transformations, e.g. customer merge or currency conversion.',
  'trans.source': 'The source the transformations read from. Pick Multiple sources for ones that combine several. No effect on hours.',
  'trans.count': 'Transformation steps in the group (notebooks, dataflows, procedures). Hours = count × {transformObj} h × type × complexity.',
  'trans.type': {t: 'What kind of logic the transformations carry.', cx: 'ttype'},
  'trans.complexity': {t: 'How hard each transformation is to build and test.', cx: 'tcomplex'},
  'legacy.etlLow': {t: 'Low-complexity ETL assets, {etlLow} h each. Every legacy tier is scaled by the reusable framework, the retirement ratio and documentation quality.', cx: 'legacy'},
  'legacy.etlMed': {t: 'Medium ETL assets, {etlMed} h each.', cx: 'legacy'},
  'legacy.etlHigh': {t: 'High ETL / controller packages, {etlHigh} h each.', cx: 'legacy'},
  'legacy.spSimple': {t: 'Simple stored procedures, {spSimple} h each.', cx: 'legacy'},
  'legacy.spComplex': {t: 'Complex stored procedures, {spComplex} h each.', cx: 'legacy'},
  'legacy.views': 'Views re-created on the target. {viewMig} h each, scaled like the other legacy assets.',
  'legacy.framework': {t: 'Reuse from a metadata or template framework. Multiplies every legacy rebuild line.', cx: 'framework'},
  'legacy.retirement': 'Share of legacy assets confirmed obsolete. Legacy rebuild hours drop by this percentage.',
  'gold.dimensions': 'Conformed dimensions in Gold. {dimension} h each × Gold complexity.',
  'gold.facts': 'Fact tables in Gold. {fact} h each × Gold complexity.',
  'gold.businessRules': 'Calculations beyond a standard fact or dimension build: allocations, currency conversion, stand decomposition. {businessRule} h each.',
  'gold.consumptionViews': 'Views exposed to consumers on top of Gold. {consumptionView} h each.',
  'gold.complexity': {t: 'Multiplies dimension and fact hours.', cx: 'gold'},
  'sm.name': 'One row per semantic model. Hours = ({smBase} h base + tables + measures + calculation objects + security) × mode.',
  'sm.tables': 'Tables in the model, {smTable} h each.',
  'sm.measuresMig': 'Measures reused from an existing model, {smMeasureMig} h each.',
  'sm.measuresNew': 'New measures or KPIs written in DAX, {smMeasureNew} h each.',
  'sm.calcs': 'Calculation group items, field parameters and similar objects, {smCalc} h each.',
  'sm.security': 'Security per model. Static RLS {secStatic} h · Dynamic RLS {secDynamic} h · Hierarchy / OLS / CLS {secHierarchy} h.',
  'sm.mode': {t: 'Multiplies the whole model line.', cx: 'smMode'},
  'rep.name': 'A group of reports with the same technology and similar shape.',
  'rep.count': 'Reports in the group. Hours = reports × ({reportBase} h base + extra pages × {reportPage} h) × complexity × action.',
  'rep.pages': 'Average pages per report. The first page is part of the base.',
  'rep.complexity': {t: 'How demanding each report is to build.', cx: 'rcomplex'},
  'rep.action': {t: 'What has to happen to the report.', cx: 'raction'},
  'ops.reconcileObjects': 'Objects compared with the legacy or source numbers. {reconcileObj} h each.',
  'ops.validateMeasures': 'Measures checked for parity. {measureValidate} h each.',
  'ops.securityTests': 'Security scenarios tested, e.g. a user restricted to one company. {securityTest} h each.',
  'ops.schedules': 'Pipelines or refresh chains to orchestrate. {schedule} h each.',
  'ops.monitoring': 'Basic alerts {monitoringBasic} h · Dashboard + alerts {monitoringDashboard} h · Operational framework {monitoringFramework} h.',
  'ops.ktSessions': 'Knowledge-transfer sessions, {ktSession} h each. With PROD ticked they are counted under Production Launch & Hypercare.',
  'ops.purview': 'Workspace scan {purviewScan} h · Scan + lineage {purviewLineage} h · Governance integration {purviewIntegration} h.',
  'test.uatCycles': 'UAT cycles: plan, support, triage and close. {uatCycle} h each.',
  'test.testers': 'Business testers to prepare and support. {uatTester} h each.',
  'prod.waves': 'Deployment waves or cutovers. {prodWave} h each, plus one-off PROD setup and cutover planning.',
  'prod.parallelWeeks': 'Weeks the old and new solution run side by side, across all waves. {parallelWeek} h per week.',
  'prod.hypercareWeeks': 'Weeks of hypercare after go-live, across all waves. {hypercareWeek} h per week.',
  'prod.decommission': 'A plan to retire the legacy platform. {decommission} h when included.',
  'custom.name': 'What the activity is.',
  'custom.wp': 'Add the hours to an existing work package (its bar grows) or give the activity its own bar on the timeline.',
  'custom.qty': 'How many units of the activity.',
  'custom.rate': 'Hours per unit. Hours = quantity × hours per unit.',
  'settings.hoursPerWeek': 'Productive hours one FTE delivers per week – 32 h means 80% utilisation. Lower values make the timeline longer; total hours do not change.',
  'team.role': 'A role on the delivery team.',
  'team.fte': 'Share of a full-time person on the project. The sum of FTE sets the team capacity on the timeline.',
};
const CX_PAGE_ORDER = ['docQ', 'arch', 'connect', 'load', 'ttype', 'tcomplex', 'legacy', 'framework', 'gold', 'smMode', 'rcomplex', 'raction', 'other'];

function tipRates(text) {
  const R = Object.assign({}, baseRates(), S.rates || {});
  return String(text).replace(/\{(\w+)\}/g, (m, k) => R[k] === undefined ? m : fmt(R[k], R[k] % 1 ? 2 : 0));
}
function tipHtml(key) {
  const i = INFO[key]; if (!i) return '';
  const o = typeof i === 'string' ? {t: i} : i;
  let h = `<p>${esc(tipRates(o.t))}</p>`;
  if (key === 'meta.projectType') {
    const on = typeSections(S.meta.projectType);
    h += `<p><b>Included now:</b> ${esc(SECTIONS.filter(x => on.includes(x[0])).map(x => x[1].split(' · ')[1]).join(' · ') || 'no build sections')}.</p>`;
  }
  if (o.cx) h += `<ul>${CX[o.cx][1].map(l => `<li><b>${esc(l[0])} ${esc(tipRates(l[1]))}</b> – ${esc(l[2])}</li>`).join('')}</ul>`;
  return h;
}
/* The "What complexity means" card on Scope inputs. */
function renderCxGuide() {
  return CX_PAGE_ORDER.map(k => `<div class="cx-block"><h4>${esc(CX[k][0])}</h4><table class="grid"><thead><tr><th>Level</th><th class="r">Effect</th><th>Examples</th></tr></thead><tbody>${CX[k][1].map(l => `<tr><td class="nowrap"><b>${esc(l[0])}</b></td><td class="r nowrap">${esc(tipRates(l[1]))}</td><td>${esc(l[2])}</td></tr>`).join('')}</tbody></table></div>`).join('');
}
/* Icons go next to every label that has an explanation (keyed by the field it
   binds) and next to anything marked data-info (section titles, row headers). */
function addInfoIcons() {
  const icon = k => `<span class="de-info" tabindex="0" role="button" data-tip="${esc(k)}" aria-label="What this means">i</span>`;
  qsa('label').forEach(lb => {
    const f = lb.querySelector('[data-bind]'); if (!f || !INFO[f.dataset.bind] || lb.querySelector('.de-info')) return;
    if (f.type === 'checkbox') { lb.insertAdjacentHTML('beforeend', icon(f.dataset.bind)); return; }
    const t = [...lb.childNodes].find(nd => nd.nodeType === 3 && nd.textContent.trim());
    if (t) t.after(document.createRange().createContextualFragment(icon(f.dataset.bind)));
  });
  qsa('[data-info]').forEach(el => { if (INFO[el.dataset.info] && !el.querySelector('.de-info')) el.insertAdjacentHTML('beforeend', icon(el.dataset.info)); });
}
let TIP = null;
function showTip(ic) {
  if (!TIP) return;
  TIP.innerHTML = tipHtml(ic.dataset.tip);
  TIP.hidden = false;
  const r = ic.getBoundingClientRect(), w = TIP.offsetWidth, h = TIP.offsetHeight;
  const left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2));
  const top = r.bottom + 8 + h > window.innerHeight && r.top - 8 - h > 0 ? r.top - 8 - h : r.bottom + 8;
  TIP.style.left = left + 'px'; TIP.style.top = top + 'px';
}
function hideTip() { if (TIP) TIP.hidden = true; }

/* ---------- Scope tab: the written scope behind the numbers ---------- */
const SCOPE_SECTIONS = [
  ['changes', 'What changed', 'What changed since the previous version of this estimate: new inputs received, corrections, and why.'],
  ['summary', 'Executive summary', 'Customer objective, business problem, current state, target state, proposed solution and key assumptions.'],
  ['sourcesUsed', 'Sources used', 'Transcripts, requirement documents, workbooks and sample outputs this estimate is based on.'],
  ['workPackages', 'Scope – work packages', 'Per work package: stakeholders, requirements / activities, dependencies, assumptions, out of scope and deliverables.'],
  ['phases', 'Delivery phases', 'Phases with target dates, and what is deliberately left for later.'],
  ['justification', 'Estimation input justification', 'Every scope input, its value, how it was derived, its source and basis (evidence, derived, assumption, tool default).'],
  ['readiness', 'Estimation readiness', 'Status per area – sources, objects, volumes, transformations, governance, security, models, reports, latency – and the overall confidence.'],
  ['questions', 'Discovery questions', 'Open questions grouped as critical, important and optional.'],
  ['techValidation', 'Technology validation', 'Product capabilities and limits checked against documentation, and what is still an assumption.'],
];
const SCOPE_CMDS = [['bold', '', '<b>B</b>', 'Bold'], ['italic', '', '<i>I</i>', 'Italic'], ['underline', '', '<u>U</u>', 'Underline'], ['formatBlock', 'H3', 'H', 'Heading'], ['formatBlock', 'P', '¶', 'Paragraph'],
  ['insertUnorderedList', '', '• List', 'Bullet list'], ['insertOrderedList', '', '1. List', 'Numbered list'], ['removeFormat', '', '✕', 'Clear formatting']];
const defaultScope = () => SCOPE_SECTIONS.map(d => ({key: d[0], title: d[1], html: ''}));

/* Pasted content comes from Word, Excel, Outlook and web pages, and a shared
   estimate shows it to other people, so it is reduced to an allow-list of
   tags, attributes and cosmetic styles – on paste and again on every render. */
const RICH_TAGS = new Set(['P', 'BR', 'DIV', 'SPAN', 'STRONG', 'B', 'EM', 'I', 'U', 'S', 'STRIKE', 'SUB', 'SUP', 'A', 'UL', 'OL', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'BLOCKQUOTE', 'CODE', 'PRE', 'HR', 'IMG', 'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TD', 'TH', 'CAPTION', 'MARK', 'SMALL']);
const RICH_STYLES = new Set(['color', 'background-color', 'font-weight', 'font-style', 'text-decoration', 'text-decoration-line', 'text-align']);
function cleanStyle(v) {
  return String(v || '').split(';').map(d => { const i = d.indexOf(':'); if (i < 0) return ''; const p = d.slice(0, i).trim().toLowerCase(), val = d.slice(i + 1).trim(); return RICH_STYLES.has(p) && !/url\s*\(|expression\s*\(|[{}<>]/i.test(val) ? `${p}: ${val}` : ''; }).filter(Boolean).join('; ');
}
function sanitizeRich(html) {
  const raw = String(html || ''); if (!raw.trim()) return '';
  const doc = new DOMParser().parseFromString(`<body>${raw}</body>`, 'text/html');
  doc.body.querySelectorAll('script,style,link,meta,base,iframe,frame,object,embed,svg,math,form,input,textarea,select,button,video,audio,canvas,noscript,template,title').forEach(x => x.remove());
  const walk = node => [...node.children].forEach(el => {
    if (!RICH_TAGS.has(el.tagName)) { const p = el.parentNode; while (el.firstChild) p.insertBefore(el.firstChild, el); p.removeChild(el); return; }
    [...el.attributes].forEach(a => {
      const nm = a.name.toLowerCase(), v = a.value.trim();
      if (nm === 'style') { const st = cleanStyle(v); if (st) el.setAttribute('style', st); else el.removeAttribute('style'); return; }
      if (nm === 'href' && el.tagName === 'A') { if (/^(https?:|mailto:|#)/i.test(v)) { el.setAttribute('target', '_blank'); el.setAttribute('rel', 'noopener noreferrer'); } else el.removeAttribute('href'); return; }
      if (nm === 'src' && el.tagName === 'IMG') { if (!/^(https:|data:image\/(png|jpe?g|gif|webp);)/i.test(v)) el.remove(); return; }
      if ((nm === 'colspan' || nm === 'rowspan') && /^\d{1,3}$/.test(v)) return;
      if (nm === 'alt' || nm === 'title' || (nm === 'target' && el.tagName === 'A') || (nm === 'rel' && el.tagName === 'A')) return;
      el.removeAttribute(a.name);
    });
    walk(el);
  });
  walk(doc.body);
  return doc.body.innerHTML.trim();
}
function renderScope(s) {
  const secs = s.scope || [];
  const used = new Set(secs.map(x => x.key).filter(Boolean));
  const missing = SCOPE_SECTIONS.filter(d => !used.has(d[0]));
  const cards = secs.map((x, i) => {
    const def = SCOPE_SECTIONS.find(d => d[0] === x.key);
    return `<section class="card scope-sec"><div class="scope-head"><span class="num">${i + 1}</span><input class="scope-title" data-scope-title="${i}" value="${esc(x.title)}" placeholder="Section title" aria-label="Section title">
      <span class="scope-tools"><button type="button" class="btn mini" data-scope-move="${i}|-1"${i === 0 ? ' disabled' : ''} title="Move up">↑</button><button type="button" class="btn mini" data-scope-move="${i}|1"${i === secs.length - 1 ? ' disabled' : ''} title="Move down">↓</button><button type="button" class="btn danger mini" data-scope-del="${i}" title="Remove this section">×</button></span></div>
      <div class="scope-toolbar">${SCOPE_CMDS.map(c => `<button type="button" class="btn mini" data-scope-cmd="${c[0]}" data-scope-val="${c[1]}" title="${c[3]}">${c[2]}</button>`).join('')}</div>
      <div class="scope-editor" contenteditable="true" data-scope-html="${i}" data-placeholder="${esc(def ? def[2] : 'Paste or type the content of this section.')}">${sanitizeRich(x.html)}</div></section>`;
  }).join('');
  return cards + `<div class="scope-add"><select id="de3-scopeAddKey" aria-label="Section to add">${missing.map(d => opt(d[0], d[1])).join('')}${opt('custom', 'Custom section')}</select><button type="button" class="btn secondary" data-action="scope-add">+ Add section</button></div>`;
}
function syncScopeHtml(ed) { const i = Number(ed.dataset.scopeHtml); if (S.scope[i]) S.scope[i].html = ed.innerHTML; }
function insertClean(ed, data) {
  const html = data.getData('text/html'), text = data.getData('text/plain');
  const clean = html ? sanitizeRich(html) : '';
  if (clean) document.execCommand('insertHTML', false, clean);
  else if (text) document.execCommand('insertText', false, text);
  syncScopeHtml(ed);
}
const NEW_ROW = {sources: {name: '', objects: 10, connect: 1, load: 1}, transforms: {name: '', source: '', count: 10, type: 1, complexity: 1}, models: {name: '', tables: 10, measuresMig: 0, measuresNew: 20, calcs: 0, security: 'static', mode: 1},
  reports: {name: '', count: 5, pages: 3, complexity: 1, action: 1}, team: {role: 'Data Engineer', fte: 0.8},
  custom: {name: '', wp: 'new', group: 'Additional activities', qty: 1, rate: 8, notes: ''}};
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
  const show = typeSections(S.meta.projectType);
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
  if (opts.calibration) { $('de3-calibration').innerHTML = renderCalibration(S); $('de3-cxGuide').innerHTML = renderCxGuide(); }
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
  const ro = isLocked(), shared = isReadOnly();
  qsa('[data-scope-html]').forEach(el => { el.contentEditable = ro ? 'false' : 'true'; });
  qsa('input,select,textarea,button').forEach(el => {
    if (el.closest('.de-header') || el.classList.contains('tab')) return;
    if (!shared && el.closest('#de3-endorse')) return;   // a Final estimate can still be moved back to Draft
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
  S.rateNotes = S.rateNotes || {}; S.wpNames = S.wpNames || {};
  if (!Array.isArray(S.scope)) S.scope = defaultScope();   // estimates saved before the Scope tab
  if (!S.endorsement || !STAGES[S.endorsement.status]) S.endorsement = {status: 'draft', history: []};
  bindStatic(); applyVisibility(); RES = compute(S); renderTables(); $('de3-scope').innerHTML = renderScope(S); renderEndorsement(); update({calibration: true});
}

function init(rootEl) {
  if (ROOT) return;                      // the view is created once, with the page
  ROOT = rootEl || document.getElementById('detailed-estimation-view');
  if (!ROOT) return;
  $('de3-projectType').innerHTML = Object.entries(TYPES).map(([k, t]) => `<option value="${k}">${t.name}</option>`).join('');
  addInfoIcons();
  TIP = document.createElement('div'); TIP.className = 'de-tip'; TIP.setAttribute('role', 'tooltip'); TIP.hidden = true; ROOT.appendChild(TIP);
  const tipOn = e => { const ic = e.target.closest && e.target.closest('.de-info'); if (ic) showTip(ic); };
  const tipOff = e => { if (e.target.closest && e.target.closest('.de-info')) hideTip(); };
  ROOT.addEventListener('mouseover', tipOn); ROOT.addEventListener('focusin', tipOn);
  ROOT.addEventListener('mouseout', tipOff); ROOT.addEventListener('focusout', tipOff);
  window.addEventListener('scroll', hideTip, true);
  // The toolbar acts on the editor's selection, so it must not take focus.
  ROOT.addEventListener('mousedown', e => { if (e.target.closest('[data-scope-cmd]')) e.preventDefault(); });
  ROOT.addEventListener('paste', e => {
    const ed = e.target.closest && e.target.closest('[data-scope-html]');
    if (!ed || isLocked() || !e.clipboardData) return;
    e.preventDefault(); insertClean(ed, e.clipboardData);
  });
  ROOT.addEventListener('drop', e => {
    const ed = e.target.closest && e.target.closest('[data-scope-html]');
    if (!ed || !e.dataTransfer) return;
    e.preventDefault();
    if (isLocked()) return;
    const at = document.caretRangeFromPoint && document.caretRangeFromPoint(e.clientX, e.clientY);
    ed.focus();
    if (at) { const sl = window.getSelection(); sl.removeAllRanges(); sl.addRange(at); }
    insertClean(ed, e.dataTransfer);
  });
  ROOT.addEventListener('input', e => {
    const el = e.target;
    if (el.dataset.bind) {
      setPath(S, el.dataset.bind, readVal(el));
      if (el.dataset.bind === 'settings.maturity') { S.settings.riskPct = MATURITY[S.settings.maturity].risk; writeVal($('de3-riskPct'), S.settings.riskPct); }
      if (/^sources\.\d+\.name$/.test(el.dataset.bind)) $('de3-transformRows').innerHTML = renderTransforms(S);   // the source pickers show these names
      if (/^(meta\.projectType|settings\.env)/.test(el.dataset.bind)) { applyVisibility(); RES = compute(S); $('de3-customRows').innerHTML = renderCustom(S, RES); }
      update();
    } else if (el.dataset.ratenote) {
      const v = el.value.trim();
      if (v) S.rateNotes[el.dataset.ratenote] = v; else delete S.rateNotes[el.dataset.ratenote];
    } else if (el.dataset.scopeTitle !== undefined) {
      const sc = S.scope[Number(el.dataset.scopeTitle)]; if (sc) sc.title = el.value;
    } else if (el.dataset.scopeHtml !== undefined) {
      syncScopeHtml(el);
    } else if (el.dataset.rate) {
      const base = baseRates();
      S.rates[el.dataset.rate] = el.value === '' ? base[el.dataset.rate] : Number(el.value);
      el.closest('tr').classList.toggle('ovr', Number(S.rates[el.dataset.rate]) !== Number(base[el.dataset.rate]));
      update();
    }
  });
  ROOT.addEventListener('change', e => {
    const el = e.target;
    if (isLocked()) return;
    if (el.dataset.wpname) {
      const v = el.value.trim();
      if (v) S.wpNames[el.dataset.wpname] = v; else delete S.wpNames[el.dataset.wpname];
      update();
    }
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
    if (e.target.closest('.de-info')) { e.preventDefault(); return; }   // inside a label it would otherwise toggle or focus the field
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.endorse) { if (!isReadOnly()) endorse(b.dataset.endorse); return; }
    if (isLocked() && !b.dataset.tab && !b.dataset.tabJump) return;
    if (b.dataset.del) { const [k, i] = b.dataset.del.split('.'); S[k].splice(Number(i), 1); if (k === 'sources') unlinkSource(Number(i)); Object.keys(S.overrides).filter(x => /^(p\.|t\.|g\.sm\.|r\.|c\.)/.test(x)).forEach(x => delete S.overrides[x]); RES = compute(S); renderTables(); update(); }
    if (b.dataset.add) { S[b.dataset.add].push(clone(NEW_ROW[b.dataset.add])); RES = compute(S); renderTables(); update(); }
    if (b.dataset.cal === 'reset') { S.rates = {}; S.rateNotes = {}; update({calibration: true}); }
    if (b.dataset.wpdel) { S.removed = (S.removed || []).concat(S.removed.includes(b.dataset.wpdel) ? [] : [b.dataset.wpdel]); update(); }
    if (b.dataset.wprestore) { S.removed = b.dataset.wprestore === '*' ? [] : (S.removed || []).filter(k => k !== b.dataset.wprestore); update(); }
    if (b.dataset.action === 'reset-schedule') { S.schedule = {}; S.order = []; S.removed = []; S.wpNames = {}; update(); }
    if (b.dataset.wpedit) {
      const d = (ROOT || document).querySelector('#de3-gantt details.sched'); if (d) d.open = true;
      const inp = (ROOT || document).querySelector('#de3-gantt [data-wpname="' + CSS.escape(b.dataset.wpedit) + '"]');
      if (inp) { inp.scrollIntoView({block: 'center', behavior: 'smooth'}); inp.focus(); }
    }
    if (b.dataset.action === 'add-wp') addWorkPackage();
    if (b.dataset.action === 'scope-add') {
      const k = $('de3-scopeAddKey').value, def = SCOPE_SECTIONS.find(d => d[0] === k);
      S.scope.push(def ? {key: def[0], title: def[1], html: ''} : {key: '', title: 'New section', html: ''});
      $('de3-scope').innerHTML = renderScope(S); applyReadOnly();
      const t = (ROOT || document).querySelectorAll('#de3-scope [data-scope-title]'); if (t.length) { t[t.length - 1].focus(); t[t.length - 1].select(); }
    }
    if (b.dataset.scopeDel !== undefined) {
      const i = Number(b.dataset.scopeDel), sc = S.scope[i];
      if (sc && (!String(sc.html || '').replace(/<[^>]*>|&nbsp;|\s/g, '') || window.confirm('Remove “' + (sc.title || 'this section') + '” and its content?'))) { S.scope.splice(i, 1); $('de3-scope').innerHTML = renderScope(S); applyReadOnly(); }
    }
    if (b.dataset.scopeMove) {
      const [i, d] = b.dataset.scopeMove.split('|').map(Number), j = i + d;
      if (S.scope[i] && S.scope[j]) { [S.scope[i], S.scope[j]] = [S.scope[j], S.scope[i]]; $('de3-scope').innerHTML = renderScope(S); applyReadOnly(); }
    }
    if (b.dataset.scopeCmd) {
      const ed = b.closest('.scope-sec').querySelector('[data-scope-html]');
      if (!ed.contains(document.activeElement) && document.activeElement !== ed) ed.focus();
      const v = b.dataset.scopeVal;
      document.execCommand(b.dataset.scopeCmd, false, b.dataset.scopeCmd === 'formatBlock' ? '<' + v + '>' : (v || null));
      syncScopeHtml(ed);
    }
    if (b.dataset.move) { const [k, d] = splitLast(b.dataset.move, '|'); if (moveOrder(S, SCH, k, Number(d))) update(); }
    if (b.dataset.tabJump) { const t = (ROOT || document).querySelector('[data-tab="' + b.dataset.tabJump + '"]'); if (t) t.click(); }
    if (b.dataset.tab) {
      qsa('.tab').forEach(t => t.classList.toggle('active', t === b));
      qsa('.tabpane').forEach(p => p.classList.toggle('active', p.id === 'de3-pane-' + b.dataset.tab));
    }
  });
  $('de3-loadPreset').onclick = () => { if (!isLocked()) loadState(PRESETS.blank.state); };
  $('de3-clearOverrides').onclick = () => { if (!isLocked()) { S.overrides = {}; update(); } };
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
/* A work package added on the timeline is an additional activity with its own
   bar. The name is made unique so it never silently merges into another one. */
function addWorkPackage() {
  const box = $('de3-gantt');
  const nameEl = box.querySelector('[data-newwp="name"]'), hoursEl = box.querySelector('[data-newwp="hours"]');
  const base = (nameEl.value || '').trim() || 'Additional work package';
  const taken = new Set(RES.wps.map(w => w.name.toLowerCase()).concat(RES.wps.map(w => wpLabel(S, w).toLowerCase())));
  let name = base, k = 2;
  while (taken.has(name.toLowerCase())) name = base + ' (' + (k++) + ')';
  S.custom.push({name, wp: 'new', group: name, qty: 1, rate: Math.max(0, Number(hoursEl.value) || 0), notes: ''});
  RES = compute(S); renderTables(); update();
}
/* ---------- Endorsement: Draft → Proposed → Final ----------
   Every change of stage is recorded with who made it, when and why. A Final
   estimate is locked until someone moves it back to Draft, so the numbers
   that were endorsed cannot drift by accident. */
const STAGES = {
  draft: {label: 'Draft', desc: 'Being worked on. Numbers can change at any time.'},
  proposed: {label: 'Proposed', desc: 'Submitted for endorsement. Still editable, so review comments can be applied.'},
  final: {label: 'Final', desc: 'Endorsed. The estimate is locked; move it back to Draft to change anything.'},
};
const STAGE_ACTIONS = {draft: [['proposed', 'Propose for endorsement', 'primary']], proposed: [['final', 'Endorse as Final', 'primary'], ['draft', 'Back to Draft', 'ghost']], final: [['draft', 'Reopen as Draft', 'ghost']]};
let CURRENT_USER = null;
function isFinal() { return Boolean(S.endorsement && S.endorsement.status === 'final'); }
function isLocked() { return isReadOnly() || isFinal(); }
function renderEndorsement() {
  const E = S.endorsement, keys = Object.keys(STAGES), at = keys.indexOf(E.status);
  const when = t => { const d = new Date(t); return isNaN(d) ? '' : d.toLocaleString('en-GB', {day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'}); };
  $('de3-endorse').innerHTML = `<h2 data-info="sec.endorse">Endorsement</h2>
    <ol class="stages">${keys.map((k, i) => `<li class="${i < at ? 'done' : i === at ? 'now' : ''}"><span>${i + 1}</span>${STAGES[k].label}</li>`).join('')}</ol>
    <p class="small stage-desc">${esc(STAGES[E.status].desc)}</p>
    <textarea id="de3-endorseNote" rows="2" placeholder="Comment for this step (optional) – e.g. reviewed with the delivery lead"></textarea>
    <div class="actions">${STAGE_ACTIONS[E.status].map(a => `<button type="button" class="btn ${a[2]}" data-endorse="${a[0]}">${a[1]}</button>`).join('')}</div>
    <p class="small" style="margin:8px 0 0">Save the estimation to keep a change of stage.</p>
    ${E.history.length ? `<details class="stage-log"><summary><span>History</span><span class="small">${E.history.length} step${E.history.length === 1 ? '' : 's'}</span></summary><ul>${E.history.slice().reverse().map(h => `<li><b>${esc((STAGES[h.status] || {}).label || h.status)}</b> · ${esc(h.by || 'Unknown')} · ${esc(when(h.at))}${h.note ? `<div>${esc(h.note)}</div>` : ''}</li>`).join('')}</ul></details>` : ''}`;
  const pill = $('de3-statusPill');
  if (pill) { pill.textContent = STAGES[E.status].label; pill.className = 'de3-status ' + E.status; pill.title = STAGES[E.status].desc; }
  const ic = $('de3-endorse').querySelector('[data-info]');
  if (ic && INFO[ic.dataset.info]) ic.insertAdjacentHTML('beforeend', `<span class="de-info" tabindex="0" role="button" data-tip="sec.endorse" aria-label="What this means">i</span>`);
}
function endorse(to) {
  if (!STAGES[to] || to === S.endorsement.status) return;
  const note = ($('de3-endorseNote').value || '').trim();
  if (to === 'final' && !window.confirm('Endorse this estimate as Final? It will be locked until someone moves it back to Draft.')) return;
  S.endorsement.status = to;
  S.endorsement.history.push({status: to, by: CURRENT_USER ? (CURRENT_USER.name || CURRENT_USER.email || '') : '', email: CURRENT_USER ? CURRENT_USER.email || '' : '', at: new Date().toISOString(), note});
  renderEndorsement(); update();
}
function isReadOnly() { return Boolean(ROOT && ROOT.classList.contains('de-readonly')); }

/* ---------- Gantt drag & drop: bars left/right (start week) and up/down (order); hours and duration never change ---------- */
function initGanttDrag() {
  let D = null;
  const clearMarks = () => document.querySelectorAll('#de3-gantt .g-row.drop-before, #de3-gantt .g-row.drop-after').forEach(r => r.classList.remove('drop-before', 'drop-after'));
  document.addEventListener('pointerdown', e => {
    if (e.button !== 0 || isLocked()) return;
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
  setCurrentUser(user) { CURRENT_USER = user || null; },
  getEndorsement() { return clone(S.endorsement); },
  getClientName() { return S.meta.client || ''; },
  setClientName(name) { if (!ROOT) return; S.meta.client = name || ''; bindStatic(); update(); },
  /* Organisation calibration, owned by the admin panel. The rate card itself
     is static, so the admin UI reads the definitions from here rather than
     keeping a second copy. */
  getRateDefs() { return RATE_DEFS.map(r => ({key: r[0], group: r[1], label: r[2], unit: r[3], builtIn: r[5]})); },
  getOrgRates() { return Object.assign({}, ORG_RATES); },
  /* Which scope sections each project type includes, also owned by the admin
     panel. Only the types an administrator changed are stored. */
  getScopeSectionDefs() { return SECTIONS.map(([key, label]) => ({key, label})); },
  getProjectTypes() { return Object.entries(TYPES).map(([key, t]) => ({key, name: t.name, builtIn: t.show.slice(), sections: typeSections(key).slice()})); },
  setOrgProjectTypes(types) {
    ORG_TYPES = {};
    Object.entries(types || {}).forEach(([k, v]) => { if (TYPES[k] && Array.isArray(v)) ORG_TYPES[k] = SECTIONS.map(x => x[0]).filter(x => v.includes(x)); });
    if (ROOT) { applyVisibility(); RES = compute(S); renderTables(); update(); }
  },
  setOrgRates(rates) {
    ORG_RATES = {};
    Object.entries(rates || {}).forEach(([k, v]) => { if (DEFAULT_RATES[k] !== undefined && isFinite(Number(v))) ORG_RATES[k] = Number(v); });
    if (ROOT) update({calibration: true});
  },
};
})();
