// Real-browser integration check. Set PUPPETEER_PATH to puppeteer-core and
// CHROME_PATH to a local Chrome executable; no database or cloud account needed.
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
    browser = await puppeteer.launch({
      executablePath: process.env.CHROME_PATH, headless: true, args: ['--no-sandbox']
    });
    const page = await browser.newPage();
    await page.setViewport({width: 1440, height: 1000});
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    const principal = Buffer.from(JSON.stringify({userId: 'admin',
      claims: [{typ: 'preferred_username', val: 'admin@test.local'}]})).toString('base64');
    await page.setExtraHTTPHeaders({'x-ms-client-principal': principal});
    await page.goto(base, {waitUntil: 'networkidle0'});
    await page.waitForSelector('[data-nav-id="admin"]');
    assert.equal(await page.$eval('.brand-logo', el => el.tagName === 'IMG' && el.naturalWidth > 0), true);
    assert.equal(await page.$eval('link[rel="icon"]', el => el.getAttribute('href')), '/images/app-icon.svg');
    assert.equal(await page.$$eval('#sizing-project-type option', els => els.length), 6);
    assert.deepEqual(await page.$$eval('#sizing-project-type option', els => els.map(el => [el.value, el.textContent])),
      await page.evaluate(() => FabricEstimatorV3.getProjectTypes().map(type => [type.key, type.name])));
    const detailedType = await page.evaluate(() => FabricEstimatorV3.getState().state.meta.projectType);
    await page.select('#sizing-project-type', 'discovery');
    assert.deepEqual(await page.$$eval('[data-sizing-section]', els => els.filter(el => getComputedStyle(el).display !== 'none').map(el => el.dataset.sizingSection)), ['discovery']);
    await page.click('#discovery-1');
    assert.match(await page.$eval('#hours-summary', el => el.textContent), /62/);
    assert.equal(await page.evaluate(() => FabricEstimatorV3.getState().state.meta.projectType), detailedType);
    await page.select('#sizing-project-type', 'platformMigration');
    assert.equal(await page.$eval('#discovery-1', el => el.checked), true);

    const openCalibration = async () => {
      await page.click('[data-nav-id="admin"]');
      await page.click('#admin-modal [data-tab="calibration"]');
      await page.waitForFunction(() => document.querySelectorAll('#admin-sizing-calibration [data-recipe-section]').length > 0);
      // Wait for the GET-driven render, not just the immediately rendered defaults.
      await page.waitForNetworkIdle();
    };
    const setValue = (selector, value) => page.$eval(selector, (el, v) => {
      el.value = v; el.dispatchEvent(new Event('input', {bubbles: true}));
    }, String(value));
    const saveCalibration = async () => {
      const response = page.waitForResponse(r => r.url().endsWith('/api/rate-defaults') && r.request().method() === 'PUT');
      await page.$eval('#admin-calibration-save', el => el.click());
      assert.equal((await response).status(), 200);
      await page.waitForFunction(() => document.getElementById('admin-calibration-status').textContent.includes('Calibration saved'));
    };
    await openCalibration();
    await setValue('[data-global="pmPercent"]', 15);
    await setValue('[data-global="productivePercent"]', 80);
    await setValue('[data-recipe-section="discovery"] [data-choice="0"] [data-field="hours"]', 30);
    await page.$eval('[data-add-section]', el => el.click());
    const customId = await page.$eval('[data-recipe-section]:last-of-type', el => el.dataset.recipeSection);
    assert.ok(customId.startsWith('custom_'));
    await setValue(`[data-recipe-section="${customId}"] [data-field="title"]`, 'Enablement');
    await setValue(`[data-recipe-section="${customId}"] [data-choice="0"] [data-field="hours"]`, 9);
    await page.$eval(`[data-recipe-type="discovery"][data-section="${customId}"]`, el => { el.checked = true; });
    await saveCalibration();
    await page.$eval('#admin-modal .modal-close', el => el.click());
    await page.select('#sizing-project-type', 'discovery');
    const snapshot = await page.evaluate(() => exportState());
    assert.equal(snapshot.sizingRecipe.pmPercent, 15);
    assert.equal(snapshot.sizingRecipe.productivePercent, 80);
    assert.match(await page.$eval('#hours-summary', el => el.textContent), /75/);
    assert.equal(await page.$eval(`[data-sizing-section="${customId}"]`, el => el.hidden), false);
    assert.deepEqual(await page.$$eval('[data-sizing-section]:not([hidden]) .group-num', els => els.map(el => el.textContent)), ['1', '2']);
    if (process.env.ARTIFACT_DIR) await page.screenshot({path: path.join(process.env.ARTIFACT_DIR, 'sizing-discovery.png'), fullPage: true});

    // Saving a new organisation recipe must not re-price a loaded version.
    await page.evaluate(state => importState(state), snapshot);
    await openCalibration();
    await setValue('[data-global="pmPercent"]', 25);
    await saveCalibration();
    assert.equal(await page.evaluate(() => exportState().sizingRecipe.pmPercent), 15);
    if (process.env.ARTIFACT_DIR) await page.screenshot({path: path.join(process.env.ARTIFACT_DIR, 'sizing-calibration.png')});
    await page.$eval('#admin-modal .modal-close', el => el.click());
    const roundTrip = await page.evaluate(async () => {
      const file = await buildEstimationFile();
      const doc = new DOMParser().parseFromString(file.html, 'text/html');
      const data = JSON.parse(doc.querySelector('#fps-estimation-data').textContent);
      const clean = cleanImportedState(data.estimation);
      importState(clean);
      return exportState();
    });
    assert.equal(roundTrip.sizingProjectType, 'discovery');
    assert.equal(roundTrip.sizingRecipe.pmPercent, 15);
    assert.equal(roundTrip.sizingRecipe.sections.at(-1).title, 'Enablement');
    await page.reload({waitUntil: 'networkidle0'});
    await page.select('#sizing-project-type', 'discovery');
    assert.equal(await page.evaluate(() => exportState().sizingRecipe.pmPercent), 25);
    assert.equal(await page.evaluate(() => exportState().sizingRecipe.sections.at(-1).title), 'Enablement');

    // Material icons must load from the app and shape as a single glyph.
    const icon = await page.evaluate(async () => {
      await document.fonts.ready;
      const el = document.querySelector('.driver-icon');
      return {family: getComputedStyle(el).fontFamily, width: el.getBoundingClientRect().width,
        loaded: document.fonts.check('24px "Material Symbols Rounded"'),
        menu: getComputedStyle(document.querySelector('.bi-list'), '::before').content};
    });
    assert.match(icon.family, /Material Symbols Rounded/);
    assert.equal(icon.loaded, true);
    assert.match(icon.menu, /menu/);
    await page.setViewport({width: 760, height: 1000});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.setViewport({width: 1440, height: 1000});
    await page.evaluate(() => AppShell.toggleTheme());
    if (process.env.ARTIFACT_DIR) await page.screenshot({path: path.join(process.env.ARTIFACT_DIR, 'sizing-dark.png')});
    assert.deepEqual(errors, []);

    const blocked = await browser.newPage();
    await blocked.goto(base, {waitUntil: 'networkidle0'});
    assert.equal(await blocked.$eval('body', el => el.classList.contains('is-landing')), true);
    assert.equal(await blocked.$eval('#landing-section', el => getComputedStyle(el).display !== 'none'), true);
    assert.equal(await blocked.$eval('#landing-sign-in', el => el.textContent), 'Sign in with Microsoft');
    assert.equal(await blocked.$eval('.landing-app-icon', el => el.naturalWidth > 0), true);
    assert.equal(await blocked.$eval('#app-section', el => getComputedStyle(el).display), 'none');
    if (process.env.ARTIFACT_DIR) await blocked.screenshot({path: path.join(process.env.ARTIFACT_DIR, 'public-landing.png')});
    await blocked.setExtraHTTPHeaders({'x-ms-client-principal': Buffer.from(JSON.stringify({
      userId: 'blocked', claims: [{typ: 'preferred_username', val: 'unapproved@test.local'}]
    })).toString('base64')});
    assert.equal((await blocked.goto(base, {waitUntil: 'networkidle0'})).status(), 403);
    assert.match(await blocked.$eval('main', el => el.textContent), /Page under maintenance/);
    assert.equal((await blocked.goto(base + '/requirements.html', {waitUntil: 'networkidle0'})).status(), 403);
    assert.equal(await blocked.$eval('#access-signout', el => el.hidden), false);
    assert.equal(await blocked.$eval('#access-action', el => el.hidden), true);
    if (process.env.ARTIFACT_DIR) await blocked.screenshot({path: path.join(process.env.ARTIFACT_DIR, 'access-blocked.png')});
    console.log('Sizing, admin save/reload, snapshot/file round trip, icons, responsive layout and blocked access passed.');
  } finally {
    if (browser) await browser.close();
    child.kill();
  }
})().catch(err => { console.error(err); process.exitCode = 1; });
