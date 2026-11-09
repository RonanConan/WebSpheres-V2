const fs = require('fs'), path = require('path');
const { ROOT, serve, launch, counter } = require('./harness.cjs');
const { ok, done } = counter('ANALYSIS BROWSER');
const Z = new Function(fs.readFileSync(path.join(ROOT, 'zip-writer.js'), 'utf8') + ';return WebSpheresZip;')();
const STAMP = '2026-11-10T10-00-00';

async function sessionZip(id, blocks, options) {
  const o = options || {};
  const files = [];
  const prefix = (o.practice ? 'PRACTICE_' : '') + id + '_';
  const plan = blocks.map((b, i) => `${i + 1}:${b.boost ? 'boost' : 'no-boost'}:headset-on`).join('|');
  blocks.forEach((b, i) => {
    const n = i + 1;
    let csv = 'Trial,Timestamp,Target,Hand,Points,HitType,DecisionTime,TotalMovementTime,RecentreCount,ParticipantID,Block\n';
    for (let t = 1; t <= b.n; t++) csv += `${t},${t * 1000},${((t - 1) % 11) + 1},LEFT,5,normal,400,800,0,${id},${n}\n`;
    files.push({ path: `block${n}/${prefix}block${n}_vr-session-data-${STAMP}.csv`, parts: [csv] });
    files.push({ path: `block${n}/${prefix}block${n}_session-info-${STAMP}.csv`, parts: [`Key,Value\nParticipantID,${id}\nSessionStartISO,2026-11-${o.day || 10}T10:${10 + n}:00.000Z\nEndReason,finished\nCondition,${b.boost ? 2 : 1}\nMode,standard\nTotalTrials,${b.n}\nTrialsCompleted,${b.n}\nBlock,${n}\nPlan,${plan}\nGroup,${o.group === undefined ? 'Patient' : o.group}\n${o.practice ? 'Practice,1\n' : ''}`] });
  });
  const blob = await Z.make(files);
  return Buffer.from(await blob.arrayBuffer()).toString('base64');
}

const PICKER = () => {
  window.__pickPath = ['EXP027'];
  window.showDirectoryPicker = async () => {
    let dir = await navigator.storage.getDirectory();
    for (const part of window.__pickPath) dir = await dir.getDirectoryHandle(part, { create: true });
    return dir;
  };
  window.__dir = async (parts) => {
    let dir = await navigator.storage.getDirectory();
    for (const part of parts) dir = await dir.getDirectoryHandle(part, { create: true });
    return dir;
  };
};

(async () => {
  const b = await launch();
  const ctx = await b.newContext({ viewport: { width: 1707, height: 960 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(PICKER);
  await serve(p);
  await p.goto('https://test.local/analysis.html');

  const put = (parts, name, b64) => p.evaluate(async ([parts, name, b64]) => {
    const dir = await window.__dir(parts);
    const w = await (await dir.getFileHandle(name, { create: true })).createWritable();
    await w.write(Uint8Array.from(atob(b64), c => c.charCodeAt(0)));
    await w.close();
  }, [parts, name, b64]);
  const putText = (parts, name, text) => put(parts, name, Buffer.from(text).toString('base64'));
  const remove = (parts, name) => p.evaluate(async ([parts, name]) => (await window.__dir(parts)).removeEntry(name), [parts, name]);
  const read = (parts, name) => p.evaluate(async ([parts, name]) => (await (await (await window.__dir(parts)).getFileHandle(name)).getFile()).text(), [parts, name]);
  const list = (parts) => p.evaluate(async (parts) => { const out = []; for await (const [n] of (await window.__dir(parts)).entries()) out.push(n); return out.sort(); }, parts);
  const pick = (parts) => p.evaluate((x) => { window.__pickPath = x; }, parts);
  const text = (sel) => p.locator(sel).innerText();
  const enabled = (n) => p.locator(`[data-next="${n}"]`).isEnabled();
  const openStep = () => p.evaluate(() => +document.querySelector('.step.open').dataset.step);
  const tick = (n, i) => p.locator(`.step[data-step="${n}"] .g-tick input`).nth(i).check();
  const untick = (n, i) => p.locator(`.step[data-step="${n}"] .g-tick input`).nth(i).uncheck();
  const next = async (n) => { await p.click(`[data-next="${n}"]`); await p.waitForFunction((x) => !document.querySelector(`[data-next="${x}"]`).disabled || document.querySelector('.step.open').dataset.step !== String(x), n); };
  const waitStep = (n) => p.waitForFunction((x) => document.querySelector('.step.open').dataset.step === String(x), n);
  const waitMsg = (id, part) => p.waitForFunction(([i, t]) => document.getElementById(i).textContent.includes(t), [id, part]);
  const selectFolder = async () => p.click('#g2-choose');

  async function goToStep4(group) {
    await tick(1, 0); await tick(1, 1); await next(1); await waitStep(2);
    await selectFolder();
    await waitMsg('g2-msg', 'contains the patients and controls folders');
    await next(2); await waitStep(3);
    await p.click(`[data-group="${group}"]`);
    await next(3); await waitStep(4);
    await p.waitForFunction(() => document.getElementById('g4-msg').textContent !== '');
  }
  async function readSessions() {
    await tick(4, 0); await tick(4, 1);
    await p.click('[data-next="4"]');
    await waitStep(5);
  }
  async function restart() {
    await p.reload();
    await p.waitForSelector('.step.open');
    await pick(['NEW']);
  }

  console.log('PRIVACY');
  ok((await text('.lead')).includes('does not upload your data'), 'page says data cannot be sent anywhere');
  ok(await p.evaluate(() => fetch('https://test.local/analysis.html').then(() => false, () => true)), 'the page is blocked from network requests');
  ok(!(await p.locator('#browser-stop').isVisible()), 'no browser warning in a supported browser');

  console.log('STEP 1: CHECKLIST');
  ok(!(await enabled(1)), 'Next is disabled with nothing ticked');
  ok(await p.locator('.step[data-step="2"] .step-head').isDisabled(), 'later steps cannot be opened');
  await tick(1, 0);
  ok(!(await enabled(1)), 'Next is disabled with one of two ticked');
  await tick(1, 1);
  ok(await enabled(1), 'Next is enabled when every box is ticked');
  await next(1); await waitStep(2);
  ok((await openStep()) === 2, 'step 2 opens');

  console.log('STEP 2: FOLDER CHECKS');
  ok(!(await enabled(2)), 'Next is disabled before a folder is selected');
  await p.evaluate(() => { window.__realPicker = window.showDirectoryPicker; window.showDirectoryPicker = async () => { throw new DOMException('aborted', 'AbortError'); }; });
  await selectFolder();
  await waitMsg('g2-msg', 'No folder was selected');
  ok(!(await enabled(2)) && !(await text('#g2-msg')).includes('Chrome'), 'cancelling explains what happened without blaming the browser');
  await p.evaluate(() => { window.showDirectoryPicker = window.__realPicker; });
  await pick(['EXP027', 'patients']);
  await selectFolder();
  await waitMsg('g2-msg', 'You selected the patients folder');
  ok(!(await enabled(2)), 'selecting a subfolder is refused');
  await putText(['exp026'], 'script.R', 'x');
  await pick(['exp026']);
  await selectFolder();
  await waitMsg('g2-msg', 'has neither a patients nor');
  ok(!(await p.locator('#g2-setup').isVisible()) && !(await enabled(2)), 'an unrelated folder is refused with no set-up offered');
  await pick(['NEW']);
  await selectFolder();
  await waitMsg('g2-msg', 'NEW is empty');
  ok(await p.locator('#g2-setup').isVisible(), 'an empty folder offers set-up');
  await p.click('#g2-setup');
  await waitMsg('g2-msg', 'contains the patients and controls folders');
  ok((await list(['NEW'])).join() === 'controls,patients' && (await list(['NEW', 'patients'])).join() === 'history,zips', 'set-up creates the folders');
  ok(await enabled(2), 'Next is enabled for a correct folder');
  await next(2); await waitStep(3);

  console.log('STEPS 3 TO 7');
  ok(!(await enabled(3)), 'a group must be chosen');
  await p.click('[data-group="patients"]');
  await next(3); await waitStep(4);
  await waitMsg('g4-msg', 'No ZIP files');
  ok((await text('#g4-path')) === 'NEW/patients/zips', 'the exact folder is shown');
  await tick(4, 0); await tick(4, 1);
  ok(!(await enabled(4)), 'an empty zips folder cannot continue');
  const two = await sessionZip('101', [{ n: 352 }, { n: 352, boost: true }]);
  await put(['NEW', 'patients', 'zips'], '101.zip', two);
  await p.click('#g4-recheck');
  await waitMsg('g4-msg', 'There is 1 ZIP file');
  ok(await enabled(4), 'finding a zip allows continuing');
  await untick(4, 1);
  ok(!(await enabled(4)), 'unticking disables continuing');
  await tick(4, 1);
  await p.click('[data-next="4"]');
  await waitStep(5);
  ok((await text('#totals')) === 'Patients: 1 participant, 1 session, 2 blocks, 704 trials', 'totals are shown');
  ok((await text('#comparison')) === 'This will be the first master for this group.', 'the first master is explained');
  ok((await p.locator('.tile').count()) === 2, 'one tile per block');
  ok(!(await enabled(5)), 'sessions must be confirmed');
  await tick(5, 0);
  await next(5); await waitStep(6);
  await p.click('#g6-save');
  await waitMsg('g6-msg', 'Saved handDB_patients.csv with 704 trials');
  const master = await read(['NEW', 'patients'], 'handDB_patients.csv');
  ok(master.trim().split('\n').length === 705, 'the master has a header and 704 rows');
  ok(master.split('\n')[1].endsWith('"Patient"'), 'rows carry the group');
  ok((await list(['NEW', 'patients'])).join() === 'blocks_patients.csv,handDB_patients.csv,history,report_patients.txt,zips', 'the master, summary and report are saved');
  ok((await list(['NEW', 'patients', 'history'])).length === 0, 'nothing goes to history on the first save');
  ok(await enabled(6), 'Next is enabled after saving');
  await next(6); await waitStep(7);
  ok(!(await enabled(7)), 'Finish is disabled until the GitHub checklist is ticked');
  await tick(7, 0); await tick(7, 1);
  ok(!(await enabled(7)), 'Finish needs all three boxes');
  await tick(7, 2);
  await p.click('[data-next="7"]');
  await waitMsg('g7-msg', 'All steps are complete for Patients');
  await untick(7, 2);
  ok((await text('#g7-msg')) === '' && !(await enabled(7)), 'unticking the last step after Finish takes the completion back');
  await tick(7, 2);
  await p.click('[data-next="7"]');
  await waitMsg('g7-msg', 'All steps are complete for Patients');
  ok(await p.locator('#g7-restart').isVisible(), 'another analysis can be started');

  console.log('UNTICKING GOES BACK');
  await p.click('[data-open="1"]');
  await untick(1, 0);
  ok((await openStep()) === 1 && (await p.locator('.step[data-step="2"] .step-head').isDisabled()), 'unticking an earlier step locks everything after it');

  console.log('ADDING TO THE MASTER');
  await restart();
  ok((await text('#g2-again')) !== undefined, 'page reloads');
  await pick(['NEW']);
  await goToStep4('patients');
  await put(['NEW', 'patients', 'zips'], '102.zip', await sessionZip('102', [{ n: 11 }], { day: 12 }));
  await p.click('#g4-recheck');
  await waitMsg('g4-msg', 'There are 2 ZIP files');
  await readSessions();
  ok((await text('#comparison')) === '1 new participant, 11 new trials, and 0 existing rows changed.', 'a new participant is reported as an addition');
  await tick(5, 0);
  await next(5); await waitStep(6);
  const zipBefore = await read(['NEW', 'patients', 'zips'], '101.zip');
  await p.click('#g6-save');
  await waitMsg('g6-msg', 'Saved handDB_patients.csv with 715 trials');
  const hist = await list(['NEW', 'patients', 'history']);
  ok(hist.length === 3 && hist.some(n => /^handDB_patients-\d{4}.*\.csv$/.test(n)), 'earlier files are copied to history');
  const kept = hist.find(n => n.startsWith('handDB_patients'));
  ok((await read(['NEW', 'patients', 'history'], kept)) === master, 'the history copy is the previous master');
  ok((await read(['NEW', 'patients', 'zips'], '101.zip')) === zipBefore, 'the zips are untouched');

  console.log('SAVING SAFELY');
  await restart();
  await goToStep4('patients');
  await put(['NEW', 'patients', 'zips'], '104.zip', await sessionZip('104', [{ n: 11 }], { day: 20 }));
  await p.click('#g4-recheck');
  await waitMsg('g4-msg', 'There are 3 ZIP files');
  await readSessions();
  await tick(5, 0);
  await next(5); await waitStep(6);
  const beforeFail = await read(['NEW', 'patients'], 'handDB_patients.csv');
  const historyBefore = await list(['NEW', 'patients', 'history']);
  await p.evaluate(() => {
    const real = FileSystemFileHandle.prototype.createWritable;
    let failed = false;
    FileSystemFileHandle.prototype.createWritable = function (...a) {
      if (this.name === 'blocks_patients.csv' && !failed) { failed = true; return Promise.reject(new DOMException('full', 'QuotaExceededError')); }
      return real.apply(this, a);
    };
  });
  await p.click('#g6-save');
  await waitMsg('g6-msg', 'any changes were undone');
  ok((await read(['NEW', 'patients'], 'handDB_patients.csv')) === beforeFail, 'a failed save puts the earlier master back');
  ok((await list(['NEW', 'patients', 'history'])).join() === historyBefore.join(), 'a failed save leaves no extra history copies');
  await p.click('#g6-save');
  await waitMsg('g6-msg', 'Saved handDB_patients.csv with 726 trials');
  ok(true, 'saving again after a failure works');
  await restart();
  await goToStep4('patients');
  await put(['NEW', 'patients', 'zips'], '105.zip', await sessionZip('105', [{ n: 11 }], { day: 21 }));
  await p.click('#g4-recheck');
  await waitMsg('g4-msg', 'There are 4 ZIP files');
  await readSessions();
  await tick(5, 0);
  await next(5); await waitStep(6);
  const master2 = await read(['NEW', 'patients'], 'handDB_patients.csv');
  await putText(['NEW', 'patients'], 'handDB_patients.csv', master2 + '"x"\n');
  await p.click('#g6-save');
  await waitMsg('g6-msg', 'has changed since the sessions were read');
  ok((await read(['NEW', 'patients'], 'handDB_patients.csv')) === master2 + '"x"\n', 'a master that changed after reading is not overwritten');
  await putText(['NEW', 'patients'], 'handDB_patients.csv', master2);
  await remove(['NEW', 'patients', 'zips'], '105.zip');

  console.log('ITEMS THAT ARE NOT ZIPS');
  await restart();
  await putText(['NEW', 'patients', 'zips'], '101_vr-session-data-2026.csv', 'x');
  await putText(['NEW', 'patients', 'zips', 'extracted'], 'a.csv', 'x');
  await goToStep4('patients');
  await readSessions();
  const stray = await text('#warnings-list');
  ok(stray.includes('101_vr-session-data-2026.csv') && stray.includes('extracted'), 'loose files and subfolders are named');
  await tick(5, 0);
  ok(!(await enabled(5)), 'the warning must be acknowledged');
  await remove(['NEW', 'patients', 'zips'], '101_vr-session-data-2026.csv');
  await p.evaluate(async () => (await window.__dir(['NEW', 'patients', 'zips'])).removeEntry('extracted', { recursive: true }));

  console.log('MAC FILES IN THE FOLDER');
  await restart();
  await putText(['NEW', 'patients', 'zips'], '.DS_Store', 'x');
  await putText(['NEW', 'patients', 'zips'], '._101.zip', 'x');
  await goToStep4('patients');
  ok((await text('#g4-msg')).startsWith('There are 3 ZIP files'), 'hidden Mac files are not counted as zips');
  await readSessions();
  ok(!(await p.locator('#warnings').isVisible()) && !(await p.locator('#set-aside').isVisible()), 'hidden Mac files cause no warnings');
  await remove(['NEW', 'patients', 'zips'], '.DS_Store');
  await remove(['NEW', 'patients', 'zips'], '._101.zip');
  await putText(['NEW', 'patients', 'zips'], '.106.zip.icloud', 'x');
  await restart();
  await goToStep4('patients');
  await readSessions();
  ok((await text('#stops-list')).includes('stored in iCloud') && (await text('#stops-list')).includes('106.zip'), 'a zip still in iCloud is named');
  await tick(5, 0);
  ok(!(await enabled(5)), 'a zip still in iCloud stops the save');
  await remove(['NEW', 'patients', 'zips'], '.106.zip.icloud');

  console.log('NOTHING NEW');
  await restart();
  await goToStep4('patients');
  await readSessions();
  ok((await text('#comparison')).endsWith('0 new trials, and 0 existing rows changed.'), 'a rebuild with nothing new says so');
  await tick(5, 0);
  await next(5); await waitStep(6);
  ok((await text('#g6-say')) === 'The master is already up to date.' && !(await p.locator('#g6-save').isVisible()) && await enabled(6), 'nothing needs saving');

  console.log('CHANGED ROWS NEED CONFIRMING');
  await restart();
  const current = await read(['NEW', 'patients'], 'handDB_patients.csv');
  const lines = current.split('\n');
  lines[1] = lines[1].replace('"LEFT",5,', '"LEFT",9,');
  await putText(['NEW', 'patients'], 'handDB_patients.csv', lines.join('\n'));
  await goToStep4('patients');
  await readSessions();
  ok((await text('#comparison')).includes('1 existing row changed'), 'a changed row is reported');
  ok((await text('#changes-list')).includes('Points changed from 9 to 5'), 'the change is described');
  await tick(5, 0);
  ok(!(await enabled(5)), 'the change must be confirmed');
  await p.check('#g5-changes input');
  ok(await enabled(5), 'confirming allows continuing');
  await putText(['NEW', 'patients'], 'handDB_patients.csv', current);

  console.log('RECORDED GROUP');
  await restart();
  await put(['NEW', 'patients', 'zips'], 'wrong.zip', await sessionZip('150', [{ n: 11 }], { group: 'Control', day: 15 }));
  await goToStep4('patients');
  await readSessions();
  ok((await text('#group-mismatch-list')).includes('wrong.zip was recorded as Control, but it is in the patients folder.'), 'a session recorded under the other group is named');
  await tick(5, 0);
  ok(!(await enabled(5)), 'it cannot continue without confirming');
  await p.check('#g5-group input');
  ok(await enabled(5), 'confirming the group was set wrongly allows continuing');
  await remove(['NEW', 'patients', 'zips'], 'wrong.zip');
  await put(['NEW', 'patients', 'zips'], 'old.zip', await sessionZip('151', [{ n: 11 }], { day: 16, group: '' }));
  await restart();
  await goToStep4('patients');
  await readSessions();
  ok((await text('#warnings-list')).includes('do not specify a group') && (await text('#warnings-list')).includes('old.zip'), 'a zip with no recorded group is warned about');
  await tick(5, 0);
  ok(!(await enabled(5)), 'the warning must be acknowledged');
  await remove(['NEW', 'patients', 'zips'], 'old.zip');

  console.log('STOPS');
  await restart();
  await put(['NEW', 'controls', 'zips'], 'copy.zip', two);
  await goToStep4('patients');
  await readSessions();
  ok((await text('#stops-list')).includes('contain the same session'), 'the same session in both groups is reported');
  await tick(5, 0);
  ok(!(await enabled(5)), 'it cannot continue');
  await remove(['NEW', 'controls', 'zips'], 'copy.zip');
  await put(['NEW', 'patients', 'zips'], 'practice.zip', await sessionZip('900', [{ n: 11 }], { practice: true, day: 13 }));
  await restart();
  await goToStep4('patients');
  await readSessions();
  ok((await text('#set-aside-list')).includes('practice.zip: This is a practice session'), 'a practice zip is named and left out');
  await remove(['NEW', 'patients', 'zips'], 'practice.zip');

  console.log('PRACTICE MODE');
  await put(['NEW', 'patients', 'zips'], 'practice.zip', await sessionZip('900', [{ n: 11 }], { practice: true, day: 13 }));
  const realMaster = await read(['NEW', 'patients'], 'handDB_patients.csv');
  await p.goto('https://test.local/analysis.html?practice');
  await p.waitForSelector('.step.open');
  await pick(['NEW']);
  await goToStep4('patients');
  await readSessions();
  await tick(5, 0);
  await p.click('[data-next="5"]');
  await waitStep(6);
  ok((await text('#g6-path')) === 'NEW/patients/PRACTICE_handDB_patients.csv', 'practice mode names a separate file');
  await p.click('#g6-save');
  await waitMsg('g6-msg', 'Saved PRACTICE_handDB_patients.csv');
  ok((await read(['NEW', 'patients'], 'handDB_patients.csv')) === realMaster, 'practice mode leaves the real master alone');
  await remove(['NEW', 'patients', 'zips'], 'practice.zip');
  await p.goto('https://test.local/analysis.html');
  await p.waitForSelector('.step.open');
  await pick(['NEW']);

  console.log('REMEMBERED FOLDER');
  await restart();
  await tick(1, 0); await tick(1, 1); await next(1); await waitStep(2);
  await p.waitForFunction(() => !document.getElementById('g2-again').hidden);
  ok((await text('#g2-again')) === 'Use NEW again', 'the folder is remembered');
  await p.click('#g2-again');
  await waitMsg('g2-msg', 'contains the patients and controls folders');
  ok(await enabled(2), 'the remembered folder can be used');

  console.log('LAPTOP SCREENS');
  await put(['NEW', 'patients', 'zips'], 'six.zip', await sessionZip('103', [{ n: 110 }, { n: 110 }, { n: 110, boost: true }, { n: 110, boost: true }, { n: 110 }, { n: 110 }], { day: 14 }));
  for (const [width, height] of [[2560, 1440], [1920, 1080], [1707, 960], [1440, 900]]) {
    await p.setViewportSize({ width, height });
    for (const textSize of [1, 1.4]) {
      await p.evaluate((t) => localStorage.setItem('webspheres-observer-settings', JSON.stringify({ textSize: t })), textSize);
      await restart();
      await goToStep4('patients');
      await readSessions();
      const fit = await p.evaluate(() => ({
        fits: document.documentElement.scrollWidth <= innerWidth,
        size: parseFloat(getComputedStyle(document.documentElement).fontSize),
        guide: document.getElementById('guide').scrollWidth <= document.getElementById('guide').clientWidth,
        view: document.getElementById('view').scrollWidth <= document.getElementById('view').clientWidth,
        rows: new Set([...document.querySelectorAll('.participant:last-of-type .tile')].map(t => Math.round(t.getBoundingClientRect().top))).size
      }));
      ok(fit.fits && fit.guide && fit.view && Math.abs(fit.size - 18 * textSize) < 0.01, `${width}x${height} at text size ${textSize}: fits and follows the Observer setting`);
      if (textSize === 1 && width >= 1707) ok(fit.rows === 1, `${width}x${height}: six blocks sit on one row`);
    }
  }
  ok(errs.length === 0, 'no page errors: ' + errs.join('; '));

  console.log('BROWSER NOTICE');
  const other = await b.newContext({ viewport: { width: 1707, height: 960 } });
  const firefox = () => Object.defineProperty(Navigator.prototype, 'userAgentData', { get: () => undefined });
  const q = await other.newPage();
  await q.addInitScript(firefox);
  await serve(q, { realBrowser: true });
  await q.goto('https://test.local/analysis.html');
  ok(await q.locator('#browser-stop').isVisible() && !(await q.locator('#steps').isVisible()), 'the Analysis page stops in other browsers');
  await q.goto('https://test.local/observer.html');
  await q.waitForFunction(() => window.__peers && window.__obs);
  ok(await q.locator('#g1-browser').isVisible(), 'the Observer warns in other browsers');
  ok(await q.locator('#g-practice').isVisible(), 'the Observer still works after warning');

  console.log('OBSERVER');
  const o = await ctx.newPage();
  await o.addInitScript(() => { window.open = (...a) => { window.__opened = a; return null; }; });
  await serve(o);
  await o.goto('https://test.local/observer.html');
  await o.waitForFunction(() => window.__peers && window.__obs);
  ok(!(await o.locator('#g1-browser').isVisible()), 'no warning in a supported browser');
  await o.click('#btn-analysis');
  const opened = await o.evaluate(() => window.__opened);
  ok(opened && opened[0] === 'analysis.html' && opened[1] === '_blank', 'the Analysis button opens the page in a new tab');
  ok(!fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').includes('browser-check'), 'the headset page has no browser check');

  await b.close();
  done();
})();
