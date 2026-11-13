(function (root) {
    const WSA = root.WSA = root.WSA || {};
    const LOOP_LIMIT = 1000000;
    const TIME_LIMIT = 2000;
    const LOG_LIMIT = 500;

    function esc(value) {
        return String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    }

    function fmt(n) {
        return typeof n === 'number' && Number.isFinite(n) ? String(Number(n.toPrecision(12))) : String(n);
    }

    function near(a, b, tol) {
        return typeof a === 'number' && Math.abs(a - b) < (tol || 1e-9);
    }

    function compiles(src) {
        try {
            new Function(src);
            return true;
        } catch (e) {
            return false;
        }
    }

    function syntaxLine(code) {
        const lines = code.split('\n');
        let line = 1;
        for (let i = 1; i <= lines.length; i++) {
            if (compiles(lines.slice(0, i).join('\n'))) line = i + 1;
        }
        return Math.min(line, lines.length);
    }

    function runtimeLine(err) {
        const m = String((err && err.stack) || '').match(/<anonymous>:(\d+):\d+/);
        return m ? Number(m[1]) - 2 : null;
    }

    function declared(code) {
        return Array.from(code.matchAll(/\b(?:let|const|var|function)\s+([A-Za-z_$][\w$]*)/g), m => m[1]);
    }

    function rhs(code, name) {
        const re = new RegExp('(?:^|[;\\n{])\\s*(?:let\\s+|const\\s+|var\\s+)?' + name + '\\s*=(?![=>])([^;\\n]*)', 'g');
        let found = null;
        for (const m of code.matchAll(re)) found = m[1].trim();
        return found;
    }

    function replaceDecl(code, name, source) {
        const re = new RegExp('(\\b(?:let|const|var)\\s+' + name + '\\s*=\\s*)([^;\\n]*)');
        return re.test(code) ? code.replace(re, (m, head) => head + source) : null;
    }

    function lineWith(code, pattern) {
        const lines = code.split('\n');
        const i = lines.findIndex(l => pattern.test(l));
        return i === -1 ? null : i + 1;
    }

    function skipQuoted(code, i) {
        const q = code[i];
        i++;
        while (i < code.length && code[i] !== q) {
            if (code[i] === '\\') i++;
            else if (q === '`' && code[i] === '$' && code[i + 1] === '{') {
                let depth = 1;
                i += 2;
                while (i < code.length && depth) {
                    if (code[i] === '{') depth++;
                    else if (code[i] === '}') depth--;
                    else if (code[i] === '"' || code[i] === '\'' || code[i] === '`') i = skipQuoted(code, i) - 1;
                    i++;
                }
                continue;
            }
            i++;
        }
        return i + 1;
    }

    function matchParen(code, open) {
        let depth = 0;
        for (let i = open; i < code.length; i++) {
            const ch = code[i];
            if (ch === '"' || ch === '\'' || ch === '`') {
                i = skipQuoted(code, i) - 1;
            } else if (ch === '(') {
                depth++;
            } else if (ch === ')') {
                depth--;
                if (!depth) return i;
            }
        }
        return -1;
    }

    function splitTop(text) {
        const parts = [];
        let depth = 0;
        let start = 0;
        for (let i = 0; i < text.length; i++) {
            const ch = text[i];
            if (ch === '"' || ch === '\'' || ch === '`') i = skipQuoted(text, i) - 1;
            else if ('([{'.includes(ch)) depth++;
            else if (')]}'.includes(ch)) depth--;
            else if (ch === ';' && !depth) {
                parts.push(text.slice(start, i));
                start = i + 1;
            }
        }
        parts.push(text.slice(start));
        return parts;
    }

    function regexStart(code, i) {
        if (code[i] !== '/' || code[i + 1] === '/' || code[i + 1] === '*') return false;
        let k = i - 1;
        while (k >= 0 && /\s/.test(code[k])) k--;
        if (k < 0) return true;
        if ('(,=:[!&|?{};+-*%<>~^'.includes(code[k])) return true;
        const word = /([A-Za-z_$][\w$]*)$/.exec(code.slice(0, k + 1));
        return !!word && ['return', 'typeof', 'case', 'in', 'of', 'new', 'delete', 'void', 'throw', 'else', 'do'].includes(word[1]);
    }

    function skipRegex(code, i) {
        let inClass = false;
        for (let k = i + 1; k < code.length; k++) {
            const ch = code[k];
            if (ch === '\n') return i + 1;
            if (ch === '\\') k++;
            else if (ch === '[') inClass = true;
            else if (ch === ']') inClass = false;
            else if (ch === '/' && !inClass) {
                k++;
                while (/[a-z]/i.test(code[k] || '')) k++;
                return k;
            }
        }
        return i + 1;
    }

    function blank(code) {
        let out = '';
        let i = 0;
        const wipe = text => text.replace(/[^\n]/g, ' ');
        while (i < code.length) {
            const ch = code[i];
            let end = -1;
            if (ch === '"' || ch === '\'') {
                const nl = code.indexOf('\n', i);
                end = Math.min(skipQuoted(code, i), nl === -1 ? code.length : nl);
            } else if (ch === '`') {
                end = Math.min(skipQuoted(code, i), code.length);
            } else if (ch === '/' && code[i + 1] === '/') {
                const nl = code.indexOf('\n', i);
                end = nl === -1 ? code.length : nl;
            } else if (ch === '/' && code[i + 1] === '*') {
                const close = code.indexOf('*/', i + 2);
                end = close === -1 ? code.length : close + 2;
            } else if (regexStart(code, i)) {
                end = skipRegex(code, i);
            }
            if (end > i) {
                out += wipe(code.slice(i, end));
                i = end;
            } else {
                out += ch;
                i++;
            }
        }
        return out;
    }

    function topLevelReturn(code) {
        const bare = blank(code);
        let depth = 0;
        let line = 1;
        for (let i = 0; i < bare.length; i++) {
            const ch = bare[i];
            if (ch === '\n') line++;
            else if (ch === '{') depth++;
            else if (ch === '}') depth--;
            else if (!depth && /^return\b/.test(bare.slice(i, i + 7)) && !/[\w$.]/.test(bare[i - 1] || '')) return line;
        }
        return null;
    }

    function guardLoops(code) {
        let out = '';
        let i = 0;
        while (i < code.length) {
            const ch = code[i];
            if (ch === '"' || ch === '\'' || ch === '`') {
                const end = skipQuoted(code, i);
                out += code.slice(i, end);
                i = end;
                continue;
            }
            if (regexStart(code, i)) {
                const end = skipRegex(code, i);
                out += code.slice(i, end);
                i = end;
                continue;
            }
            if (ch === '/' && code[i + 1] === '/') {
                const end = code.indexOf('\n', i);
                const stop = end === -1 ? code.length : end;
                out += code.slice(i, stop);
                i = stop;
                continue;
            }
            if (ch === '/' && code[i + 1] === '*') {
                const end = code.indexOf('*/', i + 2);
                const stop = end === -1 ? code.length : end + 2;
                out += code.slice(i, stop);
                i = stop;
                continue;
            }
            const word = /^(for|while)\b/.exec(code.slice(i));
            if (word && !/[\w$.]/.test(code[i - 1] || '')) {
                let j = i + word[1].length;
                while (/\s/.test(code[j] || '')) j++;
                if (code[j] === '(') {
                    const close = matchParen(code, j);
                    if (close !== -1) {
                        const head = code.slice(j + 1, close);
                        let guarded = null;
                        if (word[1] === 'while') {
                            guarded = `__guard() && (${head})`;
                        } else {
                            const parts = splitTop(head);
                            if (parts.length === 3) {
                                const cond = parts[1].trim();
                                parts[1] = cond ? ` __guard() && (${cond})` : ' __guard()';
                                guarded = parts.join(';');
                            }
                        }
                        if (guarded !== null) {
                            out += code.slice(i, j) + '(' + guarded + ')';
                            i = close + 1;
                            continue;
                        }
                    }
                }
            }
            out += ch;
            i++;
        }
        return out;
    }

    function makeGuard() {
        let count = 0;
        let started = Date.now();
        const guard = () => {
            count++;
            if (count > LOOP_LIMIT || (count % 1000 === 0 && Date.now() - started > TIME_LIMIT)) {
                const e = new Error('LOOP_LIMIT');
                e.loopLimit = true;
                throw e;
            }
            return true;
        };
        guard.reset = () => {
            count = 0;
            started = Date.now();
        };
        return guard;
    }

    function explain(err, code, names, line) {
        const msg = String((err && err.message) || err);
        const lines = code.split('\n');
        const text = line ? lines[line - 1] || '' : '';
        const out = (message, at) => ({ line: at === undefined ? line : at, message, raw: msg });
        let m;

        if (err && err.friendly) return out(err.friendly);
        if (err && err.loopLimit) {
            return out('This loop kept repeating, so the page stopped it. A loop stops when its condition becomes false. Check that the counter changes in the right direction, for example i++ when the condition is i < 11.');
        }
        if (/Maximum call stack/i.test(msg) || /too much recursion/i.test(msg)) {
            return out('A function kept calling itself and never stopped, so the computer gave up.');
        }
        if (/[“”‘’]/.test(code)) {
            return out('These are curly quotes (“ ” or ‘ ’), which usually come from copying text out of Word or a web page. Code needs straight quotes: " or \'.', lineWith(code, /[“”‘’]/));
        }
        if (/Unterminated template|unterminated template/i.test(msg)) {
            return out('A backtick (`) opens on this line but never closes. Text in backticks needs a backtick at both ends.');
        }
        if (/Invalid or unexpected token|unterminated string|string literal contains an unescaped line break/i.test(msg)) {
            const plain = text.replace(/\/\/.*$/, '');
            const odd = q => (plain.split(q).length - 1) % 2 === 1;
            if (odd('`')) return out('A backtick (`) opens on this line but never closes. Text in backticks needs a backtick at both ends.');
            if (odd('"') || odd('\'')) return out('This line opens a quote but never closes it. Text needs a quote at both ends, like "gold".');
        }
        if (err && err.name === 'SyntaxError') {
            const bare = blank(code);
            const count = ch => bare.split(ch).length - 1;
            if (count('{') > count('}')) return out('A curly bracket { opens but never closes. Every { needs a matching } after the code it contains.');
            if (count('}') > count('{')) return out('There\'s a closing curly bracket } that doesn\'t match an opening one. Check that every { has exactly one matching }.', bare.split('\n').map((l, i) => (l.includes('}') ? i + 1 : 0)).filter(Boolean).pop());
            if (count('(') > count(')')) return out('A round bracket ( opens but never closes. Every ( needs a matching ).');
            if (count(')') > count('(')) return out('There\'s a closing round bracket ) that doesn\'t match an opening one.');
        }
        if (err && err.name === 'SyntaxError' && text.includes('${') && !text.includes('`')) {
            return out('${...} only works inside backticks (`). Put the whole piece of text inside backticks, as in `+${points}`.');
        }
        if (/\d,\d/.test(text) && /Unexpected number|unexpected token/i.test(msg)) {
            return out('Decimals use a dot, not a comma. Write 0.12, not 0,12.');
        }
        if (/Invalid or unexpected token/i.test(msg)) {
            return out('There\'s a character on this line the computer doesn\'t recognise. Check for stray symbols.');
        }
        if (/Unexpected end of input|missing \} |end of script/i.test(msg) && (code.split('`').length - 1) % 2 === 1) {
            const at = lines.map((l, i) => (l.includes('`') ? i + 1 : 0)).filter(Boolean).pop();
            return out('A backtick (`) opens on this line but never closes. Text in backticks needs a backtick at both ends.', at);
        }
        if (/Unexpected end of input|missing \} |end of script/i.test(msg)) {
            const opens = (code.match(/\{/g) || []).length - (code.match(/\}/g) || []).length;
            if (opens > 0) return out('A curly bracket { opens but never closes. Every { needs a matching } after the code it contains.');
            const parens = (code.match(/\(/g) || []).length - (code.match(/\)/g) || []).length;
            if (parens > 0) return out('A round bracket ( opens but never closes. Every ( needs a matching ).');
            return out('The code stops before something is finished. Look for a quote or bracket that was opened but never closed.');
        }
        if (/Unexpected token '}'|unexpected token: '}'/i.test(msg)) {
            return out('There\'s a closing curly bracket } that doesn\'t match an opening one. Check that every { has exactly one matching }.');
        }
        if ((m = msg.match(/Identifier '(.+?)' has already been declared|redeclaration of (?:let|const|var) (\S+)/))) {
            const name = m[1] || m[2];
            const decl = new RegExp('\\b(?:let|const|var)\\s+' + name + '\\b');
            const found = lines.map((l, i) => (decl.test(l) ? i + 1 : 0)).filter(Boolean);
            return out(`${name} is made twice with let. A variable is only made once. To change its value later, leave out let: ${name} = ...`, found[1] || line);
        }
        if ((m = msg.match(/Cannot access '(.+?)' before initialization|can't access lexical declaration '?(\w+)'? before initialization/))) {
            const name = m[1] || m[2];
            return out(`${name} is used before the line that makes it. The computer reads code from top to bottom, so the line with let ${name} has to come first.`);
        }
        if ((m = msg.match(/^(\S+) is not defined/))) {
            const name = m[1];
            const known = names.concat(declared(code));
            const twin = known.find(k => k !== name && k.toLowerCase() === name.toLowerCase());
            if (twin) return out(`Capital letters matter. There's no variable or function called ${name}, but there is one called ${twin}.`);
            if (new RegExp('^\\s*' + name + '\\s*=').test(text)) return out(`${name} is given a value, but it was never made. Put let in front of it the first time: let ${name} = ...`);
            if (names.includes(name)) return out(`There's no variable called ${name} any more. Did the line that makes ${name} get deleted?`);
            if (new RegExp('=\\s*' + name + '\\b').test(text)) return out(`The computer read ${name} as the name of a variable, because it has no quotes around it. If you meant the word ${name} as text, put it in quotes: "${name}".`);
            return out(`There's no variable or function called ${name}. Check the spelling, including capital letters.`);
        }
        if (/Assignment to constant/i.test(msg)) {
            return out('This variable was made with const, which means its value can\'t change. Use let if it needs to change.');
        }
        if ((m = msg.match(/Cannot (?:read|set) properties of (undefined|null) \((?:reading|setting) '(.+?)'\)|(\S+) is (undefined|null)$/))) {
            const prop = m[2] ? `.${m[2]}` : 'a property';
            return out(`The code tried to use ${prop} on something that is ${m[1] || m[4]}, which means it has no value. Check that the value before ${prop} exists and is spelled correctly.`);
        }
        if ((m = msg.match(/^(.+?) is not a function/))) {
            const name = m[1].replace(/^.*\./, '');
            return out(`${name} isn't a function, so it can't be run with brackets (). Check the spelling, or whether ${name} holds a value instead of a function.`);
        }
        if (/Unexpected number/i.test(msg)) {
            return out('There\'s a number where the computer didn\'t expect one. Variable names can\'t start with a number or contain spaces.');
        }
        if (/Unexpected string/i.test(msg)) {
            return out('There\'s text in quotes where the computer didn\'t expect it. Is the = missing between the name and the value, or a comma between two items?');
        }
        if (/Unexpected identifier|unexpected token: identifier/i.test(msg)) {
            return out('There\'s a word where the computer didn\'t expect one. Variable names can\'t contain spaces, and there needs to be an = between the name and the value.');
        }
        if (/Unexpected token '='|unexpected token: '='/i.test(msg)) {
            return out('There\'s an = where the computer didn\'t expect one. A line that makes a variable looks like this: let name = value;');
        }
        if (/Unexpected token|unexpected token/i.test(msg)) {
            return out('Something on this line doesn\'t follow JavaScript\'s rules. Compare it with the lines that work.');
        }
        return out('The computer reported: ' + msg);
    }

    function show(value) {
        if (value === undefined) return 'undefined';
        if (typeof value === 'string') return value;
        if (typeof value === 'number' || typeof value === 'boolean') return String(value);
        if (typeof value === 'function') return `function ${value.name || ''}`.trim();
        try {
            const special = (k, v) => (typeof v === 'number' && !Number.isFinite(v)) || (v === undefined && k !== '') ? `@@WSA:${v}@@` : v;
            return JSON.stringify(value, special).replace(/"@@WSA:(NaN|-?Infinity|undefined)@@"/g, '$1');
        } catch (e) {
            return String(value);
        }
    }

    function friendlyError(message) {
        const e = new Error(message);
        e.friendly = message;
        return e;
    }

    function run(code, names, env) {
        env = env || {};
        const logs = [];
        const consoleStub = {
            log: (...args) => {
                if (logs.length < LOG_LIMIT) logs.push(args.map(show).join(' '));
                else if (logs.length === LOG_LIMIT) logs.push(`The console stopped showing messages after ${LOG_LIMIT} lines. If they came from a loop, check how many times it repeats.`);
            }
        };
        consoleStub.info = consoleStub.log;
        const params = Object.assign({ console: consoleStub }, env);
        const keys = Object.keys(params).concat('__guard');
        const reader = names.map(n => JSON.stringify(n) + ': (function () { try { return [' + n + ']; } catch (e) { return null; } })()').join(', ');
        const guard = makeGuard();
        let fn;
        try {
            fn = new Function(...keys, '"use strict";return function () {' + guardLoops(code) + '\n;const __read = () => ({' + reader + '});\n__read.__wsaRead = true;\nreturn __read;\n};');
        } catch (e) {
            return { ok: false, logs, missing: [], error: explain(e, code, names, syntaxLine(code)) };
        }
        const unpack = raw => {
            const values = {};
            const missing = [];
            names.forEach(n => {
                if (raw[n] === null) missing.push(n);
                else values[n] = raw[n][0];
            });
            return { values, missing };
        };
        try {
            const read = fn(...keys.map(k => (k === '__guard' ? guard : params[k])))();
            if (typeof read !== 'function' || !read.__wsaRead) {
                const at = topLevelReturn(code);
                return { ok: false, logs, missing: [], error: { line: at, message: 'return can only be used inside a function. This return is outside every function, so the code stopped there. Delete it, or move it inside the function it belongs to.', raw: 'Illegal return statement' } };
            }
            const first = unpack(read());
            const result = { ok: true, logs, values: first.values, missing: first.missing, code, names };
            result.read = () => unpack(read()).values;
            result.call = (f, args) => call(f, args, result);
            return result;
        } catch (e) {
            return { ok: false, logs, missing: [], error: explain(e, code, names, runtimeLine(e)) };
        }

        function call(f, args, owner) {
            guard.reset();
            if (typeof f !== 'function') return { ok: false, error: { line: null, message: 'This is not a function, so it can\'t be run.' } };
            try {
                return { ok: true, value: f(...(args || [])) };
            } catch (e) {
                return { ok: false, error: explain(e, owner.code, owner.names, runtimeLine(e)) };
            }
        }
    }

    WSA.esc = esc;
    WSA.fmt = fmt;
    WSA.near = near;
    WSA.show = show;
    WSA.friendlyError = friendlyError;
    WSA.runner = { run, explain, rhs, declared, replaceDecl, guardLoops, runtimeLine };
    if (typeof module !== 'undefined') module.exports = WSA;
})(typeof window !== 'undefined' ? window : globalThis);
