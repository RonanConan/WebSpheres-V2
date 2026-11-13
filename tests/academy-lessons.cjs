const path = require('path');
const fs = require('fs');

global.window = global;
global.requestAnimationFrame = fn => setTimeout(fn, 0);
require('../academy/js/runner.js');
require('../academy/js/marking.js');
require('../academy/js/game.js');
const dir = path.join(__dirname, '..', 'academy', 'js', 'lessons');
fs.readdirSync(dir).filter(f => f.endsWith('.js')).sort().forEach(f => require(path.join(dir, f)));

const WSA = global.WSA;
const CODE_TYPES = ['code', 'bug', 'match'];
const only = process.argv[2];
let failures = 0;
let passes = 0;
const expect = (ok, label) => {
    if (!ok) {
        failures++;
        console.log(`FAIL ${label}`);
    } else {
        passes++;
        if (process.env.VERBOSE) console.log(`ok   ${label}`);
    }
};

function specAt(lesson, i) {
    for (let k = i; k >= 0; k--) {
        const s = lesson.steps[k];
        if (CODE_TYPES.includes(s.type || 'code') && s.names) return { names: s.names, types: s.types };
    }
    return { names: lesson.names, types: lesson.types };
}

function runCode(lesson, code, names) {
    const g = lesson.api ? WSA.createGame({}) : null;
    const r = WSA.runner.run(code, names, g ? g.api : undefined);
    if (g) g.bind(r);
    return r;
}

function checkCode(lesson, step, code, names) {
    const r = runCode(lesson, code, names);
    if (!r.ok) return { pass: false, message: 'error: ' + r.error.message, r };
    const missing = names.filter(n => r.missing.includes(n));
    if (missing.length) return { pass: false, message: 'missing ' + missing.join(', '), r };
    const ctx = WSA.checkContext(r, code, names, !!lesson.api, { isColour: v => typeof v === 'string' });
    if (step.tests) {
        const rows = step.tests(ctx);
        const bad = rows.filter(x => !x.pass);
        if (bad.length) return { pass: false, message: 'tests: ' + bad.map(x => `${x.label} gave ${x.got}`).join('; '), r, ctx };
    }
    const result = step.check ? step.check(r.values, ctx) : { pass: true, message: step.success };
    return Object.assign({}, result, { r, ctx });
}

function sceneSmoke(lesson, step, r) {
    const values = r.read ? r.read() : r.values;
    const ctx = { values, run: r, call: (name, args) => r.call(values[name], args) };
    if (lesson.scene) lesson.scene(values, ctx);
    if (step.scene) step.scene(values, ctx);
    const panel = step.panel || lesson.panel;
    if (panel) panel(values, ctx);
}

const STYLE_FIELDS = ['goal', 'explain', 'success', 'question'];
function styleCheck(label, text) {
    if (typeof text !== 'string') return;
    const prose = text.replace(/<pre[\s\S]*?<\/pre>/g, '').replace(/<code>[\s\S]*?<\/code>/g, '');
    expect(!/![^=]/.test(prose.replace(/!$/, '! ')), `${label}: no exclamation marks in "${prose.slice(0, 60)}"`);
    expect(!/—/.test(prose), `${label}: no em dashes`);
}

for (const lesson of global.LESSONS) {
    if (only && lesson.id !== only) continue;
    expect(runCode(lesson, lesson.starterCode, lesson.names).ok, `${lesson.id}: starter code runs`);
    [lesson.intro, lesson.real.note].concat(lesson.learned).forEach((t, k) => styleCheck(`${lesson.id} text ${k}`, t));
    let code = lesson.starterCode;
    lesson.steps.forEach((step, i) => {
        const type = step.type || 'code';
        const label = `${lesson.id} step ${i + 1} (${type})`;
        expect(step.hints && step.hints.length === 3, `${label}: three hints`);
        STYLE_FIELDS.forEach(f => styleCheck(`${label} ${f}`, step[f]));
        (step.hints || []).forEach((h, k) => styleCheck(`${label} hint ${k + 1}`, h));
        if (step.predict) styleCheck(`${label} predict`, step.predict.explain);
        if (CODE_TYPES.includes(type)) {
            const { names } = specAt(lesson, i);
            const good = checkCode(lesson, step, step.answer, names);
            expect(good.pass, `${label}: model answer passes${good.pass ? '' : ' -> ' + good.message}`);
            if (good.r && good.r.ok) {
                try {
                    sceneSmoke(lesson, step, good.r);
                    expect(true, `${label}: scene and panel build`);
                } catch (e) {
                    expect(false, `${label}: scene and panel build -> ${e.message}`);
                }
            }
            if (type === 'match') {
                expect(good.ctx && step.gap(good.r.values, good.ctx) <= step.tolerance, `${label}: model answer turns the outlines green`);
                expect(step.tolerance < step.closeWithin, `${label}: amber range is wider than the green range`);
            }
            const start = step.setCode || code;
            const bad = checkCode(lesson, step, start, names);
            expect(!bad.pass, `${label}: the code at the start of the step doesn't pass yet`);
            code = step.answer;
        } else if (type === 'trace') {
            expect(WSA.marking.trace(step, WSA.literal(step.answer)).pass, `${label}: typing the answer passes`);
            if (step.box && !step.noRun) {
                const r = WSA.runner.run(step.code, [step.box]);
                const got = r.ok ? r.values[step.box] : undefined;
                expect(r.ok && (step.accept ? step.accept(WSA.literal(got), got) : WSA.marking.sameValue(got, step.answer)), `${label}: the answer matches what the code really produces (${WSA.show(got)})`);
            }
            expect((step.wrong || []).every(w => (w.test ? !w.test(step.answer, WSA.literal(step.answer)) : !WSA.marking.sameValue(w.value, step.answer))), `${label}: no wrong answer matches the right one`);
        } else if (type === 'quiz') {
            const right = step.options.map((o, k) => (o.correct ? k : -1)).filter(k => k >= 0);
            expect(step.multi ? right.length >= 1 : right.length === 1, `${label}: has the right number of correct options`);
            expect(WSA.marking.quiz(step, right).pass, `${label}: choosing the correct options passes`);
            const wrong = step.options.findIndex(o => !o.correct);
            expect(!WSA.marking.quiz(step, step.multi ? right.concat(wrong) : [wrong]).pass, `${label}: adding a wrong option fails`);
            step.options.forEach((o, k) => styleCheck(`${label} option ${k}`, o.why));
        } else if (type === 'order') {
            const good = WSA.marking.order(step, step.answer);
            expect(good.pass, `${label}: model order passes${good.pass ? '' : ' -> ' + good.message}`);

            expect(!WSA.marking.order(step, step.start).pass, `${label}: starting order fails`);

        } else if (type === 'find') {
            const lines = step.code.split('\n');
            expect(step.answer.every(k => k >= 0 && k < lines.length), `${label}: answer line exists`);
            expect(WSA.marking.find(step, step.answer[0]).pass, `${label}: clicking the answer line passes`);
            expect(lines.every((_, k) => step.answer.includes(k) || !WSA.marking.find(step, k).pass), `${label}: every other line fails`);
            Object.values(step.wrong || {}).forEach((w, k) => styleCheck(`${label} wrong ${k}`, w));
        }
    });
}

if (!only) {
    const names = ['targetColour', 'targetSize', 'reach', 'ringRadius', 'label'];
    const errors = [
        ['let targetColour = gold;', /no quotes/],
        ['let targetColour = "gold;', /never closes/],
        ['let targetSize = 0,12;', /dot, not a comma/],
        ['let targetColour = "gold";\nlet targetColour = "red";', /made twice/],
        ['let targetcolour = "gold";\ntargetColour = "red";', /Capital letters/],
        ['let ringRadius = 0.8 * reach;\nlet reach = 0.7;', /top to bottom/],
        ['let target size = 0.1;', /spaces/],
        ['let targetColour = “gold”;', /curly quotes/],
        ['const targetSize = 0.1;\ntargetSize = 0.2;', /const/],
        ['let points = 7;\nlet label = `+${points};', /backtick/],
        ['let points = 7;\nlet label = +${points};', /only works inside backticks/],
        ['let n = 0;\nfor (let i = 0; i < 11; i--) {\n  n = n + 1;\n}', /kept repeating/],
        ['if (true) {\n  let a = 1;\n', /curly bracket/],
        ['let a;\na.b = 1;', /no value/],
        ['let a = 5;\na();', /isn't a function/],
        ['let a = 3;\nreturn a;', /only be used inside a function/],
        ["console.log('Hello);", /opens a quote but never closes/],
        ["let a = 'x';\nconsole.log('Hello);\nlet b = 'y';", /opens a quote but never closes/],
        ['console.log("see http://x.com");\nlet x = (1;', /round bracket \( opens/]
    ];
    for (const [code, re] of errors) {
        const r = WSA.runner.run(code, names);
        expect(!r.ok && re.test(r.error.message), `friendly error for ${JSON.stringify(code)} -> ${r.ok ? 'ran' : r.error.message} (line ${r.ok ? '-' : r.error.line})`);
    }

    const maths = global.LESSONS.find(l => l.id === 'maths');
    const hard = 'let reach = 0.7;\nlet ringRadius = 0.56;';
    const hr = WSA.runner.run(hard, maths.names);
    const s2 = maths.steps[1].check(hr.values, WSA.checkContext(hr, hard, maths.names, false));
    expect(!s2.pass && s2.near, 'maths step 2: hard-coded 0.56 gets an "Are you sure?" nudge');

    const m = WSA.marking;
    expect(m.parseAnswer('"gold"') === 'gold' && m.parseAnswer(' 0.2; ') === 0.2 && m.parseAnswer('size = .2') === 0.2, 'parseAnswer strips quotes, semicolons and "name ="');
    expect(m.trace({ answer: 0.2 }, '0,2').free, 'a comma decimal is explained without costing a star');
    expect(m.trace({ answer: 0.2 }, '').free, 'an empty answer is free');
    expect(m.stars(0, 0, true) === 3 && m.stars(1, 1, true) === 1 && m.stars(1, 5, false) === 2 && m.stars(3, 0, false) === 0 && m.stars(2, 4, true) === 0, 'star counting: hints always cost, misses cost only in guessable steps, never below 0');

    const logged = WSA.runner.run('let a = 2;\nconsole.log(`a is ${a}`, 5);', ['a']);
    expect(logged.ok && logged.logs.length === 1 && logged.logs[0] === 'a is 2 5', 'console.log output is captured');

    const g = WSA.createGame({});
    const gr = WSA.runner.run('let score = 0;\nfunction onHit(event) {\n  score = score + 1;\n  setTimeout(function () { score = score + 10; }, 500);\n}\ntargets.addEventListener("click", onHit);', ['score'], g.api);
    g.bind(gr);
    g.click(0, 'LEFT');
    g.advance(499);
    const before = gr.read().score;
    g.advance(1);
    expect(before === 1 && gr.read().score === 11, 'game: clicks and simulated timers run in order');
    const bad = WSA.createGame({});
    const br = WSA.runner.run('function onHit() {}\ntargets.addEventListener("click", onHit());', [], bad.api);
    expect(!br.ok && /brackets/.test(br.error.message), 'game: passing onHit() instead of onHit is explained');

    const ret = WSA.runner.run('let a = 1;\n\nreturn a;', ['a']);
    expect(!ret.ok && ret.error.line === 3, 'a return outside a function is shown on its own line');
    const shadow = WSA.runner.run('let targets = [1, 2];\nlet console = 5;', ['targets'], WSA.createGame({}).api);
    expect(shadow.ok && shadow.values.targets.length === 2, 'the learner can make variables with the names of page functions');
    expect(/while \(__guard\(\) && \(x\)\)/.test(WSA.runner.guardLoops('const q = /"/;\nwhile (x) {}')), 'a quote inside a regular expression does not hide the loops after it');
    const flood = WSA.runner.run('for (let i = 0; i < 100000; i++) { console.log(i); }', []);
    expect(flood.ok && flood.logs.length === 501 && /stopped showing/.test(flood.logs[500]), 'console output stops after 500 lines, with a note');
    expect(WSA.show([NaN, Infinity, -Infinity, undefined]) === '[NaN,Infinity,-Infinity,undefined]' && WSA.show({ a: NaN }) === '{"a":NaN}', 'NaN and Infinity inside lists and objects are shown as themselves, not null');

    const loopGame = WSA.createGame({});
    const lr = WSA.runner.run('function tick() { setTimeout(tick, 0); }\nsetTimeout(tick, 0);', [], loopGame.api);
    loopGame.bind(lr);
    loopGame.advance(100);
    expect(loopGame.errors.length === 1 && /timers ran one after another/.test(loopGame.errors[0].message), 'game: a timer that restarts itself straight away is stopped');
    const crashGame = WSA.createGame({});
    const cr = WSA.runner.run('setTimeout(function () {}, 10);\nnull.x;', [], crashGame.api);
    crashGame.bind(cr);
    crashGame.advance(100);
    expect(!cr.ok && crashGame.errors.length === 0, 'game: a timer from code that crashed adds no second error');
    const twice = WSA.createGame({});
    const tr = WSA.runner.run('let n = 0;\nfunction onHit() { n++; }\ntargets.addEventListener("click", onHit);\ntargets.addEventListener("click", onHit);', ['n'], twice.api);
    twice.bind(tr);
    twice.click(0, 'LEFT');
    expect(tr.read().n === 1, 'game: adding the same listener twice runs it once, as in a browser');
    const many = WSA.createGame({});
    const mr = WSA.runner.run('for (let i = 0; i <= 11; i--) {\n  addTarget(-40 + i * 8);\n}', [], many.api);
    expect(!mr.ok && /check that the loop stops/.test(mr.error.message), 'a loop that adds targets without end is explained as a loop problem');

    const stepCheck = (title, stepTitle, code) => {
        const lesson = global.LESSONS.find(l => l.title === title);
        const i = lesson.steps.findIndex(s => s.title === stepTitle);
        return checkCode(lesson, lesson.steps[i], code, specAt(lesson, i).names);
    };
    const vars = 'let trial = 3;\nlet target = 5;\nlet hand = "LEFT";\nlet points = 7;\nlet label = `+${points}`;\n\n';
    expect(stepCheck('Text', 'Print a message', vars + 'let message = `Trial ${trial}: Target ${target}, Hand ${hand}`;\nconsole.log(message);\n').pass, 'text: a message built in a variable, then printed, passes');
    expect(stepCheck('Text', 'Print a message', vars + 'console.log(\n  `Trial ${trial}: Target ${target}, Hand ${hand}`\n);\n').pass, 'text: a console.log split over lines passes');
    const typed = stepCheck('Text', 'Print a message', vars + 'console.log("Trial 3: Target 5, Hand LEFT");\n');
    expect(!typed.pass && typed.near, 'text: a message typed by hand gets an "Are you sure?" nudge');
    expect(stepCheck('Text', 'Backticks', 'let points = 7;\nlet label = `+${points}` // the label\n').pass, 'text: a template literal with a comment after it passes');
    expect(stepCheck('Lists and records', 'Fix the bugs', 'let position = 4;\nlet trial = { trial: 1, target: 1 + position, hand: "LEFT", points: 7, hitType: "critical" };\n\nconsole.log(`Target ${trial.target}`);\n').pass, 'lists: 1 + position passes');
    const lists = global.LESSONS.find(l => l.title === 'Lists and records');
    const rowStep = lists.steps.find(s => s.title === 'Make the row match');
    const splitRow = rowStep.setCode.replace('let row = "";\n', 'let row = `${trial.trial},${trial.timestamp},${trial.target},${trial.hand},${trial.points},` +\n  `${trial.hitType},${trial.decisionTime},${trial.totalMovementTime},${trial.recentreCount},${trial.participantId},${trial.run}`;\n');
    expect(stepCheck('Lists and records', 'Make the row match', splitRow).pass, 'lists: a row built over two lines passes');
    const ifElse = global.LESSONS.find(l => l.title === 'If and else');
    const capital = WSA.marking.trace(ifElse.steps.find(s => s.title === 'True or false'), 'True');
    expect(!capital.pass && capital.free && /lower case/.test(capital.message), 'if and else: "True" is explained without costing a star');
}

console.log(failures ? `\n${failures} failed, ${passes} passed` : `\nAll ${passes} passed`);
process.exit(failures ? 1 : 0);
