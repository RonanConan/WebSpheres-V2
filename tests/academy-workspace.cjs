const path = require('path');
const fs = require('fs');

global.window = global;
require('../academy/js/runner.js');
require('../academy/js/marking.js');
require('../academy/js/game.js');
require('../academy/js/minigit.js');
require('../academy/js/practice-files.js');
require('../academy/js/workspace.js');
require('../academy/js/lessons/11-real-code.js');
require('../academy/js/lessons/12-version-control.js');

const WSA = global.WSA;
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

const build = require('../academy/tools/build-practice.cjs');
expect(fs.readFileSync(path.join(__dirname, '..', 'academy', 'js', 'practice-files.js'), 'utf8').replace(/\r\n/g, '\n') === build(), 'academy/js/practice-files.js is up to date with academy/practice/ (run node academy/tools/build-practice.cjs)');

function ctxOf(core) {
    return {
        files: core.files(),
        active: core.state.active,
        cursor: core.rt.cursor,
        logs: core.rt.logs,
        ran: core.ranLatest(),
        runErrors: !!core.rt.errorThisRun,
        runs: core.rt.runs,
        step: core.rt.step,
        git: core.git,
        trialLines: core.trialLines(),
        csv: core.rt.csv,
        pristine: WSA.practiceFiles
    };
}

const P = WSA.practiceFiles;
const white = P['floating-number.js'].replace("'#CCCCCC'", "'#FFFFFF'");
const trial = (n, type) => `Trial ${n}: Target 4, Hand LEFT, Points 3, Type ${type || 'normal'}`;

function scenario(lessonId, steps) {
    const lesson = global.LESSONS.find(l => l.id === lessonId);
    const core = WSA.createWorkspaceCore(null);
    lesson.steps.forEach((step, i) => {
        core.stepStarted();
        if (step.type !== 'task') return;
        const label = `${lessonId} step ${i + 1}`;
        const before = step.check(ctxOf(core));
        expect(!before.pass, `${label}: doesn't pass before the work is done`);
        const act = steps[i];
        if (!act) {
            expect(false, `${label}: has a test scenario`);
            return;
        }
        act(core);
        const after = step.check(ctxOf(core));
        expect(after.pass, `${label}: passes after the work${after.pass ? '' : ' -> ' + after.message}`);
    });
    return core;
}

scenario('real-code', {
    1: core => {
        core.open('score-manager.js');
        core.setCursor(8);
    },
    2: core => {
        core.runStarted();
        [1, 2, 3].forEach(n => core.log('log', trial(n)));
    },
    3: core => {
        core.log('log', trial(4));
        core.evalDone("document.querySelector('#score-display').components['score-manager'].score", '12', '12', false);
    },
    5: core => {
        core.setFile('floating-number.js', white);
        core.runStarted();
        core.log('log', trial(1, 'normal'));
    },
    6: core => {
        const broken = P['score-manager.js'].replace(/\n    \}\n\}\);\n$/, '\n});\n');
        if (broken === P['score-manager.js']) throw new Error('could not break score-manager.js');
        core.setFile('score-manager.js', broken);
        core.runStarted();
        core.log('error', "Uncaught SyntaxError: Unexpected token ')'", { file: 'score-manager.js', line: 32 });
        core.setFile('score-manager.js', P['score-manager.js']);
        core.runStarted();
    },
    7: core => {
        const text = core.files()['score-manager.js'].replace(/(const criticalChance = [^\n]*\n)/, '$1        console.log(`Critical-hit chance: ${criticalChance}`);\n');
        core.setFile('score-manager.js', text);
        core.runStarted();
        core.log('log', 'Critical-hit chance: 0.3');
        core.log('log', trial(1));
    }
});

const versionControl = whiteFile => scenario('version-control', {
    1: core => {
        core.terminal('git config --global user.name "Sam Smith"');
        core.terminal('git config --global user.email "sam@example.com"');
    },
    2: core => {
        ['git init', 'git add .', 'git commit -m "First version"'].forEach(c => core.terminal(c));
    },
    3: core => core.terminal('git switch -c brighter-labels'),
    4: core => {
        core.setFile('floating-number.js', whiteFile);
        core.diffViewed();
    },
    5: core => {
        core.terminal('git add floating-number.js');
        core.terminal('git commit -m "Make normal hit labels white"');
    },
    6: core => {
        core.terminal('git switch main');
        core.runStarted();
        core.log('log', trial(1, 'normal'));
    },
    7: core => {
        core.setFile('index.html', core.files()['index.html'] + '\n<!-- mess -->');
        core.setFile('data-manager.js', core.files()['data-manager.js'] + '\n// mess');
        core.terminal('git restore .');
    },
    8: core => {
        core.terminal('git merge brighter-labels');
        core.terminal('git log --oneline');
    }
});
const vc = versionControl(white);
versionControl(P['floating-number.js'].replace("'#CCCCCC'", "'white'"));
const log = vc.git.exec('git log --oneline').output;
expect(/\(HEAD -> main, brighter-labels\) Make normal hit labels white/.test(log), `version-control: final history shows the merged branch -> ${JSON.stringify(log)}`);

const step5 = global.LESSONS.find(l => l.id === 'version-control').steps[4];
const core5 = WSA.createWorkspaceCore(null);
['git config user.name Sam', 'git config user.email sam@example.com', 'git init', 'git add .', 'git commit -m "First version"', 'git switch -c b'].forEach(c => core5.terminal(c));
core5.setFile('floating-number.js', white);
const nudged = step5.check(ctxOf(core5));
expect(!nudged.pass && nudged.near, 'version-control step 5: without opening the comparison, the learner gets a nudge');

const git = WSA.createGit({ getFiles: () => ({ 'a.js': 'x\n' }), setFiles: () => {} });
expect(/doesn't support "git push"/.test(git.exec('git push').error), 'git: unsupported commands get a plain message');
expect(/only runs git commands/.test(git.exec('ls').error), 'git: non-git commands get a plain message');

const carry = WSA.createWorkspaceCore(null);
['git config user.name Sam', 'git config user.email sam@example.com', 'git init', 'git add .', 'git commit -m "First version"'].forEach(c => carry.terminal(c));
carry.setFile('floating-number.js', white);
carry.setFile('extra.js', '// new\n');
const made = carry.terminal('git switch -c brighter-labels');
expect(!made.error && carry.files()['floating-number.js'] === white && carry.files()['extra.js'] === '// new\n', 'git: making a branch keeps uncommitted edits and new files, as real git does');
const back = carry.terminal('git switch main');
expect(!back.error && carry.files()['floating-number.js'] === white && carry.files()['extra.js'] === '// new\n', 'git: switching to a branch on the same commit keeps uncommitted edits');
carry.terminal('git add floating-number.js');
carry.terminal('git commit -m "Make normal hit labels white"');
const blocked = carry.terminal('git switch brighter-labels');
expect(/would lose them/.test(blocked.error || ''), 'git: switching to a different commit with uncommitted changes is refused');
expect(/no branch called toString/.test(carry.terminal('git switch toString').error || ''), 'git: names such as toString are not treated as branches');
expect(/doesn't support "git constructor"/.test(carry.terminal('git constructor').error || ''), 'git: names such as constructor are not treated as commands');

const noEmail = WSA.createWorkspaceCore(null);
['git config --global user.name Sam', 'git init', 'git add .'].forEach(c => noEmail.terminal(c));
expect(/Set your email first/.test(noEmail.terminal('git commit -m "First version"').error || ''), 'git: committing without an email asks for one, as real git does');
noEmail.terminal('git config --global user.email sam@example.com');
noEmail.terminal('git commit -m "First version"');
expect(/Author: Sam <sam@example.com>/.test(noEmail.terminal('git log').output), 'git: the log shows the author with the email');

const typedCore = WSA.createWorkspaceCore(null);
typedCore.runStarted();
typedCore.log('error', 'ReferenceError: scroe is not defined', { typed: true });
expect(!typedCore.rt.errorThisRun && typedCore.rt.step.errorsSeen === 0, 'workspace: an error from an expression typed in the console is not a game error');
typedCore.log('error', 'Uncaught TypeError: x', { file: 'score-manager.js', line: 3 });
expect(typedCore.rt.errorThisRun && typedCore.rt.step.errorsSeen === 1, 'workspace: an error from the game counts');

const doc = WSA.buildProjectDoc(P);
expect(doc.doc.includes('/*@@FILE:score-manager.js@@*/') && Object.keys(doc.offsets).length === 4, 'project page inlines the four scripts and records where each starts');
expect(!/<script src="(sphere|score|data|floating)/.test(doc.doc), 'project page has no external script tags for project files');

const LESSON_STYLE = ['goal', 'explain', 'success', 'question'];
['real-code', 'version-control'].forEach(id => {
    const lesson = global.LESSONS.find(l => l.id === id);
    lesson.steps.forEach((step, i) => {
        LESSON_STYLE.concat([]).forEach(f => {
            const text = step[f];
            if (typeof text !== 'string') return;
            const prose = text.replace(/<pre[\s\S]*?<\/pre>/g, '').replace(/<code>[\s\S]*?<\/code>/g, '');
            expect(!/![^=]/.test(prose + ' '), `${id} step ${i + 1} ${f}: no exclamation marks`);
        });
        expect(step.hints && step.hints.length === 3, `${id} step ${i + 1}: three hints`);
    });
});

console.log(failures ? `\n${failures} failed, ${passes} passed` : `\nAll ${passes} passed`);
process.exit(failures ? 1 : 0);
