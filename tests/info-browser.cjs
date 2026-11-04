const { serve, launch, counter } = require('./harness.cjs');
const { ok, done } = counter('INFO BROWSER');

const TOP = {
  trial: 'Trials completed in the current run, out of the planned total.',
  score: 'Points earned in the current run.',
  cond: 'No boost: Both hands have a 30% critical-hit chance.\nBoost: The non-dominant hand has a 55% chance; the dominant hand has a 5% chance.',
  dom: 'The dominant hand has a lower critical-hit chance during Boost.',
  fire: 'Fire mode activates after three consecutive non-dominant-hand critical hits and ends after any dominant-hand hit. It does not affect points.'
};
const DRAWER = {
  target: 'Current target number (1–11), matching the trial data file.',
  recentre: 'Time of last recentre.',
  hand: 'Tracked: The hand is currently tracked.\nLost: The hand was tracked but is no longer tracked.\nNo data: No tracking data have been received yet.',
  headh: 'Height above floor.',
  rows: 'Counts of rows received on the laptop and recorded on the headset. Matching counts mean the laptop is up to date so far.',
  uptime: 'Time since link started.',
  rate: 'Frequency of updates to the laptop 3D view. This is not the headset recording rate.',
  age: 'Time since the last update. Normally less than 1 s.',
  gap: 'Longest gap between updates in the last 10 s. Normally less than 1 s.',
  stale: 'Out-of-order updates are ignored. Saved data are unaffected.',
  fps: 'Frame rate of the laptop 3D view, not the headset or recorded data.',
  reconnects: 'Number of connections restored since this page was opened.',
  error: 'Most recent connection error, if any.'
};
const LABELS = {
  '#g-hide': 'Hide guide', '#g-confirm': 'Send to headset', '#g-save-headset': 'Save headset copy', '#g-new-reload': 'Reload this page',
  '#save-backup': 'Save laptop copy', '[data-view="pov"]': 'Participant view', '#recentre': 'Recentre', '#btn-readouts': 'Status', '#btn-help': 'Keys',
  '[data-calib="lap"]': 'Calibrate home'
};

(async () => {
  const b = await launch();
  const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await serve(p);
  await p.clock.install();
  await p.goto('https://test.local/observer.html');
  await p.waitForFunction(() => window.__peers && window.__peers.length > 0 && window.__obs);
  const E = (fn, arg) => p.evaluate(fn, arg);
  const tick = (ms) => p.clock.runFor(ms || 300);
  const pop = () => E(() => { const el = document.getElementById('info-pop'); return el.hidden ? null : el.textContent; });
  const hoverOff = () => p.mouse.move(700, 500);
  const health = () => E(() => { const el = document.getElementById('r-health'); return { text: el.textContent, cls: el.className }; });
  const peer = (d) => E((m) => window.__c.emit('data', JSON.stringify(m)), d);

  console.log('BUTTON NAMES');
  for (const [sel, want] of Object.entries(LABELS)) {
    ok(await E((s) => document.querySelector(s).textContent, sel) === want, `${sel} reads "${want}"`);
  }

  console.log('TOP BAR EXPLANATIONS');
  for (const [key, want] of Object.entries(TOP)) {
    await p.hover(`#topbar [data-info="${key}"]`); await tick(50);
    ok(await pop() === want, `hover ${key} shows the approved text`);
  }
  await hoverOff(); await tick(50);
  ok(await pop() === null, 'moving away closes the explanation');

  console.log('CLICK TO PIN');
  await p.click('#topbar [data-info="trial"]'); await hoverOff(); await tick(50);
  ok(await pop() === TOP.trial, 'click keeps the explanation open after the mouse leaves');
  await p.click('#topbar [data-info="trial"]'); await tick(50);
  ok(await pop() === null, 'second click closes it');
  await p.click('#topbar [data-info="score"]'); await tick(50);
  await p.mouse.click(700, 500); await tick(50);
  ok(await pop() === null, 'clicking elsewhere closes it');
  await p.click('#topbar [data-info="score"]'); await tick(50);
  await p.keyboard.press('Escape'); await tick(50);
  ok(await pop() === null, 'Esc closes it');
  const box = await E(() => { const r = document.getElementById('info-pop').getBoundingClientRect(); return r; });
  await p.click('#topbar [data-info="fire"]'); await tick(50);
  const fit = await E(() => { const r = document.getElementById('info-pop').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; });
  ok(!!box && fit, 'explanation stays inside the window');
  await p.keyboard.press('Escape');

  console.log('CONNECTION STATUS EXPLANATIONS');
  const status = async (state, want) => {
    await E((st) => window.__obs.receiver.setStatus(st, ''), state);
    await p.click('[data-info="conn"]'); await tick(50);
    ok(await pop() === want, `${state}: "${want}"`);
    await p.click('[data-info="conn"]'); await tick(50);
  };
  await status('connecting', 'Searching for the headset. Check that WebSpheres is open in VR or AR.');
  ok(await E(() => document.getElementById('conn-dot').offsetParent !== null), 'dot shows when not connected');
  await status('reconnecting', 'Connection lost. Trying to reconnect.');
  await status('notfound', 'Headset not found. Check that WebSpheres is open. Retrying automatically.');
  await status('error', 'Connection error. Retrying automatically. If the problem continues, check your internet connection and reload this page.');

  await E(() => { const P = window.__peers.at(-1); P.serverOpen(); const c = P.conns.at(-1); window.__c = c; c.open = true; c.emit('open'); });
  await peer({ type: 'state', version: '2.5.5', phase: 'running', participantId: 'P1', experimenter: 'Jo', dominantHand: 'LEFT', condition: 1, mode: 'standard', totalTrials: 352, setupLocked: true, calib: null, recentred: true, cue: null, sessionMs: 0, trialCount: 0, recentreCount: 0, pauses: 0, backup: { trials: 0, kinL: 0, kinR: 0, final: false, exportTs: '' }, info: '' });
  await tick(50);
  await status('connected', 'Live data arriving.');
  ok(await E(() => document.getElementById('conn-dot').offsetParent === null), 'no dot when connected');
  await status('reconnecting', 'Connection lost. Trying to reconnect. The headset continues recording.');
  await E(() => window.__obs.receiver.setStatus('connected', ''));

  console.log('STATUS PANEL');
  await p.click('#btn-readouts'); await tick(300);
  ok(await E(() => document.querySelector('#drawer-readouts h2').textContent) === 'Status', 'panel titled Status');
  ok(await E(() => { const d = document.querySelector('#drawer-readouts details'); return d && !d.open && d.querySelector('summary').textContent === 'Technical details'; }), 'figures start collapsed under Technical details');
  ok(await E(() => document.getElementById('r-health').checkVisibility() && !document.getElementById('r-gap').checkVisibility()), 'summary line visible, figures hidden');
  const labels = await E(() => [...document.querySelectorAll('#drawer-readouts details .ro-row > span:first-child')].map(s => s.firstChild.textContent));
  ok(labels.join('|') === 'Status|Connected for|Live updates per second|Data age|Longest wait, last 10 s|Late updates discarded|3D view smoothness|Reconnects|Last error', 'technical labels renamed');
  await p.click('#drawer-readouts summary'); await tick(100);
  for (const [key, want] of Object.entries(DRAWER)) {
    await p.hover(`#drawer-readouts [data-info="${key}"]`); await tick(50);
    ok(await pop() === want, `hover ${key} shows the approved text`);
  }
  await hoverOff();

  console.log('CONNECTION SUMMARY');
  const sendFrames = async () => { for (let i = 0; i < 110; i++) { await peer({ head: { px: 0, py: 1.2, pz: 0, qx: 0, qy: 0, qz: 0, qw: 1 }, trialCount: 0, totalTrials: 352, homePos: { x: 0, y: 0.9, z: -0.4 } }); await tick(100); } };
  await sendFrames(); await tick(260);
  let h = await health();
  ok(h.text === 'Connected: Live data are arriving.' && h.cls === 'good', `Healthy (${h.text})`);
  await tick(1400);
  h = await health();
  ok(h.text === 'Unstable: Live updates are intermittent. The headset continues recording.' && h.cls === 'warn', `Unstable (${h.text})`);
  await E(() => window.__obs.receiver.setStatus('reconnecting', ''));
  await tick(260);
  h = await health();
  ok(h.text === 'Disconnected: No live data are arriving. The headset continues recording.' && h.cls === 'bad', `Down (${h.text})`);
  await peer({ type: 'state', version: '2.5.5', phase: 'setup', participantId: '', experimenter: '', dominantHand: 'LEFT', condition: 1, mode: 'standard', totalTrials: 352, setupLocked: false, calib: null, recentred: false, cue: null, sessionMs: 0, trialCount: 0, recentreCount: 0, pauses: 0, backup: { trials: 0, kinL: 0, kinR: 0, final: false, exportTs: '' }, info: '' });
  await E(() => window.__obs.receiver.setStatus('reconnecting', ''));
  await tick(260);
  h = await health();
  ok(h.text === 'Disconnected: No live data are arriving.', `outside a session, no claim about recording (${h.text})`);

  console.log('KEYS PANEL');
  await p.click('#btn-help'); await tick(100);
  const help = await E(() => document.getElementById('help').textContent);
  ok(help.includes('Keyboard shortcuts are off by default. Turn them on under Settings → Keyboard control.') && help.includes('Calibrate home') && help.includes('Save headset copy'), 'panel explains keys are off by default');

  ok(errs.length === 0, 'no page errors (' + errs.join(' | ') + ')');
  await b.close();
  done();
})().catch(e => { console.error(e); process.exit(2); });
