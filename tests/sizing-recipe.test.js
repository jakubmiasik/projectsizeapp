const { test } = require('node:test');
const assert = require('node:assert/strict');
const Sizing = require('../public/js/sizing-recipe');

const existing = [
  {id: 'objects', title: 'Objects', options: [{label: 'Small', hours: 10}, {label: 'Not in scope', hours: 8}]},
  {id: 'transform', title: 'Transforms', options: [{label: 'Low', transform: {objectsPercent: .15, factorA: 4, factorB: 1.5}}]}
];
const recipe = () => Sizing.defaults(existing);

test('discovery includes assessment only and delivery types expose their matching scope', () => {
  const config = recipe();
  assert.deepEqual(Sizing.evaluate(config, 'discovery', {}).map(r => r.section.id), ['discovery']);
  assert.match(config.sections[0].options[0].sub, /semantic/);
  assert.ok(config.projectTypes.platformMigration.includes('legacy'));
  assert.ok(!config.projectTypes.greenfield.includes('legacy'));
  assert.ok(!config.projectTypes.biMigration.includes('transform'));
  assert.ok(config.projectTypes.pov.includes('environments'));
  assert.equal(Sizing.evaluate(config, 'discovery', {})[0].hours, 24);
});

test('dependencies use base hours, allow arbitrary section order, and ignore excluded sources', () => {
  const config = recipe();
  config.sections.reverse();
  const result = Sizing.evaluate(config, 'platformMigration', {objects: {value: 0, multiplier: 50}});
  assert.equal(result.find(r => r.section.id === 'objects').hours, 15);
  assert.equal(result.find(r => r.section.id === 'transform').hours, 9);
  config.projectTypes.platformMigration = ['transform'];
  assert.equal(Sizing.evaluate(config, 'platformMigration', {})[0].hours, 0);
});

test('Not in scope is zero and structured fixed-plus-percentage choices work', () => {
  const config = recipe();
  assert.equal(Sizing.evaluate(config, 'platformMigration', {objects: {value: 1}}).find(r => r.section.id === 'objects').hours, 0);
  config.sections.find(s => s.id === 'transform').options[0].hours = 3;
  assert.equal(Sizing.evaluate(config, 'platformMigration', {}).find(r => r.section.id === 'transform').hours, 12);
});

test('rejects cyclic, unknown, nonfinite and malformed rules', () => {
  let config = recipe();
  config.sections.find(s => s.id === 'objects').options[0].source = 'transform';
  assert.throws(() => Sizing.validate(config), /cycle/);
  config = recipe();
  config.sections[0].options[0].source = 'missing';
  assert.throws(() => Sizing.validate(config), /Unknown sizing dependency/);
  config = recipe(); config.pmPercent = Infinity;
  assert.throws(() => Sizing.validate(config), /PM percentage/);
  config = recipe(); config.productivePercent = 0;
  assert.throws(() => Sizing.validate(config), /productive/);
  config = recipe(); config.sections[0].id = undefined;
  assert.throws(() => Sizing.validate(config), /identifiers/);
  config = recipe(); config.projectTypes.discovery = ['missing'];
  assert.throws(() => Sizing.validate(config), /Invalid sizing sections/);
});

test('custom sections and saved recipe snapshots survive JSON round trips', () => {
  const config = recipe();
  config.sections.push({id: 'custom_training', title: 'Training', scope: 'custom',
    options: [{label: 'Workshop', sub: '', hours: 7, source: '', percent: 0}]});
  config.projectTypes.discovery.push('custom_training');
  const saved = JSON.parse(JSON.stringify(config));
  config.sections.at(-1).options[0].hours = 100;
  const rows = Sizing.evaluate(saved, 'discovery', {});
  assert.equal(rows.at(-1).hours, 7);
});
