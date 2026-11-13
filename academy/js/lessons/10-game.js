(function () {
    const WSA = window.WSA;
    const { pass, fail } = WSA;
    const esc = WSA.esc;

    const VARS1 = 'let score = 0;\n';
    const VARS2 = 'let score = 0;\nlet counts = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];\nlet lastIndex = -1;\n';
    const VARS6 = 'let score = 0;\nlet counts = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];\nlet lastIndex = -1;\nlet trials = [];\n';
    const LOOP = '\nfor (let i = 0; i < 11; i++) {\n  addTarget(-40 + i * 8);\n}\n';
    const CHOOSE_EMPTY = '\nfunction chooseTarget() {\n  let available = [];\n\n  return available[Math.floor(Math.random() * available.length)];\n}\n';
    const CHOOSE = '\nfunction chooseTarget() {\n  let available = [];\n  for (let i = 0; i < counts.length; i++) {\n    if (counts[i] < 2 && i !== lastIndex) {\n      available.push(i);\n    }\n  }\n  if (available.length === 0) {\n    for (let i = 0; i < counts.length; i++) {\n      if (counts[i] < 2) {\n        available.push(i);\n      }\n    }\n  }\n  return available[Math.floor(Math.random() * available.length)];\n}\n';
    const SHOW_EMPTY = '\nfunction showNext() {\n\n}\n';
    const SHOW = '\nfunction showNext() {\n  let index = chooseTarget();\n  lastIndex = index;\n  setTimeout(function () {\n    counts[index] = counts[index] + 1;\n    showTarget(index);\n  }, 500);\n}\n';
    const HIT_EMPTY = '\nfunction onHit(event) {\n\n}\n';
    const HIT_4 = '\nfunction onHit(event) {\n  hideTarget(event.index);\n  let critical = Math.random() < 0.3;\n  let points = critical ? Math.floor(Math.random() * 6) + 5 : Math.floor(Math.random() * 5) + 1;\n  score = score + points;\n  showMessage(`Score: ${score}`);\n  setTimeout(showNext, 300);\n}\n';
    const HIT_5 = HIT_4.replace('  showMessage(`Score: ${score}`);\n', '  floatLabel(event.index, `+${points}`, critical ? "#FFD700" : "#CCCCCC");\n  showMessage(`Score: ${score}`);\n');
    const HIT_6 = HIT_5.replace('  showMessage(`Score: ${score}`);\n', '  trials.push({ trial: trials.length + 1, target: event.index + 1, hand: event.hand, points: points, hitType: critical ? "critical" : "normal" });\n  console.log(`Trial ${trials.length}: Target ${event.index + 1}, Hand ${event.hand}, Points ${points}`);\n  showMessage(`Score: ${score}`);\n');
    const HIT_8 = HIT_6.replace('  setTimeout(showNext, 300);\n', '  if (trials.length === 22) {\n    showMessage(`Block complete. Score: ${score}`);\n  } else {\n    setTimeout(showNext, 300);\n  }\n');
    const START_3 = '\nshowNext();\n';
    const START = '\ntargets.addEventListener("click", onHit);\nshowNext();\n';

    const code1 = VARS1 + LOOP;
    const code2start = VARS2 + LOOP + CHOOSE_EMPTY;
    const code2 = VARS2 + LOOP + CHOOSE;
    const code3start = code2 + SHOW_EMPTY + START_3;
    const code3 = code2 + SHOW + START_3;
    const code4start = code2 + SHOW + HIT_EMPTY + START;
    const code4 = code2 + SHOW + HIT_4 + START;
    const code5 = code2 + SHOW + HIT_5 + START;
    const code6start = VARS6 + LOOP + CHOOSE + SHOW + HIT_5 + START;
    const code6 = VARS6 + LOOP + CHOOSE + SHOW + HIT_6 + START;
    const code7start = code6.replace('target: event.index + 1,', 'target: event.index,').replace('setTimeout(showNext, 300);', 'setTimeout(showNext(), 300);');
    const code8 = VARS6 + LOOP + CHOOSE + SHOW + HIT_8 + START;

    const n2 = ['score', 'counts', 'lastIndex', 'chooseTarget'];
    const t2 = { score: 'number', counts: 'array', lastIndex: 'number', chooseTarget: 'function' };
    const n3 = n2.concat('showNext');
    const t3 = Object.assign({ showNext: 'function' }, t2);
    const n4 = n3.concat('onHit');
    const t4 = Object.assign({ onHit: 'function' }, t3);
    const n6 = n4.concat('trials');
    const t6 = Object.assign({ trials: 'array' }, t4);

    const errorOf = s => (s.errors.length ? s.errors[0].message : null);
    const visibleTargets = s => s.state.visible.map((v, i) => (v ? i : -1)).filter(i => i >= 0);
    const standard = Array.from({ length: 11 }, (_, i) => -40 + i * 8);

    function arcProblem(s) {
        const a = s.state.angles;
        if (a.length !== 11) return `Your code adds ${a.length} targets. The arc needs 11.`;
        const k = a.findIndex((x, i) => !WSA.near(x, standard[i]));
        return k === -1 ? null : `The target at index ${k} is at ${WSA.fmt(a[k])}°. It should be at ${standard[k]}°.`;
    }

    function chooseRows(ctx) {
        const zeros = '[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]';
        const tries = (counts, last, times) => {
            const r = ctx.variant({ counts, lastIndex: String(last) });
            if (!r.ok) return { error: r.error.message };
            const out = [];
            for (let k = 0; k < times; k++) {
                const c = r.call(r.values.chooseTarget, []);
                if (!c.ok) return { error: c.error.message };
                out.push(c.value);
            }
            return { out };
        };
        const label = text => `<code>chooseTarget()</code> ${text}`;
        const rows = [];
        const all = tries(zeros, -1, 2000);
        if (all.error) return [{ label: label('with every count at 0'), expected: 'every index from 0 to 10', got: esc(all.error), pass: false }];
        const missing = Array.from({ length: 11 }, (_, i) => i).filter(i => !all.out.includes(i));
        const strange = all.out.find(x => !(Number.isInteger(x) && x >= 0 && x <= 10));
        rows.push({ label: label('with every count at 0'), expected: 'every index from 0 to 10', got: strange !== undefined ? `<code>${esc(WSA.literal(strange))}</code>` : missing.length ? `missing ${missing.join(', ')}` : 'every index from 0 to 10', pass: strange === undefined && !missing.length });
        const one = tries('[2, 2, 2, 2, 2, 0, 2, 2, 2, 2, 2]', -1, 50);
        rows.push({ label: label('when only index 5 has a count below 2'), expected: 'always 5', got: one.error ? esc(one.error) : (one.out.every(x => x === 5) ? 'always 5' : `<code>${esc(WSA.literal(one.out.find(x => x !== 5)))}</code>`), pass: !one.error && one.out.every(x => x === 5) });
        const notLast = tries(zeros, 5, 2000);
        rows.push({ label: label('when the last target was index 5'), expected: 'never 5', got: notLast.error ? esc(notLast.error) : (notLast.out.includes(5) ? 'sometimes 5' : 'never 5'), pass: !notLast.error && !notLast.out.includes(5) && notLast.out.every(x => Number.isInteger(x)) });
        const fallback = tries('[2, 2, 2, 2, 2, 1, 2, 2, 2, 2, 2]', 5, 20);
        rows.push({ label: label('when only the last target, index 5, is left'), expected: 'always 5', got: fallback.error ? esc(fallback.error) : (fallback.out.every(x => x === 5) ? 'always 5' : `<code>${esc(WSA.literal(fallback.out.find(x => x !== 5)))}</code>`), pass: !fallback.error && fallback.out.every(x => x === 5) });
        return rows;
    }

    function cycleProblem(ctx) {
        const s = ctx.sim();
        if (!s.ok) return s.error.message;
        if (visibleTargets(s).length && s.state.shown) return 'A target is showing straight away. It should appear 500 milliseconds after the code runs.';
        s.advance(500);
        if (errorOf(s)) return errorOf(s);
        const shown = visibleTargets(s);
        if (!s.state.shown || shown.length !== 1) return 'After 500 milliseconds, exactly one target should be showing.';
        const before = s.read().score;
        s.click(shown[0], 'LEFT');
        if (errorOf(s)) return errorOf(s);
        if (s.state.visible[shown[0]]) return 'The target should disappear as soon as it\'s hit.';
        const gained = s.read().score - before;
        if (!(Number.isInteger(gained) && gained >= 1 && gained <= 10)) return `A hit should score from 1 to 10 points, but this hit scored ${WSA.show(gained)}.`;
        if (s.state.message !== `Score: ${s.read().score}`) return `After a hit, the message should show the score, as <code>Score: ${s.read().score}</code>.`;
        s.advance(799);
        if (visibleTargets(s).length) return 'The next target appears too early. It should appear 300 milliseconds after the hit, plus the 500 millisecond appear delay.';
        s.advance(1);
        if (errorOf(s)) return errorOf(s);
        if (visibleTargets(s).length !== 1) return 'The next target doesn\'t appear 800 milliseconds after the hit: 300 milliseconds of cooldown, then 500 milliseconds of appear delay.';
        return null;
    }

    function hitStats(ctx, times) {
        const s = ctx.sim();
        if (!s.ok) return { error: s.error.message };
        const gains = [];
        for (let k = 0; k < times; k++) {
            const before = s.read().score;
            const r = s.call('onHit', [{ type: 'click', index: k % 11, hand: k % 2 ? 'RIGHT' : 'LEFT' }]);
            if (!r.ok) return { error: r.error.message };
            gains.push(s.read().score - before);
        }
        return { s, gains };
    }

    function labelProblem(ctx) {
        const h = hitStats(ctx, 2000);
        if (h.error) return h.error;
        const labels = h.s.labels;
        if (labels.length !== 2000) return `Each hit should float one label. 2000 hits floated ${labels.length}.`;
        let gold = 0;
        for (let k = 0; k < labels.length; k++) {
            const l = labels[k];
            const pts = h.gains[k];
            if (l.text !== `+${pts}`) return `A hit that scored ${pts} points floated the label <code>${esc(l.text)}</code>. It should be <code>+${pts}</code>.`;
            if (l.index !== k % 11) return 'The label should float up from the target that was hit, at <code>event.index</code>.';
            const c = l.colour.toUpperCase();
            if (c === '#FFD700') {
                gold++;
                if (pts < 5 || pts > 10) return `A gold label showed ${pts} points. Critical hits score from 5 to 10.`;
            } else if (c === '#CCCCCC') {
                if (pts < 1 || pts > 5) return `A grey label showed ${pts} points. Normal hits score from 1 to 5.`;
            } else {
                return `A label was the colour <code>${esc(l.colour)}</code>. It should be <code>"#FFD700"</code> for a critical hit, or <code>"#CCCCCC"</code> for a normal hit.`;
            }
        }
        const share = gold / labels.length;
        if (Math.abs(share - 0.3) > 0.04) return `About ${Math.round(share * 100)}% of the labels were gold. Critical hits should happen about 30% of the time.`;
        return null;
    }

    function trialProblem(ctx) {
        const h = hitStats(ctx, 3);
        if (h.error) return h.error;
        const trials = h.s.read().trials;
        if (!Array.isArray(trials) || trials.length !== 3) return `After 3 hits, <code>trials</code> should hold 3 records, but it holds ${Array.isArray(trials) ? trials.length : 'no list'}.`;
        const events = [[0, 'LEFT'], [1, 'RIGHT'], [2, 'LEFT']];
        for (let k = 0; k < 3; k++) {
            const t = trials[k];
            const [index, hand] = events[k];
            const label = h.s.labels[k];
            const crit = label && label.colour.toUpperCase() === '#FFD700';
            if (!t || typeof t !== 'object') return `Record ${k + 1} isn't an object.`;
            if (t.trial !== k + 1) return `Record ${k + 1} should have <code>trial: ${k + 1}</code>. It has <code>${esc(WSA.show(t.trial))}</code>.`;
            if (t.target !== index + 1) return `The hit on index ${index} should be recorded as <code>target: ${index + 1}</code>. It was recorded as <code>${esc(WSA.show(t.target))}</code>.`;
            if (t.hand !== hand) return `Record ${k + 1} should have <code>hand: "${hand}"</code>, from <code>event.hand</code>.`;
            if (t.points !== h.gains[k]) return `Record ${k + 1} should have the points scored for that hit, ${h.gains[k]}.`;
            if (t.hitType !== (crit ? 'critical' : 'normal')) return `Record ${k + 1} should have <code>hitType: "${crit ? 'critical' : 'normal'}"</code>.`;
        }
        const last = h.s.logs[h.s.logs.length - 1];
        const want = `Trial 3: Target 3, Hand LEFT, Points ${h.gains[2]}`;
        if (last !== want) return `After the third hit, the console should show <code>${esc(want)}</code>, but it shows <code>${esc(WSA.show(last))}</code>.`;
        return null;
    }

    function blockProblem(ctx) {
        const s = ctx.sim();
        if (!s.ok) return s.error.message;
        for (let k = 1; k <= 22; k++) {
            s.advance(800);
            if (errorOf(s)) return errorOf(s);
            const shown = visibleTargets(s);
            if (shown.length !== 1) return `Before hit ${k}, exactly one target should be showing.`;
            s.click(shown[0], 'LEFT');
            if (errorOf(s)) return errorOf(s);
        }
        const v = s.read();
        if (!/^Block complete/.test(s.state.message)) return `After 22 hits, the message should start with <code>Block complete</code>. It's <code>${esc(WSA.show(s.state.message))}</code>.`;
        if (s.state.message !== `Block complete. Score: ${v.score}`) return `After 22 hits, the message should be <code>Block complete. Score: ${v.score}</code>.`;
        s.advance(3000);
        if (visibleTargets(s).length) return 'After the block is complete, no more targets should appear.';
        if (JSON.stringify(v.counts) !== JSON.stringify(Array(11).fill(2))) return `After 22 hits, each target should have appeared twice. The counts are <code>${esc(JSON.stringify(v.counts))}</code>.`;
        return null;
    }

    const check = finder => (v, ctx) => {
        const problem = finder(ctx);
        return problem ? fail(problem.includes('<code>') ? problem : esc(problem)) : null;
    };

    window.LESSONS = window.LESSONS || [];
    window.LESSONS.push({
        id: 'game',
        title: 'Build the game',
        subtitle: 'Joining everything into one working program',
        api: 'game',
        buildsArc: true,
        console: true,
        names: ['score'],
        types: { score: 'number' },
        starterCode: VARS1 + '\n',
        intro: `
            <p>In this lesson you'll build a small version of the WebSpheres task, one piece at a time. There's nothing new to learn. Each step uses something from an earlier lesson, and its hints say which.</p>
            <p>By the end, targets will appear one at a time, you'll hit them by clicking, each hit will score points with the WebSpheres rules, critical hits will float a gold label, and every trial will be recorded. After 22 hits, the block ends.</p>
            <p>The page gives you the same functions as in lesson 9: <code>addTarget</code>, <code>showTarget</code>, <code>hideTarget</code>, <code>showMessage</code>, <code>floatLabel</code>, <code>targets.addEventListener</code> and <code>setTimeout</code>.</p>
            <p>At the start of some steps, the page tidies your code into a standard version, so that every step starts from code that works.</p>`,
        steps: [
            {
                title: 'Build the arc',
                goal: 'Under the first line, use a loop to add the 11 targets, at -40 + i × 8 degrees.',
                explain: `<p>This is lesson 6, step 2.</p>`,
                hints: [
                    'Use a <code>for</code> loop that repeats 11 times.',
                    'Inside the loop, call <code>addTarget(-40 + i * 8);</code>',
                    'Add: <code>for (let i = 0; i &lt; 11; i++) { addTarget(-40 + i * 8); }</code>'
                ],
                answer: code1,
                check(v, ctx) {
                    const s = ctx.sim();
                    if (!s.ok) return fail(esc(s.error.message));
                    const problem = arcProblem(s);
                    return problem ? fail(problem) : pass('The arc of 11 targets is built.');
                }
            },
            {
                title: 'Choose a target',
                names: n2,
                types: t2,
                setCode: code2start,
                goal: 'Complete <code>chooseTarget</code>, so that it returns a random index from the targets shown fewer than 2 times, but not the last target shown. If no other target is left, it can choose the last target again.',
                explain: `<p>This uses lessons 6, 7 and 8. <code>counts</code> holds how many times each target has been shown, and <code>lastIndex</code> holds the index of the last target shown.</p><p>The return line is already there. It picks a random item from <code>available</code>, as WebSpheres does. You need to fill <code>available</code>:</p><ol><li>Loop through <code>counts</code>, and push each index with a count below 2 that isn't <code>lastIndex</code>.</li><li>If <code>available</code> is still empty after the loop, loop again without the <code>lastIndex</code> rule.</li></ol>`,
                tests: chooseRows,
                hints: [
                    'The first loop is like lesson 8, step 4, with an extra condition: <code>if (counts[i] &lt; 2 &amp;&amp; i !== lastIndex)</code>.',
                    'After the first loop, add <code>if (available.length === 0) {</code> with a second loop inside it that checks only <code>counts[i] &lt; 2</code>.',
                    'Put this between <code>let available = [];</code> and the return line:<pre class="snippet">for (let i = 0; i &lt; counts.length; i++) {\n  if (counts[i] &lt; 2 &amp;&amp; i !== lastIndex) {\n    available.push(i);\n  }\n}\nif (available.length === 0) {\n  for (let i = 0; i &lt; counts.length; i++) {\n    if (counts[i] &lt; 2) {\n      available.push(i);\n    }\n  }\n}</pre>'
                ],
                answer: code2,
                success: 'All the tests pass. The page tried your function with four different sets of counts. This is how <code>selectRandomSphere</code> in <code>sphere-manager.js</code> chooses targets, including the second loop.'
            },
            {
                title: 'Show a target',
                names: n3,
                types: t3,
                setCode: code3start,
                goal: 'Fill in <code>showNext</code>, so that it chooses a target, stores its index in <code>lastIndex</code>, and 500 milliseconds later adds 1 to its count and shows it.',
                explain: `<p>This uses lessons 5, 8 and 9. Inside <code>showNext</code>:</p><ol><li>Call <code>chooseTarget()</code> and keep the result in a variable, such as <code>index</code>.</li><li>Put it in <code>lastIndex</code>.</li><li>Use <code>setTimeout</code> with a function without a name, as in lesson 9 step 3. Inside that function, add 1 to <code>counts[index]</code> and call <code>showTarget(index)</code>.</li></ol><p>WebSpheres also counts a target when it appears, not when it's chosen.</p>`,
                hints: [
                    'Start with <code>let index = chooseTarget();</code> and <code>lastIndex = index;</code>',
                    'Then: <code>setTimeout(function () { ... }, 500);</code> with the counting and showing inside the curly brackets.',
                    'Inside the timer: <code>counts[index] = counts[index] + 1;</code> and <code>showTarget(index);</code>'
                ],
                answer: code3,
                check(v, ctx) {
                    const s = ctx.sim();
                    if (!s.ok) return fail(esc(s.error.message));
                    if (s.state.shown && visibleTargets(s).length) return fail('A target shows straight away. It should appear after 500 milliseconds.');
                    s.advance(499);
                    if (s.state.shown && visibleTargets(s).length) return fail('A target shows too early. The delay should be 500 milliseconds.');
                    s.advance(1);
                    if (errorOf(s)) return fail(esc(errorOf(s)));
                    const shown = visibleTargets(s);
                    if (!s.state.shown || shown.length !== 1) return fail('After 500 milliseconds, exactly one target should be showing.');
                    const val = s.read();
                    if (val.lastIndex !== shown[0]) return fail('<code>lastIndex</code> should hold the index of the target that was chosen.');
                    if (val.counts[shown[0]] !== 1 || val.counts.reduce((a, b) => a + b, 0) !== 1) return fail('The count for the target that appeared should go up by 1, and no other count should change.');
                    return pass('A target appears after 500 milliseconds, and its count goes up.');
                }
            },
            {
                title: 'Score a hit',
                names: n4,
                types: t4,
                setCode: code4start,
                goal: 'Fill in <code>onHit</code>. Hide the target, decide whether the hit is critical with a 0.3 chance, roll the points, add them to <code>score</code>, show the score, and call <code>showNext</code> 300 milliseconds later.',
                explain: `<p>This uses lessons 4, 7 and 9:</p><ol><li><code>hideTarget(event.index);</code></li><li><code>let critical = Math.random() &lt; 0.3;</code></li><li>Roll the points: 5 to 10 for a critical hit, 1 to 5 for a normal hit. You can use an <code>if</code> and <code>else</code>, or <code>? :</code>.</li><li>Add the points to <code>score</code>, and show <code>Score: ...</code> with <code>showMessage</code>.</li><li><code>setTimeout(showNext, 300);</code> for the cooldown.</li></ol><p>You can now play in the preview. After 22 hits, every target has appeared twice, so <code>chooseTarget</code> finds nothing and the page reports an error. Step 8 ends the block properly.</p>`,
                hints: [
                    'For the points, one way is <code>let points = critical ? Math.floor(Math.random() * 6) + 5 : Math.floor(Math.random() * 5) + 1;</code>',
                    'Then <code>score = score + points;</code>, <code>showMessage(`Score: ${score}`);</code> and <code>setTimeout(showNext, 300);</code>',
                    'Put these six lines inside <code>onHit</code>:<pre class="snippet">hideTarget(event.index);\nlet critical = Math.random() &lt; 0.3;\nlet points = critical ? Math.floor(Math.random() * 6) + 5 : Math.floor(Math.random() * 5) + 1;\nscore = score + points;\nshowMessage(`Score: ${score}`);\nsetTimeout(showNext, 300);</pre>'
                ],
                answer: code4,
                check(v, ctx) {
                    const problem = cycleProblem(ctx);
                    if (problem) return fail(problem.includes('<code>') ? problem : esc(problem));
                    const h = hitStats(ctx, 3000);
                    if (h.error) return fail(esc(h.error));
                    if (!h.gains.every(g => Number.isInteger(g) && g >= 1 && g <= 10)) return fail('Every hit should score a whole number of points from 1 to 10.');
                    const mean = h.gains.reduce((a, b) => a + b, 0) / h.gains.length;
                    if (Math.abs(mean - 4.35) > 0.3) return fail(`Over 3000 hits, the average score per hit was ${mean.toFixed(2)}. With a 0.3 critical-hit chance it should be about 4.35. Check the chance and the two point ranges.`);
                    return pass('Hits score points with the WebSpheres rules, and the next target follows the cooldown. The page played one trial, then scored 3000 hits.');
                }
            },
            {
                title: 'Float the label',
                goal: 'In <code>onHit</code>, after rolling the points, float a label from the target that was hit: <code>+</code> and the points, gold for a critical hit and grey for a normal hit.',
                explain: `<p>This uses lessons 3 and 4. <code>floatLabel(index, text, colour)</code> takes three values: the index of the target, the text, and the colour. Gold is <code>"#FFD700"</code> and grey is <code>"#CCCCCC"</code>.</p>`,
                hints: [
                    'Use <code>event.index</code> for the index, and a template literal for the text: <code>`+${points}`</code>.',
                    'For the colour, use <code>critical ? "#FFD700" : "#CCCCCC"</code>.',
                    'Add <code>floatLabel(event.index, `+${points}`, critical ? "#FFD700" : "#CCCCCC");</code> after the points line.'
                ],
                answer: code5,
                check: (v, ctx) => check(labelProblem)(v, ctx) || pass('Each hit floats a label with its points, gold for critical hits and grey for normal hits. The page checked 2000 hits.')
            },
            {
                title: 'Record each trial',
                names: n6,
                types: t6,
                setCode: code6start,
                goal: 'In <code>onHit</code>, push a record of each trial into <code>trials</code>, and log a line such as <code>Trial 3: Target 5, Hand LEFT, Points 7</code>.',
                explain: `<p>This uses lessons 3 and 8. A new list, <code>trials</code>, has been added at the top. Each record should be an object with these fields:</p><ul class="parts"><li><code>trial</code>: the trial number, starting at 1. After the push, it's <code>trials.length</code>.</li><li><code>target</code>: the target number, one more than <code>event.index</code>.</li><li><code>hand</code>: <code>event.hand</code>.</li><li><code>points</code> and <code>hitType</code>, which is <code>"critical"</code> or <code>"normal"</code>.</li></ul><p>Then log the line with <code>console.log</code>, before the <code>showMessage</code> line. Clicking with the right mouse button records the right hand.</p>`,
                hints: [
                    'Use <code>trials.push({ trial: trials.length + 1, target: event.index + 1, hand: event.hand, points: points, hitType: critical ? "critical" : "normal" });</code>',
                    'Then <code>console.log(`Trial ${trials.length}: Target ${event.index + 1}, Hand ${event.hand}, Points ${points}`);</code>',
                    'Put these two lines after the <code>floatLabel</code> line:<pre class="snippet">trials.push({ trial: trials.length + 1, target: event.index + 1, hand: event.hand, points: points, hitType: critical ? "critical" : "normal" });\nconsole.log(`Trial ${trials.length}: Target ${event.index + 1}, Hand ${event.hand}, Points ${points}`);</pre>'
                ],
                answer: code6,
                check: (v, ctx) => check(trialProblem)(v, ctx) || check(cycleProblem)(v, ctx) || pass('Every hit is recorded and logged. The page made 3 hits with different targets and hands.')
            },
            {
                type: 'bug',
                title: 'Fix the bugs',
                setCode: code7start,
                goal: 'Someone changed two things in your game. Fix both, so that the game plays and records trials correctly again.',
                explain: `<p>One mistake stops the game when a target is hit. The other records the wrong target number. Play a trial in the preview and watch the message under your code and the console.</p>`,
                hints: [
                    'Look at the <code>setTimeout</code> line in <code>onHit</code>. Lesson 9, step 6 had the same mistake.',
                    'Look at the <code>target</code> field of the record. Target numbers start at 1.',
                    'Use <code>setTimeout(showNext, 300);</code> and <code>target: event.index + 1</code>.'
                ],
                answer: code6,
                check: (v, ctx) => check(cycleProblem)(v, ctx) || check(trialProblem)(v, ctx) || pass('Both bugs are fixed. The game plays and records the right target numbers again.')
            },
            {
                title: 'End the block',
                goal: 'At the end of <code>onHit</code>, after 22 trials, show <code>Block complete. Score: ...</code> instead of calling <code>showNext</code>.',
                explain: `<p>This uses lesson 4. Replace the last line of <code>onHit</code> with an <code>if</code> and <code>else</code>: if <code>trials.length</code> is 22, show the block-complete message. Otherwise, call <code>showNext</code> after the cooldown, as before.</p><p>Your block of 22 trials shows each target twice. WebSpheres block mode works in sets of this size: after every 22 trials, each target has appeared twice and the headset shows confetti. A block mode session has 5 of these sets, 110 trials in all. Play a whole block in the preview to try it.</p>`,
                hints: [
                    'Start with <code>if (trials.length === 22) {</code>',
                    'Inside: <code>showMessage(`Block complete. Score: ${score}`);</code> Then <code>} else {</code> with the <code>setTimeout</code> line inside it.',
                    'The end of onHit should be <code>if (trials.length === 22) { showMessage(`Block complete. Score: ${score}`); } else { setTimeout(showNext, 300); }</code>'
                ],
                answer: code8,
                check: (v, ctx) => check(blockProblem)(v, ctx) || pass('The page played a whole block of 22 hits. Every target appeared twice, and the block ended with the final score. Your game is complete.')
            },
            {
                type: 'order',
                title: 'The real trial',
                goal: 'Put the real WebSpheres functions in the order a trial uses them.',
                explain: `<p>Each part of your game has a function in WebSpheres that does the same job:</p><ul class="parts"><li><code>calculateHitPoints</code> decides the hit type and points, like the first lines of your <code>onHit</code>.</li><li><code>createFloatingNumber</code> floats the points label, like <code>floatLabel</code>.</li><li><code>isInsideSphere</code> checks whether the hand is in the target. Your click does this job.</li><li><code>recordTrial</code> saves the trial, like your <code>trials.push</code>.</li><li><code>selectRandomSphere</code> chooses the next target, like <code>chooseTarget</code>.</li><li><code>startAppearTimer</code> shows the target after 500 milliseconds, like your <code>showNext</code>.</li><li><code>startDisappearTimer</code> starts the 300 millisecond cooldown after the hit.</li></ul>`,
                lines: ['selectRandomSphere();', 'startAppearTimer();', 'isInsideSphere();', 'calculateHitPoints();', 'createFloatingNumber();', 'recordTrial();', 'startDisappearTimer();'],
                names: [],
                exact: true,
                start: [3, 0, 5, 1, 6, 2, 4],
                answer: [0, 1, 2, 3, 4, 5, 6],
                success: 'Correct. This is the order of one WebSpheres trial. In <code>sphere-manager.js</code>, the first three run in <code>tick</code>, which runs on every frame, and the last four run in <code>handleHit</code>, which <code>tick</code> calls when a hand reaches the target.',
                hints: [
                    'A trial starts by choosing a target, and ends with the cooldown.',
                    'After the target appears, the hand has to reach it before anything is scored.',
                    'The order is: select, appear, inside, points, floating number, record, disappear.'
                ]
            }
        ],
        learned: [
            'A program is built from small pieces, each with one job, usually in its own function.',
            'Variables at the top, such as <code>score</code> and <code>counts</code>, hold the state of the program between events.',
            'Events and timers decide when each piece runs.',
            'Testing each piece as you build it makes problems easier to find.',
            'Your game follows the same steps as a WebSpheres trial, with the same rules.'
        ],
        real: {
            file: 'sphere-manager.js',
            where: 'selected lines from handleHit, lines 999 to 1055',
            code: `handleHit: function (handUsed, spherePos) {

const result = scoreManager.calculateHitPoints(handUsed);
scoreManager.addPoints(result.points, result.hitType, handUsed);

this.activeSphere.setAttribute('visible', false);

this.createFloatingNumber(spherePos, result.points, result.hitType);

dataManager.recordTrial(
    sphereIndex,
    handUsed,
    result.points,
    result.hitType,
    dataManager.currentDecisionTime
);

this.startDisappearTimer();`,
            note: `<p>These are the main lines of <code>handleHit</code>, the function that runs when a hand reaches a target. Other lines between them find the score and data parts of WebSpheres, add visual effects, and catch errors. Your <code>onHit</code> does the same jobs in almost the same order. The difference is at the start: WebSpheres scores the hit and then hides the target, and your <code>onHit</code> hides the target first. After that, both float the label, record the trial, and start the cooldown.</p><p>Lesson 11 shows the same game as a set of real files, laid out like WebSpheres.</p>`
        }
    });
})();
