const fs = require('fs'), os = require('os'), path = require('path');
const { serve, launch, counter, ROOT } = require('./harness.cjs');
const { openDownload } = require('./unzip.cjs');
const Q = require(path.join(ROOT, 'questionnaire-core.js'));
const A = require(path.join(ROOT, 'analysis-core.js'));
globalThis.WebSpheresQuestionnaires = Q;
['game', 'sus', 'imi-teq', 'study'].forEach(f => require(path.join(ROOT, 'questionnaires', f + '.js')));
const { ok, done } = counter('QUESTIONNAIRE RECOVERY BROWSER');

const TS = '2026-10-22T13-00-00';
const START1 = '2026-10-22T12:30:00.000Z';
const START = '2026-10-22T12:40:00.000Z';
const info = (id, start, extra) => `Key,Value\nParticipantID,${id}\nSessionStartISO,${start}\nDominantHand,LEFT\n${extra || ''}`;
const BASE = {
  type: 'state', version: '2.9.1', sessionId: 'sA', phase: 'complete', endReason: 'finished', participantId: 'P21', filePrefix: 'P21_block2_', sessionPrefix: 'P21_', experimenter: 'RT', homeMode: 'one-box', dominantHand: 'LEFT', condition: 1, mode: 'standard', totalTrials: 6, setupLocked: true,
  calib: { reach: { done: true, hand: 'LEFT', distance: 0.6, radius: 0.45 }, height: { done: true, height: 1.2 }, lap: { done: true, home: { x: 0, y: 0.9, z: -0.4 } } },
  recentred: true, cue: null, sessionMs: 125000, trialCount: 6, recentreCount: 0, pauses: 0, run: 2, plannedRuns: 2,
  plan: { mode: 'standard', home: 'one-box', charts: [], runs: [{ condition: 1, off: false, recal: false }, { condition: 2, off: false, recal: false }] },
  completedRuns: [{ run: 1, prefix: 'P21_block1_', info: info('P21', START1), ms: 60000, recentres: 0, pauses: 0, trials: 0, kinL: 0, kinR: 0 }],
  backup: { trials: 6, kinL: 4, kinR: 5, final: true, exportTs: TS }, info: info('P21', START)
};
const TRIALS = ['1,1000,3,LEFT,4,normal,400,900,0,P21', '2,2000,5,RIGHT,8,critical,500,1100,0,P21', '3,3000,7,LEFT,0,normal,300,800,0,P21', '4,4000,2,LEFT,9,critical,300,700,1,P21', '5,5000,9,RIGHT,2,normal,600,1300,1,P21', '6,6000,4,LEFT,3,normal,200,800,1,P21'].map(l => l + '\n');
const kin = (t, v) => `${t},0.1,1,-0.3,0,0.9,-0.4,,,,${v},0,0,0,0,0,0,1,0,1.2,0,0,0,0,1,0\n`;
const KL = [1, 1, 0, 1].map((v, i) => kin(i * 11, v)), KR = [1, 1, 1, 1, 0].map((v, i) => kin(i * 11, v));
const TH = 'Trial,Timestamp,Target,Hand,Points,HitType,DecisionTime,TotalMovementTime,RecentreCount,ParticipantID\n';
const KH = 'Timestamp,HandX\n';
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const leaveWarns = (p) => p.E(() => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; });

async function observer(ctx, setup) {
  const p = await ctx.newPage();
  p.errs = []; p.dls = [];
  p.on('pageerror', e => p.errs.push(e.message));
  p.on('dialog', d => d.accept());
  p.on('download', d => p.dls.push(d));
  await serve(p);
  if (setup) await setup(p);
  p.E = (fn, arg) => p.evaluate(fn, arg);
  p.S = JSON.parse(JSON.stringify(BASE));
  p.state = (over) => { p.S = Object.assign(JSON.parse(JSON.stringify(p.S)), over || {}); return p.E((s) => window.__c.emit('data', JSON.stringify(s)), p.S); };
  p.rows = (n) => p.E(([th, t, kh, kl, kr]) => { const c = window.__c; c.emit('data', JSON.stringify({ type: 'rows', file: 'trials', from: 0, header: th, lines: t })); c.emit('data', JSON.stringify({ type: 'rows', file: 'kinL', from: 0, header: kh, lines: kl })); c.emit('data', JSON.stringify({ type: 'rows', file: 'kinR', from: 0, header: kh, lines: kr })); }, [TH, TRIALS.slice(0, n || TRIALS.length), KH, KL, KR]);
  p.connect = async () => {
    await p.waitForFunction(() => window.__peers && window.__peers.length > 0);
    await p.E(() => {
      const P = window.__peers.at(-1); P.serverOpen(); const c = P.conns.at(-1);
      window.__c = c;
      const send = c.send.bind(c);
      c.send = (d) => { send(d); const m = JSON.parse(d); if (m.type === 'cmd') queueMicrotask(() => c.emit('data', JSON.stringify({ type: 'cmdResult', id: m.id, ok: true, reason: '' }))); };
      c.open = true; c.emit('open');
      clearInterval(window.__keep);
      window.__keep = setInterval(() => c.emit('data', JSON.stringify({ type: 'keepalive' })), 1000);
    });
  };
  p.openStep = () => p.E(() => +(document.querySelector('#guide .step.open')?.dataset.step || 0));
  p.text = (sel) => p.E((s) => (document.querySelector(s) || {}).textContent || '', sel);
  p.checks = (id) => p.E((i) => [...document.querySelectorAll('#' + i + ' li')].map(li => li.children[0].className.replace('ck ', '') + ':' + li.children[1].textContent), id);
  p.shown = (sel) => p.E((s) => { const e = document.querySelector(s); return !!e && e.checkVisibility(); }, sel);
  p.choose = (id, n) => p.click(`#qv-r-${id}-${n} + *`);
  p.hold = async (ms) => { await p.hover('#qv-staff'); await p.mouse.down(); await wait(ms); await p.mouse.up(); await wait(100); };
  p.leaveView = async () => { await p.hold(2300); await p.click('#qv-menu-leave'); await wait(250); };
  p.nextDownload = async (fn, ms) => { const before = p.dls.length; await fn(); for (let i = 0; i < (ms || 6000) / 100 && p.dls.length === before; i++) await wait(100); return p.dls[before]; };
  p.fillAll = () => p.E(() => { const q = window.__obs.quest; q.defs.forEach(def => def.items.forEach(item => { q.state.answers[item.id] = def.type === 'scale' ? { value: def.scale.values[1] } : { value: item.options[0], text: 'x' }; })); });
  p.idb = (store) => p.E((s) => new Promise(res => { const q = indexedDB.open('webspheres-laptop-copy', 1); q.onsuccess = () => { const t = q.result.transaction(s).objectStore(s).getAll(); t.onsuccess = () => res(t.result); }; }), store);
  p.complete = async (over) => p.nextDownload(async () => { await p.state(over); await p.rows(); });
  await p.goto('https://test.local/observer.html');
  await wait(300);
  await p.connect();
  return p;
}

const zipFiles = (d) => openDownload(d, os.tmpdir());
async function exportOf(d) {
  const f = path.join(os.tmpdir(), Math.random().toString(36).slice(2) + '-' + d.suggestedFilename());
  await d.saveAs(f);
  return A.readExport(new File([fs.readFileSync(f)], d.suggestedFilename()));
}

(async () => {
  const b = await launch();

  console.log('RELOAD AFTER THE FINAL ZIP');
  {
    const ctx = await b.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 900 } });
    const p = await observer(ctx);
    await p.complete();
    await wait(300);
    await p.fillAll();
    const first = await p.nextDownload(() => p.E(() => window.__obs.questFinish('submitted')));
    ok(first && first.suggestedFilename() === `P21_${TS}-questionnaires.zip`, 'the answers are saved in their own ZIP');
    await wait(300);
    await p.reload();
    await wait(400);
    await p.connect();
    const again = await p.complete();
    await wait(400);
    ok(await p.openStep() === 9 && await p.E(() => window.__obs.quest.status === 'submitted' && window.__obs.quest.savedFinal), 'after a reload, the questionnaires count as done and Finish is shown');
    ok(!(await leaveWarns(p)), 'and leaving the page does not warn');
    ok(again && again.suggestedFilename() === `P21_${TS}-final.zip`, 'the automatic save after the reload is a complete final ZIP again');
    const built = A.build([await exportOf(first), await exportOf(again)]);
    ok(!built.stops.length && built.questSessions.length === 1 && built.questRows.length === 35, 'the answers ZIP and the final ZIP hold the same answers, so the Analysis page uses them once');
    ok(p.errs.length === 0, 'no page errors (' + p.errs.join(' | ') + ')');
    await ctx.close();
  }

  console.log('ADD BLOCK BEFORE THE QUESTIONNAIRES');
  {
    const ctx = await b.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 900 } });
    const p = await observer(ctx);
    await p.complete();
    await wait(300);
    await p.click('#g-quest-add-run');
    await wait(300);
    const cmds = await p.E(() => window.__c.sent.map(x => JSON.parse(x)).filter(m => m.type === 'cmd').map(m => m.name));
    ok(cmds.includes('setPlan') && cmds.includes('reopenSession'), 'Add block in step 8 reopens the session');
    await p.state({ phase: 'between', backup: { trials: 6, kinL: 4, kinR: 5, final: false, exportTs: '' } });
    await wait(200);
    await p.state({ phase: 'complete', run: 3, plannedRuns: 3, info: info('P21', '2026-10-22T12:50:00.000Z'), backup: { trials: 6, kinL: 4, kinR: 5, final: true, exportTs: '2026-10-22T13-10-00' } });
    await wait(300);
    ok(await p.openStep() === 8 && await p.E(() => window.__obs.quest.status === 'pending' && window.__obs.quest.meta.afterBlock === 3 && window.__obs.quest.meta.lastBlockStart === '2026-10-22T12:50:00.000Z'), 'after the added block, the questionnaires follow the new last block');
    await ctx.close();
  }

  console.log('SKIP, THEN ADD BLOCK');
  {
    const ctx = await b.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 900 } });
    const p = await observer(ctx);
    await p.complete({ endReason: 'ended-early' });
    await wait(300);
    await p.click('#g-quest-skip');
    await p.nextDownload(() => p.click('#g-quest-skip-yes'));
    await wait(300);
    ok(await p.openStep() === 9, 'skipping an early-ended session moves on to Finish');
    await p.click('#g-add-run');
    await wait(300);
    ok(await p.E(() => window.__obs.quest.status === 'pending' && !localStorage.getItem('webspheres-questionnaires-done').includes('"sA"')), 'adding a block after a skip offers the questionnaires again');
    await p.state({ phase: 'between', endReason: '', backup: { trials: 6, kinL: 4, kinR: 5, final: false, exportTs: '' } });
    await wait(200);
    await p.state({ phase: 'complete', endReason: 'finished', run: 3, plannedRuns: 3, info: info('P21', '2026-10-22T12:50:00.000Z'), backup: { trials: 6, kinL: 4, kinR: 5, final: true, exportTs: '2026-10-22T13-10-00' } });
    await wait(400);
    ok(await p.openStep() === 8 && await p.shown('#g-quest-go'), 'when the added block is done, step 8 asks for the questionnaires');
    const stored = (await p.idb('sessions')).find(r => r.id === 'sA');
    ok(!stored || stored.questionnaire === null || stored.questionnaire === undefined, 'the stored skip was cleared, so a reload does not bring it back');
    ok(p.errs.length === 0, 'no page errors (' + p.errs.join(' | ') + ')');
    await ctx.close();
  }

  console.log('PREVIOUS SESSION NOT STARTED');
  {
    const ctx = await b.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 900 } });
    const p = await observer(ctx);
    await p.complete();
    await wait(300);
    await p.state({ sessionId: 'sB', participantId: 'P22', phase: 'setup', run: 1, completedRuns: [], backup: { trials: 0, kinL: 0, kinR: 0, final: false, exportTs: '' }, info: '' });
    await wait(300);
    ok(await p.shown('#g-quest-other') && (await p.text('#g-quest-other-text')).startsWith('Questionnaires for P21 are not finished (0 of 35 answered).'), 'the banner names the previous participant');
    ok(await p.shown('#g-quest-other-skip') && await p.shown('#g-quest-other-go'), 'the banner offers Skip as well as Hand back');
    await p.state({ sessionId: 'sB', participantId: 'P22', sessionPrefix: 'P22_', filePrefix: 'P22_', phase: 'complete', run: 1, plannedRuns: 1, info: info('P22', START), backup: { trials: 0, kinL: 0, kinR: 0, final: true, exportTs: '2026-10-22T14-00-00' } });
    await wait(400);
    ok(await p.E(() => window.__obs.quest.sessionId === 'sB' && window.__obs.quest.status === 'pending') && !(await p.shown('#g-quest-other')) && !(await p.E(() => document.getElementById('g-quest-go').disabled)), 'the next session gets its own questionnaire when the previous one was never started');
    ok(!(await p.idb('sessions')).some(r => r.id === 'sA'), 'the previous session\'s copy, already in its ZIP, is cleared');
    await ctx.close();
  }

  console.log('PREVIOUS SESSION UNFINISHED: SKIP FROM THE BANNER');
  {
    const ctx = await b.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 900 } });
    const p = await observer(ctx);
    await p.complete();
    await wait(300);
    await p.click('#g-quest-go');
    await wait(150);
    await p.click('#qv-next');
    await p.choose('GQ1', 1);
    await p.fill('#qv-ta-GQ1', 'Partly done.');
    await p.leaveView();
    await p.state({ sessionId: 'sB', participantId: 'P22', phase: 'setup', run: 1, completedRuns: [], backup: { trials: 0, kinL: 0, kinR: 0, final: false, exportTs: '' }, info: '' });
    await wait(300);
    const B_DONE = { sessionId: 'sB', participantId: 'P22', sessionPrefix: 'P22_', filePrefix: 'P22_', phase: 'complete', run: 1, plannedRuns: 1, info: info('P22', START), backup: { trials: 0, kinL: 0, kinR: 0, final: true, exportTs: '2026-10-22T14-00-00' } };
    await p.state(B_DONE);
    await wait(400);
    ok((await p.checks('g8-checks')).some(l => l === 'bad:The questionnaires for P21 are not finished. Finish or skip them using the banner at the top.') && await p.E(() => document.getElementById('g-quest-go').disabled), 'a started questionnaire for the previous participant must be finished or skipped first');
    await p.click('#g-quest-other-skip');
    ok(await p.shown('#g-quest-other-skip-confirm'), 'Skip in the banner asks for confirmation');
    await p.E(() => { const make = WebSpheresZip.make; WebSpheresZip.make = (files) => new Promise(r => setTimeout(r, 1500)).then(() => make(files)); });
    const skipZip = await p.nextDownload(async () => {
      await p.click('#g-quest-other-skip-yes');
      await wait(300);
      await p.state(B_DONE);
    }, 8000);
    await wait(400);
    ok(skipZip && skipZip.suggestedFilename() === `P21_${TS}-questionnaires.zip`, 'the skip is saved in its own ZIP, as the previous session\'s blocks were already downloaded (' + (skipZip && skipZip.suggestedFilename()) + ')');
    const rows = Q.readRaw((await zipFiles(skipZip)).find(f => f.path === `questionnaires/P21_questionnaire-${TS}.csv`).text).rows;
    ok(rows.every(r => r.Status === 'skipped' && r.ID === 'P21') && rows.find(r => r.ItemID === 'GQ1').FollowUpText === 'Partly done.', 'the ZIP records the skip and keeps the answer already given');
    ok(await p.E(() => window.__obs.quest.sessionId === 'sB' && window.__obs.quest.status === 'pending'), 'the next session then gets its questionnaire');
    ok(!(await p.idb('sessions')).some(r => r.id === 'sA'), 'the previous session\'s copy is cleared even though the questionnaire moved on while the ZIP was being made');
    ok(p.errs.length === 0, 'no page errors (' + p.errs.join(' | ') + ')');
    await ctx.close();
  }

  console.log('RESUME FROM THE LAPTOP COPY AFTER BOTH PAGES RELOADED');
  {
    const ctx = await b.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 900 } });
    const p = await observer(ctx);
    await p.complete();
    await wait(300);
    await p.state();
    await wait(300);
    ok((await p.idb('runs')).map(r => r.run).join() === '1,2', 'the laptop copy holds both blocks');
    await p.click('#g-quest-go');
    await wait(150);
    await p.click('#qv-next');
    await p.choose('GQ1', 2);
    await p.fill('#qv-ta-GQ1', 'Kept on the laptop.');
    await wait(600);
    await p.reload();
    await wait(400);
    await p.connect();
    await p.state({ sessionId: 'sNEW', participantId: '', phase: 'setup', run: 1, completedRuns: [], backup: { trials: 0, kinL: 0, kinR: 0, final: false, exportTs: '' }, info: '' });
    await wait(500);
    const banner = await p.text('#g-recovery');
    ok(banner.includes('Unsaved session: P21') && banner.includes('questionnaires not finished') && banner.includes('Hand back to participant'), 'the stored session offers to hand the questionnaire back');
    await p.E(() => { const s = indexedDB.open('webspheres-laptop-copy', 1); s.onsuccess = () => { const t = s.result.transaction('sessions', 'readwrite').objectStore('sessions'); const g = t.get('sA'); g.onsuccess = () => { const r = g.result; r.questionnaire.state.answers.GQ2 = { value: 'Left', text: 'Added after the page loaded.' }; t.put(r); }; }; });
    await wait(300);
    const recovered = await p.nextDownload(() => p.E(() => [...document.querySelectorAll('#g-recovery button')].find(x => x.textContent === 'Download ZIP').click()));
    const recRows = Q.readRaw((await zipFiles(recovered)).find(f => f.path.startsWith('questionnaires/')).text).rows;
    ok(recRows.find(r => r.ItemID === 'GQ2').FollowUpText === 'Added after the page loaded.', 'Download ZIP reads the stored copy as it is now, not as it was at page load');
    await p.E(() => [...document.querySelectorAll('#g-recovery button')].find(x => x.textContent === 'Hand back to participant').click());
    await wait(500);
    ok(await p.shown('#qv') && await p.E(() => window.__obs.quest.state.answers.GQ1 && window.__obs.quest.state.answers.GQ1.text === 'Kept on the laptop.'), 'the participant screen opens with the stored answers');
    await p.fillAll();
    await p.E(() => { const s = window.__obs.quest.state; s.page = 4; s.reached = 4; });
    await p.click('#qv-tabs .qv-tab:nth-child(1)');
    await p.click('#qv-tabs .qv-tab:nth-child(4)');
    const fin = await p.nextDownload(() => p.click('#qv-next'));
    const finFiles = fin ? await zipFiles(fin) : [];
    ok(fin && /-final\.zip$/.test(fin.suggestedFilename()) && finFiles.some(f => f.path.startsWith('block2/P21_block2_vr-session-data')) && finFiles.some(f => f.path.startsWith('questionnaires/P21_questionnaire-')), 'submitting saves a final ZIP with the stored blocks and the answers (' + (fin && fin.suggestedFilename()) + ')');
    await wait(400);
    ok(!(await p.idb('sessions')).some(r => r.id === 'sA'), 'the stored copy is then cleared');
    ok(p.errs.length === 0, 'no page errors (' + p.errs.join(' | ') + ')');
    await ctx.close();
  }

  console.log('BROWSER STORAGE FAILS');
  {
    const ctx = await b.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 900 } });
    const p = await observer(ctx, (pg) => pg.addInitScript(() => { IDBObjectStore.prototype.put = function () { throw new Error('quota'); }; }));
    await p.complete();
    await wait(300);
    await p.click('#g-quest-go');
    await wait(150);
    await p.click('#qv-next');
    await p.choose('GQ1', 1);
    await wait(700);
    await p.hold(2300);
    ok((await p.text('#qv-menu-text')).includes('held in memory only'), 'the experimenter menu says the answers are only in memory');
    await p.click('#qv-menu-leave');
    await wait(300);
    const lines = await p.checks('g8-checks');
    ok(lines.includes('bad:Browser storage is not working, so the answers are held in memory only. Do not reload or close this page.') && !lines.some(l => l.includes('The answers are kept')), 'step 8 warns that the answers are only in memory');
    await ctx.close();
  }

  console.log('QUESTIONNAIRE CORE MISSING');
  {
    const ctx = await b.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 900 } });
    const p = await observer(ctx, (pg) => pg.route('**/questionnaire-core.js', r => r.abort()));
    await p.complete({ endReason: 'ended-early' });
    await wait(500);
    ok((await p.checks('g8-checks')).includes('bad:The questionnaire files did not load. Reload this page.') && await p.E(() => document.getElementById('g-quest-go').disabled), 'step 8 says the questionnaire files did not load');
    await p.click('#g-quest-skip');
    await p.nextDownload(() => p.click('#g-quest-skip-yes'));
    await wait(400);
    ok(await p.openStep() === 9 && (await p.checks('g9-files')).includes('warn:Questionnaires skipped. The questionnaire files did not load, so the skip could not be recorded in the ZIP.'), 'Finish is reached and says the skip could not be recorded');
    const unexpected = p.errs.filter(e => !/WebSpheresQuestionnaires is not defined/.test(e));
    ok(unexpected.length === 0, 'the guide keeps working: no page errors other than the definition files that need the core (' + unexpected.join(' | ') + ')');
    await ctx.close();
  }

  console.log('ONE DEFINITION FILE MISSING');
  {
    const ctx = await b.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 900 } });
    const p = await observer(ctx, (pg) => pg.route('**/questionnaires/imi-teq.js', r => r.abort()));
    await p.complete({ endReason: 'ended-early' });
    await wait(400);
    ok((await p.checks('g8-checks')).some(l => l.startsWith('bad:IMI-TEQ is listed in questionnaires/study.js')) && await p.E(() => document.getElementById('g-quest-go').disabled) && await p.shown('#g-quest-skip'), 'step 8 names the missing questionnaire, offers Skip and no hand-over');
    await p.click('#g-quest-skip');
    const skipZip = await p.nextDownload(() => p.click('#g-quest-skip-yes'));
    const rows = Q.readRaw((await zipFiles(skipZip)).find(f => f.path === `questionnaires/P21_questionnaire-${TS}.csv`).text).rows;
    ok(rows.length === 3 && rows.map(r => r.QuestionnaireID).join() === 'GAME,SUS,IMI-TEQ' && rows.every(r => r.Status === 'skipped'), 'the skip is recorded, one row per listed questionnaire');
    await wait(300);
    ok((await p.checks('g9-files')).includes('ok:Questionnaires skipped. The skip is recorded in the questionnaire files.'), 'Finish says the skip is in the ZIP');
    await ctx.close();
  }

  console.log('PARTIAL SAVES ARE NOT NAMED FINAL');
  {
    const ctx = await b.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 900 } });
    const p = await observer(ctx);
    await p.state({ backup: { trials: 10, kinL: 4, kinR: 5, final: true, exportTs: TS } });
    await p.rows();
    await wait(400);
    ok(p.dls.length === 0, 'no automatic save while the laptop copy is behind');
    await p.fillAll();
    const alone = await p.nextDownload(() => p.E(() => window.__obs.questFinish('submitted')));
    ok(alone && /^P21_[\dT-]+-questionnaires\.zip$/.test(alone.suggestedFilename()), 'the answers are saved on their own (' + (alone && alone.suggestedFilename()) + ')');
    await wait(300);
    const partial = await p.nextDownload(() => p.E(() => document.getElementById('g-save-again').click()));
    ok(partial && /^P21_[\dT-]+\.zip$/.test(partial.suggestedFilename()) && !partial.suggestedFilename().includes('final'), 'Download ZIP again with an incomplete laptop copy is not named final (' + (partial && partial.suggestedFilename()) + ')');
    ok(await leaveWarns(p), 'leaving still warns until the complete ZIP is saved');
    await ctx.close();
  }

  console.log('RESUMED SESSION: ONE STORED COPY');
  {
    const ctx = await b.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 900 } });
    const p = await observer(ctx);
    await p.E(() => { window.__obs.backup.storeId = 'sOLD'; window.__obs.backup.sessionId = 'sA'; });
    await p.complete();
    await wait(300);
    ok(await p.E(() => window.__obs.quest.storeId === 'sOLD'), 'the questionnaire uses the same stored copy as the blocks');
    await p.click('#g-quest-go');
    await wait(150);
    await p.click('#qv-next');
    await p.choose('GQ1', 1);
    await wait(700);
    const ids = (await p.idb('sessions')).map(r => r.id);
    ok(ids.includes('sOLD') && !ids.includes('sA'), 'the answers are stored with the blocks, not in a second record');
    await p.leaveView();
    await p.fillAll();
    await p.nextDownload(() => p.E(() => window.__obs.questFinish('submitted')));
    await wait(500);
    ok((await p.idb('sessions')).length === 0, 'after the final ZIP nothing is left behind');
    await ctx.close();
  }

  await b.close();
  done();
})().catch(e => { console.error(e); process.exit(2); });
