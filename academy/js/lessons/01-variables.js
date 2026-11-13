(function () {
    const WSA = window.WSA;
    const { pass, fail, nudge } = WSA;
    const isGold = v => ['gold', '#ffd700'].includes(String(v).trim().toLowerCase());
    const ratio = n => WSA.fmt(+n.toFixed(2));

    window.LESSONS = window.LESSONS || [];
    window.LESSONS.push({
        id: 'variables',
        title: 'Variables',
        subtitle: 'Labelled boxes that hold values',
        names: ['targetColour', 'targetSize', 'spinTime'],
        types: { targetColour: 'colour', targetSize: 'number', spinTime: 'number' },
        starterCode: 'let targetColour = "#00FFFF";\nlet targetSize = 0.06;\nlet spinTime = 5000;\n',
        scene: v => ({ colour: v.targetColour, size: v.targetSize, spin: v.spinTime }),
        intro: `
            <p>A program is a list of instructions. The computer follows them in order, from top to bottom. Most programs need to remember values, such as a score, a colour or a size. A <b>variable</b> is a labelled box that holds one value.</p>
            <pre class="snippet">let targetSize = 0.06;</pre>
            <ul class="parts">
                <li><code>let</code> tells the computer to make a new box.</li>
                <li><code>targetSize</code> is the label on the box. You choose the label.</li>
                <li><code>=</code> puts a value in the box. In code, it doesn't mean "equals" as it does in maths.</li>
                <li><code>0.06</code> is the value.</li>
                <li><code>;</code> ends the instruction, like a full stop at the end of a sentence.</li>
            </ul>
            <p>The code in the middle sets up the targets that a participant reaches for in WebSpheres. Each target is an eight-sided crystal that spins. When you change a value, the preview on the right updates.</p>`,
        steps: [
            {
                title: 'Gold targets',
                goal: 'Make the targets gold.',
                explain: `<p><code>targetColour</code> holds the text <code>"#00FFFF"</code>, which is the code for cyan. Text always goes inside quotes.</p><p>You can write a colour as a code like this one, or as an English colour name, such as <code>"red"</code> or <code>"orange"</code>.</p>`,
                hints: [
                    'The colour is set on line 1. Only the text between the quotes needs to change.',
                    'Colours can be written as names. Try the English word for the colour, and keep the quotes around it.',
                    'Change line 1 to <code>let targetColour = "gold";</code>'
                ],
                answer: 'let targetColour = "gold";\nlet targetSize = 0.06;\nlet spinTime = 5000;\n',
                check(v) {
                    const c = String(v.targetColour).trim().toLowerCase();
                    if (isGold(c)) return pass('The targets are now gold. In WebSpheres, the points that float up after a critical hit are also gold.');
                    if (['#00ffff', '#0ff', 'cyan', 'aqua'].includes(c)) return fail('The targets are still cyan. Change the text between the quotes on line 1.');
                    if (['yellow', '#ffff00', '#ff0', 'goldenrod', '#daa520', 'darkgoldenrod', 'khaki', 'lightyellow', 'orange'].includes(c)) return nudge(`Are you sure? <code>${WSA.esc(v.targetColour)}</code> is close to gold, but it's a different colour. Gold has its own colour name.`);
                    return fail(`The targets are now <code>${WSA.esc(v.targetColour)}</code>. The goal is gold.`);
                }
            },
            {
                title: 'Bigger targets',
                goal: 'Make the targets twice as big.',
                explain: `<p><code>targetSize</code> holds a number, so there are no quotes around it. The number is in metres. <code>0.06</code> means each crystal measures 6 cm from its centre to each of its tips.</p>`,
                hints: [
                    'Twice as big means the size multiplied by 2.',
                    'What is 0.06 × 2? Write the answer on line 2, with a dot for the decimal point.',
                    'Change line 2 to <code>let targetSize = 0.12;</code>'
                ],
                answer: 'let targetColour = "gold";\nlet targetSize = 0.12;\nlet spinTime = 5000;\n',
                check(v, ctx) {
                    const s = v.targetSize;
                    if (WSA.near(s, 0.12)) {
                        const maths = /[*+]/.test(ctx.rhs('targetSize') || '');
                        return pass('The targets are twice as big. The number has no quotes around it, so the computer treats it as an amount it can calculate with.' + (maths ? ' You also wrote a calculation for the computer to work out. Lesson 2 covers calculations.' : ''));
                    }
                    if (WSA.near(s, 0.06)) return fail('The size is still <code>0.06</code>.');
                    if (WSA.near(s, 0.6)) return nudge('Are you sure? 0.6 is ten times as big as 0.06, not twice as big. Check where the decimal point is.');
                    if (s > 0.06) return fail(`The targets are bigger, but not twice as big. They are now ${ratio(s / 0.06)} times their starting size.`);
                    return fail('The targets are smaller now. Twice as big needs a bigger number.');
                }
            },
            {
                title: 'Faster spin',
                predict: {
                    question: '<code>spinTime</code> is 5000. If you make that number bigger, what will the crystals do?',
                    options: ['Spin faster', 'Spin more slowly', 'Grow bigger'],
                    answer: 1,
                    explain: '<code>spinTime</code> is how long one full turn takes. A bigger number makes each turn take longer, so the crystals spin more slowly.'
                },
                goal: 'Make the crystals spin twice as fast.',
                explain: `<p><code>spinTime</code> is in milliseconds. A millisecond is a thousandth of a second, so 1000 milliseconds make one second. 5000 means one full turn every 5 seconds.</p>`,
                hints: [
                    'To spin twice as fast, each turn has to take less time.',
                    'Each turn should take half as long as it does now. What is half of 5000?',
                    'Change line 3 to <code>let spinTime = 2500;</code>'
                ],
                answer: 'let targetColour = "gold";\nlet targetSize = 0.12;\nlet spinTime = 2500;\n',
                check(v) {
                    const t = v.spinTime;
                    const secs = WSA.fmt(+(t / 1000).toFixed(3));
                    if (WSA.near(t, 2500)) return pass('The crystals spin twice as fast. One turn now takes 2.5 seconds. WebSpheres also records times in milliseconds: the DecisionTime column in its trial data file is one example.');
                    if (WSA.near(t, 5000)) return fail('<code>spinTime</code> is still 5000.');
                    if (t <= 0) return fail('A turn must take some time. Use a number bigger than zero.');
                    if (t > 5000) return nudge(`Are you sure? The crystals now spin more slowly, because each turn takes ${secs} seconds.`);
                    if (t < 2500) return fail(`That's more than twice as fast. Each turn takes ${secs} seconds, so the crystals spin ${ratio(5000 / t)} times as fast as before.`);
                    return fail(`The crystals spin faster, but not twice as fast. They spin ${ratio(5000 / t)} times as fast as before.`);
                }
            },
            {
                type: 'quiz',
                title: 'Variable names',
                goal: 'Choose every name that the computer would accept as a variable name.',
                explain: `<p>Variable names follow three rules:</p><ul class="parts"><li>A name can't contain spaces.</li><li>A name can contain letters, numbers and <code>_</code>, but it can't start with a number.</li><li>A name can't be a word that JavaScript already uses, such as <code>let</code>.</li></ul><p>Capital letters matter. <code>targetSize</code> and <code>targetsize</code> are two different names.</p><p>WebSpheres joins the words in a name by starting each new word with a capital letter, as in <code>targetSize</code>. This style is called camel case.</p>`,
                question: 'Which of these could be a variable name?',
                multi: true,
                options: [
                    { text: '<code>targetSize</code>', correct: true, why: 'Accepted. This is camel case, the style WebSpheres uses.' },
                    { text: '<code>target size</code>', correct: false, why: 'Not accepted. It contains a space, so the computer reads it as two separate words.' },
                    { text: '<code>2ndTarget</code>', correct: false, why: 'Not accepted. It starts with a number.' },
                    { text: '<code>target_size</code>', correct: true, why: 'Accepted. Underscores are allowed, although WebSpheres uses camel case instead.' },
                    { text: '<code>let</code>', correct: false, why: 'Not accepted. JavaScript already uses <code>let</code> to make boxes.' },
                    { text: '<code>TargetSize</code>', correct: true, why: 'Accepted. Because capital letters matter, it\'s a different name from <code>targetSize</code>.' }
                ],
                success: 'All your choices are right. The note under each name gives the reason.',
                hints: [
                    'Check each name against the three rules: no spaces, no number at the start, and not a word that JavaScript already uses.',
                    'Three of the six names are accepted.',
                    'The accepted names are <code>targetSize</code>, <code>target_size</code> and <code>TargetSize</code>.'
                ]
            },
            {
                type: 'trace',
                title: 'Changing a value',
                goal: 'Work out what\'s in the box at the end, without running the code.',
                explain: `<p>After a box is made, you can put a new value in it. Leave out <code>let</code>, because the box already exists: <code>size = 0.1;</code> The new value replaces the old one.</p><p>A line that starts with <code>//</code> is a <b>comment</b>. Comments are notes for people who read the code. The computer skips them.</p>`,
                code: 'let size = 0.06;\nsize = 0.1;\n// size = 0.5;\nsize = size * 2;',
                box: 'size',
                question: 'After all four lines have run, what is in <code>size</code>?',
                answer: 0.2,
                wrong: [
                    { value: 0.06, message: '0.06 is the value from line 1. The lines after it put new values in the box.' },
                    { value: 0.1, message: '0.1 is the value after line 2. Line 4 changes it again.' },
                    { value: 0.12, message: '0.12 is double 0.06. By line 4, the box holds a different value. What did line 2 put in it?' },
                    { value: 0.5, near: true, message: 'Are you sure? Line 3 starts with <code>//</code>, so it\'s a comment, and the computer skips it.' },
                    { value: 1, near: true, message: 'Are you sure? Line 3 is a comment, so the computer skips it. <code>size</code> never holds 0.5.' }
                ],
                walk: [
                    '<code>let size = 0.06;</code> makes the box and puts 0.06 in it.',
                    '<code>size = 0.1;</code> replaces 0.06 with 0.1.',
                    '<code>// size = 0.5;</code> is a comment, so nothing happens.',
                    '<code>size = size * 2;</code> reads the box (0.1), doubles it, and puts 0.2 back in the box.'
                ],
                success: 'Correct: 0.2. Line 4 reads the value in the box, calculates a new value, and puts the new value back in the same box.',
                hints: [
                    'Go through the lines one at a time. Write down what\'s in the box after each line.',
                    'Line 3 is a comment. After line 2, the box holds 0.1.',
                    'The answer is <code>0.2</code>, which is 0.1 doubled.'
                ]
            },
            {
                type: 'quiz',
                title: 'Boxes that can\'t change',
                goal: 'Work out what the computer does with this code.',
                explain: `<p>You can also make a box with <code>const</code>, which is short for constant. A <code>const</code> box gets a value once, and that value can't be changed afterwards.</p><p>WebSpheres uses <code>const</code> for values that must not change while it runs. For example, the first line of <code>spectator-manager.js</code> is <code>const APP_VERSION = '2.8.1';</code></p>`,
                question: '<pre class="snippet">const crystalCount = 11;\ncrystalCount = 12;</pre>What happens when the computer runs these two lines?',
                options: [
                    { text: '<code>crystalCount</code> holds 12', correct: false, why: 'That would happen if the box was made with <code>let</code>. A <code>const</code> box can\'t be given a new value.' },
                    { text: 'The computer stops with an error on line 2', correct: true, why: 'Correct. JavaScript reports "Assignment to constant variable" and stops.' },
                    { text: '<code>crystalCount</code> holds 23', correct: false, why: '<code>=</code> puts a value in a box. It doesn\'t add.' },
                    { text: 'The computer skips line 2 and carries on', correct: false, why: 'The computer doesn\'t skip a line that it can\'t run. It stops with an error.' }
                ],
                success: 'Correct. Changing a <code>const</code> box causes an error. This protects values that must stay the same.',
                hints: [
                    '<code>const</code> is short for constant. What does constant mean?',
                    'A <code>const</code> box can\'t be given a new value. What does the computer do when an instruction isn\'t allowed?',
                    'The answer is that the computer stops with an error on line 2.'
                ]
            },
            {
                type: 'bug',
                title: 'Fix the bugs',
                setCode: 'let targetColour = "gold;\nlet targetSize = 0.12;\nlet spintime = 2500;\n',
                goal: 'Your code now has two mistakes in it. Fix both mistakes, so that the preview works again.',
                explain: `<p>A mistake in code is called a <b>bug</b>. The message under the code tells you which line to look at.</p><p>Fix one mistake, then read the message again.</p>`,
                hints: [
                    'Line 1 has a quote that opens but doesn\'t close.',
                    'When line 1 is fixed, look at the name on line 3. Compare it with the names in the list of variables.',
                    'Line 1 should be <code>let targetColour = "gold";</code> and line 3 should be <code>let spinTime = 2500;</code>'
                ],
                answer: 'let targetColour = "gold";\nlet targetSize = 0.12;\nlet spinTime = 2500;\n',
                check(v) {
                    if (isGold(v.targetColour) && WSA.near(v.targetSize, 0.12) && WSA.near(v.spinTime, 2500)) return pass('Both bugs are fixed. A missing quote and a wrong capital letter are two common bugs.');
                    return fail('The code runs now, but some values have changed. Keep the values as they were: <code>"gold"</code>, <code>0.12</code> and <code>2500</code>.');
                }
            },
            {
                type: 'match',
                title: 'Match the outlines',
                goal: 'Change <code>targetSize</code> until each crystal fills its white outline.',
                explain: `<p>The preview now shows three of your crystals. Each one has a white outline around it, and the outline is a different size from the crystal. Change <code>targetSize</code> until the crystal and its outline are the same size.</p><p>The outline turns amber when you're close, and green when the sizes match.</p>`,
                ghost: { size: 0.09 },
                gap: v => Math.abs(v.targetSize - 0.09),
                tolerance: 0.01,
                closeWithin: 0.025,
                hints: [
                    'If the crystal sticks out of its outline, the crystal is too big. If there\'s a gap inside the outline, the crystal is too small.',
                    'The outline is between 0.06 and 0.12. Try a value halfway between them.',
                    'Change line 2 to <code>let targetSize = 0.09;</code>'
                ],
                answer: 'let targetColour = "gold";\nlet targetSize = 0.09;\nlet spinTime = 2500;\n',
                check(v) {
                    const s = v.targetSize;
                    const gap = Math.abs(s - 0.09);
                    if (gap <= 0.01) return pass(`The sizes match. The outlines are 0.09${WSA.near(s, 0.09) ? '' : `, and ${WSA.fmt(s)} is within 0.01 of that`}.`);
                    if (gap <= 0.025) return nudge(`Are you sure? You're close, but the crystals are still a little ${s > 0.09 ? 'bigger' : 'smaller'} than the outlines.`);
                    return fail(s > 0.09 ? 'The crystals are bigger than their outlines.' : 'The crystals are smaller than their outlines.');
                }
            },
            {
                type: 'find',
                title: 'Find it in WebSpheres',
                goal: 'Find the line in the WebSpheres code that sets how fast the crystals spin.',
                explain: `<p>This is real code from WebSpheres. It builds each target. You don't need to understand all of it. Look for parts that you recognise.</p><p>Click a line to choose it, then check your answer.</p>`,
                file: 'sphere-manager.js',
                startLine: 94,
                code: `            crystal.setAttribute('material', 'color: #00FFFF; opacity: 0.8; transparent: true; metalness: 0.8; roughness: 0.2');
            crystal.setAttribute('radius', '0.06');
            crystal.setAttribute('visible', 'false');
            crystal.setAttribute('id', \`sphere-\${i}\`);
            crystal.setAttribute('animation', 'property: rotation; to: 0 360 0; loop: true; dur: 5000; easing: linear');`,
                question: 'Which line sets how fast the crystals spin?',
                answer: [4],
                wrong: {
                    0: 'That line sets the colour, how see-through the crystal is, and how shiny it is.',
                    1: 'That line sets the size. 0.06 was the starting value of <code>targetSize</code>.',
                    2: 'That line hides the crystal until it\'s needed.',
                    3: 'That line gives each crystal a name, such as sphere-0.'
                },
                success: 'Correct. <code>dur: 5000</code> is the time for one turn, in milliseconds. It does the same job as <code>spinTime</code>.',
                hints: [
                    'Look for a number that you changed in this lesson.',
                    '<code>spinTime</code> started at 5000. Which line contains 5000?',
                    'It\'s line 98, which sets the animation.'
                ]
            }
        ],
        learned: [
            'A <b>variable</b> is a labelled box that holds one value. <code>let</code> makes the box, and <code>=</code> puts a value in it.',
            'Text goes inside quotes, as in <code>"gold"</code>. Numbers don\'t, as in <code>0.12</code>.',
            'A variable name can\'t contain spaces or start with a number, and capital letters matter.',
            'To change the value in a box, leave out <code>let</code>: <code>size = 0.1;</code> A box made with <code>const</code> can\'t be changed.',
            'The computer skips lines that start with <code>//</code>. These lines are comments.',
            'The code doesn\'t show units. <code>targetSize</code> is in metres and <code>spinTime</code> is in milliseconds.'
        ],
        real: {
            file: 'floating-number.js',
            where: 'lines 11 to 14',
            code: `// MODIFIED: Ghost Text Logic
// Critical = Gold, Large (1.5)
// Normal = Light Grey, Small (0.8)
const color = hitType === 'critical' ? '#FFD700' : '#CCCCCC';`,
            note: `<p>This code chooses the colour of the points that float up after a hit. The first three lines are comments. The fourth line makes a <code>const</code> box called <code>color</code>. <code>#FFD700</code> is the code for gold, the colour you used in step 1.</p><p>The <code>? :</code> part chooses between two values: gold for a critical hit, and grey for other hits. Lesson 4, If and else, covers choices like this.</p>`
        }
    });
})();
