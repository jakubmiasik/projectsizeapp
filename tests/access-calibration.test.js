const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { fork } = require('node:child_process');
const path = require('node:path');
const { once } = require('node:events');
const Sizing = require('../public/js/sizing-recipe');
let child, base;
function headers(role) {
  return role ? {'x-ms-client-principal': Buffer.from(JSON.stringify({
    userId: role, claims: [{typ: 'preferred_username', val: role + '@test.local'}]
  })).toString('base64')} : {};
}
before(async () => {
  child = fork(path.join(__dirname, 'fixtures', 'server.js'), {stdio: ['ignore', 'pipe', 'pipe', 'ipc']});
  child.stderr.on('data', data => process.stderr.write(data));
  const [{port}] = await once(child, 'message');
  base = `http://127.0.0.1:${port}`;
});
after(() => child?.kill());

test('unapproved accounts get the maintenance page on every document entry and no API access', async () => {
  for (const role of [null, 'unapproved', 'invalid']) {
    for (const url of ['/', '/index.html', '/requirements.html', '/unknown-workspace']) {
      const response = await fetch(base + url, {headers: headers(role)});
      assert.equal(response.status, role ? 403 : 200);
      assert.match(await response.text(), /Page under maintenance/);
    }
    const response = await fetch(base + '/api/rate-defaults', {headers: headers(role)});
    assert.equal(response.status, role ? 403 : 401);
  }
});

test('approved admins and explorers can open both workspaces', async () => {
  for (const role of ['admin', 'explorer']) {
    for (const url of ['/', '/requirements.html']) {
      const response = await fetch(base + url, {headers: headers(role)});
      assert.equal(response.status, 200);
      assert.doesNotMatch(await response.text(), /<title>Access blocked/);
    }
  }
});

test('only admin can persist recipes; invalid writes do not replace the saved recipe', async () => {
  const sizing = Sizing.defaults([]);
  sizing.pmPercent = 17;
  const put = (role, data) => fetch(base + '/api/rate-defaults', {
    method: 'PUT', headers: {...headers(role), 'Content-Type': 'application/json'}, body: JSON.stringify(data)
  });
  assert.equal((await put('explorer', {rates: {}, sizing})).status, 403);
  let response = await put('admin', {rates: {modelAssess: 6}, projectTypes: {pov: ['discovery', 'env']}, sizing});
  assert.equal(response.status, 200);
  assert.equal((await response.json()).sizing.pmPercent, 17);
  response = await fetch(base + '/api/rate-defaults', {headers: headers('explorer')});
  assert.equal((await response.json()).sizing.pmPercent, 17);
  sizing.sections[0].options[0].source = 'discovery';
  response = await put('admin', {rates: {}, sizing});
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /cycle/);
  response = await put('admin', {rates: {modelAssess: 7}});
  assert.equal((await response.json()).sizing.pmPercent, 17, 'older clients preserve the sizing recipe');
});

test('empty access list never grants implicit Explorer access', async () => {
  const message = once(child, 'message');
  child.send({count: 0}); await message;
  assert.equal((await fetch(base + '/api/user', {headers: headers('unapproved')})).status, 403);
  const response = await fetch(base + '/', {headers: headers('unapproved')});
  assert.equal(response.status, 403);
  assert.match(await response.text(), /Access blocked/);
});
