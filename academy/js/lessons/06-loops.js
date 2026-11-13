(function () {
    const WSA = window.WSA;
    const { pass, fail, nudge } = WSA;
    const esc = WSA.esc;
    const arcNames = ['count', 'spacing', 'firstAngle'];
    const arcTypes = { count: 'number', spacing: 'number', firstAngle: 'number' };
    const arcCode = count => `let count = ${count};\nlet spacing = 8;\nlet firstAngle = -(count - 1) * spacing / 2;\n\nfor (let i = 0; i < count; i++) {\n  addTarget(firstAngle + i * spacing);\n}\n`;
    const ghostAngles = Array.from({ length: 9 }, (_, i) => -40 + i * 10);
    const usesLoop = code => /\bfor\s*\(|\bwhile\s*\(/.test(code);

    function anglesOf(ctx) {
        const s = ctx.sim();
        if (!s.ok) return { error: s.error.message };
        return { angles: s.state.angles };
    }

    function compareArc(got, want) {
        if (got.length !== want.length) return `Your code adds ${got.length} ${got.length === 1 ? 'target' : 'targets'}. The goal is ${want.length}.`;
        const k = got.findIndex((a, i) => !WSA.near(a, want[i]));
        if (k !== -1) return `The target at position ${k} is at ${WSA.fmt(got[k])}°. It should be at ${want[k]}°.`;
        return null;
    }

    window.LESSONS = window.LESSONS || [];
    window.LESSONS.push({
        id: 'loops',
        title: 'Loops',
        subtitle: 'Repeating instructions',
        api: 'targets',
        console: true,
        names: [],
        types: {},
        starterCode: 'addTarget(-40);\naddTarget(-32);\naddTarget(-24);\n',
        intro: `
            <p>A <b>loop</b> repeats instructions. WebSpheres builds its 11 targets with a loop, instead of writing the same instructions 11 times.</p>
            <p>A <code>for</code> loop has three parts in its round brackets, separated by semicolons:</p>
            <pre class="snippet">for (let i = 0; i &lt; 3; i++) {\n  console.log(i);\n}</pre>
            <ul class="parts">
                <li><code>let i = 0</code> makes a counter. It runs once, at the start.</li>
                <li><code>i &lt; 3</code> is the condition. The block in curly brackets runs again and again while the condition is true.</li>
                <li><code>i++</code> adds 1 to the counter after each repeat. It's short for <code>i = i + 1</code>.</li>
            </ul>
            <p>This loop prints 0, 1 and 2. When <code>i</code> reaches 3, the condition is false, so the loop stops.</p>
            <p>In this lesson, the page gives you a function called <code>addTarget</code>. Each call adds one target to the preview, at the angle you pass in.</p>`,
        steps: [
            {
                type: 'trace',
                title: 'Counting repeats',
                goal: 'Work out what\'s in the box, without running the code.',
                explain: `<p>Each time the block runs, <code>count</code> goes up by 1. So <code>count</code> ends up holding the number of times the block ran.</p>`,
                code: 'let count = 0;\nfor (let i = 0; i < 11; i++) {\n  count = count + 1;\n}',
                box: 'count',
                question: 'After the loop has finished, what is in <code>count</code>?',
                answer: 11,
                wrong: [
                    { value: 10, near: true, message: 'Are you sure? <code>i</code> starts at 0, not 1. Count the values of <code>i</code> from 0 to 10.' },
                    { value: 12, message: 'The loop stops as soon as <code>i &lt; 11</code> is false, which is when <code>i</code> reaches 11. The block doesn\'t run for 11.' }
                ],
                walk: [
                    'The block runs for i = 0, 1, 2, and so on, up to i = 10.',
                    'That\'s 11 values, so the block runs 11 times.',
                    'When i reaches 11, <code>i &lt; 11</code> is false, so the loop stops. <code>count</code> holds 11.'
                ],
                success: 'Correct: 11. Counting from 0 is common in code, so <code>i &lt; 11</code> gives 11 repeats.',
                hints: [
                    'List the values of <code>i</code> that make <code>i &lt; 11</code> true.',
                    '<code>i</code> runs from 0 to 10.',
                    'The answer is <code>11</code>.'
                ]
            },
            {
                title: 'Build the arc',
                goal: 'Replace the three lines with a <code>for</code> loop that adds all 11 targets, at -40 + i × 8 degrees.',
                explain: `<p>The three lines add the first three targets. Writing all 11 by hand would work, but a loop is shorter and easier to change. Inside the loop, use the counter <code>i</code> to work out each angle.</p>`,
                hints: [
                    'Start with <code>for (let i = 0; i &lt; 11; i++) {</code> and end with <code>}</code>.',
                    'Inside the loop, call <code>addTarget(-40 + i * 8);</code> Then delete the three original lines.',
                    'The whole code should be <code>for (let i = 0; i &lt; 11; i++) { addTarget(-40 + i * 8); }</code>'
                ],
                answer: 'for (let i = 0; i < 11; i++) {\n  addTarget(-40 + i * 8);\n}\n',
                check(v, ctx) {
                    const a = anglesOf(ctx);
                    if (a.error) return fail(esc(a.error));
                    const problem = compareArc(a.angles, Array.from({ length: 11 }, (_, i) => -40 + i * 8));
                    if (problem) return fail(problem);
                    if (!usesLoop(ctx.code)) return nudge('Are you sure? The targets are right, but there\'s no loop. Use a <code>for</code> loop, so that the computer does the repeating.');
                    return pass('All 11 targets are on the arc, added by a loop. Lines 87 and 88 of <code>sphere-manager.js</code> do the same.');
                }
            },
            {
                title: 'Fewer targets',
                predict: {
                    question: 'If you change 11 to 7 in your loop, where will the 7 targets be?',
                    options: ['Spread across the whole arc', 'Bunched to one side of the arc', 'In the middle of the arc'],
                    answer: 1,
                    explain: 'The first target is still at -40°, and each next target is 8° further on, so the last one is at 8°. The targets bunch to one side.'
                },
                goal: 'Change the loop so that it adds 7 targets.',
                explain: `<p>Watch where the targets appear in the preview.</p>`,
                hints: [
                    'The number of repeats is set by the condition.',
                    'Change <code>i &lt; 11</code> to <code>i &lt; 7</code>.',
                    'The loop should start with <code>for (let i = 0; i &lt; 7; i++) {</code>'
                ],
                answer: 'for (let i = 0; i < 7; i++) {\n  addTarget(-40 + i * 8);\n}\n',
                check(v, ctx) {
                    const a = anglesOf(ctx);
                    if (a.error) return fail(esc(a.error));
                    const problem = compareArc(a.angles, Array.from({ length: 7 }, (_, i) => -40 + i * 8));
                    if (problem) return fail(problem);
                    return pass('The loop adds 7 targets. They still start at -40°, so they sit on one side of the arc.');
                }
            },
            {
                title: 'Centre the arc',
                names: arcNames,
                types: arcTypes,
                setCode: 'let count = 7;\nlet spacing = 8;\nlet firstAngle = -40;\n\nfor (let i = 0; i < count; i++) {\n  addTarget(firstAngle + i * spacing);\n}\n',
                goal: 'Change line 3 so that <code>firstAngle</code> is calculated from <code>count</code> and <code>spacing</code>, and the arc is centred for any number of targets.',
                explain: `<p>Your code now keeps the number of targets and the gap between them in variables. To centre the arc, the first target has to be as far to one side as the last target is to the other.</p><p>From the first target to the last, the arc covers <code>(count - 1) * spacing</code> degrees. The first target is at minus half of that.</p><p>Try different values of <code>count</code> and <code>spacing</code> to check that the arc stays centred.</p>`,
                hints: [
                    'The arc covers <code>(count - 1) * spacing</code> degrees. Half of that is <code>(count - 1) * spacing / 2</code>.',
                    'The first target is on the negative side, so put a minus sign in front.',
                    'Change line 3 to <code>let firstAngle = -(count - 1) * spacing / 2;</code>'
                ],
                answer: arcCode(7),
                check(v, ctx) {
                    for (const [count, spacing] of [[7, 8], [11, 8], [4, 10], [9, 12]]) {
                        const r = ctx.variant({ count: String(count), spacing: String(spacing) });
                        if (!r.ok) return fail(esc(r.error.message));
                        const got = r.game.state.angles;
                        const want = Array.from({ length: count }, (_, i) => -(count - 1) * spacing / 2 + i * spacing);
                        const problem = compareArc(got, want);
                        if (problem) return fail(`With ${count} targets ${spacing}° apart, the arc isn't centred. ${problem}`);
                    }
                    return pass('The arc is centred for every count and spacing the page tried. Calculating one value from others, as in lesson 2, keeps the code right when the numbers change.');
                }
            },
            {
                type: 'quiz',
                title: 'Off by one',
                goal: 'Work out how many times this loop runs.',
                explain: `<p>Small differences in a loop's condition change how many times it repeats. Being one repeat out is called an off-by-one error. It's one of the most common bugs.</p>`,
                question: '<pre class="snippet">for (let i = 0; i &lt;= 11; i++) {\n  addTarget(-40 + i * 8);\n}</pre>How many targets does this loop add?',
                options: [
                    { text: '10', correct: false, why: 'The loop runs for every value of <code>i</code> from 0 up to and including 11.' },
                    { text: '11', correct: false, why: 'That would be the answer with <code>&lt;</code>. With <code>&lt;=</code>, the loop also runs when <code>i</code> is 11.' },
                    { text: '12', correct: true, why: 'Correct. <code>&lt;=</code> means "less than or equal to", so <code>i</code> runs from 0 to 11, which is 12 values.' },
                    { text: 'The loop never stops', correct: false, why: '<code>i</code> goes up by 1 each time, so it reaches 12 and the condition becomes false.' }
                ],
                success: 'Correct: 12. The extra target would be at 48°, outside the WebSpheres arc.',
                hints: [
                    'What does <code>&lt;=</code> mean?',
                    'List the values of <code>i</code> from 0 that make <code>i &lt;= 11</code> true.',
                    'The answer is 12.'
                ]
            },
            {
                type: 'bug',
                title: 'Fix the bugs',
                names: [],
                types: {},
                setCode: 'for (let i = 0; i <= 11; i--) {\n  addTarget(-40 + i * 8);\n}\n',
                goal: 'This loop has two mistakes. Fix both, so that it adds the 11 targets of the arc again.',
                explain: `<p>Fix the mistake described in the message under the code first. Then count the targets in the preview.</p>`,
                hints: [
                    'The counter goes down instead of up, so the condition never becomes false.',
                    'Change <code>i--</code> to <code>i++</code>. Then check the condition: how many targets should there be?',
                    'The loop should start with <code>for (let i = 0; i &lt; 11; i++) {</code>'
                ],
                answer: 'for (let i = 0; i < 11; i++) {\n  addTarget(-40 + i * 8);\n}\n',
                check(v, ctx) {
                    const a = anglesOf(ctx);
                    if (a.error) return fail(esc(a.error));
                    const problem = compareArc(a.angles, Array.from({ length: 11 }, (_, i) => -40 + i * 8));
                    if (problem) return fail(problem);
                    return pass('Both bugs are fixed. A loop whose counter moves the wrong way never meets its condition, so it never ends. The page stopped it for you, but a normal web page would stop responding.');
                }
            },
            {
                title: 'Add up the points',
                names: ['total'],
                types: { total: 'number' },
                setCode: 'let total = 0;\n',
                goal: 'A short block in WebSpheres has 110 trials. Use a loop to add up the score for a short block in which every hit scores 3 points.',
                explain: `<p>Loops are also useful for adding things up. Start with a total of 0, and add to it once each time the loop repeats:</p><pre class="snippet">let sum = 0;\nfor (let i = 0; i &lt; 4; i++) {\n  sum = sum + 10;\n}</pre><p>After this loop, <code>sum</code> holds 40.</p>`,
                hints: [
                    'Write a loop that repeats 110 times.',
                    'Inside the loop, add 3 to <code>total</code>: <code>total = total + 3;</code>',
                    'Add: <code>for (let trial = 0; trial &lt; 110; trial++) { total = total + 3; }</code>'
                ],
                answer: 'let total = 0;\n\nfor (let trial = 0; trial < 110; trial++) {\n  total = total + 3;\n}\n',
                check(v, ctx) {
                    if (v.total === 330 && !usesLoop(ctx.code)) return nudge('Are you sure? The total is right, but you worked it out yourself. Use a loop to add it up, so that the same code works for any number of trials.');
                    if (v.total === 333) return nudge('Are you sure? That\'s one trial too many. Check the loop\'s condition.');
                    if (v.total === 327) return nudge('Are you sure? That\'s one trial too few. Check the loop\'s condition.');
                    if (v.total !== 330) return fail(`<code>total</code> is ${esc(WSA.fmt(v.total))}. 110 trials at 3 points each should give 330.`);
                    return pass('The total is 330, added up by a loop.');
                }
            },
            {
                type: 'match',
                title: 'Match the outlines',
                names: arcNames,
                types: arcTypes,
                setCode: arcCode(7),
                goal: 'Change <code>count</code> and <code>spacing</code> until your targets line up with the white outlines.',
                explain: `<p>This is your centred arc from step 4. The outlines show a different arc. Count the outlines, and estimate the gap between them in degrees. Your code keeps the arc centred, so you only need to change <code>count</code> and <code>spacing</code>.</p><p>The outlines turn amber when you have the right number of targets and the gap is close, and green when your targets line up exactly.</p>`,
                ghost: { angles: ghostAngles },
                gap: v => {
                    if (v.count !== 9) return 100;
                    const mine = Array.from({ length: 9 }, (_, i) => v.firstAngle + i * v.spacing);
                    return Math.max(...mine.map((a, i) => Math.abs(a - ghostAngles[i])));
                },
                tolerance: 0.5,
                closeWithin: 10,
                hints: [
                    'Count the outlines first, and set <code>count</code> to that number.',
                    'There are 9 outlines. The outer two are at -40° and 40°, so the whole arc covers 80°, with 8 gaps between the 9 targets.',
                    'Set <code>count</code> to 9 and <code>spacing</code> to 10.'
                ],
                answer: arcCode(9).replace('let spacing = 8;', 'let spacing = 10;'),
                check(v) {
                    if (v.count !== 9) return fail(`Count the outlines. Your code adds ${esc(WSA.fmt(v.count))} targets.`);
                    if (!WSA.near(v.spacing, 10, 0.01)) return v.spacing > 10 ? fail('The number of targets is right, but your gaps are wider than the outlines\' gaps.') : fail('The number of targets is right, but your gaps are narrower than the outlines\' gaps.');
                    return pass('Your targets line up with the outlines: 9 targets, 10° apart.');
                }
            },
            {
                type: 'find',
                title: 'Find it in WebSpheres',
                goal: 'Find the line in <code>createSpheres</code> that sets the angle for each target.',
                explain: `<p>This is the start of <code>createSpheres</code> in <code>sphere-manager.js</code>, the loop that builds the WebSpheres targets.</p>`,
                file: 'sphere-manager.js',
                startLine: 86,
                code: `    createSpheres: function () {
        for (let i = 0; i < 11; i++) {
            let angle = -40 + (i * 8);
            let x = this.radius * Math.sin(angle * Math.PI / 180);
            let z = -this.radius * Math.cos(angle * Math.PI / 180);`,
                question: 'Which line sets the angle for each target?',
                answer: [2],
                wrong: {
                    0: 'That line starts the function.',
                    1: 'That line starts the loop. The lines inside it run 11 times, with <code>i</code> from 0 to 10.',
                    3: 'That line uses the angle to work out the target\'s x position.',
                    4: 'That line uses the angle to work out the target\'s z position.'
                },
                success: 'Correct. <code>let angle = -40 + (i * 8);</code> is the calculation you used in step 2. The brackets around <code>i * 8</code> don\'t change the result, because multiplying happens first anyway.',
                hints: [
                    'Look for the word <code>angle</code> after <code>let</code>.',
                    'The angle is worked out from <code>i</code>.',
                    'It\'s line 88.'
                ]
            }
        ],
        learned: [
            'A <code>for</code> loop repeats a block of code while its condition is true.',
            'The counter usually starts at 0, so <code>i &lt; 11</code> gives 11 repeats.',
            'Use the counter inside the loop to make each repeat a little different, such as the angle of each target.',
            'A loop can add up a total, one repeat at a time.',
            'A counter that never reaches the end of its condition gives a loop that never ends.'
        ],
        real: {
            file: 'sphere-manager.js',
            where: 'lines 86 to 90',
            code: `createSpheres: function () {
    for (let i = 0; i < 11; i++) {
        let angle = -40 + (i * 8);
        let x = this.radius * Math.sin(angle * Math.PI / 180);
        let z = -this.radius * Math.cos(angle * Math.PI / 180);`,
            note: `<p>Inside the loop, WebSpheres turns each angle into a position on the ring of targets. <code>Math.sin</code> and <code>Math.cos</code> are built-in functions from trigonometry. They need the angle in radians, not degrees, so <code>angle * Math.PI / 180</code> converts it first.</p><p><code>this.radius</code> is the ring size from lesson 2, so the targets always sit at the calibrated distance.</p>`
        }
    });
})();
