(function (root) {
    const WSA = root.WSA = root.WSA || {};

    WSA.pass = message => ({ pass: true, message });
    WSA.fail = message => ({ pass: false, message });
    WSA.nudge = message => ({ pass: false, near: true, message });

    function parseAnswer(raw) {
        const s = raw.trim().replace(/;$/, '').trim().replace(/^[A-Za-z_$][\w$]*\s*=\s*/, '');
        if (/^(["']).*\1$/.test(s)) return s.slice(1, -1);
        if (s !== '' && !isNaN(Number(s))) return Number(s);
        return s;
    }

    function sameValue(a, b) {
        if (typeof b === 'number') return typeof a === 'number' && Math.abs(a - b) < 1e-9;
        return String(a).toLowerCase() === String(b).toLowerCase();
    }

    function trace(step, raw) {
        raw = (raw || '').trim();
        if (!raw) return { pass: false, free: true, message: 'Type your answer in the box first.' };
        if (/^\d+,\d+$/.test(raw)) return { pass: false, free: true, message: 'Use a dot for decimals, such as 0.2, not a comma.' };
        const v = parseAnswer(raw);
        if (step.accept ? step.accept(raw, v) : sameValue(v, step.answer)) return { pass: true, message: step.success };
        const known = (step.wrong || []).find(w => (w.test ? w.test(v, raw) : sameValue(v, w.value)));
        if (known) return { pass: false, near: !!known.near, free: !!known.free, message: known.message };
        return { pass: false, message: 'That isn\'t right. Go through the lines one at a time, and write down what\'s in the box after each one.' };
    }

    function quiz(step, picked) {
        picked = picked || [];
        if (!picked.length) return { pass: false, free: true, message: 'Choose an answer first.' };
        if (!step.multi) {
            const o = step.options[picked[0]];
            return o.correct ? { pass: true, message: step.success || o.why } : { pass: false, message: o.why || 'That isn\'t the right answer.' };
        }
        const right = step.options.map((o, k) => (o.correct ? k : -1)).filter(k => k >= 0);
        const wrongPicks = picked.filter(k => !right.includes(k)).length;
        const missed = right.filter(k => !picked.includes(k)).length;
        if (!wrongPicks && !missed) return { pass: true, message: step.success };
        const parts = [];
        if (wrongPicks) parts.push(wrongPicks === 1 ? 'One of your choices doesn\'t work.' : `${wrongPicks} of your choices don't work.`);
        if (missed) parts.push(missed === 1 ? 'One answer that works isn\'t chosen yet.' : `${missed} answers that work aren't chosen yet.`);
        return { pass: false, message: parts.join(' ') };
    }

    function order(step, current) {
        current = current || step.start;
        if (current.join() === step.start.join()) return { pass: false, free: true, message: 'Move the lines first.' };
        const texts = current.map(i => step.lines[i]);
        if (step.exact) {
            const want = step.answer.map(i => step.lines[i]);
            if (texts.join('\n') === want.join('\n')) return { pass: true, message: step.success };
            const placed = texts.filter((t, k) => t === want[k]).length;
            return { pass: false, message: `That isn't the right order yet. ${placed} of the ${texts.length} lines are in the right place.` };
        }
        const shown = step.prelude ? step.prelude.split('\n').length : 0;
        const cases = step.cases || [{}];
        for (const c of cases) {
            const pre = c.prelude !== undefined ? c.prelude : (step.prelude || '');
            const extra = pre ? pre.split('\n').length : 0;
            const code = (pre ? pre + '\n' : '') + texts.join('\n');
            const r = WSA.runner.run(code, step.names);
            if (!r.ok) {
                const line = r.error.line && r.error.line > extra ? r.error.line - extra + shown : null;
                return { pass: false, message: (line ? `<b>Line ${line}.</b> ` : '') + WSA.esc(r.error.message) };
            }
            if (c.expect) {
                const wrong = Object.keys(c.expect).find(k => !sameExact(r.values[k], c.expect[k]));
                if (wrong) return { pass: false, message: c.fail || `The code runs, but it doesn't give the right result yet. <code>${wrong}</code> ends up as <code>${WSA.esc(WSA.show(r.values[wrong]))}</code>.` };
            }
            if (c.log !== undefined && r.logs[r.logs.length - 1] !== c.log) {
                return { pass: false, message: c.fail || `The code runs, but the console doesn't show <code>${WSA.esc(c.log)}</code> yet.` };
            }
        }
        return { pass: true, message: step.success };
    }

    function sameExact(a, b) {
        if (typeof b === 'number') return typeof a === 'number' && Math.abs(a - b) < 1e-9;
        return JSON.stringify(a) === JSON.stringify(b);
    }

    function find(step, line) {
        if (line === undefined) return { pass: false, free: true, message: 'Click a line of code first.' };
        if (step.answer.includes(line)) return { pass: true, message: step.success };
        return { pass: false, message: (step.wrong && step.wrong[line]) || 'That isn\'t the line. Read it again: what does it change?' };
    }

    function literal(v) {
        return typeof v === 'string' ? JSON.stringify(v) : WSA.show(v);
    }

    WSA.literal = literal;

    WSA.testCases = function (ctx, name, cases) {
        return cases.map(([args, want]) => {
            const label = `<code>${WSA.esc(name)}(${args.map(a => WSA.esc(literal(a))).join(', ')})</code>`;
            const expected = `<code>${WSA.esc(literal(want))}</code>`;
            const r = ctx.call(name, args);
            if (!r.ok) return { label, expected, got: WSA.esc(r.error.message), pass: false };
            const pass = typeof want === 'number' ? WSA.near(r.value, want) : r.value === want;
            return { label, expected, got: `<code>${WSA.esc(literal(r.value))}</code>`, pass };
        });
    };

    function stars(hints, misses, guessable) {
        return Math.max(0, 3 - hints - (guessable ? misses || 0 : 0));
    }

    WSA.marking = { parseAnswer, sameValue, trace, quiz, order, find, stars };
    if (typeof module !== 'undefined') module.exports = WSA;
})(typeof window !== 'undefined' ? window : globalThis);
