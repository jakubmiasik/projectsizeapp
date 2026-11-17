(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SizingRecipe = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const types = {
    discovery: 'Discovery & Assessment',
    pov: 'Proof of Value / Pilot',
    greenfield: 'Greenfield Fabric Implementation',
    platformMigration: 'Data Platform Migration / Rebuild',
    biMigration: 'BI / Reporting Migration',
    hybrid: 'Discovery + Conditional Deployment'
  };
  const scopes = {
    discovery: ['discovery'],
    pov: ['discovery', 'sources', 'transform', 'models', 'ops', 'env'],
    greenfield: ['discovery', 'sources', 'transform', 'models', 'reports', 'ops', 'env'],
    platformMigration: ['discovery', 'sources', 'transform', 'legacy', 'models', 'reports', 'ops', 'env'],
    biMigration: ['discovery', 'sources', 'models', 'reports', 'ops', 'env'],
    hybrid: ['discovery', 'sources', 'transform', 'legacy', 'models', 'reports', 'ops', 'env']
  };
  function defaults(existing) {
    const groups = { sources: 'sources', objects: 'sources', volume: 'sources', latency: 'sources',
      transform: 'transform', methodology: 'transform', semantic: 'models', gold: 'models',
      governance: 'ops', delivery: 'ops', reports: 'reports' };
    const sections = existing.map(s => ({
      id: s.id, title: s.title, scope: groups[s.id],
      options: s.options.map(o => ({
        label: o.label, sub: o.sub || '',
        hours: o.label === 'Not in scope' ? 0 : (o.hours || 0),
        source: o.transform && o.label !== 'Not in scope' ? 'objects' : '',
        percent: o.transform && o.label !== 'Not in scope'
          ? Number((o.transform.objectsPercent * o.transform.factorA * o.transform.factorB * 100).toFixed(4)) : 0
      }))
    }));
    const extra = (id, title, scope, choices) => ({
      id, title, scope, options: choices.map(([label, hours, sub]) => ({label, hours, sub, source: '', percent: 0}))
    });
    sections.unshift(extra('discovery', 'Discovery & assessment', 'discovery', [
      ['Focused review', 24, 'A few workshops; inventory sources, reports and semantic models.'],
      ['Standard assessment', 56, 'Review platform, transformations, semantic models, RLS and refresh; propose a roadmap.'],
      ['Enterprise assessment', 120, 'Multiple domains, legacy dependencies and a phased delivery roadmap.'],
      ['Not in scope', 0, 'No discovery or assessment work.']
    ]));
    sections.push(extra('legacy', 'Legacy migration estate', 'legacy', [
      ['Small', 24, 'A few existing pipelines, procedures or BI assets to migrate.'],
      ['Medium', 80, 'Multiple legacy technologies and dependencies.'],
      ['Large', 200, 'Complex estate with reverse engineering and reconciliation.'],
      ['Not in scope', 0, 'No legacy migration.']
    ]), extra('operations', 'Quality, operations & handover', 'ops', [
      ['Basic', 16, 'Testing, monitoring, documentation and knowledge transfer.'],
      ['Standard', 40, 'Reconciliation, operational runbooks and team handover.'],
      ['Enterprise', 96, 'Cross-domain quality controls, support and operational readiness.'],
      ['Not in scope', 0, 'No operational delivery.']
    ]), extra('environments', 'Release environments', 'env', [
      ['DEV only', 0, 'No additional release environments.'],
      ['DEV + TEST + PROD', 40, 'Deployment setup, UAT and production launch.'],
      ['Extended', 72, 'Additional environments and release controls.'],
      ['Not in scope', 0, 'No environment delivery.']
    ]));
    return { version: 1, pmPercent: 10, productivePercent: 70, sections,
      projectTypes: Object.fromEntries(Object.keys(types).map(key =>
        [key, sections.filter(s => scopes[key].includes(s.scope)).map(s => s.id)])) };
  }
  function validate(config) {
    const fail = message => { throw new Error(message); };
    const number = (v, max, label, min = 0) => {
      if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) fail(`Invalid ${label}`);
    };
    const text = (v, max, label, empty = false) => {
      if (typeof v !== 'string' || v.length > max || (!empty && !v.trim())) fail(`Invalid ${label}`);
    };
    if (!config || config.version !== 1) fail('Unsupported sizing recipe version');
    number(config.pmPercent, 500, 'PM percentage');
    number(config.productivePercent, 100, 'productive percentage', 1);
    if (!Array.isArray(config.sections) || !config.sections.length || config.sections.length > 40) fail('Use 1 to 40 sizing sections');
    const ids = new Set();
    for (const section of config.sections) {
      if (!section || typeof section.id !== 'string' || !/^[a-z][a-z0-9_]{0,63}$/.test(section.id) || ids.has(section.id)) fail('Section IDs must be unique lowercase identifiers');
      ids.add(section.id);
      text(section.title, 120, 'section title');
      text(section.scope, 64, 'scope group');
      if (!Array.isArray(section.options) || !section.options.length || section.options.length > 20) fail(`Use 1 to 20 choices for ${section.title}`);
      for (const o of section.options) {
        if (!o) fail('Invalid choice');
        text(o.label, 120, 'choice label'); text(o.sub, 500, 'choice description', true);
        number(o.hours, 1000000, 'choice hours'); number(o.percent, 10000, 'dependency percentage');
        text(o.source, 64, 'dependency', true);
      }
    }
    const visiting = new Set(), done = new Set();
    const visit = id => {
      if (visiting.has(id)) fail('Sizing dependencies must not contain a cycle');
      if (done.has(id)) return;
      visiting.add(id);
      for (const o of config.sections.find(s => s.id === id).options) {
        if (!o.source) continue;
        if (!ids.has(o.source)) fail(`Unknown sizing dependency: ${o.source}`);
        visit(o.source);
      }
      visiting.delete(id); done.add(id);
    };
    ids.forEach(visit);
    if (!config.projectTypes || typeof config.projectTypes !== 'object' || Array.isArray(config.projectTypes)) fail('Missing sizing project types');
    for (const key of Object.keys(config.projectTypes)) if (!Object.hasOwn(types, key)) fail(`Unknown sizing project type: ${key}`);
    for (const key of Object.keys(types)) {
      const on = config.projectTypes[key];
      if (!Array.isArray(on) || new Set(on).size !== on.length || on.some(id => !ids.has(id))) fail(`Invalid sizing sections for ${key}`);
    }
    return config;
  }
  function evaluate(config, type, selections) {
    validate(config);
    if (!Object.hasOwn(types, type)) throw new Error('Unknown sizing project type');
    const active = new Set(config.projectTypes[type]), cache = {};
    function hours(id) {
      if (!active.has(id)) return 0;
      if (Object.hasOwn(cache, id)) return cache[id];
      const section = config.sections.find(s => s.id === id);
      const entry = selections[id] || {};
      const option = section.options[Number(entry.value) || 0] || section.options[0];
      // Dependencies use base hours so a local section uplift is never applied twice.
      cache[id] = Math.ceil(option.hours + (option.source ? hours(option.source) * option.percent / 100 : 0));
      return cache[id];
    }
    return config.sections.filter(s => active.has(s.id)).map(s => ({
      section: s, option: s.options[Number(selections[s.id]?.value) || 0] || s.options[0],
      baseHours: hours(s.id),
      multiplierPercent: Math.max(0, Number(selections[s.id]?.multiplier) || 0),
      hours: Math.ceil(hours(s.id) * (1 + Math.max(0, Number(selections[s.id]?.multiplier) || 0) / 100))
    }));
  }
  return { types, defaults, validate, evaluate };
});
