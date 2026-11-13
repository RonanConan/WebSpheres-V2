(function () {
    const WSA = window.WSA;
    const { pass, fail } = WSA;
    const esc = WSA.esc;
    const angles = ctx => Array.from({ length: 11 }, (_, i) => {
        const r = ctx.call('angleOf', [i]);
        return r.ok && typeof r.value === 'number' && Number.isFinite(r.value) ? r.value : 0;
    });

    window.LESSONS = window.LESSONS || [];
    window.LESSONS.push({
        id: 'functions',
        title: 'Functions',
        subtitle: 'Naming a set of instructions and reusing it',
        names: ['reach', 'ringRadius'],
        types: { reach: 'number', ringRadius: 'number' },
        starterCode: 'let reach = 0.25;\nlet ringRadius = 0.8 * reach;\n',
        scene: v => (typeof v.ringRadius === 'number' ? { radius: v.ringRadius, reach: v.reach, labels: true } : {}),
        intro: `
            <p>A <b>function</b> is a named set of instructions. Once a function exists, you can run it as many times as you like, by its name. Running a function is called <b>calling</b> it.</p>
            <pre class="snippet">let bigger = Math.max(3, 8);</pre>
            <ul class="parts">
                <li><code>Math.max</code> is the name of a function that comes with JavaScript.</li>
                <li>The values in the round brackets are passed to the function.</li>
                <li>The function gives a value back. This is called <b>returning</b> a value. <code>Math.max</code> returns the bigger number, so <code>bigger</code> holds 8.</li>
            </ul>
            <p>In this lesson you'll use functions that come with JavaScript, then write your own. WebSpheres is built from functions: each job, such as choosing a target or scoring a hit, has its own function.</p>`,
        steps: [
            {
                type: 'trace',
                title: 'Calling a function',
                goal: 'Work out what\'s in the box, without running the code.',
                explain: `<p><code>Math.max(a, b)</code> returns whichever of <code>a</code> and <code>b</code> is bigger.</p>`,
                code: 'let reach = 0.3;\nlet ringRadius = Math.max(0.3, 0.8 * reach);',
                box: 'ringRadius',
                question: 'After both lines have run, what is in <code>ringRadius</code>?',
                answer: 0.3,
                wrong: [
                    { value: 0.24, near: true, message: 'Are you sure? 0.24 is 0.8 × 0.3. <code>Math.max</code> then compares 0.3 with 0.24, and returns the bigger one.' },
                    { value: 0.8, message: '0.8 is part of the calculation. Work out <code>0.8 * reach</code> first.' }
                ],
                walk: [
                    '<code>reach</code> holds 0.3.',
                    '<code>0.8 * reach</code> is 0.24.',
                    '<code>Math.max(0.3, 0.24)</code> returns the bigger number, 0.3.'
                ],
                success: 'Correct: 0.3. In WebSpheres, this stops the ring of targets from being closer than 0.3 m, however short the reach is.',
                hints: [
                    'Work out <code>0.8 * reach</code> first.',
                    '<code>Math.max</code> compares 0.3 and 0.24. Which is bigger?',
                    'The answer is <code>0.3</code>.'
                ]
            },
            {
                title: 'A minimum ring size',
                goal: 'Change line 2 so that the ring is never closer than 0.3 m, using <code>Math.max</code>. For longer reaches, the ring should still be 80% of the reach.',
                explain: `<p>This participant has a very short reach, so the ring is only 0.2 m away. WebSpheres prevents this by using <code>Math.max</code>. The page will check your code with a short reach and a long reach.</p>`,
                hints: [
                    'Put <code>Math.max(</code> in front of the calculation on line 2, with 0.3 as the first value.',
                    'The two values go inside the brackets, separated by a comma: <code>Math.max(0.3, 0.8 * reach)</code>.',
                    'Change line 2 to <code>let ringRadius = Math.max(0.3, 0.8 * reach);</code>'
                ],
                answer: 'let reach = 0.25;\nlet ringRadius = Math.max(0.3, 0.8 * reach);\n',
                check(v, ctx) {
                    const short = ctx.variant({ reach: '0.25' });
                    const long = ctx.variant({ reach: '0.7' });
                    if (!short.ok) return fail(esc(short.error.message));
                    if (!long.ok) return fail(esc(long.error.message));
                    if (!WSA.near(short.values.ringRadius, 0.3)) return fail(`With a reach of 0.25, the ring should be 0.3 m away, but your code gives ${esc(WSA.fmt(short.values.ringRadius))}.`);
                    if (!WSA.near(long.values.ringRadius, 0.56)) return fail(`With a reach of 0.7, the ring should be 80% of the reach, 0.56 m, but your code gives ${esc(WSA.fmt(long.values.ringRadius))}.`);
                    return pass('The ring is never closer than 0.3 m, and longer reaches still give 80%. The page checked a reach of 0.25 and a reach of 0.7. This is line 647 of <code>sphere-manager.js</code>.');
                }
            },
            {
                title: 'Write a function',
                names: ['angleOf'],
                types: { angleOf: 'function' },
                setCode: 'function angleOf(i) {\n  return 0;\n}\n',
                scene: (v, ctx) => ({ angles: angles(ctx) }),
                goal: 'Make <code>angleOf</code> return the angle for target position <code>i</code>: -40 + i × 8.',
                explain: `<p>You can write your own functions:</p><pre class="snippet">function double(n) {\n  return n * 2;\n}</pre><ul class="parts"><li><code>function</code> starts the function, and <code>double</code> is its name.</li><li><code>n</code> is a <b>parameter</b>. It's a box that holds the value passed in when the function is called.</li><li><code>return</code> gives a value back to the code that called the function.</li></ul><p>WebSpheres places the target at position <code>i</code> at an angle of -40 + i × 8 degrees, so position 0 is at -40° and position 10 is at 40°. The preview calls your function for each of the 11 positions, and places each target at the angle it returns. At the moment, every target is at 0°.</p><p>The tests under your code call your function with different values.</p>`,
                tests: ctx => WSA.testCases(ctx, 'angleOf', [[[0], -40], [[1], -32], [[5], 0], [[10], 40]]),
                hints: [
                    'Change the <code>return</code> line. It should calculate the angle from <code>i</code>.',
                    'The calculation is <code>-40 + i * 8</code>.',
                    'Change line 2 to <code>  return -40 + i * 8;</code>'
                ],
                answer: 'function angleOf(i) {\n  return -40 + i * 8;\n}\n',
                success: 'All four tests pass, and the preview places the targets with your function. Line 88 of <code>sphere-manager.js</code> does the same calculation.'
            },
            {
                title: 'Change the spacing',
                predict: {
                    question: 'What happens to the targets if you change the 8 in <code>angleOf</code> to 10?',
                    options: ['They spread out evenly on both sides', 'They spread out further on one side than the other', 'They move closer together'],
                    answer: 1,
                    explain: 'Position 0 stays at -40°, but position 10 moves to -40 + 10 × 10 = 60°. The arc gets wider, but only on one side.'
                },
                scene: (v, ctx) => ({ angles: angles(ctx) }),
                goal: 'Change <code>angleOf</code> so that the targets are 10° apart and the arc is centred: position 0 at -50° and position 10 at 50°.',
                explain: `<p>Try the change from your prediction first, and watch the preview. Then centre the arc again.</p>`,
                tests: ctx => WSA.testCases(ctx, 'angleOf', [[[0], -50], [[1], -40], [[5], 0], [[10], 50]]),
                hints: [
                    'The targets are now 10° apart, so multiply <code>i</code> by 10.',
                    'Position 0 has to be at -50°, so the number at the start changes to -50.',
                    'Change the return line to <code>  return -50 + i * 10;</code>'
                ],
                answer: 'function angleOf(i) {\n  return -50 + i * 10;\n}\n',
                success: 'The targets are 10° apart, and the arc is centred again. Because the angle is calculated in one function, one change moved all 11 targets.'
            },
            {
                type: 'trace',
                title: 'Parameters',
                goal: 'Work out what\'s in the box, without running the code.',
                explain: `<p>Each time a function is called, its parameter holds the value that was passed in for that call.</p>`,
                code: 'function double(n) {\n  return n * 2;\n}\n\nlet a = double(3);\nlet b = double(a);',
                box: 'b',
                question: 'After all the lines have run, what is in <code>b</code>?',
                answer: 12,
                wrong: [
                    { value: 6, near: true, message: 'Are you sure? 6 is in <code>a</code>. Line 6 calls <code>double</code> again, with <code>a</code>.' },
                    { value: 3, message: '3 is the value passed in on line 5. The function doubles it.' },
                    { value: 9, message: 'The function multiplies by 2. It doesn\'t add.' }
                ],
                walk: [
                    'Lines 1 to 3 make the function. Nothing runs yet.',
                    'Line 5 calls <code>double(3)</code>: <code>n</code> holds 3, and the function returns 6. <code>a</code> holds 6.',
                    'Line 6 calls <code>double(a)</code>: <code>n</code> holds 6, and the function returns 12. <code>b</code> holds 12.'
                ],
                success: 'Correct: 12. The second call passed in 6, the result of the first call.',
                hints: [
                    'Work out <code>a</code> first.',
                    '<code>a</code> holds 6. What does <code>double(6)</code> return?',
                    'The answer is <code>12</code>.'
                ]
            },
            {
                title: 'Milestones',
                names: ['milestone'],
                types: { milestone: 'function' },
                setCode: 'function milestone(score) {\n  return 0;\n}\n',
                goal: 'Make <code>milestone</code> return the number of whole hundreds in <code>score</code>. For example, a score of 250 contains 2 whole hundreds.',
                explain: `<p><code>Math.floor(x)</code> rounds a number down to a whole number, so <code>Math.floor(2.7)</code> returns 2. A number that is already whole stays the same: <code>Math.floor(3)</code> returns 3.</p><p>WebSpheres shows a special effect each time the score passes another 100 points. To spot this, it works out how many whole hundreds the score contains.</p>`,
                tests: ctx => WSA.testCases(ctx, 'milestone', [[[0], 0], [[99], 0], [[100], 1], [[250], 2]]),
                hints: [
                    'Dividing the score by 100 gives 2.5 for 250. You need to round that down.',
                    'Use <code>Math.floor(score / 100)</code>.',
                    'Change the return line to <code>  return Math.floor(score / 100);</code>'
                ],
                answer: 'function milestone(score) {\n  return Math.floor(score / 100);\n}\n',
                success: 'All four tests pass. Line 82 of <code>score-manager.js</code> uses the same calculation.'
            },
            {
                type: 'bug',
                title: 'Fix the bugs',
                names: ['milestone', 'level'],
                types: { milestone: 'function', level: 'number' },
                setCode: 'function milestone(score) {\n  Math.floor(score / 100);\n}\n\nlet level = Milestone(250);\n',
                goal: 'This code has two mistakes. Fix both, so that <code>level</code> holds 2.',
                explain: `<p>Fix the mistake described in the message under the code first. Then look at <code>level</code> in the list of variables.</p>`,
                hints: [
                    'The function is called <code>milestone</code>, with a small m.',
                    'A function only gives a value back if it has a <code>return</code> line.',
                    'Line 2 should be <code>  return Math.floor(score / 100);</code> and line 5 should be <code>let level = milestone(250);</code>'
                ],
                answer: 'function milestone(score) {\n  return Math.floor(score / 100);\n}\n\nlet level = milestone(250);\n',
                check(v) {
                    if (v.level === 2) return pass('Both bugs are fixed. A function without a <code>return</code> line gives back <code>undefined</code>, which means "no value".');
                    return fail(`<code>level</code> holds ${esc(WSA.show(v.level))}. It should hold 2.`);
                }
            },
            {
                title: 'Inside the target',
                names: ['handDistance', 'isInside'],
                types: { handDistance: 'number', isInside: 'function' },
                setCode: 'let handDistance = 0.12;\n\nfunction isInside(distance) {\n  return false;\n}\n',
                scene: (v, ctx) => {
                    const r = ctx.call('isInside', [v.handDistance]);
                    return { hand: { distance: v.handDistance, inside: r.ok && r.value === true } };
                },
                goal: 'Make <code>isInside</code> return <code>true</code> when <code>distance</code> is less than 0.08, and <code>false</code> when it isn\'t. Then move the hand inside the target, by changing <code>handDistance</code>.',
                explain: `<p>A function can return a boolean. WebSpheres counts a hit when a tracked part of the participant's hand is less than 0.08 m from the centre of the target.</p><p>In the preview, the red ball is the hand. The target turns green when <code>isInside</code> returns <code>true</code> for the hand's distance.</p>`,
                tests: ctx => WSA.testCases(ctx, 'isInside', [[[0.05], true], [[0.08], false], [[0.1], false], [[0], true]]),
                hints: [
                    'A comparison gives true or false, so you can return a comparison.',
                    'Return <code>distance &lt; 0.08</code>. Then set <code>handDistance</code> to a value below 0.08.',
                    'The function should be <code>return distance &lt; 0.08;</code>, and line 1 could be <code>let handDistance = 0.05;</code>'
                ],
                answer: 'let handDistance = 0.05;\n\nfunction isInside(distance) {\n  return distance < 0.08;\n}\n',
                check(v, ctx) {
                    const r = ctx.call('isInside', [v.handDistance]);
                    if (!(r.ok && r.value === true)) return fail('The tests pass. Now move the hand into the target: change <code>handDistance</code> to a value less than 0.08.');
                    return pass('The hand is inside the target, so the target is green. Notice that 0.08 itself counts as outside, because <code>&lt;</code> means "less than", not "less than or equal to". WebSpheres uses the same rule.');
                }
            },
            {
                type: 'find',
                title: 'Find it in WebSpheres',
                goal: 'Find the line in <code>isInsideSphere</code> that decides whether a part of the hand is inside the target.',
                explain: `<p>This is the real function from <code>sphere-manager.js</code>. It has two parameters: the position of a part of the hand, and the position of the target.</p>`,
                file: 'sphere-manager.js',
                startLine: 934,
                code: `    isInsideSphere: function (handPos, spherePos) {
        const hitRadius = 0.08;
        const distance = Math.sqrt(
            Math.pow(handPos.x - spherePos.x, 2) +
            Math.pow(handPos.y - spherePos.y, 2) +
            Math.pow(handPos.z - spherePos.z, 2)
        );
        return distance < hitRadius;
    },`,
                question: 'Which line decides whether the hand is inside the target?',
                answer: [7],
                wrong: {
                    0: 'That line starts the function. <code>handPos</code> and <code>spherePos</code> are its parameters.',
                    1: 'That line makes a box for the 0.08 m limit. It doesn\'t compare anything yet.',
                    2: 'That line starts calculating the distance between the hand and the target. It doesn\'t decide anything yet.',
                    3: 'That line is part of the distance calculation.',
                    4: 'That line is part of the distance calculation.',
                    5: 'That line is part of the distance calculation.',
                    6: 'That bracket ends the distance calculation.',
                    8: 'That line ends the function.'
                },
                success: 'Correct. <code>return distance &lt; hitRadius;</code> returns true when the hand is inside the target and false when it isn\'t, as your <code>isInside</code> function did. The lines above it use Pythagoras\' theorem, which you met in lesson 2.',
                hints: [
                    'Look for the word <code>return</code>.',
                    'The answer compares two values with <code>&lt;</code>.',
                    'It\'s line 941.'
                ]
            }
        ],
        learned: [
            'A function is a named set of instructions. You call it by writing its name followed by round brackets.',
            'Values passed in the brackets arrive in the function\'s parameters.',
            '<code>return</code> gives a value back to the code that called the function. Without it, the function gives back <code>undefined</code>.',
            'JavaScript has built-in functions, such as <code>Math.max</code> and <code>Math.floor</code>.',
            'When a calculation is in one function, one change updates every place that uses it.'
        ],
        real: {
            file: 'score-manager.js',
            where: 'lines 81 to 92, inside addPoints',
            code: `// Check for 100-point milestone FIRST
const currentMilestone = Math.floor(this.score / 100);
if (currentMilestone > this.lastMilestoneReached) {
    this.lastMilestoneReached = currentMilestone;
    this.el.sceneEl.emit('haze-milestone');
} else if (hitType === 'critical') {
    // Only emit critical if no milestone
    this.el.sceneEl.emit('haze-critical-hit');
} else {
    // Only emit normal if no milestone
    this.el.sceneEl.emit('haze-normal-hit');
}`,
            note: `<p>This code runs after every hit. It uses your milestone calculation, then an <code>if</code>, <code>else if</code> and <code>else</code> chain from lesson 4 to choose a visual effect. If the score has passed another 100, it sends the event for the milestone effect. Otherwise, it sends the event for a critical hit or a normal hit.</p><p><code>emit</code> sends an event, and other parts of WebSpheres react to it by showing the effect. Lesson 9 covers events.</p>`
        }
    });
})();
