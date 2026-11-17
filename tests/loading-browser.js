// Uses the same PUPPETEER_PATH and CHROME_PATH settings as sizing-browser.js.
const assert = require('node:assert/strict');
const path = require('node:path');
const {fork} = require('node:child_process');
const {once} = require('node:events');
const puppeteer = require(process.env.PUPPETEER_PATH || 'puppeteer-core');

(async () => {
  const child = fork(path.join(__dirname, 'fixtures', 'server.js'), {stdio: ['ignore', 'pipe', 'pipe', 'ipc']});
  let browser;
  try {
    const [{port}] = await once(child, 'message');
    const base = `http://127.0.0.1:${port}`;
    browser = await puppeteer.launch({executablePath: process.env.CHROME_PATH, headless: true, args: ['--no-sandbox']});
    const principal = Buffer.from(JSON.stringify({userId: 'admin',
      claims: [{typ: 'preferred_username', val: 'admin@test.local'}]})).toString('base64');
    const errors = [];
    async function pageWithHeldRequests(paths) {
      const page = await browser.newPage();
      page.on('pageerror', err => errors.push(err.message));
      await page.setViewport({width: 1200, height: 900});
      await page.setExtraHTTPHeaders({'x-ms-client-principal': principal});
      await page.setRequestInterception(true);
      const holds = new Map(paths.map(url => {
        let resolve;
        const request = new Promise(done => { resolve = done; });
        return [url, {resolve, request}];
      }));
      page.on('request', request => {
        const pathname = new URL(request.url()).pathname;
        if (holds.has(pathname)) holds.get(pathname).resolve(request);
        else request.continue();
      });
      return {page, held: pathname => holds.get(pathname).request};
    }
    const respond = (request, status, body) => request.respond({
      status, contentType: 'application/json', body: JSON.stringify(body)
    });
    const assertBusy = async page => {
      assert.equal(await page.$eval('#app-loading-overlay', el => el.hidden), false);
      assert.equal(await page.$eval('.app-layout', el => el.inert), true);
      assert.match(await page.$eval('#app-loading-overlay', el => getComputedStyle(el).backdropFilter), /blur/);
      assert.equal(await page.evaluate(() => {
        const landing = document.getElementById('landing-section');
        return !landing || getComputedStyle(landing).display === 'none';
      }), true);
    };

    // Authentication and estimate data are deliberately held independently.
    const deep = await pageWithHeldRequests(['/api/user', '/api/estimations/loading-test']);
    await deep.page.goto(base + '/?estimationId=loading-test#detailed', {waitUntil: 'domcontentloaded'});
    const auth = await deep.held('/api/user');
    await assertBusy(deep.page);
    await auth.continue();
    const estimate = await deep.held('/api/estimations/loading-test');
    await assertBusy(deep.page);
    assert.match(await deep.page.$eval('#app-loading-message', el => el.textContent), /Loading estimation/);
    if (process.env.ARTIFACT_DIR) await deep.page.screenshot({path: path.join(process.env.ARTIFACT_DIR, 'loading-estimate.png')});
    await respond(estimate, 200, {id: 'loading-test', title: 'Loading test', version: 1, data: {clientName: 'Ready client'}});
    await deep.page.waitForFunction(() => document.getElementById('app-loading-overlay').hidden);
    assert.equal(await deep.page.$eval('.app-layout', el => el.inert), false);
    assert.equal(await deep.page.$eval('#client-name', el => el.value), 'Ready client');
    assert.equal(await deep.page.$eval('#landing-section', el => getComputedStyle(el).display), 'none');
    assert.equal(await deep.page.$eval('#detailed-estimation-view', el => el.classList.contains('active')), true);

    const concurrent = await deep.page.evaluate(() => {
      const endA = AppShell.showLoading('Loading first request...');
      const endB = AppShell.showLoading('Loading second request...');
      endA(); endA();
      const stillBusy = !document.getElementById('app-loading-overlay').hidden;
      endB();
      return {stillBusy, hidden: document.getElementById('app-loading-overlay').hidden};
    });
    assert.deepEqual(concurrent, {stillBusy: true, hidden: true});

    // A real signed-out result reveals the landing only after auth resolves.
    const signedOut = await pageWithHeldRequests(['/api/user']);
    await signedOut.page.goto(base, {waitUntil: 'domcontentloaded'});
    await assertBusy(signedOut.page);
    await respond(await signedOut.held('/api/user'), 401, {error: 'Authentication required'});
    await signedOut.page.waitForFunction(() => document.getElementById('app-loading-overlay').hidden);
    assert.equal(await signedOut.page.$eval('#landing-section', el => getComputedStyle(el).display !== 'none'), true);

    // Service failures must not impersonate a signed-out result.
    const failed = await pageWithHeldRequests(['/api/user']);
    await failed.page.goto(base, {waitUntil: 'domcontentloaded'});
    await respond(await failed.held('/api/user'), 500, {error: 'Database unavailable'});
    await failed.page.waitForFunction(() => !document.getElementById('app-loading-retry').hidden);
    await assertBusy(failed.page);
    assert.equal(await failed.page.$eval('#app-loading-title', el => el.textContent), 'Unable to load');
    assert.equal(await failed.page.$eval('#app-loading-spinner', el => el.hidden), true);

    const missing = await pageWithHeldRequests(['/api/estimations/missing', '/api/estimations/shared/missing']);
    await missing.page.goto(base + '/?estimationId=missing#detailed', {waitUntil: 'domcontentloaded'});
    await respond(await missing.held('/api/estimations/missing'), 404, {error: 'Not found'});
    await respond(await missing.held('/api/estimations/shared/missing'), 404, {error: 'Not found'});
    await missing.page.waitForFunction(() => document.getElementById('app-loading-overlay').hidden);
    assert.match(await missing.page.$eval('.app-toast-container', el => el.textContent), /could not be opened/);

    const requirements = await pageWithHeldRequests(['/api/user', '/api/requirements/requirements-test/1', '/api/estimations/requirements-test']);
    await requirements.page.goto(base + '/requirements.html?estimationId=requirements-test&version=1', {waitUntil: 'domcontentloaded'});
    const reqAuth = await requirements.held('/api/user');
    await assertBusy(requirements.page);
    await reqAuth.continue();
    const reqData = await requirements.held('/api/requirements/requirements-test/1');
    await assertBusy(requirements.page);
    await respond(reqData, 200, {data: {projectName: 'Ready requirements', workpackages: []}});
    // The second request is still in flight, so the background must stay inert.
    await assertBusy(requirements.page);
    await respond(await requirements.held('/api/estimations/requirements-test'), 200, {data: {tshirtSize: 'M'}});
    await requirements.page.waitForFunction(() => document.getElementById('app-loading-overlay').hidden);
    assert.equal(await requirements.page.$eval('.app-layout', el => el.inert), false);
    assert.equal(await requirements.page.$eval('#heroProjectSize', el => el.textContent), 'M');
    assert.deepEqual(errors, []);
    console.log('Loading overlays passed: slow authentication/data, deep links, signed-out landing, errors, concurrency and Requirements.');
  } finally {
    if (browser) await browser.close();
    child.kill();
  }
})().catch(err => { console.error(err); process.exitCode = 1; });
