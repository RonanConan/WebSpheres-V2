const fs = require('fs'), path = require('path');
const { serve, launch, counter } = require('./harness.cjs');
const { ok, done } = counter('DOWNLOADS BROWSER');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const VERSION = fs.readFileSync(path.join(__dirname, '..', 'observer.html'), 'utf8').match(/APP_VERSION = '([^']+)'/)[1];
const STATE = { type: 'state', version: VERSION, sessionId: 'A', phase: 'setup', endReason: '', participantId: '', filePrefix: '', sessionPrefix: '', experimenter: '', homeMode: 'one-box', dominantHand: 'RIGHT', condition: 1, mode: 'fmode', totalTrials: 44, setupLocked: false, calib: null, recentred: false, cue: null, sessionMs: 0, trialCount: 0, recentreCount: 0, pauses: 0, run: 1, plannedRuns: 1, plan: null, inVR: true, closing: false, saving: false, headsetCopyRun: 0, betweenMs: 0, betweenRecentres: 0, recalibrated: [], completedRuns: [], noteMarks: [], notesCsv: '', backup: { trials: 0, kinL: 0, kinR: 0, final: false, exportTs: '' }, info: '' };

async function open(ctx) {
  const o = await ctx.newPage();
  o.errs = [];
  o.dl = [];
  o.on('pageerror', e => o.errs.push(e.message));
  o.on('download', d => o.dl.push(d));
  await serve(o);
  await o.goto('https://test.local/observer.html');
  await o.waitForFunction(() => window.__peers && window.__peers.length > 0 && window.__obs);
  return o;
}

async function connect(o) {
  await o.evaluate((state) => {
    const P = window.__peers.at(-1); P.serverOpen(); const c = P.conns.at(-1); window.__c = c;
    c.open = true; c.emit('open');
    c.emit('data', JSON.stringify(state));
  }, STATE);
  await sleep(300);
}

(async () => {
  const b = await launch();
  const ctx = await b.newContext({ viewport: { width: 1707, height: 960 }, acceptDownloads: true });
  const o = await open(ctx);
  const E = (fn, arg) => o.evaluate(fn, arg);
  const text = (id) => E((x) => document.getElementById(x).textContent, id);
  const shown = (sel) => E((s) => { const el = document.querySelector(s); return !!el && el.checkVisibility(); }, sel);

  console.log('STEP 1: NOT TESTED YET');
  ok(await shown('#g1-dl') && (await text('g1-dl-text')) === 'Results are saved as downloads. Select Test downloads now. If your browser asks whether this site can download multiple files, select Allow.', 'Step 1 explains downloads before the headset connects');
  ok((await text('g-test-downloads')) === 'Test downloads', 'button reads Test downloads');
  ok(o.dl.length === 0, 'nothing downloads on page load');

  console.log('STEP 2 REMINDER');
  await connect(o);
  ok(await E(() => +document.querySelector('#guide .step.open').dataset.step) === 2, 'headset connected: Step 2 opens');
  ok(await shown('#g2-dl') && (await text('g2-dl')).includes('Downloads have not been tested on this laptop.'), 'Step 2 repeats the reminder while untested');

  console.log('TESTING');
  await o.click('#g2-dl [data-test-downloads]');
  await sleep(1200);
  const names = o.dl.map(d => d.suggestedFilename()).sort();
  ok(names.join() === 'webspheres-download-test-1.txt,webspheres-download-test-2.txt', 'two small test files download (' + names.join() + ')');
  const content = fs.readFileSync(await o.dl[0].path(), 'utf8');
  ok(content.startsWith('WebSpheres download test, file') && content.includes('You can delete this file.'), 'test files say what they are');
  ok(!(await shown('#g2-dl')), 'Step 2 reminder goes once tested');
  ok(await E(() => { try { return !!localStorage.getItem('webspheres-downloads-tested'); } catch (e) { return false; } }), 'remembered on this laptop');
  await o.click('[data-open="1"]');
  await sleep(150);
  ok((await text('g1-dl-text')).startsWith('Two test downloads started: webspheres-download-test-1.txt and webspheres-download-test-2.txt. If your browser asked about downloading multiple files, select Allow.') && (await text('g1-dl-text')).includes('Automatic downloads'), 'Step 1 says the test started and how to undo a Block');
  ok((await text('g-test-downloads')) === 'Test again', 'button offers a second test');

  console.log('LATER VISIT');
  const again = await open(ctx);
  ok((await again.evaluate(() => document.getElementById('g1-dl-text').textContent)) === 'Downloads were tested on this laptop before. If result files stop appearing in Downloads, test again.', 'later visit: shorter note');
  ok((await again.evaluate(() => document.getElementById('g-test-downloads').textContent)) === 'Test again', 'later visit: Test again still available');
  await connect(again);
  ok(!(await again.evaluate(() => document.getElementById('g2-dl').checkVisibility())), 'later visit: no Step 2 reminder');

  console.log('STORAGE BLOCKED');
  const blocked = await b.newContext({ viewport: { width: 1707, height: 960 }, acceptDownloads: true });
  await blocked.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); });
  const nb = await open(blocked);
  ok((await nb.evaluate(() => document.getElementById('g1-dl-text').textContent)).startsWith('Results are saved as downloads.'), 'page still works when browser storage is blocked');
  await nb.click('#g-test-downloads');
  await sleep(900);
  ok(nb.dl.length === 2 && nb.errs.length === 0, 'test still downloads with storage blocked');

  ok(o.errs.length === 0 && again.errs.length === 0, 'no page errors (' + o.errs.concat(again.errs).join('; ') + ')');
  await b.close();
  done();
})().catch(e => { console.error(e); process.exit(2); });
