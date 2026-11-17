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

test('signed-out visitors get the normal landing document but no API access', async () => {
  for (const url of ['/', '/index.html', '/requirements.html', '/unknown-workspace']) {
    const response = await fetch(base + url);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /id="landing-section"/);
    assert.doesNotMatch(html, /<title>Access blocked/);
  }
  assert.equal((await fetch(base + '/api/rate-defaults')).status, 401);
});

test('signed-in unapproved accounts get the maintenance page and no API access', async () => {
  for (const role of ['unapproved', 'invalid']) {
    for (const url of ['/', '/index.html', '/requirements.html', '/unknown-workspace']) {
      const response = await fetch(base + url, {headers: headers(role)});
      assert.equal(response.status, 403);
      assert.match(await response.text(), /Page under maintenance/);
    }
    const response = await fetch(base + '/api/rate-defaults', {headers: headers(role)});
    assert.equal(response.status, 403);
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

test('sharing requires prior administrator approval and never provisions access', async () => {
  for (const role of ['admin', 'explorer']) {
    const share = email => fetch(base + '/api/estimations/test-group/share', {
      method: 'POST', headers: {...headers(role), 'Content-Type': 'application/json'}, body: JSON.stringify({email})
    });
    for (const recipient of ['unapproved@test.local', 'invalid@test.local']) {
      const response = await share(recipient);
      assert.equal(response.status, 403);
      assert.match((await response.json()).error, /administrator must add/);
    }
    const approvedRecipient = role === 'admin' ? 'explorer@test.local' : 'admin@test.local';
    const response = await share(approvedRecipient);
    assert.equal(response.status, 201);
    assert.equal((await response.json()).email, approvedRecipient);
  }
  assert.equal((await fetch(base + '/api/user', {headers: headers('unapproved')})).status, 403);
});

test('empty access list never grants implicit Explorer access', async () => {
  const message = once(child, 'message');
  child.send({count: 0}); await message;
  assert.equal((await fetch(base + '/api/user', {headers: headers('unapproved')})).status, 403);
  const response = await fetch(base + '/', {headers: headers('unapproved')});
  assert.equal(response.status, 403);
  assert.match(await response.text(), /Access blocked/);
});
