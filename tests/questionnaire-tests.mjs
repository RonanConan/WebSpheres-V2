import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const Q = require(path.join(root, 'questionnaire-core.js'));
globalThis.WebSpheresQuestionnaires = Q;
['game', 'sus', 'imi-teq', 'study'].forEach(f => require(path.join(root, 'questionnaires', f + '.js')));

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ FAIL: ' + msg); } };

console.log('Definitions');
const st = Q.study();
ok(st.problems.length === 0, 'the study definitions have no problems' + (st.problems.length ? ': ' + st.problems.join(' | ') : ''));
ok(st.defs.map(d => d.id).join(',') === 'GAME,SUS,IMI-TEQ', 'the study uses GAME, SUS and IMI-TEQ in that order');
ok(Q.count(st.defs) === 35, 'there are 35 questions in all');
const GAME = Q.get('GAME'), SUS = Q.get('SUS'), TEQ = Q.get('IMI-TEQ');
ok(GAME.items[0].text === 'Did you notice any changes between the game sessions?', 'GQ1 asks about the game sessions');
ok(SUS.items.filter(i => i.reverse).map(i => i.id).join(',') === 'SUS02,SUS04,SUS06,SUS08,SUS10', 'SUS reverses the even items');
ok(TEQ.items.filter(i => i.reverse).map(i => i.id).join(',') === 'TEQ02,TEQ09,TEQ11,TEQ14,TEQ19,TEQ21', 'TEQ reverses items 2, 9, 11, 14, 19 and 21');
const teqItems = TEQ.scores.flatMap(s => s.items).sort();
ok(teqItems.length === 22 && new Set(teqItems).size === 22, 'each TEQ item belongs to exactly one subscale');
ok(Q.subscalesOf(TEQ, 'TEQ14').join() === 'TEQ_InterestEnjoyment', 'TEQ14 is an interest/enjoyment item');

console.log('Broken definitions are reported');
const bad = (def) => Q.check([def]);
ok(bad({ id: 'X', version: 1, title: 'x', type: 'scale', scale: { values: [1, 2, 3], labels: ['a', 'b'] }, items: [{ id: 'X1', text: 't' }] }).some(p => /label/.test(p)), 'a missing scale label');
ok(bad({ id: 'X', version: 1, title: 'x', type: 'scale', scale: { values: [1, 3], labels: ['a', 'b'] }, items: [{ id: 'X1', text: 't' }] }).some(p => /consecutive/.test(p)), 'scale values with a gap');
ok(bad({ id: 'X', version: 1, title: 'x', type: 'scale', scale: { values: [1, 2], labels: ['a', 'b'] }, items: [{ id: 'X1', text: 't' }, { id: 'X1', text: 'u' }] }).some(p => /more than once/.test(p)), 'a repeated item id');
ok(bad({ id: 'X', version: 1, title: 'x', type: 'scale', scale: { values: [1, 2], labels: ['a', 'b'] }, items: [{ id: 'X1', text: 't' }], scores: [{ id: 'S', method: 'mean', items: ['X9'] }] }).some(p => /X9/.test(p)), 'a score using an item that does not exist');
ok(bad({ id: 'X', version: 1, title: 'x', type: 'scale', scale: { values: [1, 2], labels: ['a', 'b'] }, items: [{ id: 'X1', text: 't' }], scores: [{ id: 'S', method: 'median', items: 'all' }] }).some(p => /unknown method/.test(p)), 'an unknown scoring method');
ok(bad({ id: 'X', version: 1, title: 'x', type: 'choice-followup', items: [{ id: 'X1', text: 't', options: ['A', 'B'], followUp: { A: 'why?' } }] }).some(p => /follow-up/.test(p)), 'an option without a follow-up question');
ok(bad({ id: 'X', version: 0, title: 'x', type: 'scale', scale: { values: [1, 2], labels: ['a', 'b'] }, items: [{ id: 'X1', text: 't' }] }).some(p => /version/.test(p)), 'a version below 1');
ok(Q.check([SUS, SUS]).some(p => /listed twice/.test(p)), 'a questionnaire listed twice');
const base = { id: 'X', version: 1, title: 'x', type: 'scale', scale: { values: [1, 2], labels: ['a', 'b'] } };
let thrown = null;
try { thrown = bad(Object.assign({}, base, { items: [{ id: 'X1', text: 't' }], scores: { id: 'S', method: 'mean', items: 'all' } })); } catch (e) { thrown = e; }
ok(Array.isArray(thrown) && thrown.some(p => /not a list/.test(p)), 'scores written without square brackets are reported, not thrown');
ok(bad(Object.assign({}, base, { items: [{ id: 'X1', text: 't' }, , { id: 'X3', text: 'u' }] })).some(p => /item 2 needs an id/.test(p)), 'a gap in the items list is reported');
ok(Q.count([{ id: 'X' }]) === 0 && Q.answeredCount([{ id: 'X', type: 'scale' }], {}) === 0 && Q.rawRows([{ id: 'X', type: 'scale', items: [{ id: 'X1' }] }], { X1: { value: 1 } }, {}).length === 1, 'counting and saving do not fail on a definition without items or scale');

console.log('Answers');
const gq1 = GAME.items[0];
ok(!Q.answered(GAME, gq1, { value: 'Yes', text: '   ' }), 'a game question with an empty follow-up is not answered');
ok(Q.answered(GAME, gq1, { value: 'Yes', text: 'The targets moved' }), 'a game question with a button and text is answered');
ok(!Q.answered(GAME, gq1, { value: 'Maybe', text: 'x' }), 'an answer that is not one of the buttons is not accepted');
ok(Q.followPrompt(gq1, 'Yes') === 'What changes did you notice?' && Q.followPrompt(gq1, 'No') === 'Why have you chosen that?', 'GQ1 asks a different follow-up for Yes');
ok(!Q.answered(SUS, SUS.items[0], { value: 6 }) && Q.answered(SUS, SUS.items[0], { value: 5 }), 'a rating outside the scale is not accepted');
ok(Q.missing(SUS, { SUS01: { value: 3 } }).length === 9, 'nine SUS items are missing after one answer');

console.log('Scoring');
const fill = (def, v) => Object.fromEntries(def.items.map((item, i) => [item.id, typeof v === 'function' ? v(item, i) : v]));
const sus = (r) => Q.score(SUS, r)[0].value;
ok(sus(fill(SUS, 3)) === 50, 'SUS: Undecided on every item scores 50');
ok(sus(fill(SUS, (item) => item.reverse ? 1 : 5)) === 100, 'SUS: the best answer on every item scores 100');
ok(sus(fill(SUS, (item) => item.reverse ? 5 : 1)) === 0, 'SUS: the worst answer on every item scores 0');
ok(sus(fill(SUS, (item, i) => [4, 2, 4, 2, 4, 1, 5, 2, 4, 2][i])) === 80, 'SUS: a worked example scores 80');
const partial = fill(SUS, 3); delete partial.SUS05;
const ps = Q.score(SUS, partial)[0];
ok(ps.value === null && ps.itemsUsed === 9 && ps.itemsExpected === 10, 'SUS: a missing item leaves the score empty');
const teqAll4 = Q.score(TEQ, fill(TEQ, 4));
ok(teqAll4.every(s => s.value === 4), 'TEQ: 4 on every item gives 4 on every subscale');
const teq = Q.score(TEQ, fill(TEQ, (item) => item.reverse ? 1 : 7));
ok(teq.every(s => s.value === 7), 'TEQ: reversed items are scored as 8 minus the response');
const teqMixed = Q.score(TEQ, fill(TEQ, (item, i) => [5, 6, 6, 4, 6, 2, 4, 6, 6, 6, 2, 4, 2, 2, 5, 4, 6, 2, 3, 6, 1, 5][i]));
const byId = Object.fromEntries(teqMixed.map(s => [s.id, s.value]));
ok(byId.TEQ_InterestEnjoyment === Number((41 / 7).toFixed(4)), 'TEQ: interest/enjoyment worked example');
ok(byId.TEQ_PerceivedCompetence === 4.2, 'TEQ: perceived competence worked example');
ok(byId.TEQ_PerceivedChoice === 5.8, 'TEQ: perceived choice worked example');
ok(byId.TEQ_PressureTension === 2, 'TEQ: pressure/tension worked example');

console.log('Raw CSV');
const answers = {
    GQ1: { value: 'Yes', text: 'Yes, "the spheres", moved,\nand then\r\nleft', at: '2026-11-22T10:50:00' },
    GQ2: { value: 'Right', text: '  Quicker  ', at: '2026-11-22T10:50:10' },
    SUS01: { value: 4, at: '2026-11-22T10:51:00' },
    TEQ02: { value: 2, at: '2026-11-22T10:52:00' }
};
const meta = { id: 'P012', sessionId: 's-1', lastBlockStart: '2026-11-22T10:14:03.000Z', practice: false, appVersion: '2.9.2', afterBlock: 2, status: 'submitted', submittedAt: '2026-11-22T10:53:00' };
const rows = Q.rawRows(st.defs, answers, meta);
ok(rows.length === 35, 'one row per item');
const csv = Q.toCsv(Q.COLUMNS, rows);
const back = Q.readRaw(csv);
ok(back.header.join() === Q.COLUMNS.join(), 'the header round-trips');
ok(back.rows.length === 35, 'every row round-trips');
const r1 = back.rows.find(r => r.ItemID === 'GQ1');
ok(r1.FollowUpText === answers.GQ1.text && r1.FollowUpPrompt === 'What changes did you notice?', 'quotes, commas and line breaks in free text round-trip');
ok(back.rows.find(r => r.ItemID === 'GQ2').FollowUpText === 'Quicker', 'follow-up text is trimmed');
const s1 = back.rows.find(r => r.ItemID === 'SUS01');
ok(s1.Response === '4' && s1.ResponseLabel === 'Somewhat agree' && s1.ScaleMin === '1' && s1.ScaleMax === '5' && s1.Reverse === '0' && s1.Subscales === 'SUS_Total', 'a SUS row carries its label, scale, reverse flag and score');
const t2 = back.rows.find(r => r.ItemID === 'TEQ02');
ok(t2.Reverse === '1' && t2.Subscales === 'TEQ_PressureTension' && t2.ResponseLabel === '', 'a TEQ row carries its reverse flag and subscale');
ok(back.rows.find(r => r.ItemID === 'SUS02').Response === '', 'an unanswered item is written with an empty response');
ok(back.rows.every(r => r.ID === 'P012' && r.AfterBlock === '2' && r.Status === 'submitted' && r.Practice === '0' && r.LastBlockStart === meta.lastBlockStart), 'every row carries the session details');
const skipped = Q.rawRows(st.defs, { SUS01: { value: 4 }, GQ1: { value: 'No', text: 'Had to leave.' } }, Object.assign({}, meta, { status: 'skipped' }));
ok(skipped.length === 35 && skipped.every(r => r.Status === 'skipped'), 'a skipped session still has one row per question');
ok(skipped.find(r => r.ItemID === 'SUS01').Response === 4 && skipped.find(r => r.ItemID === 'GQ1').FollowUpText === 'Had to leave.' && skipped.find(r => r.ItemID === 'SUS02').Response === '', 'answers given before a skip are kept');
const noDefs = Q.rawRows(Q.studyIds().map(id => ({ id })), {}, Object.assign({}, meta, { status: 'skipped' }));
ok(noDefs.length === 3 && noDefs.map(r => r.QuestionnaireID).join() === 'GAME,SUS,IMI-TEQ' && noDefs.every(r => r.Status === 'skipped' && r.ItemID === undefined && r.QuestionnaireVersion === ''), 'a skip is recorded per listed questionnaire when no definitions loaded');
ok(Q.studyIds().join() === 'GAME,SUS,IMI-TEQ', 'studyIds lists the questionnaires in study.js');

console.log('Text that looks like a spreadsheet formula');
const formulaRows = Q.rawRows(st.defs, { GQ1: { value: 'Yes', text: '=1+1' }, GQ2: { value: 'Left', text: "'- quoted" }, GQ3: { value: 'No', text: '- the spheres moved' } }, meta);
const formulaCsv = Q.toCsv(Q.COLUMNS, formulaRows);
ok(formulaCsv.includes(",'=1+1,") && formulaCsv.includes(",'- the spheres moved,"), 'text starting with = or - gets a leading apostrophe in the file');
const formulaBack = Q.readRaw(formulaCsv).rows;
ok(formulaBack.find(r => r.ItemID === 'GQ1').FollowUpText === '=1+1' && formulaBack.find(r => r.ItemID === 'GQ2').FollowUpText === "'- quoted" && formulaBack.find(r => r.ItemID === 'GQ3').FollowUpText === '- the spheres moved', 'reading the file gives back exactly what was typed');
ok(Q.parseCsv('a,b\r\n1,2\r\n\r\n').length === 2, 'blank lines are ignored');
ok(Q.parseCsv('﻿a,b\n1,2').length === 2 && Q.parseCsv('﻿a,b\n1,2')[0][0] === 'a', 'a byte-order mark is ignored');

console.log('Definitions copy');
const snap = Q.snapshot(st.defs);
ok(snap.format === 1 && snap.questionnaires.length === 3 && Q.same(snap.questionnaires[1], SUS), 'the copy saved in the ZIP matches the definitions');

console.log(`\nquestionnaire-tests: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
