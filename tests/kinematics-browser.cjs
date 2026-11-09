const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { ROOT, serve, launch, counter } = require('./harness.cjs');
const { ok, done } = counter('KINEMATICS BROWSER');
const Z = new Function(fs.readFileSync(path.join(ROOT, 'zip-writer.js'), 'utf8') + ';return WebSpheresZip;')();
const STAMP = '2026-11-10T10-00-00';
const HEADER = 'Timestamp,HandX,HandY,HandZ,HomeX,HomeY,HomeZ,TargetX,TargetY,TargetZ\n';
const STEP_MS = 1000 / 90;
const HOME = [0, 1, 0];
const RADIUS = 0.5;
const TRIALS = 11;
const REST_MS = 1000, MOVE_START_MS = 250, MOVE_END_MS = 800, BACK_MS = 700;
const hands = (t) => (t % 2 ? 'LEFT' : 'RIGHT');
const targetAt = (t) => { const a = (-40 + 8 * (t - 1)) * Math.PI / 180; return [RADIUS * Math.sin(a), 1, -RADIUS * Math.cos(a)]; };
const minJerk = (s) => 10 * s ** 3 - 15 * s ** 4 + 6 * s ** 5;
const fixed = (values) => values.map(v => v.toFixed(5)).join(',');

function blockFiles(id, n) {
  const onset = (t) => (t - 1) * (REST_MS + MOVE_END_MS + BACK_MS) + REST_MS;
  const contact = (t) => onset(t) + MOVE_END_MS;
  const positionFor = (label, ms) => {
    for (let t = 1; t <= TRIALS; t++) {
      if (hands(t) !== label) continue;
      const start = onset(t) + MOVE_START_MS, end = contact(t), back = end + BACK_MS;
      if (ms < start || ms > back) continue;
      const target = targetAt(t);
      const s = ms <= end ? minJerk((ms - start) / (end - start)) : 1 - minJerk((ms - end) / BACK_MS);
      return HOME.map((h, i) => h + (target[i] - h) * s);
    }
    return HOME;
  };
  const kinematics = (label) => {
    let out = HEADER;
    const finish = contact(TRIALS) + BACK_MS;
    for (let i = 0; i * STEP_MS <= finish; i++) {
      const ms = Math.round(i * STEP_MS);
      const trial = Math.min(TRIALS, Math.max(1, Math.floor(ms / (REST_MS + MOVE_END_MS + BACK_MS)) + 1));
      out += `${ms},${fixed(positionFor(label, ms))},${fixed(HOME)},${fixed(targetAt(trial))}\n`;
    }
    return out;
  };
  let behaviour = 'Trial,Timestamp,Target,Hand,Points,HitType,DecisionTime,TotalMovementTime,RecentreCount,ParticipantID,Block\n';
  for (let t = 1; t <= TRIALS; t++) behaviour += `${t},${contact(t)},${t},${hands(t)},5,normal,350,${MOVE_END_MS},0,${id},${n}\n`;
  return { behaviour, left: kinematics('LEFT'), right: kinematics('RIGHT') };
}

async function sessionZip(id, options) {
  const o = options || {};
  const data = blockFiles(id, 1);
  const prefix = `${id}_block1_`;
  const info = `Key,Value\nParticipantID,${id}\n${o.dominant === undefined ? '' : `DominantHand,${o.dominant}\n`}SessionStartISO,2026-11-${o.day}T10:10:00.000Z\nEndReason,finished\nCondition,1\nMode,standard\nTotalTrials,${TRIALS}\nTrialsCompleted,${TRIALS}\nBlock,1\nPlan,1:no-boost:headset-on\nGroup,${o.group}\n`;
  const files = [
    { path: `block1/${prefix}vr-session-data-${STAMP}.csv`, parts: [data.behaviour] },
    { path: `block1/${prefix}session-info-${STAMP}.csv`, parts: [info] },
    { path: `block1/${prefix}kinematics-LEFT-${STAMP}.csv`, parts: [o.damaged ? HEADER : data.left] },
    { path: `block1/${prefix}kinematics-RIGHT-${STAMP}.csv`, parts: [data.right] }
  ];
  return Buffer.from(await (await Z.make(files)).arrayBuffer()).toString('base64');
}

const PICKER = () => {
  window.__dir = async (parts) => { let d = await navigator.storage.getDirectory(); for (const x of parts) d = await d.getDirectoryHandle(x, { create: true }); return d; };
  window.showDirectoryPicker = () => window.__dir(['KIN']);
};

const sha = (name) => crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, 'analysis-python', name))).digest('hex');

(async () => {
  console.log('LOCKED FILES');
  const worker = fs.readFileSync(path.join(ROOT, 'analysis-kinematics-worker.js'), 'utf8');
  for (const name of ['kinematics_block_pipeline.py', 'kinematics_batch_pipeline.py', 'kinematics_batch_pipeline_controls.py']) ok(worker.includes(`'${name}': '${sha(name)}'`), `${name} matches its approved checksum`);
  const attributes = fs.readFileSync(path.join(ROOT, '.gitattributes'), 'utf8');
  ok(attributes.includes('analysis-python/kinematics_*.py -text') && attributes.includes('vendor/pyodide/** -text'), 'Git stores the locked scripts and Pyodide byte for byte');
  const html = fs.readFileSync(path.join(ROOT, 'analysis.html'), 'utf8');
  ok(html.includes("connect-src 'none'") && html.includes("worker-src 'self'") && html.includes("script-src 'self';") && !html.includes('unsafe-eval'), 'the page may start its own worker and still cannot contact other sites');

  const b = await launch();
  const ctx = await b.newContext({ viewport: { width: 1707, height: 960 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(PICKER);
  await serve(p);
  await p.goto('https://test.local/analysis.html');
  const put = (parts, name, b64) => p.evaluate(async ([parts, name, b64]) => {
    const w = await (await (await window.__dir(parts)).getFileHandle(name, { create: true })).createWritable();
    await w.write(Uint8Array.from(atob(b64), c => c.charCodeAt(0)));
    await w.close();
  }, [parts, name, b64]);
  const read = (parts, name) => p.evaluate(async ([parts, name]) => (await (await (await window.__dir(parts)).getFileHandle(name)).getFile()).text(), [parts, name]);
  const exists = (parts, name) => p.evaluate(async ([parts, name]) => { try { await (await window.__dir(parts)).getFileHandle(name); return true; } catch (e) { return false; } }, [parts, name]);
  for (const d of [['KIN', 'patients', 'zips'], ['KIN', 'patients', 'history'], ['KIN', 'controls', 'zips'], ['KIN', 'controls', 'history']]) await p.evaluate((x) => window.__dir(x), d);
  const tick = (n, i) => p.locator(`.step[data-step="${n}"] .g-tick input`).nth(i).check();
  const wait = (n) => p.waitForFunction((x) => document.querySelector('.step.open').dataset.step === String(x), n, { timeout: 120000 });
  const msg = (id, t) => p.waitForFunction(([i, x]) => document.getElementById(i).textContent.includes(x), [id, t], { timeout: 240000 });
  const toStep6 = async (group) => {
    await p.goto('https://test.local/analysis.html');
    await p.waitForSelector('.step.open');
    await tick(1, 0); await tick(1, 1); await p.click('[data-next="1"]'); await wait(2);
    await p.click('#g2-choose');
    await msg('g2-msg', 'contains the patients and controls folders');
    await p.click('[data-next="2"]'); await wait(3);
    await p.click(`[data-group="${group}"]`); await p.click('[data-next="3"]'); await wait(4);
    await msg('g4-msg', 'in this folder');
    await tick(4, 0); await tick(4, 1);
    await p.click('[data-next="4"]'); await wait(5);
    await tick(5, 0);
    if (await p.locator('#g5-warned').isVisible()) await p.check('#g5-warned input');
    await p.click('[data-next="5"]'); await wait(6);
  };

  console.log('CHANGED SCRIPT IS REFUSED');
  await put(['KIN', 'controls', 'zips'], '301.zip', await sessionZip('301', { dominant: 'LEFT', group: 'Control', day: 10 }));
  await p.route('**/analysis-python/kinematics_block_pipeline.py', async route => route.fulfill({ body: fs.readFileSync(path.join(ROOT, 'analysis-python/kinematics_block_pipeline.py'), 'utf8') + '\n# changed\n', contentType: 'text/plain' }));
  await toStep6('controls');
  await p.click('#g6-run');
  await msg('g6-msg', 'could not be calculated');
  ok((await p.locator('#g6-msg').innerText()).includes('kinematics_block_pipeline.py is not the approved version'), 'a script that differs from the approved version is refused and named');
  ok(await p.locator('[data-next="6"]').isDisabled(), 'Next stays disabled after a failure');
  await p.unroute('**/analysis-python/kinematics_block_pipeline.py');

  console.log('CONTROLS, REAL PYTHON');
  await put(['KIN', 'controls', 'zips'], '302.zip', await sessionZip('302', { dominant: 'RIGHT', group: 'Control', day: 11 }));
  await put(['KIN', 'controls', 'zips'], '303.zip', await sessionZip('303', { group: 'Control', day: 12 }));
  await toStep6('controls');
  ok(await p.locator('[data-next="6"]').isDisabled(), 'Next is disabled until the kinematics are calculated');
  const started = Date.now();
  await p.click('#g6-run');
  await msg('g6-msg', 'Calculated 3 blocks');
  console.log(`  calculated in ${Math.round((Date.now() - started) / 1000)} s`);
  ok((await p.locator('#kin-totals').innerText()) === '33 of 33 trials passed the quality checks. kinematicsDB_controls.csv will contain 33 reaches.', 'totals are shown');
  ok((await p.locator('#kin-comparison').innerText()) === 'This will be the first kinematics master for this group.', 'the first kinematics master is explained');
  ok((await p.locator('#kin-problems-list').innerText()).includes('Participant 303: handedness is not known'), 'a control with no recorded handedness is named');
  ok(await p.locator('[data-next="6"]').isDisabled(), 'the problem must be acknowledged');
  await p.check('#g6-problems input');
  await p.click('[data-next="6"]'); await wait(7);
  await p.click('#g7-save');
  await msg('g7-msg', 'Saved handDB_controls.csv with 33 trials, and kinematicsDB_controls.csv with 33 reaches.');
  const controlsCsv = (await read(['KIN', 'controls'], 'kinematicsDB_controls.csv')).trim().split('\n');
  const head = controlsCsv[0].split(',');
  ok(head.length === 74 && head[0] === 'block_id' && head.slice(-5).join() === 'cohort,dominant_hand,non_dominant_hand,hand_role,is_non_dominant_reach', 'the controls master has the same 74 columns as your controls script');
  const rows = controlsCsv.slice(1).map(line => Object.fromEntries(line.split(',').map((v, i) => [head[i], v])));
  const first = (id) => rows.filter(r => r.participant_id === id);
  ok(first('301')[0].block_id === '301/s1/baseline-1' && first('301')[0].session === 's1', 'block IDs use the same participant, session and block as handDB');
  ok(first('301').every(r => r.dominant_hand === 'LEFT' && r.hand_role === (r.hand === 'LEFT' ? 'dominant' : 'non_dominant')), 'a recorded left-hander is labelled from their session');
  ok(first('302').every(r => r.dominant_hand === 'RIGHT' && r.is_non_dominant_reach === (r.hand === 'LEFT' ? 'True' : 'False')), 'a recorded right-hander is labelled from their session');
  ok(first('303').every(r => r.dominant_hand === '' && r.hand_role === 'unknown' && r.is_non_dominant_reach === 'False'), 'no recorded handedness gives blank hand columns, not a guess');
  const peaks = rows.map(r => +r.peak_velocity_m_s);
  ok(peaks.every(v => v > 1.4 && v < 1.9), `peak speed matches the synthetic reach (${Math.min(...peaks).toFixed(2)} to ${Math.max(...peaks).toFixed(2)} m/s)`);
  const hand = (await read(['KIN', 'controls'], 'handDB_controls.csv')).trim().split('\n');
  ok(hand[0].endsWith('"Group","DominantHand","LessAffectedHand"') && hand[1].endsWith('"Control","LEFT",""'), 'handDB carries the recorded dominant hand');
  const details = await p.evaluate(async () => { const out = []; for await (const [n] of (await window.__dir(['KIN', 'controls', 'kinematics_details'])).entries()) out.push(n); return out.sort(); });
  ok(details.includes('all_trial_metrics.csv') && details.includes('all_block_audit.csv') && details.includes('kinematics_non_dominant_valid_reaches.csv') && details.includes('batch_summary.json'), 'the supporting files are saved together');
  const report = await read(['KIN', 'controls'], 'report_controls.txt');
  ok(report.includes('Pipeline version: 2026-08-09-coordinate-audit-v5') && report.includes('90 Hz, 6 Hz low-pass') && report.includes('pyodide 314.0.4') && report.includes('kinematics_batch_pipeline.py: 567fc333'), 'the report names the versions, filter and scripts');
  const summary = JSON.parse(await read(['KIN', 'controls', 'kinematics_details'], 'batch_summary.json'));
  ok(summary.left_handed_participants.join() === '301' && summary.handedness_not_known.join() === '303' && !summary.handedness_rule.includes('002'), 'the summary describes the recorded handedness, not the old fixed rule');

  console.log('NOTHING NEW');
  await toStep6('controls');
  await p.click('#g6-run');
  await msg('g6-msg', 'Calculated 3 blocks');
  ok((await p.locator('#kin-comparison').innerText()) === '0 new reaches, and 0 existing rows changed.', 'running again gives exactly the same kinematics master');
  await p.check('#g6-problems input');
  await p.click('[data-next="6"]'); await wait(7);
  ok((await p.locator('#g7-say').innerText()) === 'The master files are already up to date.' && await p.locator('[data-next="7"]').isEnabled(), 'nothing needs saving');

  console.log('THE MASTER GROWS');
  const beforeGrowth = await read(['KIN', 'controls'], 'kinematicsDB_controls.csv');
  await put(['KIN', 'controls', 'zips'], '304.zip', await sessionZip('304', { dominant: 'RIGHT', group: 'Control', day: 15 }));
  await toStep6('controls');
  await p.click('#g6-run');
  await msg('g6-msg', 'Calculated 4 blocks');
  ok((await p.locator('#kin-comparison').innerText()) === '11 new reaches, and 0 existing rows changed.', 'a new session is reported as additions only');
  await p.check('#g6-problems input');
  await p.click('[data-next="6"]'); await wait(7);
  await p.click('#g7-save');
  await msg('g7-msg', 'kinematicsDB_controls.csv with 44 reaches');
  const afterGrowth = (await read(['KIN', 'controls'], 'kinematicsDB_controls.csv')).trim().split('\n');
  const earlier = beforeGrowth.trim().split('\n');
  ok(afterGrowth.length === 45 && earlier.every(line => afterGrowth.includes(line)), 'the kinematics master keeps every earlier row exactly and adds the new session');
  ok(afterGrowth.filter(line => line.startsWith('304/s1/')).length === 11, 'the new session is in the kinematics master');
  const kinHistory = await p.evaluate(async () => { const out = []; for await (const [n] of (await window.__dir(['KIN', 'controls', 'history'])).entries()) out.push(n); return out.filter(n => n.startsWith('kinematicsDB_controls-')); });
  ok(kinHistory.length === 1 && (await read(['KIN', 'controls', 'history'], kinHistory[0])) === beforeGrowth, 'the previous kinematics master is kept in history');

  console.log('PATIENTS AND A DAMAGED BLOCK');
  await put(['KIN', 'patients', 'zips'], '401.zip', await sessionZip('401', { dominant: 'RIGHT', group: 'Patient', day: 13 }));
  await put(['KIN', 'patients', 'zips'], '402.zip', await sessionZip('402', { dominant: 'RIGHT', group: 'Patient', day: 14, damaged: true }));
  await put(['KIN', 'patients', 'zips'], '403.zip', await sessionZip('403', { dominant: 'LEFT', group: 'Patient', day: 16 }));
  await put(['KIN', 'patients', 'zips'], '404.zip', await sessionZip('404', { group: 'Patient', day: 17 }));
  await toStep6('patients');
  await p.click('#g6-run');
  await msg('g6-msg', 'Calculated 3 blocks');
  ok((await p.locator('#kin-problems-list').innerText()).includes('402/s1/baseline-1: this block could not be processed') && (await p.locator('#kin-problems-list').innerText()).includes('fewer than two usable timestamps'), 'a block the script cannot process is named with its reason');
  ok((await p.locator('#kin-problems-list').innerText()).includes('Participant 404: the less affected hand is not known, so the less affected and more affected hand columns are blank.'), 'a patient with no recorded less affected hand is named');
  await p.check('#g6-problems input');
  await p.click('[data-next="6"]'); await wait(7);
  await p.click('#g7-save');
  await msg('g7-msg', 'Saved handDB_patients.csv with 44 trials, and kinematicsDB_patients.csv with 33 reaches.');
  const patientsCsv = (await read(['KIN', 'patients'], 'kinematicsDB_patients.csv')).trim().split('\n');
  const patientsHead = patientsCsv[0].split(',');
  ok(patientsHead.length === 73 && patientsHead.slice(0, 69).join() === head.slice(0, 69).join() && !patientsHead.includes('dominant_hand'), 'the patients master starts with the same 69 columns as your patient script');
  ok(patientsHead.slice(-4).join() === 'less_affected_hand,more_affected_hand,hand_role,is_more_affected_reach', 'the affected hand columns are added at the end');
  const patientRows = patientsCsv.slice(1).map(line => Object.fromEntries(line.split(',').map((v, i) => [patientsHead[i], v])));
  const patient = (id) => patientRows.filter(r => r.participant_id === id);
  ok(patient('401').length === 11 && patient('401').every(r => r.less_affected_hand === 'RIGHT' && r.more_affected_hand === 'LEFT' && r.hand_role === (r.hand === 'LEFT' ? 'more_affected' : 'less_affected') && r.is_more_affected_reach === (r.hand === 'LEFT' ? 'True' : 'False')), 'a patient whose less affected hand is the right hand is labelled from their session');
  ok(patient('403').length === 11 && patient('403').every(r => r.less_affected_hand === 'LEFT' && r.more_affected_hand === 'RIGHT' && r.is_more_affected_reach === (r.hand === 'RIGHT' ? 'True' : 'False')), 'a patient whose less affected hand is the left hand is labelled from their session');
  ok(patient('404').length === 11 && patient('404').every(r => r.less_affected_hand === '' && r.more_affected_hand === '' && r.hand_role === 'unknown' && r.is_more_affected_reach === 'False'), 'no recorded less affected hand gives blank hand columns, not a guess');
  ok(new Set(patientRows.map(r => r.hand)).size === 2, 'the synthetic patients reach with both hands');
  const plain = await p.evaluate(async (sessions) => {
    const blob = (text) => new Blob([text], { type: 'text/csv' });
    const blocks = sessions.map(s => ({ blockId: `${s.id}/s1/baseline-1`, blockName: 'baseline-1', participantId: s.id, session: 's1', behaviour: blob(s.behaviour), left: blob(s.left), right: blob(s.right) }));
    return new Promise((resolve) => {
      const worker = new Worker('/analysis-kinematics-worker.js', { type: 'module' });
      worker.onmessage = ({ data }) => { if (data.type === 'done' || data.type === 'failed') { worker.terminate(); resolve(data); } };
      worker.postMessage({ group: 'unlabelled', blocks, dominant: {} });
    });
  }, ['401', '403', '404'].map(id => ({ id, ...blockFiles(id, 1) })));
  const plainLines = ((plain.files || []).find(f => f.name === 'kinematics_all_valid_reaches_master.csv') || { text: '' }).text.trim().split('\n');
  ok(plainLines.length === 34 && plainLines[0].split(',').length === 69 && plainLines.every((line, i) => patientsCsv[i].startsWith(line + ',') && patientsCsv[i].slice(line.length + 1).split(',').length === 4), 'every value the script wrote is unchanged, character for character, with the four columns added after it');
  const patientSummary = JSON.parse(await read(['KIN', 'patients', 'kinematics_details'], 'batch_summary.json'));
  ok(patientSummary.less_affected_hand_not_known.join() === '404' && patientSummary.affected_hand_rule.includes('less affected hand'), 'the summary describes where the affected hand comes from');
  ok(await exists(['KIN', 'patients', 'kinematics_details'], 'processing_errors.csv'), 'the processing errors are saved');
  ok(errs.length === 0, 'no page errors: ' + errs.join('; '));
  await b.close();
  done();
})().catch(e => { console.log('THREW', e.message.slice(0, 800)); process.exit(1); });
