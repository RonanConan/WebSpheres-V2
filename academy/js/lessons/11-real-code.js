(function () {
    const WSA = window.WSA;
    const { pass, fail, nudge } = WSA;
    const squash = s => String(s).replace(/\s+/g, '');
    const lineOf = (text, pattern) => text.split('\n').findIndex(l => pattern.test(l)) + 1;

    window.LESSONS = window.LESSONS || [];
    window.LESSONS.push({
        id: 'real-code',
        title: 'The real code',
        subtitle: 'Working on a project with several files',
        workspace: true,
        names: [],
        types: {},
        starterCode: '',
        intro: `
            <p>Real programs are split across several files. In this lesson you'll work on Spheres Practice: the game from lesson 10, written as a small project laid out like WebSpheres.</p>
            <p>The middle panel works like a code editor, such as VS Code:</p>
            <ul class="parts">
                <li>The tabs along the top open each file. A dot on a tab means the file has changed.</li>
                <li><b>Run</b> starts the game on the right with your latest code. Changes don't take effect until you run the game again.</li>
                <li>The search box searches all the files at once.</li>
                <li>The <b>Console</b> tab shows the game's messages and errors, as the browser's console does. You can also type into it.</li>
            </ul>
            <p>Your changes are saved in your browser. <b>Reset project</b> puts every file back to how it started.</p>
            <p>The project has five files:</p>
            <ul class="parts">
                <li><code>index.html</code> is the page. It loads A-Frame and the other four files, and sets up the 3D scene.</li>
                <li><code>sphere-manager.js</code> builds the targets, chooses the next one, and handles hits.</li>
                <li><code>score-manager.js</code> decides whether a hit is critical, and keeps the score.</li>
                <li><code>floating-number.js</code> floats the points label up from a target.</li>
                <li><code>data-manager.js</code> records each trial.</li>
            </ul>
            <p>Each <code>.js</code> file holds one A-Frame <b>component</b>, as in WebSpheres. Step 5 explains components.</p>`,
        steps: [
            {
                type: 'quiz',
                title: 'Find your way around',
                goal: 'Open each file from the tabs, then choose every statement that is true.',
                explain: `<p>Read the first few lines of each file. The name after <code>registerComponent</code> matches the file name.</p>`,
                question: 'Which of these statements are true?',
                multi: true,
                options: [
                    { text: '<code>sphere-manager.js</code> builds the targets and handles hits.', correct: true, why: 'True. It has <code>createSpheres</code> and <code>handleHit</code>, as in WebSpheres.' },
                    { text: '<code>score-manager.js</code> decides whether a hit is critical.', correct: true, why: 'True. <code>calculateHitPoints</code> is in this file.' },
                    { text: '<code>data-manager.js</code> floats the points label.', correct: false, why: 'False. <code>floating-number.js</code> does that. <code>data-manager.js</code> records the trials.' },
                    { text: '<code>floating-number.js</code> records each trial.', correct: false, why: 'False. <code>data-manager.js</code> does that, in <code>recordTrial</code>.' },
                    { text: '<code>index.html</code> loads the other files and sets up the scene.', correct: true, why: 'True. Its <code>script</code> lines load the four other files.' }
                ],
                success: 'All your choices are right. Splitting the code by job makes each file shorter and easier to find your way around.',
                hints: [
                    'Open <code>data-manager.js</code> and <code>floating-number.js</code>, and read their function names.',
                    'Three of the five statements are true.',
                    'The true statements are about <code>sphere-manager.js</code>, <code>score-manager.js</code> and <code>index.html</code>.'
                ]
            },
            {
                type: 'task',
                title: 'Search the project',
                goal: 'Search all the files for <code>calculateHitPoints</code>. Open the line where the function is made, and click on that line.',
                explain: `<ol><li>Click in the search box above the files, type <code>calculateHitPoints</code>, and press Enter.</li><li>The Search tab lists every match. Some lines use the function, and one line makes it. The line that makes it contains <code>calculateHitPoints: function</code>.</li><li>Click that match. The file opens, with the line marked. Then click anywhere on that line in the code, so that the cursor is on it.</li></ol><p>Searching is how programmers find their way around large projects. In WebSpheres, it's often quicker than opening files one by one.</p>`,
                hints: [
                    'Search for <code>calculateHitPoints</code>, then look at the file names in the results.',
                    'The function is made in <code>score-manager.js</code>, on the line that contains <code>calculateHitPoints: function</code>.',
                    'Open <code>score-manager.js</code>, and click on line 8.'
                ],
                check(ws) {
                    const text = ws.files['score-manager.js'];
                    const line = lineOf(text, /calculateHitPoints\s*:\s*function/);
                    if (ws.active !== 'score-manager.js') return fail(`<code>${WSA.esc(ws.active)}</code> is open. The function is made in a different file. Search for it, and look for <code>calculateHitPoints: function</code> in the results.`);
                    if (ws.cursor.file !== 'score-manager.js' || ws.cursor.line !== line) return fail(`The cursor is on line ${ws.cursor.line} of <code>score-manager.js</code>. Click on the line that makes the function.`);
                    return pass(`Correct: line ${line} of <code>score-manager.js</code> makes <code>calculateHitPoints</code>. The other matches are the places that use it.`);
                }
            },
            {
                type: 'task',
                title: 'Run and play',
                goal: 'Run the game, and play at least three trials by clicking the targets.',
                explain: `<ol><li>Press <b>Run</b> above the files. The game starts on the right.</li><li>Click each target as it appears. A left click counts as the left hand, and a right click as the right hand.</li><li>Open the <b>Console</b> tab under the code. Each trial adds a line, printed by <code>recordTrial</code> in <code>data-manager.js</code>.</li></ol>`,
                hints: [
                    'Press Run, then wait a moment for the first target.',
                    'Click a target while it\'s showing. The next one appears shortly after.',
                    'Play until the Console tab shows three lines that start with <code>Trial</code>.'
                ],
                check(ws) {
                    if (!ws.runs) return fail('Press Run to start the game first.');
                    if (!ws.ran) return fail('You\'ve changed a file since the game last ran. Press Run again, so that the game uses your latest code.');
                    const n = ws.trialLines.length;
                    if (n < 3) return fail(`The console shows ${n} ${n === 1 ? 'trial' : 'trials'} so far. Play at least three.`);
                    return pass(`The console shows ${n} trials. Each line was printed by <code>console.log</code> in <code>recordTrial</code>.`);
                }
            },
            {
                type: 'task',
                title: 'Ask the game a question',
                goal: 'In the Console tab, type an expression that reads the current score from the game, and press Enter.',
                explain: `<p>The console can run code inside the game while it's running. This is a quick way to check a value.</p><p>Parts of a project often need to find each other. In WebSpheres, <code>sphere-manager.js</code> finds the score manager with this expression:</p><pre class="snippet">document.querySelector('#score-display').components['score-manager']</pre><ul class="parts"><li><code>document.querySelector('#score-display')</code> finds the element with the id <code>score-display</code> in <code>index.html</code>.</li><li><code>.components['score-manager']</code> picks out the score-manager component attached to it.</li></ul><p>Add <code>.score</code> to the end to read its score. Type the whole expression into the console's input box, under the messages.</p>`,
                hints: [
                    'Play a trial or two first, so that the score isn\'t 0.',
                    'The expression starts with <code>document.querySelector(\'#score-display\')</code>.',
                    'Type <code>document.querySelector(\'#score-display\').components[\'score-manager\'].score</code> and press Enter.'
                ],
                check(ws) {
                    if (!ws.runs) return fail('Press Run to start the game first.');
                    const good = ws.step.evals.filter(e => !e.isError && e.actual !== null && e.result === e.actual && /score/.test(e.expr));
                    if (!good.length) {
                        const last = ws.step.evals[ws.step.evals.length - 1];
                        if (!last) return fail('Type the expression into the console\'s input box, and press Enter.');
                        if (last.isError) return fail(`The console reported an error: <code>${WSA.esc(last.result)}</code>. Check the expression against the one in the explanation.`);
                        return fail(`The console answered <code>${WSA.esc(last.result)}</code>, but the score is ${WSA.esc(String(last.actual))}. Read the <code>score</code> of the score manager.`);
                    }
                    const g = good[good.length - 1];
                    if (Number(g.result) === 0) return nudge('Are you sure? The expression works, but the score is 0. Play a trial, then ask again.');
                    return pass(`The console answered ${WSA.esc(g.result)}, the current score. You read a value from inside the running game.`);
                }
            },
            {
                type: 'quiz',
                title: 'Components and this',
                goal: 'Choose what <code>this.score</code> means in <code>score-manager.js</code>.',
                explain: `<p>Open <code>score-manager.js</code>. <code>AFRAME.registerComponent('score-manager', { ... })</code> creates a <b>component</b>: an object that A-Frame attaches to an element in the scene. In <code>index.html</code>, the element with the id <code>score-display</code> has the score-manager component.</p><p>A component's functions are listed as fields of an object, such as <code>init: function () { ... }</code>. A-Frame calls <code>init</code> once, when the component starts.</p><p>Inside the functions, <code>this</code> means the component itself. Earlier lessons said to read <code>this.radius</code> as a variable. It's a field of the component, so every function of the component can use it.</p><p><code>this.score += amount;</code> is short for <code>this.score = this.score + amount;</code></p>`,
                question: '<code>init</code> runs <code>this.score = 0;</code> and <code>addPoints</code> runs <code>this.score += amount;</code>. What is <code>this.score</code>?',
                options: [
                    { text: 'A variable that only exists inside <code>init</code>', correct: false, why: 'A variable made with <code>let</code> inside <code>init</code> would only exist there. <code>this.score</code> is a field of the component, so <code>addPoints</code> can use it too.' },
                    { text: 'The score that belongs to this score-manager component, shared by all its functions', correct: true, why: 'Correct. <code>init</code> sets it to 0, and <code>addPoints</code> adds to it.' },
                    { text: 'The score of the target that was hit', correct: false, why: 'The targets don\'t have scores. The score manager keeps one score for the whole game.' },
                    { text: 'A copy of the score that goes back to 0 each time a function runs', correct: false, why: 'Fields of a component keep their values between calls. Only <code>init</code> sets the score to 0.' }
                ],
                success: 'Correct. A component keeps its state in fields such as <code>this.score</code>, and its functions share them. WebSpheres is built the same way.',
                hints: [
                    'Which functions of score-manager use <code>this.score</code>?',
                    '<code>init</code> and <code>addPoints</code> both use it, so it can\'t only exist inside one of them.',
                    'The answer is the second option.'
                ]
            },
            {
                type: 'task',
                title: 'Change a rule',
                goal: 'In <code>floating-number.js</code>, change the colour of normal hits to white, <code>"#FFFFFF"</code>. Then run the game, and score a normal hit.',
                explain: `<ol><li>Open <code>floating-number.js</code>, and find the line that makes <code>color</code>. It uses <code>? :</code> from lesson 4.</li><li>Change the colour after the colon. Keep the quotes. Critical hits should stay gold.</li><li>Press <b>Run</b>, and play until a normal hit floats a white label.</li></ol>`,
                hints: [
                    'The line is <code>const color = hitType === \'critical\' ? \'#FFD700\' : \'#CCCCCC\';</code>',
                    'Replace <code>\'#CCCCCC\'</code> with <code>\'#FFFFFF\'</code>.',
                    'Change the line to <code>const color = hitType === \'critical\' ? \'#FFD700\' : \'#FFFFFF\';</code>, press Run, and score a normal hit.'
                ],
                check(ws) {
                    const line = ws.files['floating-number.js'].split('\n').find(l => /const color/.test(l)) || '';
                    if (!/#FFD700/i.test(line)) return fail('Critical hits should stay gold, <code>\'#FFD700\'</code>. Only change the colour after the colon.');
                    if (!/['"](#FFFFFF|#FFF|white)['"]\s*;?\s*$/i.test(line)) return fail('The colour after the colon is still not white. Change <code>\'#CCCCCC\'</code> to <code>\'#FFFFFF\'</code>.');
                    if (!ws.ran) return fail('The file is changed. Press Run, so that the game uses your change.');
                    if (ws.runErrors) return fail('The game reported an error. Read it in the Console tab.');
                    if (!ws.logs.some(l => l.kind === 'log' && /Type normal/.test(l.text))) return fail('Play until you score a normal hit, and watch its label.');
                    return pass('Normal hits now float white labels. You changed one rule in one file, and the game used it after you ran it again.');
                }
            },
            {
                type: 'task',
                title: 'Read a real error',
                goal: 'In <code>score-manager.js</code>, delete the last curly bracket <code>}</code> before <code>});</code> at the end of the file. Run the game, and read the error in the console. Then put the bracket back, and run the game again.',
                explain: `<p>In earlier lessons, the page explained errors for you. Real browsers report errors in their own words. Learning to read them is an important skill.</p><ol><li>Delete the bracket, and press Run. The browser can't read <code>score-manager.js</code> any more, so part of the game is missing.</li><li>Open the Console tab. The error names the problem, the file and the line where the browser noticed it. The line it reports is often after the real mistake.</li><li>Put the bracket back, press Run, and check that the game works again.</li></ol>`,
                hints: [
                    'The last lines of <code>score-manager.js</code> are <code>    }</code> then <code>});</code>. Delete the <code>}</code> on its own line.',
                    'After running, the console shows a red line that starts with <code>SyntaxError</code>.',
                    'To undo the change, type the <code>}</code> back on its own line, or use Ctrl and Z, then press Run.'
                ],
                check(ws) {
                    if (!ws.step.errorsSeen) return fail('Delete the bracket and run the game first, so that the console shows an error.');
                    if (squash(ws.files['score-manager.js']) !== squash(ws.pristine['score-manager.js'])) return fail('<code>score-manager.js</code> doesn\'t match the original yet. Put the bracket back exactly where it was.');
                    if (!ws.ran) return fail('The bracket is back. Press Run again.');
                    if (ws.runErrors) return fail('The game still reports an error. Read the newest message in the Console tab.');
                    return pass('You saw a real browser error, fixed the code, and the game runs again. Real error messages are shorter than the ones in earlier lessons, but they name the file and the line, which tells you where to start looking.');
                }
            },
            {
                type: 'task',
                title: 'Print a value',
                goal: 'In <code>calculateHitPoints</code>, add a line that prints the critical-hit chance. Then run the game, and score a hit.',
                explain: `<p>Adding <code>console.log</code> lines is one of the quickest ways to see what code is doing while it runs.</p><ol><li>Open <code>score-manager.js</code>, and find the line in <code>calculateHitPoints</code> that makes <code>criticalChance</code>.</li><li>Under it, add: <code>console.log(\`Critical-hit chance: \${criticalChance}\`);</code></li><li>Press Run, and score a hit. The chance appears in the console before the trial's line.</li></ol>`,
                hints: [
                    'The line you need is the one that starts with <code>const criticalChance</code>.',
                    'Add the new line straight after it, inside the function.',
                    'Add <code>console.log(`Critical-hit chance: ${criticalChance}`);</code> after the <code>const criticalChance</code> line, then press Run.'
                ],
                check(ws) {
                    const text = ws.files['score-manager.js'];
                    const lines = text.split('\n');
                    const start = lines.findIndex(l => /calculateHitPoints\s*:\s*function/.test(l));
                    const end = lines.findIndex((l, i) => i > start && /^\s{4}\},?\s*$/.test(l));
                    const body = lines.slice(start, end === -1 ? undefined : end).join('\n');
                    if (!/console\.log\s*\(/.test(body)) return fail('Add a <code>console.log</code> line inside <code>calculateHitPoints</code>.');
                    if (!ws.ran) return fail('Press Run, so that the game uses your change.');
                    if (ws.runErrors) return fail('The game reported an error. Read it in the Console tab.');
                    if (!ws.logs.some(l => l.kind === 'log' && /0\.3/.test(l.text) && !/^Trial /.test(l.text))) return fail('Score a hit. The console should then show the chance, 0.3.');
                    return pass('The console shows the chance for each hit. When something in a program behaves unexpectedly, printing values like this is often the first step.');
                }
            },
            {
                type: 'quiz',
                title: 'The trial file',
                goal: 'Open the CSV tab, press <b>Show trials as CSV</b>, then answer the question.',
                explain: `<p><code>buildCSV</code> in <code>data-manager.js</code> turns the list of trials into the text of a CSV file, using <code>formatTrialRow</code> from lesson 8. Its six columns are the first six columns of the WebSpheres trial file.</p>`,
                question: 'Which column of the CSV comes from <code>targetPosition + 1</code> in <code>recordTrial</code>?',
                options: [
                    { text: 'Trial', correct: false, why: 'Trial comes from <code>this.trialNumber</code>, which goes up by 1 each trial.' },
                    { text: 'Target', correct: true, why: 'Correct. The target number is the target\'s index plus 1.' },
                    { text: 'Points', correct: false, why: 'Points comes from <code>calculateHitPoints</code>.' },
                    { text: 'Timestamp', correct: false, why: 'Timestamp is the time since the game started, in milliseconds.' }
                ],
                success: 'Correct. The Target column holds target numbers from 1 to 11, made from indexes 0 to 10.',
                hints: [
                    'Open <code>data-manager.js</code> and read <code>recordTrial</code>.',
                    'Which field is set to <code>targetPosition + 1</code>?',
                    'The answer is Target.'
                ]
            }
        ],
        learned: [
            'Real projects are split into files by job. Searching all the files is often the quickest way to find code.',
            'Changes take effect only when the program runs again.',
            'The browser console shows messages and errors, and can run code inside a running page.',
            'An A-Frame component keeps its state in fields such as <code>this.score</code>, which all its functions share.',
            'Real error messages are short, but they name the file and line where the problem was noticed.'
        ],
        real: {
            file: 'WebSpheres',
            where: 'the main files in the WebSpheres folder',
            code: `index.html            the headset page and 3D scene
sphere-manager.js     targets, hits, timers and calibration
score-manager.js      points, critical hits and streaks
floating-number.js    the points label
data-manager.js       trial records and data files
kinematics-manager.js hand movement recording
audio-manager.js      sounds
spectator-manager.js  the link to the experimenter page
observer.html         the experimenter page`,
            note: `<p>WebSpheres has the same four managers as Spheres Practice, and more files around them. Now that you know how they're laid out, you can open any of them and find your way, starting with a search.</p><p>Lesson 12 adds git, which records every version of a project's files.</p>`
        }
    });
})();
