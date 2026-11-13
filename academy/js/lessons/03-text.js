(function () {
    const WSA = window.WSA;
    const { pass, fail, nudge } = WSA;
    const esc = WSA.esc;
    const logNames = ['trial', 'target', 'hand', 'points', 'label'];
    const logTypes = { trial: 'number', target: 'number', hand: 'text', points: 'number', label: 'text' };
    const summary = v => `Trial ${v.trial}: Target ${v.target}, Hand ${v.hand}`;
    const lastLog = ctx => ctx.logs[ctx.logs.length - 1];
    const loose = s => String(s).replace(/\s+/g, ' ').trim().toLowerCase();

    window.LESSONS = window.LESSONS || [];
    window.LESSONS.push({
        id: 'text',
        title: 'Text',
        subtitle: 'Labels, messages and the console',
        console: true,
        names: ['points', 'label'],
        types: { points: 'number', label: 'text' },
        starterCode: 'let points = 3;\nlet label = "+3";\n',
        scene: v => ({
            label: typeof v.label === 'string' ? v.label : null,
            highlights: Number.isInteger(v.index) ? [v.index] : null,
            tag: typeof v.targetId === 'string' ? v.targetId : null
        }),
        intro: `
            <p>Programs work with text as well as numbers. In code, a piece of text is called a <b>string</b>. A string goes inside quotes:</p>
            <pre class="snippet">let hand = "LEFT";</pre>
            <p>JavaScript has three kinds of quotes:</p>
            <ul class="parts">
                <li><code>"double quotes"</code></li>
                <li><code>'single quotes'</code></li>
                <li><code>\`backticks\`</code>, which can also put values from variables into the text. Step 4 covers backticks.</li>
            </ul>
            <p>In WebSpheres, text appears on screen and in the data files. After each hit, the points for that hit float up above the target as a label, such as <code>+3</code>. The preview shows that label. Its text comes from the variable <code>label</code> in your code.</p>
            <p>This lesson also uses the <b>console</b>, the panel under your code. Step 6 explains it.</p>`,
        steps: [
            {
                title: 'Change the label',
                goal: 'Make the label show +10.',
                explain: `<p><code>label</code> holds the text <code>"+3"</code>. It looks like a number, but the quotes make it text. The computer doesn't calculate with text. It shows it exactly as it's written.</p>`,
                hints: [
                    'The label is set on line 2.',
                    'Change the text between the quotes on line 2, and keep the quotes.',
                    'Change line 2 to <code>let label = "+10";</code>'
                ],
                answer: 'let points = 3;\nlet label = "+10";\n',
                check(v) {
                    if (v.label === '+10') return pass('The label shows +10. Because it\'s text, the computer shows it exactly as you typed it, including the plus sign.');
                    if (v.label.trim() === '+10') return nudge('Are you sure? The label has a space in it. A space inside quotes is part of the text, so it shows up too.');
                    if (v.label === '10') return fail('The label shows 10. The goal is +10, with a plus sign.');
                    if (v.label === '+3') return fail('The label still shows +3.');
                    return fail(`The label shows <code>${esc(v.label)}</code>. The goal is +10.`);
                }
            },
            {
                title: 'Join text and a number',
                predict: {
                    question: '<code>points</code> holds the number 3. What will <code>"+" + points</code> give?',
                    options: ['+3', '3', '"+" + 3', 'An error'],
                    answer: 0,
                    explain: 'When <code>+</code> has text on one side, it joins instead of adding. The computer turns 3 into the text "3", then joins "+" and "3" to make "+3".'
                },
                goal: 'Build the label from <code>points</code>, then change <code>points</code> to 7.',
                explain: `<p>In step 1 you typed the label by hand, so it no longer matches <code>points</code>. If the label is built from <code>points</code>, the two always match.</p><p>When <code>+</code> has text on either side, it joins the two sides together instead of adding them. Joining strings is called <b>concatenation</b>.</p>`,
                hints: [
                    'On line 2, replace the text with <code>"+"</code> joined to <code>points</code>.',
                    'Use <code>+</code> to join them: <code>"+" + points</code>. Then change the number on line 1.',
                    'Line 1 should be <code>let points = 7;</code> and line 2 should be <code>let label = "+" + points;</code>'
                ],
                answer: 'let points = 7;\nlet label = "+" + points;\n',
                check(v, ctx) {
                    const uses = /\bpoints\b/.test(ctx.rhs('label') || '');
                    if (!uses && v.label === '+' + v.points) return nudge('Are you sure? The label matches <code>points</code>, but you typed it by hand. Build it from <code>points</code>, so that it changes when <code>points</code> changes.');
                    if (!uses) return fail('Line 2 needs to use <code>points</code>.');
                    if (v.label !== '+' + v.points) {
                        if (loose(v.label) === loose('+ ' + v.points)) return nudge(`Are you sure? The label is <code>${esc(v.label)}</code>. A space inside the quotes is part of the text.`);
                        return fail(`The label is <code>${esc(v.label)}</code>. It should be a plus sign followed by the points.`);
                    }
                    if (v.points !== 7) return fail('The label is built from <code>points</code> now. Next, change <code>points</code> on line 1 to 7.');
                    return pass('The label shows +7. It\'s built from <code>points</code>, so the two always match.');
                }
            },
            {
                type: 'trace',
                title: 'Joining or adding?',
                goal: 'Work out what\'s in the box, without running the code.',
                explain: `<p>When both sides of <code>+</code> are numbers, the computer adds them. When either side is text, it joins them.</p>`,
                code: 'let a = 5 + 5;\nlet b = "5" + 5;',
                box: 'b',
                question: 'After both lines have run, what is in <code>b</code>?',
                answer: '55',
                wrong: [
                    { value: 10, near: true, message: 'Are you sure? 10 is what line 1 gives, because both sides are numbers. On line 2, the first 5 is in quotes.' },
                    { value: '5 5', message: 'Joining doesn\'t add a space between the two parts.' },
                    { value: '5 + 5', message: 'The computer runs the <code>+</code>. It doesn\'t store it as part of the text.' }
                ],
                walk: [
                    'Line 1: both sides are numbers, so <code>a</code> holds 10.',
                    'Line 2: the first 5 is text, so <code>+</code> joins. The second 5 becomes the text "5".',
                    '<code>b</code> holds the text "55".'
                ],
                success: 'Correct: "55", which is text. A number stored as text is a common cause of bugs, because adding to it joins instead.',
                hints: [
                    'On line 2, is the first 5 a number or text?',
                    'With text on one side, <code>+</code> joins the two sides together.',
                    'The answer is <code>"55"</code>.'
                ]
            },
            {
                title: 'Backticks',
                goal: 'Rewrite line 2 with backticks and <code>${}</code>, so that it builds the same label.',
                explain: `<p>Text in backticks is called a <b>template literal</b>. Inside it, <code>\${...}</code> puts in the value of whatever is between the curly brackets. For example:</p><pre class="snippet">let score = 12;
let message = \`Score: \${score}\`;</pre><p><code>message</code> now holds <code>Score: 12</code>.</p><p>On most UK keyboards, the backtick key is to the left of the 1 key.</p>`,
                hints: [
                    'Start and end the text with backticks instead of double quotes.',
                    'Inside the backticks, write + and then <code>${points}</code>.',
                    'Change line 2 to <code>let label = `+${points}`;</code>'
                ],
                answer: 'let points = 7;\nlet label = `+${points}`;\n',
                check(v, ctx) {
                    const rhs = (ctx.rhs('label') || '').replace(/\s*\/\/.*$/, '').trim();
                    const template = /^`[^`]*\$\{\s*points\s*\}[^`]*`$/.test(rhs);
                    const right = v.label === '+' + v.points;
                    if (right && template) return pass('The label is the same, built with a template literal. Line 21 of <code>floating-number.js</code> builds the WebSpheres label in the same way: <code>`+${this.data.value}`</code>.');
                    if (right) return fail('The label is right, but line 2 doesn\'t use a template literal yet. Rewrite it with backticks and <code>${points}</code>.');
                    if (v.label.includes('${')) return nudge('Are you sure? The label shows <code>${...}</code> as plain text. <code>${}</code> only works inside backticks.');
                    return fail(`The label is <code>${esc(v.label)}</code>. It should be <code>+${v.points}</code>.`);
                }
            },
            {
                type: 'quiz',
                title: 'Which quotes?',
                goal: 'Choose the line that makes the label +7.',
                explain: `<p>Only one kind of quotes fills in <code>\${}</code>.</p>`,
                question: '<code>points</code> holds 7. Which line makes <code>label</code> hold <code>+7</code>?',
                options: [
                    { text: '<code>let label = "+${points}";</code>', correct: false, why: 'Double quotes show <code>${points}</code> as plain text, so the label would be <code>+${points}</code>.' },
                    { text: '<code>let label = \'+${points}\';</code>', correct: false, why: 'Single quotes also show <code>${points}</code> as plain text.' },
                    { text: '<code>let label = `+${points}`;</code>', correct: true, why: 'Backticks fill in <code>${points}</code> with 7.' },
                    { text: '<code>let label = +${points};</code>', correct: false, why: 'Without quotes, this isn\'t text, and the computer stops with an error.' }
                ],
                success: 'Correct. Only backticks fill in <code>${}</code>.',
                hints: [
                    'Look back at step 4. Which quotes did you use?',
                    'Double and single quotes show <code>${points}</code> as plain text.',
                    'The answer is the line with backticks: <code>let label = `+${points}`;</code>'
                ]
            },
            {
                title: 'Print a message',
                names: logNames,
                types: logTypes,
                setCode: 'let trial = 3;\nlet target = 5;\nlet hand = "LEFT";\nlet points = 7;\nlet label = `+${points}`;\n\nconsole.log("Trial");\n',
                goal: 'Change the last line so that the console shows exactly <code>Trial 3: Target 5, Hand LEFT</code>. Build the line from the variables.',
                explain: `<p>Your code has some new variables. <code>console.log(...)</code> prints a line in the console, under your code. Programmers use it to check what their code is doing while it runs. The person using the program doesn't see the console.</p><p>WebSpheres prints a line like this to its console after every trial.</p>`,
                hints: [
                    'Use backticks, and put each variable inside <code>${}</code>.',
                    'Start with <code>console.log(`Trial ${trial}: ...`);</code> and add the target and the hand in the same way.',
                    'Change the last line to <code>console.log(`Trial ${trial}: Target ${target}, Hand ${hand}`);</code>'
                ],
                answer: 'let trial = 3;\nlet target = 5;\nlet hand = "LEFT";\nlet points = 7;\nlet label = `+${points}`;\n\nconsole.log(`Trial ${trial}: Target ${target}, Hand ${hand}`);\n',
                check(v, ctx) {
                    const want = summary(v);
                    const last = lastLog(ctx);
                    if (last === undefined) return fail('Nothing was printed. Check that the last line still starts with <code>console.log(</code>.');
                    const other = ctx.variant({ trial: '4', target: '9', hand: '"RIGHT"' });
                    const varsUsed = other.ok && other.logs[other.logs.length - 1] === 'Trial 4: Target 9, Hand RIGHT';
                    if (last === want && !varsUsed) return nudge('Are you sure? The line is right, but you typed the values by hand. Use the variables, so that the line changes when they change.');
                    if (last === want) return pass('The console shows the trial summary. It\'s built from the variables, so if <code>trial</code> changed to 4, the line would change too.');
                    if (loose(last) === loose(want) || loose(last).replace(/[^a-z0-9]/g, '') === loose(want).replace(/[^a-z0-9]/g, '')) return nudge('Are you sure? Compare your line with the goal character by character, including spaces, capital letters, the colon and the comma.');
                    return fail(`The console shows <code>${esc(last)}</code>. The goal is <code>${esc(want)}</code>.`);
                }
            },
            {
                type: 'bug',
                title: 'Fix the bugs',
                setCode: 'let trial = 3;\nlet target = 5;\nlet hand = "LEFT";\nlet points = 7;\nlet label = "+${points}";\n\nconsole.log(`Trial ${trial}: Target ${target}, Hand ${hand});\n',
                goal: 'Your code now has two mistakes. One stops the code from running. The other shows the wrong label in the preview. Fix both.',
                explain: `<p>Fix the mistake described in the message under the code first. Then look at the label in the preview, and at <code>label</code> in the list of variables.</p>`,
                hints: [
                    'The last line has a backtick that opens but doesn\'t close.',
                    'When the code runs, look at <code>label</code> in the list of variables. Which kind of quotes does line 5 use?',
                    'Line 5 should be <code>let label = `+${points}`;</code> and the last line should end with <code>${hand}`);</code>'
                ],
                answer: 'let trial = 3;\nlet target = 5;\nlet hand = "LEFT";\nlet points = 7;\nlet label = `+${points}`;\n\nconsole.log(`Trial ${trial}: Target ${target}, Hand ${hand}`);\n',
                check(v, ctx) {
                    const labelOk = v.label === '+' + v.points;
                    const logOk = lastLog(ctx) === summary(v);
                    if (labelOk && logOk) return pass('Both bugs are fixed. A missing backtick, and <code>${}</code> inside the wrong kind of quotes, are two common bugs when working with text.');
                    if (!labelOk) return fail(`The code runs, but the label shows <code>${esc(v.label)}</code> instead of +${v.points}. Look at the quotes on line 5.`);
                    return fail(`The label is fixed, but the console doesn't show <code>${esc(summary(v))}</code> yet.`);
                }
            },
            {
                title: 'Target names',
                names: ['index', 'targetId', 'targetName'],
                types: { index: 'number', targetId: 'text', targetName: 'text' },
                setCode: 'let index = 4;\nlet targetId = "sphere-";\nlet targetName = "Target";\n',
                goal: 'Use <code>index</code> to build two pieces of text: the ID <code>sphere-4</code>, and the name <code>Target 5</code>.',
                explain: `<p>Your code has changed again. WebSpheres numbers its 11 targets in two ways. In the code, positions run from 0 to 10, and each target's ID is built from its position, such as <code>sphere-4</code>. In the data files, target numbers run from 1 to 11, so the same target is Target 5.</p><p>Inside <code>\${}</code>, you can write a calculation as well as a variable name, such as <code>\${index + 1}</code>.</p><p>The preview highlights the target at position <code>index</code> and shows <code>targetId</code> under it.</p>`,
                hints: [
                    'Use backticks on both lines, with <code>${index}</code> in the first.',
                    'The target number is one more than <code>index</code>: <code>${index + 1}</code>.',
                    'Line 2 should be <code>let targetId = `sphere-${index}`;</code> and line 3 should be <code>let targetName = `Target ${index + 1}`;</code>'
                ],
                answer: 'let index = 4;\nlet targetId = `sphere-${index}`;\nlet targetName = `Target ${index + 1}`;\n',
                check(v, ctx) {
                    const idOk = v.targetId === `sphere-${v.index}`;
                    const nameOk = v.targetName === `Target ${v.index + 1}`;
                    const uses = /\bindex\b/.test(ctx.rhs('targetId') || '') && /\bindex\b/.test(ctx.rhs('targetName') || '');
                    if (idOk && nameOk && uses) return pass('Both pieces of text are built from <code>index</code>. Line 97 of <code>sphere-manager.js</code> builds each target\'s ID in the same way: <code>`sphere-${i}`</code>.');
                    if (idOk && nameOk) return nudge('Are you sure? The text is right, but you typed the numbers by hand. Build both from <code>index</code>, so that they change when <code>index</code> changes.');
                    if (!idOk) return fail(`<code>targetId</code> is <code>${esc(v.targetId)}</code>. The goal is <code>sphere-${v.index}</code>.`);
                    if (v.targetName === `Target ${v.index}`) return nudge('Are you sure? Target numbers in the data files are one more than the position. Put a calculation inside <code>${}</code>.');
                    if (v.targetName === `Target ${v.index}+1`) return fail('The <code>+1</code> is outside the curly brackets, so it\'s shown as text. Put the calculation inside them: <code>${index + 1}</code>.');
                    if (v.targetName === `Target ${v.index}1`) return fail('The name shows <code>Target 41</code>. Because the left side is text, <code>+ 1</code> joined the 1 instead of adding it. Use <code>${index + 1}</code> inside backticks.');
                    return fail(`<code>targetName</code> is <code>${esc(v.targetName)}</code>. The goal is <code>Target ${v.index + 1}</code>.`);
                }
            },
            {
                type: 'find',
                title: 'Find it in WebSpheres',
                goal: 'Find the line in the WebSpheres code that sets the text of the floating label.',
                explain: `<p>This code is from <code>floating-number.js</code>. It sets up the label that floats up after a hit. The settings for the label are listed between the curly brackets.</p>`,
                file: 'floating-number.js',
                startLine: 20,
                code: `        this.el.setAttribute('text', {
            value: \`+\${this.data.value}\`,
            align: 'center',
            width: 4,
            color: color,
            font: 'exo2bold'
        });
        this.el.setAttribute('scale', initialScale);`,
                question: 'Which line sets the text that floats up after a hit?',
                answer: [1],
                wrong: {
                    0: 'That line starts the list of settings for the label. The text itself is one of the settings inside the curly brackets.',
                    2: 'That line centres the text.',
                    3: 'That line sets the width of the area the text sits in.',
                    4: 'That line sets the colour, using the <code>color</code> box made earlier in the file.',
                    5: 'That line sets the font.',
                    6: 'That line ends the list of settings.',
                    7: 'That line sets the size of the label.'
                },
                success: 'Correct. <code>`+${this.data.value}`</code> is a template literal. <code>this.data.value</code> holds the points for the hit, so a hit worth 7 points shows +7.',
                hints: [
                    'Look for a backtick.',
                    'The line you want contains <code>${</code>.',
                    'It\'s line 21.'
                ]
            }
        ],
        learned: [
            'A piece of text in code is called a <b>string</b>. It goes inside quotes.',
            'When either side of <code>+</code> is text, it joins instead of adding, so <code>"5" + 5</code> gives <code>"55"</code>.',
            'Backticks make a template literal. Inside one, <code>${}</code> puts in a value or a calculation.',
            '<code>${}</code> only works inside backticks. In double or single quotes, it\'s shown as plain text.',
            '<code>console.log</code> prints a line to the console. It helps you check what your code is doing.'
        ],
        real: {
            file: 'data-manager.js',
            where: 'line 397, inside recordTrial',
            code: 'console.log(`Trial ${this.trialNumber}: Target ${targetPosition + 1}, Hand ${handUsed}, Points ${points}, Type ${hitType}, Decision Time ${decisionTime}ms`);',
            note: `<p>WebSpheres prints this line after every trial. It's one template literal with six values in it. <code>Target \${targetPosition + 1}</code> uses the same calculation as step 8, because positions start at 0 but target numbers start at 1. The line ends with <code>ms</code>, because decision times are in milliseconds.</p><p>Lesson 11 explains the <code>this.</code> in <code>this.trialNumber</code>.</p>`
        }
    });
})();
