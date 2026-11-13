(function () {
    const WSA = window.WSA;
    const { pass, fail, nudge } = WSA;
    const esc = WSA.esc;
    const labelNames = ['hitType', 'labelColour', 'labelSize'];
    const labelTypes = { hitType: 'text', labelColour: 'colour', labelSize: 'number' };
    const isGold = c => ['#ffd700', 'gold'].includes(String(c).trim().toLowerCase());
    const isGrey = c => ['#cccccc', '#ccc'].includes(String(c).trim().toLowerCase());
    const show = v => `<code>${esc(WSA.show(v))}</code>`;

    function labelRule(ctx) {
        const crit = ctx.variant({ hitType: '"critical"' });
        const norm = ctx.variant({ hitType: '"normal"' });
        if (!crit.ok) return fail(esc(crit.error.message));
        if (!norm.ok) return fail(esc(norm.error.message));
        const c = crit.values;
        const n = norm.values;
        if (c.labelColour === n.labelColour && c.labelSize === n.labelSize) return fail('Both kinds of hit get the same label. The <code>if</code> statement needs to choose between them, using <code>hitType</code>.');
        if (!isGold(c.labelColour) || !WSA.near(c.labelSize, 1.5)) return fail(`For a critical hit, the label should be gold (<code>"#FFD700"</code>) at size 1.5. Your code gives ${show(c.labelColour)} at size ${show(c.labelSize)}.`);
        if (!isGrey(n.labelColour) || !WSA.near(n.labelSize, 0.8)) return fail(`For a normal hit, the label should be grey (<code>"#CCCCCC"</code>) at size 0.8. Your code gives ${show(n.labelColour)} at size ${show(n.labelSize)}.`);
        return null;
    }

    const chanceCases = [[1, 'LEFT', 0.3, 0.3], [1, 'RIGHT', 0.3, 0.3], [2, 'LEFT', 0.05, 0.55], [2, 'RIGHT', 0.55, 0.05]];

    window.LESSONS = window.LESSONS || [];
    window.LESSONS.push({
        id: 'if-else',
        title: 'If and else',
        subtitle: 'Making decisions with conditions',
        names: labelNames,
        types: labelTypes,
        starterCode: 'let hitType = "critical";\nlet labelColour = "#CCCCCC";\nlet labelSize = 0.8;\n\n',
        scene: v => (typeof v.labelColour === 'string' ? { label: v.hitType === 'critical' ? '+8' : '+3', labelColour: v.labelColour, labelScale: typeof v.labelSize === 'number' ? v.labelSize : 1 } : {}),
        intro: `
            <p>Programs often need to make decisions. In WebSpheres, a critical hit gets a large gold label and a normal hit gets a small grey one. The code decides which, every time a target is hit.</p>
            <p>Decisions are based on <b>conditions</b>. A condition is a question with a yes or no answer, such as "is the points value more than 5?". In code, the answer is <code>true</code> or <code>false</code>.</p>
            <table class="ops">
                <tr><td><code>===</code></td><td>is equal to</td><td><code>!==</code></td><td>is not equal to</td></tr>
                <tr><td><code>&lt;</code></td><td>is less than</td><td><code>&gt;</code></td><td>is more than</td></tr>
                <tr><td><code>&lt;=</code></td><td>is less than or equal to</td><td><code>&gt;=</code></td><td>is more than or equal to</td></tr>
            </table>
            <p>The preview shows the points label for one hit. Your code chooses its colour and size.</p>`,
        steps: [
            {
                type: 'trace',
                title: 'True or false',
                goal: 'Work out what\'s in the box, without running the code.',
                explain: `<p>A comparison such as <code>points &gt; 5</code> gives one of two values: <code>true</code> or <code>false</code>. These two values are called <b>booleans</b>. They don't have quotes, because they aren't text.</p>`,
                code: 'let points = 7;\nlet big = points > 5;',
                box: 'big',
                question: 'After both lines have run, what is in <code>big</code>?',
                answer: true,
                accept: (raw) => raw.trim().replace(/;$/, '').replace(/^big\s*=\s*/, '').trim() === 'true',
                wrong: [
                    { test: (v, raw) => /false/i.test(raw), message: '7 is more than 5, so the comparison gives true.' },
                    { test: (v, raw) => /^\s*"?true"?\s*$/i.test(raw) && raw.includes('"'), message: 'true is a boolean, not text, so it has no quotes.', near: true },
                    { test: v => typeof v === 'string' && v.toLowerCase() === 'true', message: 'Capital letters matter in JavaScript, so booleans are always written in lower case: <code>true</code> or <code>false</code>. Type your answer that way. This doesn\'t cost a star.', near: true, free: true },
                    { value: 7, message: '<code>points &gt; 5</code> doesn\'t give a number. It compares two numbers, and gives true or false.' },
                    { value: 5, message: '<code>points &gt; 5</code> doesn\'t give a number. It compares two numbers, and gives true or false.' }
                ],
                walk: [
                    '<code>points</code> holds 7.',
                    'The computer asks: is 7 more than 5? Yes.',
                    'So <code>big</code> holds <code>true</code>.'
                ],
                success: 'Correct: <code>true</code>. A comparison always gives a boolean, true or false.',
                hints: [
                    'Is 7 more than 5?',
                    'A comparison gives true or false.',
                    'The answer is <code>true</code>.'
                ]
            },
            {
                title: 'Gold or grey',
                predict: {
                    question: 'If <code>hitType</code> is <code>"normal"</code>, which part of this code runs?<pre class="snippet">if (hitType === "critical") {\n  labelColour = "#FFD700";\n} else {\n  labelColour = "#CCCCCC";\n}</pre>',
                    options: ['Only the part after if', 'Only the part after else', 'Both parts', 'Neither part'],
                    answer: 1,
                    explain: 'The condition <code>hitType === "critical"</code> is false for a normal hit, so the computer skips the first part and runs the part after <code>else</code>.'
                },
                goal: 'Under the three lines, add an <code>if</code> and <code>else</code>, so that a critical hit gets a gold label at size 1.5, and any other hit gets a grey label at size 0.8.',
                explain: `<p>An <code>if</code> statement runs some code only when its condition is true. The <code>else</code> part runs when the condition is false:</p><pre class="snippet">if (condition) {\n  // runs when the condition is true\n} else {\n  // runs when the condition is false\n}</pre><p><code>hitType === "critical"</code> asks whether <code>hitType</code> holds exactly the text "critical". Three equals signs compare two values. One equals sign puts a value in a box.</p><p>Gold is <code>"#FFD700"</code> and grey is <code>"#CCCCCC"</code>, the colours that WebSpheres uses. To see both results, change line 1 to <code>"normal"</code> and back again.</p>`,
                hints: [
                    'On a new line, start with <code>if (hitType === "critical") {</code> and finish the block with <code>}</code>.',
                    'Inside the if part, set <code>labelColour = "#FFD700";</code> and <code>labelSize = 1.5;</code>. Put the grey values inside the else part.',
                    'Add: <code>if (hitType === "critical") { labelColour = "#FFD700"; labelSize = 1.5; } else { labelColour = "#CCCCCC"; labelSize = 0.8; }</code>'
                ],
                answer: 'let hitType = "critical";\nlet labelColour = "#CCCCCC";\nlet labelSize = 0.8;\n\nif (hitType === "critical") {\n  labelColour = "#FFD700";\n  labelSize = 1.5;\n} else {\n  labelColour = "#CCCCCC";\n  labelSize = 0.8;\n}\n',
                check(v, ctx) {
                    return labelRule(ctx) || pass('A critical hit now gets a large gold label, and any other hit gets a small grey one. The page checked both kinds of hit. This is the same rule as lines 14 and 15 of <code>floating-number.js</code>.');
                }
            },
            {
                type: 'quiz',
                title: 'One, two or three',
                goal: 'Choose the line that checks the hit type correctly.',
                explain: `<p>JavaScript also has <code>==</code>, with two equals signs. It compares more loosely, and can treat different values as equal. Most programmers use <code>===</code>, and so does WebSpheres.</p>`,
                question: 'Which line checks whether <code>hitType</code> holds the text "critical"?',
                options: [
                    { text: '<code>if (hitType = "critical") {</code>', correct: false, why: 'One equals sign puts "critical" into <code>hitType</code>, instead of comparing. The condition is then always treated as true.' },
                    { text: '<code>if (hitType === "critical") {</code>', correct: true, why: 'Three equals signs compare the two values.' },
                    { text: '<code>if (hitType === critical) {</code>', correct: false, why: 'Without quotes, <code>critical</code> is read as the name of a variable.' },
                    { text: '<code>if ("critical") {</code>', correct: false, why: 'This doesn\'t mention <code>hitType</code>, so it doesn\'t check anything. Text that isn\'t empty always counts as true.' }
                ],
                success: 'Correct. Use <code>===</code> to compare two values, and <code>=</code> to put a value in a box.',
                hints: [
                    'Count the equals signs in each line.',
                    'Comparing needs three equals signs, and text needs quotes.',
                    'The answer is <code>if (hitType === "critical") {</code>'
                ]
            },
            {
                title: 'More than two choices',
                names: ['mode', 'totalTrials'],
                types: { mode: 'text', totalTrials: 'number' },
                setCode: 'let mode = "short";\nlet totalTrials = 352;\n\n',
                goal: 'Add an <code>if</code>, <code>else if</code> and <code>else</code> chain that sets <code>totalTrials</code> for each mode: 110 for <code>"short"</code>, 44 for <code>"fmode"</code>, 110 for <code>"block"</code>, and 352 for any other mode.',
                explain: `<p>Your code has changed. To choose between more than two options, join conditions with <code>else if</code>. The computer checks each condition in turn, runs the block of the first condition that's true, and skips the rest:</p><pre class="snippet">if (score &gt; 100) {\n  medal = "gold";\n} else if (score &gt; 50) {\n  medal = "silver";\n} else {\n  medal = "none";\n}</pre><p>WebSpheres sets the number of trials in each mode in the same way. The panel under the preview shows <code>totalTrials</code>.</p>`,
                panel: v => `<h3>Number of trials</h3><p class="note">mode is <code>${esc(WSA.show(v.mode))}</code></p><p class="big-value">totalTrials = ${esc(WSA.fmt(v.totalTrials))}</p>`,
                hints: [
                    'Start with <code>if (mode === "short") {</code> and set <code>totalTrials = 110;</code> inside it.',
                    'Add <code>} else if (mode === "fmode") {</code> for 44, another <code>else if</code> for "block", and finish with <code>} else {</code> for 352.',
                    'Add: <code>if (mode === "short") { totalTrials = 110; } else if (mode === "fmode") { totalTrials = 44; } else if (mode === "block") { totalTrials = 110; } else { totalTrials = 352; }</code>'
                ],
                answer: 'let mode = "short";\nlet totalTrials = 352;\n\nif (mode === "short") {\n  totalTrials = 110;\n} else if (mode === "fmode") {\n  totalTrials = 44;\n} else if (mode === "block") {\n  totalTrials = 110;\n} else {\n  totalTrials = 352;\n}\n',
                check(v, ctx) {
                    const cases = [['short', 110], ['fmode', 44], ['block', 110], ['standard', 352]];
                    for (const [mode, want] of cases) {
                        const r = ctx.variant({ mode: JSON.stringify(mode) });
                        if (!r.ok) return fail(esc(r.error.message));
                        if (!WSA.near(r.values.totalTrials, want)) return fail(`When <code>mode</code> is <code>"${mode}"</code>, <code>totalTrials</code> should be ${want}, but your code gives ${show(r.values.totalTrials)}.${mode === 'standard' ? ' The else part covers every other mode.' : ''}`);
                    }
                    return pass('Each mode gets the right number of trials. The page checked all four. In WebSpheres, <code>setMode</code> in <code>sphere-manager.js</code> does the same job.');
                }
            },
            {
                type: 'bug',
                title: 'Fix the bugs',
                names: labelNames,
                types: labelTypes,
                setCode: 'let hitType = "normal";\nlet labelColour = "#CCCCCC";\nlet labelSize = 0.8;\n\nif (hitType = "critical") {\n  labelColour = "#FFD700";\n  labelSize = 1.5;\n} else {\n  labelColour = "#CCCCCC";\n  labelSize = 0.8;\n',
                goal: 'This is the label code from step 2, with two mistakes in it. Fix both, so that a normal hit gets a small grey label again.',
                explain: `<p>Fix the mistake described in the message under the code first. Then check the label in the preview: <code>hitType</code> is <code>"normal"</code>, so the label should be grey.</p>`,
                hints: [
                    'The code is missing a closing curly bracket at the end.',
                    'Look at the equals signs in the if line. One equals sign puts a value in a box instead of comparing.',
                    'Add <code>}</code> on the last line, and change the if line to <code>if (hitType === "critical") {</code>'
                ],
                answer: 'let hitType = "normal";\nlet labelColour = "#CCCCCC";\nlet labelSize = 0.8;\n\nif (hitType === "critical") {\n  labelColour = "#FFD700";\n  labelSize = 1.5;\n} else {\n  labelColour = "#CCCCCC";\n  labelSize = 0.8;\n}\n',
                check(v, ctx) {
                    if (/if\s*\(\s*hitType\s*=[^=]/.test(ctx.code)) return fail('The code runs now, but the if line still uses one equals sign, so every hit counts as critical.');
                    return labelRule(ctx) || pass('Both bugs are fixed. One equals sign inside a condition is a common bug: the code runs without an error, but the decision is wrong.');
                }
            },
            {
                title: 'Critical-hit chances',
                names: ['condition', 'dominantHand', 'leftChance', 'rightChance'],
                types: { condition: 'number', dominantHand: 'text', leftChance: 'number', rightChance: 'number' },
                setCode: 'let condition = 2;\nlet dominantHand = "RIGHT";\nlet leftChance = 0.3;\nlet rightChance = 0.3;\n\n',
                goal: 'Add code that sets each hand\'s critical-hit chance. In condition 1, both hands get 0.3. In condition 2, the dominant hand gets 0.05 and the other hand gets 0.55.',
                explain: `<p>Your code has changed again. These are the real WebSpheres rules. A block can contain another <code>if</code>, or you can use <code>else if</code>. WebSpheres first checks the condition, and then, for condition 2, checks which hand is dominant.</p><p>The panel under the preview shows both chances. To check every case, try both conditions and both hands.</p>`,
                panel: v => {
                    const bar = (name, c) => `<div class="row"><span class="name">${name}</span><span class="track"><span class="fill gold" style="width:${Math.max(0, Math.min(100, c * 100))}%"></span></span><span class="num">${esc(WSA.fmt(c))}</span></div>`;
                    return `<h3>Critical-hit chance</h3>${bar('Left hand', v.leftChance)}${bar('Right hand', v.rightChance)}<p class="note">Condition ${esc(WSA.show(v.condition))}, dominant hand ${esc(WSA.show(v.dominantHand))}</p>`;
                },
                hints: [
                    'Start with <code>if (condition === 1) {</code>, and set both chances to 0.3 inside it.',
                    'Then add <code>} else if (dominantHand === "LEFT") {</code> for left 0.05 and right 0.55, and an <code>else</code> part for the opposite.',
                    'Add: <code>if (condition === 1) { leftChance = 0.3; rightChance = 0.3; } else if (dominantHand === "LEFT") { leftChance = 0.05; rightChance = 0.55; } else { leftChance = 0.55; rightChance = 0.05; }</code>'
                ],
                answer: 'let condition = 2;\nlet dominantHand = "RIGHT";\nlet leftChance = 0.3;\nlet rightChance = 0.3;\n\nif (condition === 1) {\n  leftChance = 0.3;\n  rightChance = 0.3;\n} else if (dominantHand === "LEFT") {\n  leftChance = 0.05;\n  rightChance = 0.55;\n} else {\n  leftChance = 0.55;\n  rightChance = 0.05;\n}\n',
                check(v, ctx) {
                    for (const [condition, hand, left, right] of chanceCases) {
                        const r = ctx.variant({ condition: String(condition), dominantHand: JSON.stringify(hand) });
                        if (!r.ok) return fail(esc(r.error.message));
                        if (!WSA.near(r.values.leftChance, left) || !WSA.near(r.values.rightChance, right)) {
                            return fail(`In condition ${condition} with the ${hand.toLowerCase()} hand dominant, the chances should be ${left} for the left hand and ${right} for the right hand. Your code gives ${show(r.values.leftChance)} and ${show(r.values.rightChance)}.`);
                        }
                    }
                    return pass('All four cases give the right chances. The page checked both conditions with both hands. This is how <code>updateProbabilities</code> in <code>score-manager.js</code> sets them.');
                }
            },
            {
                type: 'order',
                title: 'The streak rule',
                goal: 'Put the lines in an order that counts critical hits in a row, and turns on fire mode when the count reaches three.',
                explain: `<p>In WebSpheres, three critical hits in a row with the non-dominant hand start fire mode. These lines are a simplified version of that rule. They count critical hits in a row, and turn on fire mode at three. The real rule also checks which hand made each hit.</p><p>The page checks your order with three different hits.</p>`,
                prelude: 'let hitType = "critical";\nlet streak = 2;\nlet fireMode = false;',
                lines: ['if (hitType === "critical") {', '  streak = streak + 1;', '} else {', '  streak = 0;', '}', 'if (streak === 3) {', '  fireMode = true;', '}'],
                names: ['hitType', 'streak', 'fireMode'],
                start: [5, 1, 0, 6, 3, 2, 7, 4],
                answer: [0, 1, 2, 3, 4, 5, 6, 7],
                cases: [
                    { prelude: 'let hitType = "critical";\nlet streak = 2;\nlet fireMode = false;', expect: { streak: 3, fireMode: true }, fail: 'After a critical hit with a streak of 2, the streak should become 3, and fire mode should turn on.' },
                    { prelude: 'let hitType = "normal";\nlet streak = 2;\nlet fireMode = false;', expect: { streak: 0, fireMode: false }, fail: 'After a normal hit, the streak should go back to 0.' },
                    { prelude: 'let hitType = "critical";\nlet streak = 0;\nlet fireMode = false;', expect: { streak: 1, fireMode: false }, fail: 'After a critical hit with a streak of 0, the streak should become 1, and fire mode should stay off.' }
                ],
                success: 'The rule works for all three hits. The real rule, in <code>score-manager.js</code> lines 94 to 121, follows the same pattern, with extra checks for the hand.',
                hints: [
                    'Each line ending in <code>{</code> opens a block. The lines inside the block come next, then a closing <code>}</code>.',
                    'The first block updates the streak. The second block checks whether the streak has reached 3, so it has to come after the first.',
                    'The order is: <code>if (hitType ...</code>, <code>streak = streak + 1;</code>, <code>} else {</code>, <code>streak = 0;</code>, <code>}</code>, <code>if (streak === 3) {</code>, <code>fireMode = true;</code>, <code>}</code>'
                ]
            },
            {
                type: 'quiz',
                title: 'And, or, not',
                goal: 'Choose every condition that is true.',
                explain: `<p>You can join two conditions into one:</p><ul class="parts"><li><code>&amp;&amp;</code> means "and". The whole condition is true only if both parts are true.</li><li><code>||</code> means "or". The whole condition is true if at least one part is true.</li></ul><p><code>!==</code> means "is not equal to".</p>`,
                question: '<pre class="snippet">let hand = "LEFT";\nlet hitType = "critical";\nlet streak = 2;</pre>Which of these conditions are true?',
                multi: true,
                options: [
                    { text: '<code>hand === "LEFT" &amp;&amp; hitType === "critical"</code>', correct: true, why: 'True. Both parts are true.' },
                    { text: '<code>hand === "RIGHT" || streak &gt; 1</code>', correct: true, why: 'True. The first part is false, but the second part is true, and <code>||</code> needs only one.' },
                    { text: '<code>hand === "RIGHT" &amp;&amp; hitType === "critical"</code>', correct: false, why: 'False. The first part is false, and <code>&amp;&amp;</code> needs both parts to be true.' },
                    { text: '<code>streak === 3 || hitType === "normal"</code>', correct: false, why: 'False. Both parts are false.' },
                    { text: '<code>hand !== "RIGHT"</code>', correct: true, why: 'True. <code>hand</code> is "LEFT", which is not equal to "RIGHT".' }
                ],
                success: 'All your choices are right. The note under each condition gives the reason.',
                hints: [
                    'Work out each part on its own first, then combine them.',
                    'Three of the five conditions are true.',
                    'The true conditions are the first, the second and the last.'
                ]
            },
            {
                type: 'find',
                title: 'Find it in WebSpheres',
                goal: 'Find the line in <code>updateProbabilities</code> that sets the left hand\'s chance in condition 2, when the left hand is dominant.',
                explain: `<p>This is the real <code>updateProbabilities</code> function from <code>score-manager.js</code>. It uses an <code>if</code> inside an <code>else</code>, as you did in step 6.</p>`,
                file: 'score-manager.js',
                startLine: 39,
                code: `    updateProbabilities: function () {
        if (this.currentCondition === 1) {
            this.leftHandCriticalChance = 0.3;
            this.rightHandCriticalChance = 0.3;
        } else {
            if (this.dominantHand === 'LEFT') {
                this.leftHandCriticalChance = 0.05;
                this.rightHandCriticalChance = 0.55;
            } else {
                this.leftHandCriticalChance = 0.55;
                this.rightHandCriticalChance = 0.05;
            }
        }
    },`,
                question: 'Which line sets the left hand\'s chance in condition 2, when the left hand is dominant?',
                answer: [6],
                wrong: {
                    0: 'That line starts the function.',
                    1: 'That line checks whether the condition is 1.',
                    2: 'That line sets the left hand\'s chance in condition 1.',
                    3: 'That line sets the right hand\'s chance in condition 1.',
                    4: 'That line starts the else part, which runs in condition 2.',
                    5: 'That line checks whether the left hand is dominant. The chances are set on the lines inside it.',
                    7: 'That line sets the right hand\'s chance when the left hand is dominant.',
                    8: 'That line starts the part for when the right hand is dominant.',
                    9: 'That line sets the left hand\'s chance when the right hand is dominant.',
                    10: 'That line sets the right hand\'s chance when the right hand is dominant.',
                    11: 'That bracket ends a block.',
                    12: 'That bracket ends a block.',
                    13: 'That line ends the function.'
                },
                success: 'Correct. In condition 2, when the left hand is dominant, the left hand gets a 0.05 chance and the right hand gets 0.55.',
                hints: [
                    'First find the part that runs in condition 2.',
                    'Inside it, find the part that runs when the left hand is dominant.',
                    'It\'s line 45.'
                ]
            }
        ],
        learned: [
            'A condition gives <code>true</code> or <code>false</code>. These values are called booleans.',
            '<code>===</code> compares two values. <code>=</code> puts a value in a box.',
            '<code>if</code> runs a block only when its condition is true. <code>else</code> runs when it is false.',
            '<code>else if</code> chains several conditions. Only the first block whose condition is true runs.',
            '<code>&amp;&amp;</code> means "and", <code>||</code> means "or", and <code>!==</code> means "is not equal to".'
        ],
        real: {
            file: 'floating-number.js',
            where: 'lines 14 and 15',
            code: `const color = hitType === 'critical' ? '#FFD700' : '#CCCCCC';
const initialScale = hitType === 'critical' ? '1.5 1.5 1.5' : '0.8 0.8 0.8';`,
            note: `<p>These two lines are the rule you wrote in step 2, in a shorter form. <code>condition ? a : b</code> gives <code>a</code> when the condition is true, and <code>b</code> when it is false. It's a compact <code>if</code> and <code>else</code> that produces a value.</p><p>The scale has three numbers because A-Frame scales the label in three directions: width, height and depth.</p>`
        }
    });
})();
