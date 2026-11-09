import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const A = require(path.join(root, 'analysis-core.js'));
const Z = new Function(fs.readFileSync(path.join(root, 'zip-writer.js'), 'utf8') + ';return WebSpheresZip;')();

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ FAIL: ' + msg); } };

const HEADER = 'Trial,Timestamp,Target,Hand,Points,HitType,DecisionTime,TotalMovementTime,RecentreCount,ParticipantID,Block\n';
const KIN = 'Timestamp,HandX\n1,0\n';
const STAMP = '2026-11-10T10-00-00';
const hands = ['LEFT', 'RIGHT'];

function trials(id, block, n, edit) {
    let out = HEADER;
    for (let i = 1; i <= n; i++) {
        const row = [i, 1000 * i, ((i - 1) % 11) + 1, hands[i % 2], 5, 'normal', 400 + i, 800 + i, 0, id, block];
        if (edit) edit(row, i);
        out += row.join(',') + '\n';
    }
    return out;
}

function info(values) {
    return 'Key,Value\n' + Object.entries(values).map(([k, v]) => `${k},${v}`).join('\n') + '\n';
}

const planText = (types) => types.map((t, i) => `${i + 1}:${t === 'B' ? 'boost' : 'no-boost'}:headset-on`).join('|');

async function zipOf(name, blocks, extra) {
    const files = [];
    for (const b of blocks) {
        const dir = `block${b.number}`;
        const id = b.id;
        const prefix = `${b.practice ? 'PRACTICE_' : ''}${id}_block${b.number}_`;
        files.push({ path: `${dir}/${prefix}vr-session-data-${STAMP}.csv`, parts: [b.csv || trials(id, b.number, b.n, b.edit)] });
        files.push({ path: `${dir}/${prefix}kinematics-LEFT-${STAMP}.csv`, parts: [KIN] });
        files.push({ path: `${dir}/${prefix}kinematics-RIGHT-${STAMP}.csv`, parts: [KIN] });
        files.push({ path: `${dir}/${prefix}session-info-${STAMP}.csv`, parts: [info(Object.assign({
            ParticipantID: id, AppVersion: '2.8.0', SessionStartISO: b.start, SessionEndISO: b.start, EndReason: b.end || 'finished',
            Condition: b.condition, Mode: b.mode || 'standard', TotalTrials: b.total || b.n, TrialsCompleted: b.n, Block: b.number,
            PlannedBlocks: b.plan.length, Plan: planText(b.plan), SetupChanges: b.changes || ''
        }, b.practice ? { Practice: 1 } : {}))] });
    }
    (extra || []).forEach(f => files.push(f));
    const blob = await Z.make(files);
    return A.readExport(new File([await blob.arrayBuffer()], name));
}

function planBlocks(id, types, n, day, options) {
    return types.map((t, i) => Object.assign({ id, number: i + 1, n, condition: t === 'B' ? 2 : 1, start: `2026-11-${day}T10:${String(10 + i).padStart(2, '0')}:00.000Z`, plan: types }, options));
}

const labels = (r) => r.sessions.flatMap(s => s.items.map(i => i.name));
const phases = (r) => r.sessions.flatMap(s => s.items.map(i => i.phase));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

console.log('LAYOUTS');
{
    const r = A.build([await zipOf('a.zip', planBlocks('101', ['N', 'B'], 352, '10'))]);
    ok(r.rows.length === 704 && r.sessions.length === 1 && r.blocks.length === 2, 'one session of two 352-trial blocks gives 704 rows');
    ok(same(labels(r), ['baseline-1', 'boost-1']) && same(phases(r), ['pre-boost', 'boost']), 'two blocks are labelled from the plan');
    ok(r.rows.every(x => x.Session === 1) && r.rows[0].Condition === 'NM' && r.rows.at(-1).Condition === 'BT', 'session and condition columns are filled');
    ok(!r.warnings.length && !r.stops.length, 'a clean session produces no warnings');
}
{
    const r = A.build([await zipOf('a.zip', planBlocks('102', ['N', 'N', 'B', 'B', 'N', 'N'], 110, '10'))]);
    ok(same(labels(r), ['baseline-1', 'baseline-2', 'boost-1', 'boost-2', 'baseline-3', 'baseline-4']), 'six-block protocol matches the existing names');
    ok(same(phases(r), ['pre-boost', 'pre-boost', 'boost', 'boost', 'post-boost', 'post-boost']), 'six-block phases are correct');
    ok(same(r.blocks.map(b => b.BlockOrder), [1, 2, 3, 4, 5, 6]), 'block order comes from the game');
}
{
    const r = A.build([await zipOf('a.zip', planBlocks('103', ['N', 'B', 'B', 'N'], 44, '10', { mode: 'fmode' }))]);
    ok(same(labels(r), ['baseline-1', 'boost-1', 'boost-2', 'baseline-2']), 'a four-block plan is counted in order');
    ok(phases(r)[3] === 'post-boost', 'the baseline after boost is post-boost');
    ok(r.rows.every(x => x.Mode === 'fmode') && r.rows.every(x => x.BlockType !== 'fatigue'), 'mode is recorded and nothing is labelled fatigue');
}
{
    const r = A.build([await zipOf('a.zip', planBlocks('104', ['B', 'N'], 22, '10'))]);
    ok(same(labels(r), ['boost-1', 'baseline-1']) && same(phases(r), ['boost', 'post-boost']), 'boost first is handled');
    const n = A.build([await zipOf('a.zip', planBlocks('105', ['N', 'N'], 22, '10'))]);
    ok(same(phases(n), ['no-boost', 'no-boost']), 'a session with no boost blocks is marked no-boost');
    const one = A.build([await zipOf('a.zip', planBlocks('106', ['N'], 990, '10', { mode: 'custom' }))]);
    ok(one.rows.length === 990 && one.rows[0].Mode === 'custom', 'a single custom-length block works');
}

console.log('SESSIONS');
{
    const first = await zipOf('s1.zip', planBlocks('201', ['N', 'B'], 11, '10'));
    const second = await zipOf('s2.zip', planBlocks('201', ['N'], 11, '17'));
    const r = A.build([second, first]);
    ok(same(r.sessions.map(s => s.number), [1, 2]) && r.sessions[0].start < r.sessions[1].start, 'sessions are numbered in time order, whatever order the zips arrive');
    ok(r.rows.filter(x => x.Session === 2).length === 11, 'rows carry the right session');
    const day = planBlocks('202', ['N'], 11, '10');
    const later = planBlocks('202', ['B'], 11, '10').map(b => Object.assign(b, { start: '2026-11-10T15:00:00.000Z' }));
    const same_day = A.build([await zipOf('m.zip', day), await zipOf('p.zip', later)]);
    ok(same_day.sessions.length === 2, 'two separate plans on one day are two sessions');
    const resumed = planBlocks('204', ['N', 'B'], 11, '10');
    const parts = A.build([await zipOf('p1.zip', resumed.slice(0, 1)), await zipOf('p2.zip', resumed.slice(1))]);
    ok(parts.sessions.length === 1 && same(labels(parts), ['baseline-1', 'boost-1']) && !parts.warnings.length, 'later blocks of a resumed session stay in that session');
    const again = A.build([await zipOf('w1.zip', planBlocks('205', ['N', 'B'], 11, '10')), await zipOf('w2.zip', planBlocks('205', ['N', 'B'], 11, '17'))]);
    ok(again.sessions.length === 2, 'a later session with the same plan stays separate');
}
{
    const blocks = planBlocks('203', ['N', 'B'], 11, '10');
    const r = A.build([await zipOf('break.zip', blocks.slice(0, 1)), await zipOf('final.zip', blocks)]);
    ok(r.sessions.length === 1 && r.rows.length === 22, 'a cumulative zip counts each block once and joins one session');
    ok(r.notes.some(n => n.includes('most complete copy')), 'the duplicate is reported');
    const short = Object.assign({}, blocks[0], { n: 5 });
    const shortFirst = A.build([await zipOf('part.zip', [short]), await zipOf('final.zip', blocks)]);
    ok(shortFirst.rows.length === 22 && shortFirst.blocks[0].SourceZip === 'final.zip', 'the most complete copy wins');
    const changed = Object.assign({}, blocks[0], { edit: (row, i) => { if (i === 3) row[3] = 'LEFT'; if (i === 3) row[4] = 9; } });
    const clash = A.build([await zipOf('x.zip', [changed]), await zipOf('final.zip', blocks)]);
    ok(clash.stops.length === 1 && clash.stops[0].includes('trials differ'), 'copies that disagree stop the output');
}
{
    const a = await zipOf('a.zip', planBlocks('12', ['N'], 11, '10'));
    const b = await zipOf('b.zip', planBlocks('012', ['N'], 11, '11'));
    const r = A.build([a, b]);
    ok(same(r.sessions.map(s => s.id), ['012', '12']), 'IDs stay exactly as typed and are not merged');
    ok(r.warnings.some(w => w.includes('look alike')), 'similar IDs are warned about');
}

console.log('TRIAL VALUES');
{
    const edit = (row, i) => { if (i === 2) { row[3] = 'NA'; row[4] = 0; row[5] = 'SKIP'; row[6] = 0; } if (i === 3) { row[3] = 'left '; row[5] = 'CRITICAL'; } };
    const r = A.build([await zipOf('a.zip', planBlocks('301', ['N'], 5, '10', { edit }))]);
    const rows = r.rows;
    ok(rows.length === 5, 'skipped trials are kept');
    ok(rows[1].Hand === null && rows[1].HitType === 'skip', 'a skipped trial has no hand and hit type skip');
    ok(rows[2].Hand === 'LEFT' && rows[2].HitType === 'critical', 'hand and hit type are tidied as in pt_pipeline.R');
    ok(rows[0].MovementTime === 801 && rows[0].DecisionTime === 401, 'MovementTime is the game TotalMovementTime');
    const csv = A.toCsv(A.COLUMNS, rows).split('\n');
    ok(csv[0] === '"ID","Session","Block","BlockType","BlockNum","Trial","Target","Hand","Points","HitType","DecisionTime","MovementTime","BlockOrder","Phase","Condition","Mode","Group"', 'handDB columns are in the agreed order');
    ok(csv[1].startsWith('"301",1,"baseline-1","baseline",1,1,1,"RIGHT",5,"normal",401,801,1,"no-boost","NM","standard"'), 'a CSV row is written as expected');
    ok(csv[2].includes(',NA,0,"skip",'), 'a missing hand is written as NA without quotes');
}
{
    const csv = 'HitType,Target,Trial,Hand,TotalMovementTime,Points,DecisionTime,Extra\nnormal,4,1,LEFT,900,3,450,z\n';
    const r = A.build([await zipOf('a.zip', [Object.assign(planBlocks('302', ['N'], 1, '10')[0], { csv })])]);
    const row = r.rows[0];
    ok(row.Trial === 1 && row.Target === 4 && row.Points === 3 && row.DecisionTime === 450 && row.MovementTime === 900, 'columns are found by name, in any order, with extras ignored');
}
{
    const csv = 'Trial,Target,Hand,Points\n1,4,LEFT,3\n';
    const r = A.build([await zipOf('a.zip', [Object.assign(planBlocks('303', ['N'], 1, '10')[0], { csv })])]);
    ok(r.rows.length === 0 && r.setAside[0].reason.includes('HitType'), 'a block missing required columns is set aside and named');
    const bad = 'Trial,Target,Hand,Points,HitType,DecisionTime,TotalMovementTime\n1,4,LEFT,3,normal,1\n';
    const b = A.build([await zipOf('a.zip', [Object.assign(planBlocks('304', ['N'], 1, '10')[0], { csv: bad })])]);
    ok(b.rows.length === 0 && b.setAside[0].reason.includes('wrong number of columns'), 'a damaged trial file is set aside');
}
{
    const old = HEADER.replace('Block', 'Run');
    const x = await zipOf('a.zip', [Object.assign(planBlocks('305', ['N'], 1, '10')[0], { csv: old + '1,1000,4,LEFT,3,normal,1,2,0,305,1\n' })]);
    ok(A.build([x]).rows.length === 1, 'the older Run column name is accepted');
}

console.log('PLANS AND NOTES');
{
    const blocks = planBlocks('401', ['N', 'B'], 11, '10');
    const r = A.build([await zipOf('a.zip', blocks.slice(0, 1))]);
    ok(r.sessions[0].items.length === 2 && r.warnings.some(w => w.includes('no data')), 'a planned block with no data is reported');
    ok(r.rows.length === 11, 'blocks that exist are still used');
    const partial = A.build([await zipOf('a.zip', planBlocks('402', ['N'], 39, '10', { end: 'ended-early', total: 352 }))]);
    ok(partial.rows.length === 39 && partial.notes.some(n => n.includes('ended early')), 'a block ended early is kept and noted');
    const wrong = Object.assign(planBlocks('403', ['N'], 3, '10')[0], { condition: 2 });
    const mis = A.build([await zipOf('a.zip', [wrong])]);
    ok(mis.rows[0].BlockType === 'boost' && mis.warnings.some(w => w.includes('the plan listed')), 'what actually ran is used when it differs from the plan');
    const during = A.build([await zipOf('a.zip', planBlocks('404', ['N'], 3, '10', { changes: '123|2|Condition|1|2' }))]);
    ok(during.warnings.some(w => w.includes('Condition changed')), 'a condition change during a block is warned about');
}
{
    const practice = await zipOf('PRACTICE.zip', planBlocks('501', ['N'], 11, '10', { practice: true }));
    const left = A.build([practice]);
    ok(left.rows.length === 0 && left.practiceLeftOut === 1, 'practice data is left out by default');
    const included = A.build([practice], { includePractice: true });
    ok(included.rows.length === 11 && included.blocks[0].Practice === 'yes', 'practice data can be included for testing');
}
{
    const figures = await Z.make([{ path: 'figure.svg', parts: ['<svg/>'] }]);
    const a = await A.readExport(new File([await figures.arrayBuffer()], 'figures.zip'));
    const lean = await A.readExport(new File([await (await Z.make([{ path: `block1/9_vr-session-data-${STAMP}.csv`, parts: ['a'] }, { path: `block1/9_session-info-${STAMP}.csv`, parts: ['Key,Value\nParticipantID,9\n'] }])).arrayBuffer()], 'lean.zip'), { infoOnly: true });
    ok(lean.blocks[0].info.ParticipantID === '9' && lean.blocks[0].table === undefined, 'reading session-info only skips the trial table');
    const b = await A.readExport(new File(['not a zip at all'], 'broken.zip'));
    const r = A.build([a, b]);
    ok(r.setAside.length === 2 && r.setAside[0].reason.includes('no WebSpheres') && r.setAside[1].reason.includes('could not be read'), 'zips that are not sessions are listed, not used');
}

console.log('OUTPUT FILES');
{
    const zip = await zipOf('a.zip', planBlocks('601', ['N', 'B'], 11, '10'));
    const r = A.build([zip], { group: 'patients' });
    ok(r.rows.every(x => x.Group === 'Patient') && r.blocks[0].Group === 'Patient', 'the group is recorded on every row');
    await A.addChecksums([zip]);
    const files = A.outputFiles([zip], r, '2026-11-10T12:00:00.000Z', 'patients');
    ok(same(files.map(f => f.path), ['handDB_patients.csv', 'blocks_patients.csv', 'report_patients.txt']), 'output has the master, the block summary and a report');
    ok(files[1].parts[0].split('\n').length === 4 && files[1].parts[0].includes('"a.zip"'), 'the block summary has one row per block with its source');
    const report = files[2].parts[0];
    ok(report.includes('Trials: 22') && /a\.zip: [0-9a-f]{64}/.test(report), 'the report has totals and a checksum for each zip');
}

console.log('STUDY FOLDER');
{
    const check = (name, dirs, files, groups) => A.checkStudyFolder({ name, dirs, files, groups: groups || {} });
    const full = { patients: ['zips', 'history'], controls: ['zips'] };
    ok(check('EXP027', ['patients', 'controls', '.git'], [], full).status === 'ok', 'a complete experiment folder is accepted');
    const inside = check('patients', ['zips'], []);
    ok(inside.status === 'wrong' && inside.message.includes('experiment folder that contains it'), 'selecting patients says to go up a level');
    ok(check('zips', [], ['a.zip']).message.includes('two levels above'), 'selecting zips says to go up two levels');
    ok(check('EXP027', ['.git'], ['README.md', '.gitignore']).status === 'setup', 'a new repository can be set up');
    ok(check('EXP027', ['patients'], [], { patients: ['zips'] }).status === 'setup', 'missing folders can be added');
    const wrong = check('exp026', ['Data', '.git'], ['script.R']);
    ok(wrong.status === 'wrong' && wrong.message.includes('not an experiment folder'), 'an unrelated folder is refused and cannot be set up');
    ok(check('constructor', [], []).status === 'setup', 'a folder named after a built-in property is not mistaken for a group');
    const cased = check('EXP027', ['Patients', 'controls'], [], { controls: ['zips'] });
    ok(cased.status === 'wrong' && cased.message.includes('Rename the Patients folder to patients'), 'a capitalised group folder gets a specific fix');
}

console.log('MASTER COMPARISON');
{
    const zip = await zipOf('a.zip', planBlocks('701', ['N', 'B'], 11, '10'));
    const first = A.build([zip], { group: 'patients' });
    const oldText = A.toCsv(A.COLUMNS, first.rows);
    const same_ = A.compareMaster(oldText, first.rows);
    ok(same_.comparable && same_.added === 0 && same_.changed === 0 && same_.missing === 0, 'a rebuild with nothing new changes nothing');
    const more = A.build([zip, await zipOf('b.zip', planBlocks('702', ['N'], 11, '11'))], { group: 'patients' });
    const grown = A.compareMaster(oldText, more.rows);
    ok(grown.added === 11 && grown.addedParticipants === 1 && grown.changed === 0 && grown.missing === 0, 'a new participant only adds rows');
    const edited = oldText.replace('"001"', '"001"').split('\n');
    edited[1] = edited[1].replace(',5,"normal",', ',8,"normal",');
    const changed = A.compareMaster(edited.join('\n'), first.rows);
    ok(changed.changed === 1 && changed.examples[0].includes('Points was 8, now 5'), 'a changed row is found and described');
    const fewer = A.build([await zipOf('c.zip', planBlocks('701', ['N'], 11, '10'))], { group: 'patients' });
    ok(A.compareMaster(oldText, fewer.rows).missing === 11, 'rows that disappear are counted');
    ok(A.compareMaster('"Other"\n"x"\n', first.rows).comparable === false, 'a master with other columns is reported as not comparable');
    const twice = planBlocks('704', ['N', 'N'], 3, '10').map(b => Object.assign(b, { number: 1 }));
    const clash = A.build([await zipOf('d.zip', [twice[0]]), await zipOf('e.zip', [Object.assign({}, twice[1])])], { group: 'patients' });
    clash.rows.forEach(r => { r.Session = 1; });
    const stable = A.compareMaster(A.toCsv(A.COLUMNS, clash.rows), clash.rows);
    ok(stable.changed === 0 && stable.missing === 0 && stable.added === 0, 'repeated block numbers compare cleanly');
    const a = await zipOf('a.zip', planBlocks('703', ['N'], 3, '10'));
    const b = await zipOf('b.zip', planBlocks('703', ['N'], 3, '10'));
    const c = await zipOf('c.zip', planBlocks('703', ['N'], 3, '12'));
    ok(A.crossGroupStops('patients', [a], 'controls', [b]).length === 1, 'the same session in both groups is stopped');
    ok(A.crossGroupStops('patients', [a], 'controls', [c]).length === 0, 'the same ID with a different session is allowed in both groups');
}

console.log('RECORDED GROUP');
{
    const withGroup = async (name, id, group, day) => {
        const blob = await Z.make([
            { path: `block1/${id}_vr-session-data-${STAMP}.csv`, parts: [trials(id, 1, 3)] },
            { path: `block1/${id}_session-info-${STAMP}.csv`, parts: [info(Object.assign({ ParticipantID: id, SessionStartISO: `2026-11-${day}T10:00:00.000Z`, Condition: 1, TrialsCompleted: 3, Block: 1 }, group ? { Group: group } : {}))] }
        ]);
        return A.readExport(new File([await blob.arrayBuffer()], name));
    };
    const right = A.build([await withGroup('a.zip', '801', 'Patient', '10')], { group: 'patients' });
    ok(!right.groupMismatches.length && !right.warnings.length, 'a session in its recorded group passes');
    const wrong = A.build([await withGroup('b.zip', '802', 'Control', '10')], { group: 'patients' });
    ok(wrong.groupMismatches.length === 1 && wrong.groupMismatches[0] === 'b.zip was recorded as Control, but it is in the patients folder.', 'a session in the other group is named');
    ok(A.reportText([], wrong, 'x').includes('b.zip was recorded as Control'), 'a confirmed mismatch stays in the report');
    const none = A.build([await withGroup('c.zip', '803', '', '10')], { group: 'controls' });
    ok(!none.groupMismatches.length && none.warnings.some(w => w.includes('do not record a group')), 'a zip with no group gets a warning');
}

console.log('BROWSER CHECK');
{
    const B = require(path.join(root, 'browser-check.js'));
    const brands = (...names) => names.map(brand => ({ brand, version: '1' }));
    ok(B.supported(brands('Not?A_Brand', 'Chromium', 'Google Chrome')), 'Chrome is supported');
    ok(B.supported(brands('Not:A-Brand', 'Chromium', 'Microsoft Edge')), 'Edge is supported');
    ok(!B.supported(brands('Not A;Brand', 'Chromium', 'Brave')) && !B.supported(brands('Chromium', 'Opera')), 'other Chromium browsers are not');
    ok(!B.supported([]), 'a browser with no brand information is not');
    ok(!B.supported(brands('Chromium', 'HeadlessChrome')), 'the test browser is not treated as a supported browser');
    ok(A.fileNames('patients', true).master === 'PRACTICE_handDB_patients.csv' && A.fileNames('patients').master === 'handDB_patients.csv', 'practice output has its own file names');
    ok(B.embedded('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Claude/4.23118.0 Chrome/152.0.7977.167 Safari/537.36 MSIX'), 'an app window that cannot edit folders is detected');
    ok(!B.embedded('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36'), 'normal Chrome is not treated as an app window');
}

console.log(`\nANALYSIS: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
