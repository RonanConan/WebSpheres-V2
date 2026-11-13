(function () {
    const WSA = window.WSA;
    const { pass, fail, nudge } = WSA;
    const esc = WSA.esc;
    const pct = (n, of) => (of ? Math.round(1000 * n / of) / 10 : 0);

    function roll(ctx, name, times) {
        const out = [];
        for (let k = 0; k < times; k++) {
            const r = ctx.call(name, []);
            if (!r.ok) return { error: r.error.message };
            out.push(r.value);
        }
        return { values: out };
    }

    function rollRows(ctx, name, lo, hi) {
        const label = `<code>${name}()</code>`;
        const res = roll(ctx, name, 3000);
        if (res.error) return [{ label, expected: `Whole numbers from ${lo} to ${hi}`, got: esc(res.error), pass: false }];
        const vals = res.values;
        const allNumbers = vals.every(v => typeof v === 'number' && Number.isFinite(v));
        const whole = allNumbers && vals.every(Number.isInteger);
        const min = allNumbers ? Math.min(...vals) : NaN;
        const max = allNumbers ? Math.max(...vals) : NaN;
        const missing = [];
        for (let n = lo; n <= hi; n++) if (!vals.includes(n)) missing.push(n);
        const sample = allNumbers ? vals.slice(0, 3).map(v => WSA.fmt(v)).join(', ') + ', ...' : esc(WSA.show(vals.find(v => typeof v !== 'number')));
        return [
            { label: `${label}, 3000 times: numbers`, expected: 'whole numbers', got: whole ? 'whole numbers' : esc(sample), pass: whole },
            { label: `${label}: smallest result`, expected: String(lo), got: allNumbers ? esc(WSA.fmt(min)) : '-', pass: min === lo },
            { label: `${label}: largest result`, expected: String(hi), got: allNumbers ? esc(WSA.fmt(max)) : '-', pass: max === hi },
            { label: `${label}: every value appears`, expected: `${lo} to ${hi}`, got: missing.length ? `missing ${missing.join(', ')}` : `${lo} to ${hi}`, pass: whole && !missing.length && min === lo && max === hi }
        ];
    }

    function diceChart(ctx, name, lo, hi, title) {
        const res = roll(ctx, name, 1000);
        if (res.error) return `<p class="dim">${esc(res.error)}</p>`;
        const counts = new Map();
        res.values.forEach(v => counts.set(WSA.fmt(v), (counts.get(WSA.fmt(v)) || 0) + 1));
        const keys = Array.from(counts.keys()).sort((a, b) => Number(a) - Number(b));
        const shown = keys.length > 12 ? null : keys;
        const max = Math.max(...counts.values());
        const rows = shown ? shown.map(k => `<div class="row"><span class="name">${esc(k)}</span><span class="track"><span class="fill" style="width:${100 * counts.get(k) / max}%"></span></span><span class="num">${counts.get(k)}</span></div>`).join('') : `<p class="note">Your function returned ${keys.length} different values, such as ${esc(keys.slice(0, 3).join(', '))}. Rolls for points should only give whole numbers from ${lo} to ${hi}.</p>`;
        return `<h3>${title}</h3>${rows}<div class="actions"><button class="btn small" data-act="rerun">Run again</button></div>`;
    }

    function hitChart(rows, title, note) {
        const bars = rows.map(([name, n, of, cls]) => `<div class="row"><span class="name">${name}</span><span class="track"><span class="fill ${cls || ''}" style="width:${pct(n, of)}%"></span></span><span class="num">${n}</span></div>`).join('');
        return `<h3>${title}</h3>${bars}${note ? `<p class="note">${note}</p>` : ''}<div class="actions"><button class="btn small" data-act="rerun">Run again</button></div>`;
    }

    function share(r, chance, times) {
        let yes = 0;
        for (let k = 0; k < times; k++) {
            const c = r.call(r.values.isCritical, []);
            if (!c.ok) return { error: c.error.message };
            if (c.value === true) yes++;
            else if (c.value !== false) return { error: `isCritical should return true or false, but it returned ${WSA.show(c.value)}.` };
        }
        return { share: yes / times };
    }

    window.LESSONS = window.LESSONS || [];
    window.LESSONS.push({
        id: 'randomness',
        title: 'Randomness',
        subtitle: 'Random numbers and chance',
        console: true,
        view: 'panel',
        names: ['rollNormal'],
        types: { rollNormal: 'function' },
        starterCode: 'function rollNormal() {\n  return 1;\n}\n',
        intro: `
            <p>Each time a target is hit, WebSpheres uses chance twice. It decides at random whether the hit is critical, and it rolls a random number of points. It also uses chance elsewhere, for example to choose the next target and to pick a sound.</p>
            <p><code>Math.random()</code> returns a random decimal number from 0 up to, but not including, 1. Each call gives a different number, such as 0.0371, 0.5824 or 0.9906.</p>
            <p>To roll a whole number, such as a score from 1 to 5, the random decimal is stretched, then rounded down:</p>
            <pre class="snippet">Math.floor(Math.random() * 5)</pre>
            <p><code>Math.random() * 5</code> gives a decimal from 0 up to, but not including, 5. <code>Math.floor</code> rounds it down to 0, 1, 2, 3 or 4.</p>
            <p>Because random results change every time, the page checks your code by calling it thousands of times. The panel under the preview shows the results.</p>`,
        steps: [
            {
                type: 'quiz',
                title: 'Which values?',
                goal: 'Work out which values this expression can give.',
                explain: `<p>Read the expression from the inside out: first <code>Math.random()</code>, then <code>* 5</code>, then <code>Math.floor</code>, then <code>+ 1</code>.</p>`,
                question: 'Which values can <code>Math.floor(Math.random() * 5) + 1</code> give?',
                options: [
                    { text: '0, 1, 2, 3 or 4', correct: false, why: 'That\'s what you get before adding 1.' },
                    { text: '1, 2, 3, 4 or 5', correct: true, why: 'Correct. <code>Math.floor(Math.random() * 5)</code> gives 0 to 4, and adding 1 gives 1 to 5.' },
                    { text: '1, 2, 3, 4, 5 or 6', correct: false, why: '<code>Math.random()</code> never returns 1, so <code>Math.random() * 5</code> never reaches 5, and the result never reaches 6.' },
                    { text: 'Any decimal from 1 to 6', correct: false, why: '<code>Math.floor</code> rounds down to a whole number, so there are no decimals.' }
                ],
                success: 'Correct. This is exactly how WebSpheres rolls the points for a normal hit: 1 to 5.',
                hints: [
                    'Start with <code>Math.floor(Math.random() * 5)</code>. Which whole numbers can it give?',
                    'It gives 0 to 4. Then add 1.',
                    'The answer is 1, 2, 3, 4 or 5.'
                ]
            },
            {
                title: 'Points for a normal hit',
                goal: 'Make <code>rollNormal</code> return a random whole number from 1 to 5.',
                explain: `<p>The tests call your function 3000 times, and check the smallest and largest results. The panel under the preview shows 1000 rolls. Press Run again to roll 1000 more.</p>`,
                panel: (v, ctx) => diceChart(ctx, 'rollNormal', 1, 5, '1000 normal hits: points'),
                tests: ctx => rollRows(ctx, 'rollNormal', 1, 5),
                hints: [
                    'Use the expression from step 1.',
                    'The return line needs <code>Math.floor(Math.random() * 5) + 1</code>.',
                    'Change line 2 to <code>  return Math.floor(Math.random() * 5) + 1;</code>'
                ],
                answer: 'function rollNormal() {\n  return Math.floor(Math.random() * 5) + 1;\n}\n',
                success: 'All the tests pass. Each value from 1 to 5 comes up about as often as the others, so each bar is about 200 high. The bars change a little each time you run them again.'
            },
            {
                title: 'Critical or normal?',
                names: ['critChance', 'isCritical'],
                types: { critChance: 'number', isCritical: 'function' },
                setCode: 'let critChance = 0.3;\n\nfunction isCritical() {\n  return false;\n}\n',
                predict: {
                    question: 'If every hit has a 0.3 chance of being critical, about how many of 1000 hits will be critical?',
                    options: ['About 30', 'About 300', 'Exactly 300', 'About 700'],
                    answer: 1,
                    explain: 'A chance of 0.3 means 30%, so about 300 of 1000 hits. Because each hit is random, the total is rarely exactly 300.'
                },
                goal: 'Make <code>isCritical</code> return <code>true</code> with a chance of <code>critChance</code>, and <code>false</code> otherwise.',
                explain: `<p><code>Math.random() &lt; 0.3</code> is true for about 30% of calls, because about 30% of random numbers from 0 to 1 are below 0.3.</p><p>The panel shows how many of 1000 hits your function makes critical. The page checks your function with a chance of 0.3, and with a chance of 0.55.</p>`,
                panel: (v, ctx) => {
                    let crit = 0;
                    for (let k = 0; k < 1000; k++) {
                        const r = ctx.call('isCritical', []);
                        if (!r.ok) return `<p class="dim">${esc(r.error.message)}</p>`;
                        if (r.value === true) crit++;
                    }
                    return hitChart([['Critical', crit, 1000, 'gold'], ['Normal', 1000 - crit, 1000, 'grey']], '1000 hits', `critChance is ${esc(WSA.fmt(v.critChance))}`);
                },
                hints: [
                    'Return a comparison between <code>Math.random()</code> and <code>critChance</code>.',
                    'Use <code>&lt;</code>: the comparison should be true when the random number is below the chance.',
                    'Change the return line to <code>  return Math.random() &lt; critChance;</code>'
                ],
                answer: 'let critChance = 0.3;\n\nfunction isCritical() {\n  return Math.random() < critChance;\n}\n',
                check(v, ctx) {
                    for (const chance of [0.3, 0.55]) {
                        const r = ctx.variant({ critChance: String(chance) });
                        if (!r.ok) return fail(esc(r.error.message));
                        const s = share(r, chance, 20000);
                        if (s.error) return fail(esc(s.error));
                        if (Math.abs(s.share - chance) > 0.02) {
                            if (Math.abs(s.share - (1 - chance)) <= 0.02) return nudge(`Are you sure? With a chance of ${chance}, your function returns true about ${Math.round(s.share * 100)}% of the time, which is the opposite of what it should be. Check whether you used &lt; or &gt;.`);
                            return fail(`With a chance of ${chance}, your function returns true about ${Math.round(s.share * 100)}% of the time. It should be about ${Math.round(chance * 100)}%.`);
                        }
                    }
                    return pass('Your function gives critical hits at the right rate. The page called it 20,000 times with each chance.');
                }
            },
            {
                type: 'quiz',
                title: 'Not exactly 300',
                goal: 'Choose the reason.',
                explain: `<p>In the previous step, the panel counted the critical hits in 1000 calls of your function. Each press of Run again gave a slightly different count.</p>`,
                question: 'With a 0.3 chance, why isn\'t the number of critical hits exactly 300 out of every 1000?',
                options: [
                    { text: 'Because <code>Math.random()</code> doesn\'t work properly', correct: false, why: '<code>Math.random()</code> works as intended. Variation is what randomness looks like.' },
                    { text: 'Because each hit is decided separately at random, so the total varies a little from one set of hits to the next', correct: true, why: 'Correct. Tossing a coin 10 times doesn\'t always give exactly 5 heads, for the same reason.' },
                    { text: 'Because 0.3 can\'t be stored exactly', correct: false, why: 'That rounding error is far too small to matter here. The variation comes from the randomness.' },
                    { text: 'Because the computer rounds the results', correct: false, why: 'Nothing is rounded. Each hit is simply critical or not.' }
                ],
                success: 'Correct. Over many hits, the share of critical hits gets close to 30%, but any one set of hits varies a little.',
                hints: [
                    'Think about tossing a coin 10 times.',
                    'Each hit is decided on its own.',
                    'The answer is the second option.'
                ]
            },
            {
                title: 'Points for a critical hit',
                names: ['rollCritical'],
                types: { rollCritical: 'function' },
                setCode: 'function rollCritical() {\n  return 5;\n}\n',
                goal: 'Make <code>rollCritical</code> return a random whole number from 5 to 10.',
                explain: `<p>A critical hit in WebSpheres scores from 5 to 10 points. That's 6 possible values. Use the pattern from step 2: multiply <code>Math.random()</code> by the number of possible values, round down, then add the smallest value.</p>`,
                panel: (v, ctx) => diceChart(ctx, 'rollCritical', 5, 10, '1000 critical hits: points'),
                tests: ctx => rollRows(ctx, 'rollCritical', 5, 10),
                hints: [
                    'There are 6 possible values: 5, 6, 7, 8, 9 and 10.',
                    '<code>Math.floor(Math.random() * 6)</code> gives 0 to 5. Add 5.',
                    'Change the return line to <code>  return Math.floor(Math.random() * 6) + 5;</code>'
                ],
                answer: 'function rollCritical() {\n  return Math.floor(Math.random() * 6) + 5;\n}\n',
                success: 'All the tests pass. This is line 69 of <code>score-manager.js</code>.'
            },
            {
                type: 'trace',
                title: 'How WebSpheres decides',
                goal: 'Work out what\'s in the box, without running the code.',
                explain: `<p>WebSpheres decides the hit type in a slightly different way from your <code>isCritical</code> function. It checks whether the random number is below 1 minus the chance. If it is, the hit is normal. The result is the same: a 0.3 chance still gives about 30% critical hits.</p><p>The <code>? :</code> on line 3 chooses between two values, as in lesson 4's real code.</p>`,
                code: 'let random = 0.75;\nlet criticalChance = 0.3;\nlet hitType = random < (1 - criticalChance) ? "normal" : "critical";',
                box: 'hitType',
                question: 'After the three lines have run, what is in <code>hitType</code>?',
                answer: 'critical',
                wrong: [
                    { value: 'normal', near: true, message: 'Are you sure? <code>1 - criticalChance</code> is 0.7. Is 0.75 less than 0.7?' }
                ],
                walk: [
                    '<code>random</code> holds 0.75, and <code>criticalChance</code> holds 0.3.',
                    '<code>1 - criticalChance</code> is 0.7. Is 0.75 less than 0.7? No.',
                    'The condition is false, so the value after the colon is used: <code>hitType</code> holds "critical".'
                ],
                success: 'Correct: "critical". Random numbers from 0.7 up to 1 give a critical hit. That\'s 30% of all random numbers.',
                hints: [
                    'Work out <code>1 - criticalChance</code> first.',
                    'Is 0.75 less than 0.7? If not, the value after the colon is used.',
                    'The answer is <code>"critical"</code>.'
                ]
            },
            {
                type: 'bug',
                title: 'Fix the bugs',
                names: ['rollNormal', 'rollCritical'],
                types: { rollNormal: 'function', rollCritical: 'function' },
                setCode: 'function rollNormal() {\n  return Math.random() * 5 + 1;\n}\n\nfunction rollCritical() {\n  return Math.floor(Math.random() * 5) + 5;\n}\n',
                goal: 'Each of these functions has one mistake. Fix both, so that all the tests pass.',
                explain: `<p>Neither mistake stops the code from running. Look at the tests under your code to find them.</p>`,
                tests: ctx => rollRows(ctx, 'rollNormal', 1, 5).concat(rollRows(ctx, 'rollCritical', 5, 10)),
                hints: [
                    '<code>rollNormal</code> returns decimals. Which function rounds down?',
                    '<code>rollCritical</code> never returns 10. How many possible values are there from 5 to 10?',
                    'The return lines should be <code>return Math.floor(Math.random() * 5) + 1;</code> and <code>return Math.floor(Math.random() * 6) + 5;</code>'
                ],
                answer: 'function rollNormal() {\n  return Math.floor(Math.random() * 5) + 1;\n}\n\nfunction rollCritical() {\n  return Math.floor(Math.random() * 6) + 5;\n}\n',
                success: 'Both bugs are fixed. Neither one caused an error, so only testing with many rolls showed them.'
            },
            {
                title: 'Compare the hands',
                names: ['leftChance', 'rightChance', 'simulate'],
                types: { leftChance: 'number', rightChance: 'number', simulate: 'function' },
                setCode: 'let leftChance = 0.05;\nlet rightChance = 0.55;\n\nfunction simulate(chance) {\n  let criticals = 0;\n  return criticals;\n}\n',
                goal: 'Complete <code>simulate</code>, so that it rolls 1000 hits with the given chance, and returns how many of them are critical.',
                explain: `<p>In condition 2, the dominant hand has a 0.05 critical-hit chance, and the other hand has 0.55. Here, the left hand is dominant.</p><p>Inside <code>simulate</code>, use a loop from lesson 6 that repeats 1000 times. Each time, add 1 to <code>criticals</code> if <code>Math.random() &lt; chance</code>.</p><p>The panel calls your function for each hand and compares the results.</p>`,
                panel: (v, ctx) => {
                    const l = ctx.call('simulate', [v.leftChance]);
                    const r = ctx.call('simulate', [v.rightChance]);
                    if (!l.ok) return `<p class="dim">${esc(l.error.message)}</p>`;
                    if (!r.ok) return `<p class="dim">${esc(r.error.message)}</p>`;
                    const n = x => (typeof x === 'number' && Number.isFinite(x) ? x : 0);
                    return hitChart([['Left hand', n(l.value), 1000, 'gold'], ['Right hand', n(r.value), 1000, 'gold']], 'Critical hits out of 1000', 'The left hand is dominant.');
                },
                tests: ctx => {
                    const rows = WSA.testCases(ctx, 'simulate', [[[0], 0], [[1], 1000]]);
                    const r = ctx.call('simulate', [0.55]);
                    const ok = r.ok && typeof r.value === 'number' && r.value >= 480 && r.value <= 620;
                    rows.push({ label: '<code>simulate(0.55)</code>', expected: 'about 550', got: r.ok ? `<code>${esc(WSA.show(r.value))}</code>` : esc(r.error.message), pass: ok });
                    return rows;
                },
                hints: [
                    'Inside the function, before the return line, add a <code>for</code> loop that repeats 1000 times.',
                    'Inside the loop: <code>if (Math.random() &lt; chance) { criticals = criticals + 1; }</code>',
                    'Add <code>for (let i = 0; i &lt; 1000; i++) { if (Math.random() &lt; chance) { criticals = criticals + 1; } }</code> before <code>return criticals;</code>'
                ],
                answer: 'let leftChance = 0.05;\nlet rightChance = 0.55;\n\nfunction simulate(chance) {\n  let criticals = 0;\n  for (let i = 0; i < 1000; i++) {\n    if (Math.random() < chance) {\n      criticals = criticals + 1;\n    }\n  }\n  return criticals;\n}\n',
                success: 'The tests pass, and the panel shows the difference between the hands: about 50 critical hits for the dominant hand, and about 550 for the other.'
            },
            {
                type: 'find',
                title: 'Find it in WebSpheres',
                goal: 'Find the line in <code>calculateHitPoints</code> that decides whether a hit is normal or critical.',
                explain: `<p>This is the real <code>calculateHitPoints</code> function from <code>score-manager.js</code>. You can now read almost all of it. The lines with <code>audioManager</code> play the sound for the hit.</p>`,
                file: 'score-manager.js',
                startLine: 54,
                code: `    calculateHitPoints: function (handUsed) {
        const random = Math.random();
        const audioManager = document.querySelector('#audio-manager').components['audio-manager'];

        const criticalChance = handUsed === 'LEFT' ? this.leftHandCriticalChance : this.rightHandCriticalChance;

        if (random < (1 - criticalChance)) {
            audioManager.playHitSound('normal');
            return {
                points: Math.floor(Math.random() * 5) + 1,
                hitType: 'normal'
            };
        } else {
            audioManager.playHitSound('critical');
            return {
                points: Math.floor(Math.random() * 6) + 5,
                hitType: 'critical'
            };
        }
    },`,
                question: 'Which line decides whether a hit is normal or critical?',
                answer: [6],
                wrong: {
                    0: 'That line starts the function. <code>handUsed</code> is the hand that made the hit.',
                    1: 'That line rolls the random number. The decision comes later.',
                    2: 'That line finds the part of WebSpheres that plays sounds.',
                    4: 'That line picks the critical-hit chance for the hand that made the hit.',
                    7: 'That line plays the sound for a normal hit, after the decision.',
                    8: 'That line starts the result for a normal hit.',
                    9: 'That line rolls the points for a normal hit.',
                    10: 'That line labels the hit as normal.',
                    11: 'That bracket ends the result for a normal hit.',
                    12: 'That line starts the part for a critical hit.',
                    13: 'That line plays the sound for a critical hit.',
                    14: 'That line starts the result for a critical hit.',
                    15: 'That line rolls the points for a critical hit.',
                    16: 'That line labels the hit as critical.',
                    17: 'That bracket ends the result for a critical hit.',
                    18: 'That bracket ends the if and else.',
                    19: 'That line ends the function.'
                },
                success: 'Correct. <code>if (random &lt; (1 - criticalChance))</code> is the rule from step 6. When it\'s true, the hit is normal. Otherwise, it\'s critical.',
                hints: [
                    'Look for an <code>if</code>.',
                    'The deciding line compares <code>random</code> with the chance.',
                    'It\'s line 60.'
                ]
            }
        ],
        learned: [
            '<code>Math.random()</code> returns a random decimal from 0 up to, but not including, 1.',
            '<code>Math.floor(Math.random() * n) + lowest</code> rolls a whole number from <code>lowest</code> to <code>lowest + n - 1</code>.',
            '<code>Math.random() &lt; chance</code> is true with that chance, so it can decide random events such as critical hits.',
            'Random results vary each time, so code that uses chance is tested by running it many times.',
            'Some bugs don\'t cause errors. Tests find them.'
        ],
        real: {
            file: 'sphere-manager.js',
            where: 'lines 885 and 886, inside selectRandomSphere',
            code: `const randomIndex = Math.floor(Math.random() * availablePositions.length);
const selectedPosition = availablePositions[randomIndex];`,
            note: `<p>WebSpheres also uses randomness to choose which target appears next. <code>availablePositions</code> is a list of the targets that are allowed to appear, and <code>availablePositions.length</code> is the number of targets in it. The first line rolls a random position in the list, with the pattern you used for points.</p><p>The square brackets on the second line pick an item out of the list. Lesson 8 covers lists.</p>`
        }
    });
})();
