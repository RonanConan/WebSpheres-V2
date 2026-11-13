(function () {
    const WSA = window.WSA;
    const { pass, fail, nudge } = WSA;
    const esc = WSA.esc;
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const row = 'let trial = {\n  trial: 12,\n  timestamp: 48211,\n  target: 5,\n  hand: "LEFT",\n  points: 7,\n  hitType: "critical",\n  decisionTime: 642,\n  totalMovementTime: 1180,\n  recentreCount: 0,\n  participantId: "P01",\n  run: 1\n};\n\n';
    const wantRow = '12,48211,5,LEFT,7,critical,642,1180,0,P01,1';
    const fields = [['trial', 1], ['target', 5], ['hand', 'LEFT'], ['points', 7], ['hitType', 'critical']];

    function table(obj) {
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return '<p class="dim">The table shows an object once <code>trial</code> holds one.</p>';
        const keys = Object.keys(obj);
        if (!keys.length) return '<h3>Trial record</h3><p class="note">The object is empty. Add fields between the curly brackets.</p>';
        return `<h3>Trial record</h3><table class="data-table"><thead><tr>${keys.map(k => `<th>${esc(k)}</th>`).join('')}</tr></thead><tbody><tr>${keys.map(k => `<td>${esc(WSA.show(obj[k]))}</td>`).join('')}</tr></tbody></table>`;
    }

    window.LESSONS = window.LESSONS || [];
    window.LESSONS.push({
        id: 'lists',
        title: 'Lists and records',
        subtitle: 'Arrays, objects and data tables',
        console: true,
        names: ['counts'],
        types: { counts: 'array' },
        starterCode: 'let counts = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];\n\n',
        scene: v => ({
            counts: Array.isArray(v.counts) ? v.counts.map(n => (typeof n === 'number' ? n : 0)) : null,
            highlights: Array.isArray(v.available) ? v.available.filter(Number.isInteger) : null
        }),
        intro: `
            <p>So far, each variable has held one value. Programs often need to keep many values together, such as a count for each of the 11 targets, or a record of every trial.</p>
            <p>An <b>array</b> is a list of values in one box. It's written in square brackets, with commas between the items:</p>
            <pre class="snippet">let hands = ["LEFT", "RIGHT", "LEFT"];</pre>
            <p>An <b>object</b> groups values under names, in curly brackets:</p>
            <pre class="snippet">let hit = { hand: "LEFT", points: 7 };</pre>
            <p>WebSpheres uses both. An array keeps a count for each target, and every trial is saved as an object. A list of trial objects becomes the trial data file.</p>`,
        steps: [
            {
                type: 'trace',
                title: 'Positions start at 0',
                goal: 'Work out what\'s in the box, without running the code.',
                explain: `<p>Each item in an array has a position, called its <b>index</b>. The first item is at index 0. Square brackets after the array's name pick out one item: <code>hands[0]</code> is the first item.</p>`,
                code: 'let names = ["first", "second", "third"];\nlet picked = names[1];',
                box: 'picked',
                question: 'After both lines have run, what is in <code>picked</code>?',
                answer: 'second',
                wrong: [
                    { value: 'first', near: true, message: 'Are you sure? Positions start at 0, so <code>names[0]</code> is "first", and <code>names[1]</code> is the next item.' },
                    { value: 'third', message: '"third" is at index 2.' }
                ],
                walk: [
                    '"first" is at index 0, "second" at index 1, and "third" at index 2.',
                    '<code>names[1]</code> picks the item at index 1.',
                    '<code>picked</code> holds "second".'
                ],
                success: 'Correct: "second". Counting from 0 is the same idea as the loop counter in lesson 6.',
                hints: [
                    'The first item is at index 0.',
                    'Which item is at index 1?',
                    'The answer is <code>"second"</code>.'
                ]
            },
            {
                title: 'Count an appearance',
                goal: 'Add a line that adds 1 to the count for target 5.',
                explain: `<p>WebSpheres keeps a list called <code>appearanceCounts</code>, with one count for each of the 11 targets. Each time a target appears, its count goes up by 1. The bars above the targets in the preview show the counts in your list.</p><p>Target numbers in the data files run from 1 to 11, but array positions run from 0 to 10. You can change one item like this: <code>counts[2] = counts[2] + 1;</code></p>`,
                hints: [
                    'Target 5 is one number higher than its index.',
                    'Target 5 is at index 4.',
                    'Add the line <code>counts[4] = counts[4] + 1;</code>'
                ],
                answer: 'let counts = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];\n\ncounts[4] = counts[4] + 1;\n',
                check(v, ctx) {
                    const c = v.counts;
                    if (c.length !== 11) return fail(`<code>counts</code> has ${c.length} items. It should still have 11, one for each target.`);
                    const want = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0];
                    if (same(c, want)) {
                        if (!/counts\s*\[\s*4\s*\]/.test(ctx.code)) return nudge('Are you sure? The list is right, but you changed the list itself. Add a separate line that changes one item, as WebSpheres does each time a target appears.');
                        return pass('Target 5 has a count of 1. Its bar is the only one that grew.');
                    }
                    if (c[5] === 1) return nudge('Are you sure? That\'s the count for target 6. Positions start at 0, so target 5 is at index 4.');
                    return fail('Only the count for target 5 should change, from 0 to 1.');
                }
            },
            {
                type: 'quiz',
                title: 'How long is the list?',
                goal: 'Choose what <code>counts.length</code> gives.',
                explain: `<p>Every array has a <code>.length</code>, which gives the number of items in it.</p>`,
                question: '<pre class="snippet">let counts = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];</pre>What does <code>counts.length</code> give?',
                options: [
                    { text: '10', correct: false, why: '10 is the index of the last item. <code>.length</code> counts the items.' },
                    { text: '11', correct: true, why: 'Correct. There are 11 items, at indexes 0 to 10.' },
                    { text: '12', correct: false, why: 'Count the zeros: there are 11.' },
                    { text: '0', correct: false, why: '<code>.length</code> gives the number of items, not their values.' }
                ],
                success: 'Correct. The last index is always one less than the length.',
                hints: [
                    'Count the items in the list.',
                    'The indexes run from 0 to 10.',
                    'The answer is 11.'
                ]
            },
            {
                title: 'Which targets can appear?',
                names: ['counts', 'available'],
                types: { counts: 'array', available: 'array' },
                setCode: 'let counts = [2, 0, 1, 2, 0, 2, 1, 0, 2, 2, 1];\nlet available = [];\n\n',
                goal: 'Use a loop to go through <code>counts</code>, and add the index of every target shown fewer than 2 times to <code>available</code>.',
                explain: `<p>In block mode, WebSpheres shows each target twice in every set of 22 trials. Before choosing the next target, it makes a list of the targets that have been shown fewer than 2 times.</p><p><code>available.push(4)</code> adds 4 to the end of the list. Loop through the indexes with <code>i &lt; counts.length</code>, and use an <code>if</code> from lesson 4.</p><p>The preview lights up the targets in <code>available</code>.</p>`,
                hints: [
                    'Start with <code>for (let i = 0; i &lt; counts.length; i++) {</code>',
                    'Inside the loop: <code>if (counts[i] &lt; 2) { available.push(i); }</code>',
                    'Add: <code>for (let i = 0; i &lt; counts.length; i++) { if (counts[i] &lt; 2) { available.push(i); } }</code>'
                ],
                answer: 'let counts = [2, 0, 1, 2, 0, 2, 1, 0, 2, 2, 1];\nlet available = [];\n\nfor (let i = 0; i < counts.length; i++) {\n  if (counts[i] < 2) {\n    available.push(i);\n  }\n}\n',
                check(v, ctx) {
                    const cases = [
                        ['[2, 0, 1, 2, 0, 2, 1, 0, 2, 2, 1]', [1, 2, 4, 6, 7, 10]],
                        ['[0, 2, 2, 2, 2, 2, 2, 2, 2, 2, 0]', [0, 10]],
                        ['[1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]', [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]]
                    ];
                    for (const [counts, want] of cases) {
                        const r = ctx.variant({ counts });
                        if (!r.ok) return fail(esc(r.error.message));
                        if (!same(r.values.available, want)) {
                            if (same(r.values.available, want.map(i => i + 1))) return nudge('Are you sure? Your list holds target numbers, which start at 1. It should hold indexes, which start at 0.');
                            return fail(`With counts <code>${esc(counts)}</code>, <code>available</code> should be <code>${esc(JSON.stringify(want))}</code>, but your code gives <code>${esc(JSON.stringify(r.values.available))}</code>.`);
                        }
                    }
                    return pass('Your loop finds the right targets. The page tried three different lists of counts. <code>selectRandomSphere</code> in <code>sphere-manager.js</code> builds its <code>availablePositions</code> list in the same way.');
                }
            },
            {
                title: 'A trial record',
                names: ['trial'],
                types: { trial: 'object' },
                setCode: 'let trial = {};\n',
                panel: v => table(v.trial),
                goal: 'Fill in <code>trial</code> as an object with five fields: <code>trial</code> 1, <code>target</code> 5, <code>hand</code> "LEFT", <code>points</code> 7 and <code>hitType</code> "critical".',
                explain: `<p>Each name and value pair in an object is called a <b>field</b>. A colon goes between the name and the value, and commas go between fields:</p><pre class="snippet">let hit = {\n  hand: "LEFT",\n  points: 7\n};</pre><p>You read a field with a dot: <code>hit.points</code> is 7.</p><p>WebSpheres saves each trial as an object like this one. The panel shows your object as a row of a table.</p>`,
                hints: [
                    'Put the fields between the curly brackets, with a comma after each one except the last.',
                    'Text values need quotes, and numbers don\'t: <code>hand: "LEFT"</code>, <code>points: 7</code>.',
                    'The whole line can be <code>let trial = { trial: 1, target: 5, hand: "LEFT", points: 7, hitType: "critical" };</code>'
                ],
                answer: 'let trial = {\n  trial: 1,\n  target: 5,\n  hand: "LEFT",\n  points: 7,\n  hitType: "critical"\n};\n',
                check(v) {
                    const t = v.trial;
                    for (const [name, want] of fields) {
                        if (!(name in t)) {
                            const twin = Object.keys(t).find(k => k.toLowerCase() === name.toLowerCase());
                            if (twin) return fail(`Capital letters matter. The object has a field called <code>${esc(twin)}</code>, but it should be called <code>${name}</code>.`);
                            return fail(`The object needs a field called <code>${name}</code>.`);
                        }
                        if (t[name] !== want) return fail(`<code>${name}</code> is <code>${esc(WSA.literal(t[name]))}</code>. It should be <code>${esc(WSA.literal(want))}</code>.`);
                    }
                    const extra = Object.keys(t).filter(k => !fields.some(f => f[0] === k));
                    if (extra.length) return fail(`The object has a field that isn't needed: <code>${esc(extra[0])}</code>.`);
                    return pass('The trial record has all five fields. In WebSpheres, <code>recordTrial</code> in <code>data-manager.js</code> makes an object like this one for every trial, with six more fields.');
                }
            },
            {
                type: 'bug',
                title: 'Fix the bugs',
                names: ['position', 'trial'],
                types: { position: 'number', trial: 'object' },
                setCode: 'let position = 4;\nlet trial = { trial: 1, target: position, hand: "LEFT", points: 7, hitType: "critical" };\n\nconsole.log(`Target ${trial.Target}`);\n',
                panel: v => table(v.trial),
                goal: 'The hit was on the target at index 4, which is target 5. Fix the two mistakes, so that the record says target 5, and the console shows <code>Target 5</code>.',
                explain: `<p>Neither mistake stops the code from running. Look at the table in the panel, and at the console.</p>`,
                hints: [
                    'The record should hold the target number, which is one more than the index.',
                    'In the last line, the field name has a capital letter, but the object\'s field doesn\'t.',
                    'Line 2 should have <code>target: position + 1</code>, and the last line should use <code>${trial.target}</code>.'
                ],
                answer: 'let position = 4;\nlet trial = { trial: 1, target: position + 1, hand: "LEFT", points: 7, hitType: "critical" };\n\nconsole.log(`Target ${trial.target}`);\n',
                check(v, ctx) {
                    const last = ctx.logs[ctx.logs.length - 1];
                    if (v.trial.target !== 5) return fail(`The record says target ${esc(WSA.show(v.trial.target))}. It should say 5.`);
                    const moved = ctx.variant({ position: '7' });
                    if (!moved.ok || !moved.values.trial || moved.values.trial.target !== 8) return nudge('Are you sure? The record says 5, but you typed it by hand. Work it out from <code>position</code>, so that it\'s right for any target.');
                    if (last !== 'Target 5') return fail(`The record is right, but the console shows <code>${esc(WSA.show(last))}</code>. Reading a field that doesn't exist gives <code>undefined</code>.`);
                    return pass('Both bugs are fixed. Reading a field that doesn\'t exist doesn\'t cause an error. It gives <code>undefined</code>, which is why these bugs are easy to miss.');
                }
            },
            {
                type: 'order',
                title: 'From record to file',
                goal: 'Put the lines in an order that records a trial, and prints it as a row of a data file.',
                explain: `<p>A list of objects is like a table. Each object is a row, and its fields are the columns. WebSpheres keeps a list of trial objects, and turns each one into a line of the CSV data file, with commas between the values.</p><p><code>trials[0].trial</code> reads the <code>trial</code> field of the first object in the list.</p>`,
                lines: ['let trials = [];', 'let trial = { trial: 1, target: 5, hand: "LEFT", points: 7 };', 'trials.push(trial);', 'let row = `${trials[0].trial},${trials[0].target},${trials[0].hand},${trials[0].points}`;', 'console.log(row);'],
                names: ['trials', 'trial', 'row'],
                start: [3, 1, 4, 0, 2],
                answer: [0, 1, 2, 3, 4],
                cases: [{ log: '1,5,LEFT,7', fail: 'The code runs, but it doesn\'t print <code>1,5,LEFT,7</code> yet.' }],
                success: 'The row is printed. Each line uses a box made on a line above it.',
                hints: [
                    'The list and the object have to exist before the object is added to the list.',
                    'The row can only be built after the object is in the list, and printed after it\'s built.',
                    'One order that works: <code>let trials</code>, <code>let trial</code>, <code>trials.push</code>, <code>let row</code>, <code>console.log</code>.'
                ]
            },
            {
                title: 'Make the row match',
                names: ['trial', 'row'],
                types: { trial: 'object', row: 'text' },
                setCode: row + 'let row = "";\n',
                panel: v => {
                    const ok = v.row === wantRow;
                    return `<h3>Trial file row</h3><p class="note">Goal</p><p><code>${esc(wantRow)}</code></p><p class="note">Your row</p><p><code>${esc(WSA.show(v.row)) || '(empty)'}</code> ${ok ? '<span class="ok">✓</span>' : ''}</p>`;
                },
                goal: `Build <code>row</code> from the fields of <code>trial</code>, so that it matches this line from a trial data file exactly: <code>${wantRow}</code>`,
                explain: `<p>This object has every field that WebSpheres records for a trial. The values are made up. The columns of the trial file come in this order: Trial, Timestamp, Target, Hand, Points, HitType, DecisionTime, TotalMovementTime, RecentreCount, ParticipantID and Block. The Block column comes from the field called <code>run</code>.</p><p>Use a template literal, with a comma between each value. The panel compares your row with the goal.</p>`,
                hints: [
                    'Start with <code>let row = `${trial.trial},${trial.timestamp},</code> and continue in the order of the columns.',
                    'After timestamp come target, hand, points, hitType, decisionTime, totalMovementTime, recentreCount, participantId and run.',
                    'The last line should be <code>let row = `${trial.trial},${trial.timestamp},${trial.target},${trial.hand},${trial.points},${trial.hitType},${trial.decisionTime},${trial.totalMovementTime},${trial.recentreCount},${trial.participantId},${trial.run}`;</code>'
                ],
                answer: row + 'let row = `${trial.trial},${trial.timestamp},${trial.target},${trial.hand},${trial.points},${trial.hitType},${trial.decisionTime},${trial.totalMovementTime},${trial.recentreCount},${trial.participantId},${trial.run}`;\n',
                check(v, ctx) {
                    const at = ctx.code.search(/\brow\s*=/);
                    const built = at === -1 ? '' : ctx.code.slice(at).replace(/\/\/.*$/gm, '');
                    const reads = (built.match(/\btrial\.\w+/g) || []).length;
                    if (v.row === wantRow && reads < 11) return nudge('Are you sure? The row matches, but some values are typed by hand. Build every value from a field of <code>trial</code>, so that the code works for any trial.');
                    if (v.row === wantRow) return pass('Your row matches the trial file exactly. This is what <code>formatTrialRow</code> in <code>data-manager.js</code> does for every trial.');
                    const got = String(v.row).split(',');
                    const want = wantRow.split(',');
                    if (got.length !== want.length) return fail(`Your row has ${got.length} ${got.length === 1 ? 'value' : 'values'}. The goal has ${want.length}, separated by commas.`);
                    const k = got.findIndex((x, i) => x !== want[i]);
                    return fail(`Value number ${k + 1} is <code>${esc(got[k])}</code>. It should be <code>${esc(want[k])}</code>.`);
                }
            },
            {
                type: 'find',
                title: 'Find it in WebSpheres',
                goal: 'Find the line in <code>recordTrial</code> that turns the target\'s index (0 to 10) into its target number (1 to 11).',
                explain: `<p>This is the real <code>recordTrial</code> function from <code>data-manager.js</code>. It adds a trial object to the list <code>trialData</code>, using <code>push</code>.</p>`,
                file: 'data-manager.js',
                startLine: 381,
                code: `    recordTrial: function(targetPosition, handUsed, points, hitType, decisionTime) {
        this.trialNumber++;
        this.trialData.push({
            trial: this.trialNumber,
            timestamp: Date.now() - this.sessionStartTime,
            target: targetPosition + 1, // Convert 0-10 to 1-11
            hand: handUsed,
            points: points,
            hitType: hitType,
            decisionTime: decisionTime,
            totalMovementTime: this.currentMovementTime,
            recentreCount: this.recentreCount,
            participantId: this.participantId,
            run: this.runNumber
        });`,
                question: 'Which line turns the target\'s index into its target number?',
                answer: [5],
                wrong: {
                    0: 'That line starts the function. <code>targetPosition</code> is the index of the target that was hit.',
                    1: 'That line adds 1 to the trial number.',
                    2: 'That line starts adding a new object to the list of trials.',
                    3: 'That line records the trial number.',
                    4: 'That line records the time, in milliseconds, since the current block started.',
                    6: 'That line records the hand.',
                    7: 'That line records the points.',
                    8: 'That line records the hit type.',
                    9: 'That line records the decision time.',
                    10: 'That line records the movement time.',
                    11: 'That line records how many times the view was recentred.',
                    12: 'That line records the participant ID.',
                    13: 'That line records the block number, in a field called <code>run</code>.',
                    14: 'That line ends the object and the push.'
                },
                success: 'Correct. <code>target: targetPosition + 1</code> is the fix you made in step 6. The comment at the end of the line explains it.',
                hints: [
                    'Look for a <code>+ 1</code>.',
                    'The line sets the <code>target</code> field.',
                    'It\'s line 386.'
                ]
            }
        ],
        learned: [
            'An array is a list of values in square brackets. The first item is at index 0.',
            '<code>.length</code> gives the number of items, and <code>.push()</code> adds an item to the end.',
            'An object groups values under names, called fields. You read a field with a dot.',
            'A list of objects is like a table, and can be turned into the rows of a data file.',
            'Reading a field that doesn\'t exist gives <code>undefined</code>, not an error.'
        ],
        real: {
            file: 'data-manager.js',
            where: 'lines 4 and 174 to 176',
            code: `TRIAL_HEADER: 'Trial,Timestamp,Target,Hand,Points,HitType,DecisionTime,TotalMovementTime,RecentreCount,ParticipantID,Block\\n',

formatTrialRow: function(trial) {
    return \`\${trial.trial},\${trial.timestamp},\${trial.target},\${trial.hand},\${trial.points},\${trial.hitType},\${trial.decisionTime},\${trial.totalMovementTime},\${trial.recentreCount},\${trial.participantId},\${trial.run}\\n\`;
},`,
            note: `<p>The first line is the header of the trial file: the names of its columns. <code>formatTrialRow</code> is the function that builds each row, in the same way as your step 8. The <code>\\n</code> at the end of each line is the code for a new line, so that each trial goes on its own line in the file.</p>`
        }
    });
})();
