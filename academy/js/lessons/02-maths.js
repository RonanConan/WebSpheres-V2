(function () {
    const WSA = window.WSA;
    const { pass, fail, nudge } = WSA;
    const usesReach = ctx => /\breach\b/.test(ctx.rhs('ringRadius') || '');

    window.LESSONS = window.LESSONS || [];
    window.LESSONS.push({
        id: 'maths',
        title: 'Numbers and maths',
        subtitle: 'Calculating values from other values',
        names: ['reach', 'ringRadius'],
        types: { reach: 'number', ringRadius: 'number' },
        starterCode: 'let reach = 0.7;\nlet ringRadius = 0.45;\n',
        scene: v => ({ radius: v.ringRadius, reach: v.reach, labels: true }),
        intro: `
            <p>Code can do maths. These are the four basic operators:</p>
            <table class="ops">
                <tr><td><code>+</code></td><td>add</td><td><code>-</code></td><td>subtract</td></tr>
                <tr><td><code>*</code></td><td>multiply</td><td><code>/</code></td><td>divide</td></tr>
            </table>
            <p>You can use a variable's name in a calculation. The computer uses the value in that box:</p>
            <pre class="snippet">let price = 4;
let total = price * 3;</pre>
            <p>After these two lines, <code>total</code> holds 12.</p>
            <p>In this lesson you'll set the position of the targets. At the start of a session, WebSpheres measures how far the participant can reach. It then calculates where to place the ring of targets.</p>`,
        steps: [
            {
                title: 'Move the ring',
                predict: {
                    question: '<code>ringRadius</code> is 0.45. What will happen if you change it to 0.6?',
                    options: ['The targets get bigger', 'The targets move further away from the participant', 'More targets appear'],
                    answer: 1,
                    explain: '<code>ringRadius</code> is the distance in metres from the participant to the targets. A bigger number moves the whole ring further away.'
                },
                goal: 'Move the targets so that they sit 0.6 metres from the participant.',
                explain: `<p><code>ringRadius</code> is in metres. The preview shows its value next to the ring.</p>`,
                hints: [
                    'The distance is set on line 2.',
                    'Change the number on line 2. Numbers don\'t need quotes.',
                    'Change line 2 to <code>let ringRadius = 0.6;</code>'
                ],
                answer: 'let reach = 0.7;\nlet ringRadius = 0.6;\n',
                check(v) {
                    const r = v.ringRadius;
                    if (WSA.near(r, 0.6)) return pass('The ring is now 0.6 m from the participant. In WebSpheres, the ring starts at 0.45 m and changes when the participant\'s reach is measured.');
                    if (WSA.near(r, 6)) return nudge('Are you sure? 6 is six metres, further than the walls of most rooms. Check the decimal point.');
                    return fail(`The targets are now ${WSA.fmt(r)} m from the participant. The goal is 0.6 m.`);
                }
            },
            {
                title: 'Use the reach',
                goal: 'Make <code>ringRadius</code> 80% of <code>reach</code>, using a calculation.',
                explain: `<p>WebSpheres places the ring at 80% of the participant's reach. As a decimal, 80% is 0.8.</p><p>Write a calculation that uses the name <code>reach</code>, so that the computer calculates the answer.</p><p>Line 1 makes <code>reach</code> before line 2 uses it. The computer reads from top to bottom, so the order of the lines matters.</p>`,
                hints: [
                    '<code>*</code> means multiply. To get 80% of a number, multiply it by 0.8.',
                    'On line 2, replace 0.6 with a calculation that uses <code>reach</code> and <code>0.8</code>.',
                    'Change line 2 to <code>let ringRadius = 0.8 * reach;</code>'
                ],
                answer: 'let reach = 0.7;\nlet ringRadius = 0.8 * reach;\n',
                check(v, ctx) {
                    const r = v.ringRadius;
                    const target = 0.8 * v.reach;
                    const uses = usesReach(ctx);
                    if (WSA.near(r, target) && uses) return pass(`The computer calculated 0.8 × ${WSA.fmt(v.reach)} = ${WSA.fmt(target)}.`);
                    if (WSA.near(r, target)) return nudge('Are you sure? The number is right, but you calculated it yourself. For a participant with a different reach, <code>ringRadius</code> would be wrong. Use the name <code>reach</code> in the calculation, so that the computer does the maths.');
                    if (uses && WSA.near(r, 80 * v.reach)) return nudge('Are you sure? That makes <code>ringRadius</code> 80 times the reach. Percent means "out of 100", so 80% is 0.8, not 80.');
                    if (uses && WSA.near(r, v.reach)) return fail('<code>ringRadius</code> is now equal to <code>reach</code>, which is 100% of it. The goal is 80%.');
                    if (uses) return fail(`<code>ringRadius</code> is now ${WSA.fmt(r)}, which is ${WSA.fmt(+(100 * r / v.reach).toFixed(1))}% of the reach. The goal is 80%.`);
                    return fail('<code>ringRadius</code> needs to be calculated from <code>reach</code>. Use the name <code>reach</code> on line 2.');
                }
            },
            {
                title: 'A new participant',
                predict: {
                    question: 'A participant with a shorter reach sits down. If you change <code>reach</code> to 0.5, what will <code>ringRadius</code> be?',
                    options: ['0.56, the same as before', '0.4', '0.5'],
                    answer: 1,
                    explain: 'The computer calculates <code>ringRadius</code> from <code>reach</code> every time the code runs. It becomes 0.8 × 0.5 = 0.4.'
                },
                goal: 'Change <code>reach</code> to 0.5. Don\'t change anything else.',
                explain: `<p>Watch the preview as you make the change.</p>`,
                hints: [
                    '<code>reach</code> is set on line 1.',
                    'Only the number on line 1 needs to change. Line 2 stays as it is.',
                    'Change line 1 to <code>let reach = 0.5;</code> and keep line 2 as <code>let ringRadius = 0.8 * reach;</code>'
                ],
                answer: 'let reach = 0.5;\nlet ringRadius = 0.8 * reach;\n',
                check(v, ctx) {
                    if (!WSA.near(v.reach, 0.5)) return fail(`<code>reach</code> is ${WSA.fmt(v.reach)}. The goal is 0.5.`);
                    if (!usesReach(ctx)) return fail('<code>reach</code> is right, but <code>ringRadius</code> no longer uses it. Line 2 should still be the calculation from the last step.');
                    if (WSA.near(v.ringRadius, 0.4)) return pass('The ring moved without any change to line 2. <code>ringRadius</code> is calculated from <code>reach</code>, so changing <code>reach</code> also changed <code>ringRadius</code>. WebSpheres sets the ring from each participant\'s measured reach in the same way.');
                    return fail('<code>ringRadius</code> should still be 80% of <code>reach</code>.');
                }
            },
            {
                type: 'trace',
                title: 'Order of operations',
                goal: 'Work out what\'s in the box, without running the code.',
                explain: `<p>When a calculation has more than one operator, the computer does <code>*</code> and <code>/</code> before <code>+</code> and <code>-</code>, as in maths. Anything in brackets is calculated first. For example, <code>(2 + 3) * 4</code> is 20, but <code>2 + 3 * 4</code> is 14.</p>`,
                code: 'let reach = 0.6;\nlet ringRadius = reach / 2 + 0.2;',
                box: 'ringRadius',
                question: 'After both lines have run, what is in <code>ringRadius</code>?',
                answer: 0.5,
                wrong: [
                    { test: v => typeof v === 'number' && Math.abs(v - 0.6 / 2.2) < 0.005, message: 'You added first. The computer divides before it adds.' },
                    { value: 0.3, message: '0.3 is <code>reach / 2</code>. Line 2 then adds 0.2.' },
                    { value: 0.6, message: '0.6 is the value of <code>reach</code>. Line 2 calculates a new value from it.' },
                    { value: 0.8, message: '0.8 is <code>reach + 0.2</code>, but line 2 divides <code>reach</code> by 2 first.' },
                    { value: 0.4, message: '0.4 is what you get by adding 0.2 to 0.6 and then halving. The computer divides first.' }
                ],
                walk: [
                    '<code>reach</code> holds 0.6.',
                    'The computer divides first: 0.6 / 2 = 0.3.',
                    'Then it adds: 0.3 + 0.2 = 0.5. It puts 0.5 in <code>ringRadius</code>.'
                ],
                success: 'Correct: 0.5. The computer divides first, then adds.',
                hints: [
                    '<code>/</code> means divide. Which happens first, the <code>/</code> or the <code>+</code>?',
                    'Calculate <code>reach / 2</code> first, then add 0.2.',
                    'The answer is <code>0.5</code>.'
                ]
            },
            {
                type: 'quiz',
                title: 'Brackets',
                goal: 'Choose the line that does what the description says.',
                explain: `<p>Brackets change the order of a calculation. The part inside the brackets is calculated first.</p>`,
                question: 'Add 0.1 to <code>reach</code>, then take 80% of the result. Which line does that?',
                options: [
                    { text: '<code>let ringRadius = 0.8 * reach + 0.1;</code>', correct: false, why: 'This takes 80% of <code>reach</code> first, then adds 0.1.' },
                    { text: '<code>let ringRadius = 0.8 * (reach + 0.1);</code>', correct: true, why: 'The brackets make the computer add first, then multiply.' },
                    { text: '<code>let ringRadius = (0.8 * reach) + 0.1;</code>', correct: false, why: 'These brackets are around the multiplication, which happens first anyway. This line gives the same result as the first line.' },
                    { text: '<code>let ringRadius = 0.8 + reach * 0.1;</code>', correct: false, why: 'This multiplies <code>reach</code> by 0.1, then adds 0.8.' }
                ],
                success: 'Correct. The brackets make the addition happen first.',
                hints: [
                    'Which part has to happen first? That part needs brackets around it.',
                    'The addition has to happen before the multiplication.',
                    'The answer is <code>0.8 * (reach + 0.1)</code>.'
                ]
            },
            {
                type: 'order',
                title: 'Calibration order',
                goal: 'Put the four lines in an order that runs without errors.',
                explain: `<p>WebSpheres calibrates two values. It sets the height of the targets to 80% of the headset's height, and the size of the ring to 80% of the participant's reach.</p><p>A line can only use a box that was made on a line above it.</p>`,
                lines: ['let headHeight = 1.25;', 'let targetHeight = 0.8 * headHeight;', 'let reach = 0.7;', 'let ringRadius = 0.8 * reach;'],
                names: ['headHeight', 'targetHeight', 'reach', 'ringRadius'],
                start: [3, 1, 2, 0],
                answer: [0, 1, 2, 3],
                success: 'The code runs. Each box is made before a line uses it. Other orders also work, as long as they follow that rule.',
                hints: [
                    'Find the lines that don\'t use any other box. Those lines can go first.',
                    '<code>headHeight</code> must come before <code>targetHeight</code>, and <code>reach</code> must come before <code>ringRadius</code>.',
                    'One order that works: <code>headHeight</code>, <code>targetHeight</code>, <code>reach</code>, then <code>ringRadius</code>.'
                ]
            },
            {
                type: 'quiz',
                title: 'Rounding errors',
                goal: 'Choose the value that the computer calculates.',
                explain: `<p>Computers store numbers in binary, using ones and zeros. Most decimals, including 0.1, can't be stored exactly in binary, so the stored value has a tiny rounding error.</p>`,
                question: '<pre class="snippet">let total = 0.1 + 0.2;</pre>What is in <code>total</code>?',
                options: [
                    { text: '<code>0.3</code>', correct: false, why: '0.3 is the answer in maths. The computer\'s answer is very slightly different.' },
                    { text: '<code>0.30000000000000004</code>', correct: true, why: 'The rounding errors in 0.1 and 0.2 add up to a difference that you can see.' },
                    { text: '<code>0.12</code>', correct: false, why: 'Adding two decimals doesn\'t join their digits together.' },
                    { text: 'An error', correct: false, why: 'Adding decimals is allowed. The result is only slightly different from 0.3.' }
                ],
                success: 'Correct. Because of rounding errors, programs often check whether two numbers are close enough, instead of exactly equal. This tutorial checks your answers that way. Rounding errors are also why data files sometimes contain very long decimals.',
                hints: [
                    'Read the explanation again. Can the computer store 0.1 exactly?',
                    'The computer\'s answer is very slightly more than 0.3.',
                    'The answer is <code>0.30000000000000004</code>.'
                ]
            },
            {
                type: 'match',
                title: 'Match the outlines',
                goal: 'The white outlines show where calibration placed the ring for a new participant. Change <code>reach</code> until your targets line up with the outlines.',
                explain: `<p>Keep line 2 as it is, so that the ring is still calculated from <code>reach</code>. The outlines turn amber when you're close, and green when your targets line up with them.</p><p>You can find the answer by trying values, or by working backwards from the ring size.</p>`,
                ghost: { radius: 0.6 },
                gap: v => Math.abs(v.ringRadius - 0.6),
                tolerance: 0.01,
                closeWithin: 0.04,
                hints: [
                    '<code>ringRadius</code> is 80% of <code>reach</code>, and it needs to be 0.6. What must <code>reach</code> be?',
                    'Work backwards: <code>reach</code> = 0.6 / 0.8.',
                    'Change line 1 to <code>let reach = 0.75;</code>'
                ],
                answer: 'let reach = 0.75;\nlet ringRadius = 0.8 * reach;\n',
                check(v, ctx) {
                    if (!usesReach(ctx)) return nudge('Are you sure? Calibration calculates <code>ringRadius</code> from <code>reach</code>. Change line 2 back to <code>let ringRadius = 0.8 * reach;</code> and change <code>reach</code> instead.');
                    const gap = Math.abs(v.ringRadius - 0.6);
                    if (gap <= 0.01) return pass(`Your targets line up with the outlines, with <code>reach</code> at ${WSA.fmt(v.reach)}. The exact answer is 0.6 / 0.8 = 0.75.`);
                    if (gap <= 0.04) return nudge(`Are you sure? You're close, but your targets are still a little ${v.ringRadius > 0.6 ? 'further out than' : 'closer in than'} the outlines.`);
                    return fail(v.ringRadius > 0.6 ? 'Your targets are further out than the outlines.' : 'Your targets are closer in than the outlines.');
                }
            },
            {
                type: 'find',
                title: 'Find it in WebSpheres',
                goal: 'Find where the calibration code first stores the reach.',
                explain: `<p>This code is part of <code>calibrateReach</code>, the WebSpheres code that measures the participant's reach. In this code, the reach is called <code>distance</code>.</p><p>Think about how a box is made.</p>`,
                file: 'sphere-manager.js',
                startLine: 639,
                code: `        const tip = this.getHandPosition(controller);
        if (!tip) return notTracked;
        const distance = Math.sqrt(
            Math.pow(tip.x - cameraPos.x, 2) +
            Math.pow(tip.y - cameraPos.y, 2) +
            Math.pow(tip.z - cameraPos.z, 2)
        );
        if (!Number.isFinite(distance)) return notTracked;
        this.radius = Math.max(0.3, 0.8 * distance);
        this.updateSpherePositions();`,
                question: 'Which line makes the box that holds the measured reach?',
                answer: [2],
                wrong: {
                    0: 'That line makes a box, but the box holds the position of the index fingertip, not the reach.',
                    1: 'That line checks that the hand was found. It doesn\'t store anything.',
                    3: 'That line is part of the calculation. The box that stores the result is made on an earlier line.',
                    4: 'That line is part of the calculation. The box that stores the result is made on an earlier line.',
                    5: 'That line is part of the calculation. The box that stores the result is made on an earlier line.',
                    6: 'That bracket ends the calculation.',
                    7: 'That line checks that the reach is a usable number.',
                    8: 'That line uses the reach to set the ring. The box that holds the reach is made on an earlier line. Look for <code>let</code> or <code>const</code>.',
                    9: 'That line moves the targets to their new positions.'
                },
                success: 'Correct. <code>const distance = ...</code> makes a box called <code>distance</code>. The calculation on the next four lines uses Pythagoras\' theorem in 3D to find the straight-line distance from the headset to the index fingertip.',
                hints: [
                    'Look for lines that start with <code>let</code> or <code>const</code>.',
                    'Two lines start with <code>const</code>. Which name describes a length?',
                    'It\'s line 641: <code>const distance = Math.sqrt(</code>'
                ]
            }
        ],
        learned: [
            'Code can do maths with <code>+</code>, <code>-</code>, <code>*</code> and <code>/</code>. <code>*</code> means multiply.',
            'When a calculation uses a variable\'s name, the computer uses the value in that box.',
            'The computer multiplies and divides before it adds and subtracts. Anything in brackets is calculated first.',
            'The computer reads code from top to bottom, so a variable has to be made before a line uses it.',
            'When a value is calculated from other variables, changing one of those variables changes the result too.',
            'Decimals can have tiny rounding errors, so programs often check whether numbers are close enough instead of exactly equal.'
        ],
        real: {
            file: 'sphere-manager.js',
            where: 'line 14, and line 647 inside calibrateReach',
            code: `this.radius = 0.45;

this.radius = Math.max(0.3, 0.8 * distance);`,
            note: `<p>The first line sets the starting ring to 0.45 m, which was also your starting value. The second line runs during calibration. <code>distance</code> is the measured reach, from the headset to the participant's index fingertip, and <code>0.8 * distance</code> is the same calculation that you wrote.</p><p><code>Math.max(0.3, ...)</code> chooses the bigger of two numbers, so the ring is never closer than 0.3 m. <code>Math.max</code> is a function. Lesson 5 covers functions. For now, you can read <code>this.radius</code> as a variable.</p>`
        }
    });
})();
