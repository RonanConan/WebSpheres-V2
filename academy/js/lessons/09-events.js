(function () {
    const WSA = window.WSA;
    const { pass, fail, nudge } = WSA;
    const esc = WSA.esc;
    const msg = s => `<code>${esc(WSA.show(s.state.message || '(no message)'))}</code>`;
    const errorOf = s => (s.errors.length ? s.errors[0].message : null);

    window.LESSONS = window.LESSONS || [];
    window.LESSONS.push({
        id: 'events',
        title: 'Events',
        subtitle: 'Code that waits for something to happen',
        api: 'game',
        console: true,
        names: ['score', 'onHit'],
        types: { score: 'number', onHit: 'function' },
        starterCode: 'let score = 0;\n\nfunction onHit(event) {\n\n}\n\ntargets.addEventListener("click", onHit);\n',
        intro: `
            <p>So far, your code has run from top to bottom and then stopped. Interactive programs also need to react to things that happen later, such as a click, a key press, a hand reaching a target, or a timer running out. These are called <b>events</b>.</p>
            <p>Code can ask to be told when an event happens. It gives the browser a function to call at that moment. This function is called an <b>event listener</b>.</p>
            <pre class="snippet">targets.addEventListener("click", onHit);</pre>
            <p>This line asks the page to call <code>onHit</code> each time a target is clicked. It doesn't call <code>onHit</code> straight away, so there are no brackets after <code>onHit</code>.</p>
            <p>In this lesson, the preview is a small version of the task that you play with the mouse. A click with the left mouse button counts as a hit with the left hand, and a click with the right button counts as the right hand. The page gives you these functions:</p>
            <ul class="parts">
                <li><code>showTarget(index)</code> and <code>hideTarget(index)</code> show and hide one target. Until your code uses one of them, the preview shows every target.</li>
                <li><code>showMessage(text)</code> shows a line of text above the targets.</li>
                <li><code>floatLabel(index, text, colour)</code> floats a label up from a target, as after a hit in WebSpheres.</li>
            </ul>`,
        steps: [
            {
                type: 'quiz',
                title: 'What is an event?',
                goal: 'Choose every item that is an event.',
                explain: `<p>An event is something that happens while the program is running, which code can react to.</p>`,
                question: 'Which of these are events?',
                multi: true,
                options: [
                    { text: 'A participant\'s hand reaching a target', correct: true, why: 'An event. WebSpheres reacts by scoring the hit.' },
                    { text: 'A key being pressed', correct: true, why: 'An event. WebSpheres reacts to keys such as P, which pauses the task.' },
                    { text: 'A timer running out', correct: true, why: 'An event. WebSpheres uses timers to show each target after a short delay.' },
                    { text: 'A variable being made with <code>let</code>', correct: false, why: 'Not an event. Making a variable is an instruction that the code carries out. Nothing outside the code has happened.' }
                ],
                success: 'All your choices are right. The note under each item gives the reason.',
                hints: [
                    'An event happens outside the code, while the program is running.',
                    'Three of the four items are events.',
                    'The events are the hand reaching a target, the key press and the timer.'
                ]
            },
            {
                title: 'Score a hit',
                goal: 'Fill in <code>onHit</code>, so that each hit adds 3 to <code>score</code> and shows the score with <code>showMessage</code>.',
                explain: `<p>Write the lines between the curly brackets of <code>onHit</code>. They run each time a target is clicked, not when the code first runs.</p><p>To show the score, use a template literal from lesson 3: <code>showMessage(\`Score: \${score}\`);</code></p><p>Try your code by clicking targets in the preview. The list of variables shows <code>score</code> going up.</p>`,
                hints: [
                    'Inside <code>onHit</code>, first add 3 to the score: <code>score = score + 3;</code>',
                    'On the next line, show it: <code>showMessage(`Score: ${score}`);</code>',
                    'The function should be <code>function onHit(event) { score = score + 3; showMessage(`Score: ${score}`); }</code>'
                ],
                answer: 'let score = 0;\n\nfunction onHit(event) {\n  score = score + 3;\n  showMessage(`Score: ${score}`);\n}\n\ntargets.addEventListener("click", onHit);\n',
                check(v, ctx) {
                    const s = ctx.sim();
                    if (!s.ok) return fail(esc(s.error.message));
                    if (s.read().score !== 0) return fail('<code>score</code> should still be 0 before any target is hit. Put the scoring lines inside <code>onHit</code>.');
                    s.click(0, 'LEFT');
                    s.click(3, 'RIGHT');
                    if (errorOf(s)) return fail(esc(errorOf(s)));
                    const score = s.read().score;
                    if (score !== 6) return fail(`After two hits, <code>score</code> should be 6, but it's ${esc(WSA.show(score))}.`);
                    if (s.state.message !== 'Score: 6') return fail(`The score is right, but after two hits the message is ${msg(s)}. It should be <code>Score: 6</code>.`);
                    return pass('Each hit adds 3 points and shows the new score. The page tested it with two hits.');
                }
            },
            {
                type: 'trace',
                title: 'Later, not now',
                goal: 'Work out the order in which the three letters are printed.',
                explain: `<p><code>setTimeout(fn, ms)</code> asks the browser to call the function <code>fn</code> after <code>ms</code> milliseconds. A timer running out is an event, so <code>fn</code> runs later, when the event happens.</p><p>The code on lines 2 to 4 passes a function without a name straight to <code>setTimeout</code>. This is a common way to write a short listener.</p>`,
                code: 'console.log("A");\nsetTimeout(function () {\n  console.log("B");\n}, 0);\nconsole.log("C");',
                boxLabel: 'Printed in the order',
                noRun: true,
                question: 'The timer is set to 0 milliseconds. In what order are the letters printed?',
                answer: 'A C B',
                accept: raw => raw.toUpperCase().replace(/[^ABC]/g, '') === 'ACB',
                wrong: [
                    { test: (v, raw) => String(raw).toUpperCase().replace(/[^ABC]/g, '') === 'ABC', near: true, message: 'Are you sure? A timer\'s function never runs straight away, even with a delay of 0. It waits until the code that\'s running has finished.' }
                ],
                walk: [
                    'Line 1 prints A.',
                    'Lines 2 to 4 set a timer. The function that prints B is saved for later.',
                    'Line 5 prints C. The code has finished, so the timer\'s function runs and prints B.'
                ],
                success: 'Correct: A, C, B. The code that\'s running always finishes first, then waiting events are handled.',
                hints: [
                    'Which lines run straight away, and which line runs later?',
                    'The function inside <code>setTimeout</code> runs only after the rest of the code has finished.',
                    'The answer is <code>A C B</code>.'
                ]
            },
            {
                title: 'Wait, then show',
                names: ['showNext'],
                types: { showNext: 'function' },
                setCode: 'function showNext() {\n  showTarget(5);\n}\n\nshowNext();\n',
                goal: 'Change the last line, so that <code>showNext</code> runs 500 milliseconds later, using <code>setTimeout</code>.',
                explain: `<p>Your code has changed. In WebSpheres, a target appears 500 milliseconds after it's chosen. <code>startAppearTimer</code> in <code>sphere-manager.js</code> does this with <code>setTimeout</code>.</p><p>Pass the function's name to <code>setTimeout</code>, without brackets, so that the timer can call it later.</p>`,
                hints: [
                    'Replace <code>showNext();</code> with a call to <code>setTimeout</code>.',
                    '<code>setTimeout</code> takes the function first, then the delay: <code>setTimeout(showNext, 500);</code>',
                    'Change the last line to <code>setTimeout(showNext, 500);</code>'
                ],
                answer: 'function showNext() {\n  showTarget(5);\n}\n\nsetTimeout(showNext, 500);\n',
                check(v, ctx) {
                    const s = ctx.sim();
                    if (!s.ok) return fail(esc(s.error.message));
                    if (s.state.shown && s.state.visible[5]) return fail('The target appears straight away. It should appear after 500 milliseconds.');
                    s.advance(499);
                    if (s.state.shown && s.state.visible[5]) return fail('The target appears too early. The delay should be 500 milliseconds.');
                    s.advance(1);
                    if (errorOf(s)) return fail(esc(errorOf(s)));
                    if (!(s.state.shown && s.state.visible[5])) return fail('The target doesn\'t appear 500 milliseconds after the code runs.');
                    return pass('The target appears 500 milliseconds after the code runs. The page checked the timing with a simulated clock.');
                }
            },
            {
                title: 'Pause with P',
                names: ['paused', 'onKey'],
                types: { paused: 'boolean', onKey: 'function' },
                setCode: 'let paused = false;\n\nfunction onKey(event) {\n\n}\n\ndocument.addEventListener("keydown", onKey);\n',
                goal: 'Fill in <code>onKey</code>, so that pressing P switches <code>paused</code> between <code>true</code> and <code>false</code>, and shows <code>Paused</code> or <code>Running</code> with <code>showMessage</code>. Other keys should do nothing.',
                explain: `<p>The page calls <code>onKey</code> with an event object. <code>event.code</code> holds the name of the key, such as <code>"KeyP"</code> for the P key, or <code>"Space"</code> for the space bar. WebSpheres uses these names for its keyboard controls.</p><p>An exclamation mark in front of a boolean turns <code>true</code> into <code>false</code>, and <code>false</code> into <code>true</code>. So <code>paused = !paused;</code> switches <code>paused</code> each time it runs.</p><p>To try it, click the preview, then press P.</p>`,
                hints: [
                    'Inside <code>onKey</code>, check the key: <code>if (event.code === "KeyP") {</code>',
                    'Inside that block, switch <code>paused</code>, then show the message: <code>showMessage(paused ? "Paused" : "Running");</code> or use an <code>if</code> and <code>else</code>.',
                    'The function can be <code>function onKey(event) { if (event.code === "KeyP") { paused = !paused; if (paused) { showMessage("Paused"); } else { showMessage("Running"); } } }</code>'
                ],
                answer: 'let paused = false;\n\nfunction onKey(event) {\n  if (event.code === "KeyP") {\n    paused = !paused;\n    if (paused) {\n      showMessage("Paused");\n    } else {\n      showMessage("Running");\n    }\n  }\n}\n\ndocument.addEventListener("keydown", onKey);\n',
                check(v, ctx) {
                    const s = ctx.sim();
                    if (!s.ok) return fail(esc(s.error.message));
                    s.key('KeyX', 'x');
                    if (s.read().paused !== false) return fail('Pressing a key other than P changed <code>paused</code>. Check <code>event.code</code> first.');
                    s.key('KeyP', 'p');
                    if (errorOf(s)) return fail(esc(errorOf(s)));
                    if (s.read().paused !== true) return fail('After pressing P once, <code>paused</code> should be <code>true</code>.');
                    if (s.state.message !== 'Paused') return fail(`After pressing P once, the message should be <code>Paused</code>, but it's ${msg(s)}.`);
                    s.key('KeyP', 'p');
                    if (s.read().paused !== false) return fail('After pressing P a second time, <code>paused</code> should be <code>false</code> again.');
                    if (s.state.message !== 'Running') return fail(`After pressing P a second time, the message should be <code>Running</code>, but it's ${msg(s)}.`);
                    s.key('Space', ' ');
                    if (s.read().paused !== false || s.state.message !== 'Running') return fail('Pressing the space bar changed something. Only P should.');
                    return pass('P pauses and resumes, and other keys do nothing. The page pressed X, P, P and the space bar. WebSpheres also reads <code>event.code</code>: it looks up <code>"KeyP"</code> in a list of keyboard controls, and pauses or resumes the task. Before the task starts, the same key starts it.');
                }
            },
            {
                type: 'bug',
                title: 'Fix the bugs',
                names: ['score', 'onHit'],
                types: { score: 'number', onHit: 'function' },
                setCode: 'let score = 0;\n\nfunction onHit(event) {\n  score = score + 3;\n  showMessage(`Score: ${Score}`);\n}\n\ntargets.addEventListener("click", onHit());\n',
                goal: 'This is the code from step 2, with two mistakes in it. Fix both, so that clicking targets scores 3 points a hit again.',
                explain: `<p>Fix the mistake described in the message under the code first, then read the message again.</p>`,
                hints: [
                    'The variable is called <code>score</code>, with a small s.',
                    'On the last line, the brackets after <code>onHit</code> call the function straight away. Pass the function itself instead.',
                    'Line 5 should use <code>${score}</code>, and the last line should be <code>targets.addEventListener("click", onHit);</code>'
                ],
                answer: 'let score = 0;\n\nfunction onHit(event) {\n  score = score + 3;\n  showMessage(`Score: ${score}`);\n}\n\ntargets.addEventListener("click", onHit);\n',
                check(v, ctx) {
                    const s = ctx.sim();
                    if (!s.ok) return fail(esc(s.error.message));
                    s.click(0, 'LEFT');
                    s.click(1, 'LEFT');
                    if (errorOf(s)) return fail(esc(errorOf(s)));
                    if (s.read().score !== 6 || s.state.message !== 'Score: 6') return fail('After two hits, the score should be 6, and the message should say <code>Score: 6</code>.');
                    return pass('Both bugs are fixed. Brackets after a function\'s name call it straight away. To pass a function to be called later, leave them out.');
                }
            },
            {
                type: 'trace',
                title: 'Before the timer',
                goal: 'Work out what\'s in the box straight after the code runs.',
                explain: `<p>Remember that a timer's function runs later, after the rest of the code has finished.</p>`,
                code: 'let score = 0;\nsetTimeout(function () {\n  score = score + 5;\n}, 1000);\nscore = score + 1;',
                box: 'score',
                noRun: true,
                question: 'What is in <code>score</code> straight after these lines have run, before 1 second has passed?',
                answer: 1,
                wrong: [
                    { value: 6, near: true, message: 'Are you sure? That\'s the value 1 second later. The function inside <code>setTimeout</code> hasn\'t run yet.' },
                    { value: 5, message: 'The function that adds 5 runs only after 1 second. Line 5 runs straight away.' },
                    { value: 0, message: 'Line 5 runs straight away and adds 1.' }
                ],
                walk: [
                    'Line 1: <code>score</code> holds 0.',
                    'Lines 2 to 4 set a timer. The function that adds 5 is saved for 1 second later.',
                    'Line 5 adds 1, so <code>score</code> holds 1. One second later, the timer adds 5, and <code>score</code> becomes 6.'
                ],
                success: 'Correct: 1. One second later, it becomes 6.',
                hints: [
                    'Which lines run straight away?',
                    'Only lines 1 and 5 have run so far.',
                    'The answer is <code>1</code>.'
                ]
            },
            {
                title: 'The next target',
                names: ['score', 'showNext', 'onHit'],
                types: { score: 'number', showNext: 'function', onHit: 'function' },
                setCode: 'let score = 0;\n\nfunction showNext() {\n  showTarget(5);\n}\n\nfunction onHit(event) {\n  hideTarget(event.index);\n  score = score + 3;\n  showMessage(`Score: ${score}`);\n}\n\ntargets.addEventListener("click", onHit);\nshowNext();\n',
                goal: 'At the end of <code>onHit</code>, add a line that uses <code>setTimeout</code> to call <code>showNext</code> 300 milliseconds after each hit.',
                explain: `<p>In WebSpheres, a target disappears as soon as it's hit. Then a cooldown of 300 milliseconds follows, set by <code>startDisappearTimer</code>. After that, the next target is chosen when both of the participant's hands are back at the home position, and it appears 500 milliseconds later.</p><p>The preview has no hands, so in this step the next target appears straight after the 300 millisecond cooldown. <code>event.index</code> holds the index of the target that was clicked.</p><p>Try it in the preview: click the target, and it comes back after the cooldown.</p>`,
                hints: [
                    'Add a line inside <code>onHit</code>, before its closing curly bracket.',
                    'Use <code>setTimeout(showNext, 300);</code>',
                    'Add <code>  setTimeout(showNext, 300);</code> as the last line inside <code>onHit</code>.'
                ],
                answer: 'let score = 0;\n\nfunction showNext() {\n  showTarget(5);\n}\n\nfunction onHit(event) {\n  hideTarget(event.index);\n  score = score + 3;\n  showMessage(`Score: ${score}`);\n  setTimeout(showNext, 300);\n}\n\ntargets.addEventListener("click", onHit);\nshowNext();\n',
                check(v, ctx) {
                    const s = ctx.sim();
                    if (!s.ok) return fail(esc(s.error.message));
                    if (!s.state.visible[5]) return fail('Target 5 should be showing when the code starts. Keep the last line, <code>showNext();</code>.');
                    s.click(5, 'LEFT');
                    if (errorOf(s)) return fail(esc(errorOf(s)));
                    if (s.state.visible[5]) return fail('The target should disappear as soon as it\'s hit. Keep the <code>hideTarget</code> line.');
                    s.advance(299);
                    if (s.state.visible[5]) return fail('The target comes back too early. The cooldown should be 300 milliseconds.');
                    s.advance(1);
                    if (errorOf(s)) return fail(esc(errorOf(s)));
                    if (!s.state.visible[5]) return fail('The target doesn\'t come back 300 milliseconds after the hit.');
                    return pass('The target disappears on a hit and comes back after the 300 millisecond cooldown. The page checked the timing with a simulated clock.');
                }
            },
            {
                type: 'find',
                title: 'Find it in WebSpheres',
                goal: 'Find the line in <code>setupCalibration</code> that asks to be told about key presses.',
                explain: `<p>This code sets up the WebSpheres keyboard controls. <code>keyActions</code> is an object from lesson 8. Each field name is the code of a key, and its value is the command that the key runs.</p><p>The listener here is written with <code>(event) =&gt; { ... }</code>. This is a shorter way to write a function without a name, called an arrow function.</p>`,
                file: 'sphere-manager.js',
                startLine: 282,
                code: `        const keyActions = {
            Space: ['calibrate', 'reach'],
            KeyH: ['calibrate', 'height'],
            KeyL: ['calibrate', 'lap'],
            KeyS: ['saveOnHeadset'],
            KeyP: ['playPause'],
            KeyC: ['toggleCondition'],
            Digit1: ['setDominant', 'LEFT'],
            Digit2: ['setDominant', 'RIGHT'],
            KeyN: ['setMode', 'short'],
            KeyF: ['setMode', 'fmode'],
            KeyB: ['setMode', 'block'],
            KeyZ: ['skip']
        };
        document.addEventListener('keydown', (event) => {
            if (event.repeat) return;
            const action = keyActions[event.code];
            if (action) this.runCommand(action[0], action[1]);
        });`,
                question: 'Which line asks to be told about key presses?',
                answer: [14],
                wrong: Object.assign(Object.fromEntries(Array.from({ length: 13 }, (_, k) => [k + 1, 'That line links one key to a command. It doesn\'t listen for anything.'])), {
                    0: 'That line starts the object that links keys to commands.',
                    13: 'That bracket ends the object.',
                    15: 'That line is inside the listener. It ignores the extra events that arrive while a key is held down.',
                    16: 'That line is inside the listener. It looks up the command for the key that was pressed.',
                    17: 'That line is inside the listener. It runs the command.',
                    18: 'That line ends the listener.'
                }),
                success: 'Correct. <code>document.addEventListener(\'keydown\', ...)</code> asks to be told about every key press, as your <code>onKey</code> listener did. <code>keyActions[event.code]</code> then looks up the command, using square brackets to read a field by name.',
                hints: [
                    'Look for <code>addEventListener</code>.',
                    'The event is called <code>keydown</code>.',
                    'It\'s line 296.'
                ]
            }
        ],
        learned: [
            'An event is something that happens while a program runs, such as a click, a key press or a timer running out.',
            '<code>addEventListener</code> gives the browser a function to call when an event happens.',
            'Pass a function without brackets to have it called later. With brackets, it runs straight away.',
            '<code>setTimeout(fn, ms)</code> calls a function after a delay. It runs after the rest of the code has finished.',
            'A listener receives an event object, with details such as <code>event.code</code> or <code>event.index</code>.'
        ],
        real: {
            file: 'spectator-manager.js',
            where: 'lines 73 to 77',
            code: `this.el.sceneEl.addEventListener('enter-vr', this.bindEnterVR);
this.el.sceneEl.addEventListener('exit-vr', this.bindExitVR);
document.addEventListener('visibilitychange', this.bindVisibility);
window.addEventListener('online', this.bindHeal);
window.addEventListener('beforeunload', this.bindUnload);`,
            note: `<p>WebSpheres listens for many events besides clicks and keys. These five lines listen for the headset entering and leaving VR, for the page being hidden or shown, for the network connection coming back, and for the page being about to close.</p><p>Each line passes a function without brackets, as you did in step 6.</p>`
        }
    });
})();
