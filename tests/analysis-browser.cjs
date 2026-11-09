const fs = require('fs'), os = require('os'), path = require('path');
const { ROOT, serve, launch, counter } = require('./harness.cjs');
const { openDownload } = require('./unzip.cjs');
const { ok, done } = counter('ANALYSIS BROWSER');
const Z = new Function(fs.readFileSync(path.join(ROOT, 'zip-writer.js'), 'utf8') + ';return WebSpheresZip;')();
const STAMP = '2026-11-10T10-00-00';

async function sessionZip(name, id, blocks, practice) {
  const files = [];
  const prefix = (practice ? 'PRACTICE_' : '') + id + '_';
  const plan = blocks.map((b, i) => `${i + 1}:${b.boost ? 'boost' : 'no-boost'}:headset-on`).join('|');
  blocks.forEach((b, i) => {
    const n = i + 1;
    let csv = 'Trial,Timestamp,Target,Hand,Points,HitType,DecisionTime,TotalMovementTime,RecentreCount,ParticipantID,Block\n';
    for (let t = 1; t <= b.n; t++) csv += `${t},${t * 1000},${((t - 1) % 11) + 1},${(b.flip && t === 1) ? 'RIGHT' : 'LEFT'},5,normal,400,800,0,${id},${n}\n`;
    files.push({ path: `block${n}/${prefix}block${n}_vr-session-data-${STAMP}.csv`, parts: [csv] });
    files.push({ path: `block${n}/${prefix}block${n}_kinematics-LEFT-${STAMP}.csv`, parts: ['Timestamp\n1\n'] });
    files.push({ path: `block${n}/${prefix}block${n}_kinematics-RIGHT-${STAMP}.csv`, parts: ['Timestamp\n1\n'] });
    files.push({ path: `block${n}/${prefix}block${n}_session-info-${STAMP}.csv`, parts: [`Key,Value\nParticipantID,${id}\nSessionStartISO,2026-11-10T10:${10 + n}:00.000Z\nEndReason,${b.end || 'finished'}\nCondition,${b.boost ? 2 : 1}\nMode,standard\nTotalTrials,${b.total || b.n}\nTrialsCompleted,${b.n}\nBlock,${n}\nPlan,${plan}\n${practice ? 'Practice,1\n' : ''}`] });
  });
  const blob = await Z.make(files);
  return { name, mimeType: 'application/zip', buffer: Buffer.from(await blob.arrayBuffer()) };
}

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'analysis-'));
  const b = await launch();
  const ctx = await b.newContext({ viewport: { width: 1707, height: 960 }, acceptDownloads: true });
  const p = await ctx.newPage();
  const errs = [], external = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('request', r => { if (!r.url().startsWith('https://test.local/') && !r.url().startsWith('blob:') && !r.url().startsWith('data:')) external.push(r.url()); });
  await serve(p);
  await p.goto('https://test.local/analysis.html');
  const text = (sel) => p.locator(sel).innerText();
  const shown = (sel) => p.locator(sel).isVisible();
  const upload = async (files) => p.setInputFiles('#pick-files', files);
  const totals = (t) => p.waitForFunction((x) => document.getElementById('totals').textContent === x, t);

  console.log('PRIVACY');
  ok((await text('.lead')).includes('stay on this computer'), 'page says files stay on this computer');
  const blocked = await p.evaluate(() => fetch('https://test.local/analysis.html').then(() => false, () => true));
  ok(blocked, 'the page is blocked from making network requests');
  const beacon = await p.evaluate(() => new Promise(resolve => { document.addEventListener('securitypolicyviolation', e => resolve(e.effectiveDirective), { once: true }); navigator.sendBeacon('https://example.com/', 'x'); setTimeout(() => resolve(''), 1000); }));
  ok(beacon === 'connect-src', 'a beacon is blocked too');

  console.log('EMPTY');
  ok(!(await shown('#results')), 'results are hidden before files are added');
  await upload([{ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('x') }]);
  await p.waitForFunction(() => document.getElementById('status').textContent.includes('No zip files'));
  ok(true, 'choosing no zips explains what to do');

  console.log('TWO BLOCKS OF 352');
  const twoBlocks = await sessionZip('101_2026-11-10.zip', '101', [{ n: 352 }, { n: 352, boost: true }]);
  await upload([twoBlocks]);
  await totals('1 participant, 1 session, 2 blocks, 704 trials');
  ok(true, 'totals are correct');
  ok((await p.locator('.tile').count()) === 2, 'one tile per block');
  ok((await p.locator('.tile.boost').count()) === 1, 'the boost block is marked');
  const tiles = await p.locator('.tile').allInnerTexts();
  ok(tiles[0].includes('baseline-1') && tiles[0].includes('352 trials') && tiles[0].includes('Pre-boost') && tiles[0].includes('Mode: standard'), 'the first tile shows label, trials, phase and mode');
  ok(tiles[1].includes('boost-1') && tiles[1].includes('Boost'), 'the second tile shows the boost block');
  ok((await text('.session-name')) === 'Session 1', 'the session is labelled');
  const [download] = await Promise.all([p.waitForEvent('download'), p.click('#download')]);
  ok(/^handDB-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.zip$/.test(download.suggestedFilename()), 'the output zip name is timestamped');
  const files = await openDownload(download, dir);
  ok(files.map(f => f.path).join() === 'handDB.csv,blocks.csv,report.txt', 'the zip has the three output files');
  ok(files[0].text.trim().split('\n').length === 705, 'handDB has a header and 704 rows');
  ok(files[0].text.startsWith('"ID","Session","Block"'), 'handDB starts with the agreed columns');
  await p.waitForFunction(() => document.getElementById('download-note').textContent.startsWith('Download started'));
  ok(true, 'the page says the download started');

  console.log('EDGE STATES');
  await p.click('#start-again');
  ok(!(await shown('#results')) && !(await shown('#start-again')), 'Start again clears the page');
  await upload([await sessionZip('p.zip', '7', [{ n: 11 }], true)]);
  await totals('0 participants, 0 sessions, 0 blocks, 0 trials');
  ok(await p.locator('#download').isDisabled(), 'nothing to save when only practice data is present');
  ok((await text('#practice-text')).includes('1 practice block left out'), 'left-out practice blocks are counted');
  await p.check('#include-practice');
  await totals('1 participant, 1 session, 1 block, 11 trials');
  ok((await text('.session-name')) === 'Session 1 (practice)', 'practice data can be included and is labelled');
  await p.click('#start-again');
  await upload([await sessionZip('short.zip', '8', [{ n: 39, total: 352, end: 'ended-early' }])]);
  await totals('1 participant, 1 session, 1 block, 39 trials');
  ok((await p.locator('.tile.partial').count()) === 1 && (await text('.tile-count')) === '39 of 352 trials', 'a short block is flagged on its tile');
  ok((await text('#notes-list')).includes('ended early'), 'a short block is explained');
  await p.click('#start-again');
  await upload([await sessionZip('one.zip', '9', [{ n: 3 }]), await sessionZip('two.zip', '9', [{ n: 3, flip: true }])]);
  await p.waitForFunction(() => !document.getElementById('stops').hidden);
  ok(await p.locator('#download').isDisabled(), 'copies that disagree stop the download');
  ok((await text('#stops-list')).includes('trials differ'), 'the conflict is explained');
  ok(errs.length === 0, 'no page errors: ' + errs.join('; '));
  ok(external.length === 0, 'no outside requests: ' + external.join('; '));

  console.log('LAPTOP SCREENS');
  const six = await sessionZip('six.zip', '10', [{ n: 110 }, { n: 110 }, { n: 110, boost: true }, { n: 110, boost: true }, { n: 110 }, { n: 110 }]);
  for (const [width, height] of [[2560, 1440], [1920, 1080], [1707, 960], [1440, 900]]) {
    await p.setViewportSize({ width, height });
    for (const textSize of [1, 1.4]) {
      await p.evaluate((t) => localStorage.setItem('webspheres-observer-settings', JSON.stringify({ textSize: t })), textSize);
      await p.reload();
      await upload([six]);
      await totals('1 participant, 1 session, 6 blocks, 660 trials');
      const fit = await p.evaluate(() => ({
        fits: document.documentElement.scrollWidth <= innerWidth,
        size: parseFloat(getComputedStyle(document.documentElement).fontSize),
        rows: new Set([...document.querySelectorAll('.tile')].map(t => Math.round(t.getBoundingClientRect().top))).size
      }));
      ok(fit.fits && Math.abs(fit.size - 18 * textSize) < 0.01, `${width}x${height} at text size ${textSize}: fits and follows the Observer setting`);
      if (textSize === 1) ok(fit.rows === 1, `${width}x${height}: six blocks sit on one row`);
    }
  }
  ok(errs.length === 0, 'no page errors at any screen size: ' + errs.join('; '));

  console.log('OBSERVER LINK');
  const o = await ctx.newPage();
  await o.addInitScript(() => { window.open = (...a) => { window.__opened = a; return null; }; });
  await serve(o);
  await o.goto('https://test.local/observer.html');
  await o.waitForFunction(() => window.__peers && window.__obs);
  await o.click('#btn-analysis');
  const opened = await o.evaluate(() => window.__opened);
  ok(opened && opened[0] === 'analysis.html' && opened[1] === '_blank', 'the Analysis button opens the page in a new tab');

  await b.close();
  done();
})();
