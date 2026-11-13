(function () {
    const WSA = window.WSA;
    const KEYWORDS = /^(let|const|var|function|return|if|else|for|while|true|false|null|undefined|new|this)$/;
    const TOKEN = /(\/\/.*$)|("(?:[^"\\]|\\.)*"?|'(?:[^'\\]|\\.)*'?|`(?:[^`\\]|\\.)*`?)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)/g;

    function highlight(line, known) {
        let html = '';
        let last = 0;
        line.replace(TOKEN, (match, comment, str, num, word, offset) => {
            html += WSA.esc(line.slice(last, offset));
            let cls = 'id';
            if (comment) cls = 'com';
            else if (str) cls = 'str';
            else if (num) cls = 'num';
            else if (KEYWORDS.test(word)) cls = 'kw';
            else if (known.includes(word)) cls = 'var';
            html += `<span class="t-${cls}">${WSA.esc(match)}</span>`;
            last = offset + match.length;
            return match;
        });
        return html + WSA.esc(line.slice(last));
    }

    WSA.highlight = highlight;

    WSA.createEditor = function (opts) {
        const ta = opts.textarea;
        const hl = opts.highlight;
        const gutter = opts.gutter;
        let known = [];
        let errorLine = null;
        let markLine = null;

        function cls(i) {
            if (i + 1 === errorLine) return ' err';
            if (i + 1 === markLine) return ' mark';
            return '';
        }

        function render() {
            const lines = ta.value.split('\n');
            hl.innerHTML = lines.map((l, i) => `<span class="l${cls(i)}">${highlight(l, known) || ' '}</span>`).join('');
            gutter.innerHTML = lines.map((_, i) => `<span${cls(i) ? ` class="${cls(i).trim()}"` : ''}>${i + 1}</span>`).join('');
        }

        function cursorLine() {
            return ta.value.slice(0, ta.selectionStart).split('\n').length;
        }

        ta.addEventListener('input', () => {
            render();
            opts.onChange(ta.value);
        });

        ['keyup', 'click', 'select'].forEach(type => ta.addEventListener(type, () => {
            if (opts.onCursor) opts.onCursor(cursorLine());
        }));

        ta.addEventListener('keydown', e => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                opts.onSubmit();
                return;
            }
            if (e.key === 'Tab' && !e.shiftKey && !ta.readOnly) {
                e.preventDefault();
                document.execCommand('insertText', false, '  ');
            }
        });

        return {
            get value() { return ta.value; },
            set(value, names) {
                known = names || known;
                ta.value = value;
                markLine = null;
                render();
            },
            setErrorLine(line) {
                if (line === errorLine) return;
                errorLine = line;
                render();
            },
            setMarkLine(line) {
                markLine = line;
                render();
            },
            goToLine(line) {
                const lines = ta.value.split('\n');
                const at = lines.slice(0, Math.max(0, line - 1)).reduce((n, l) => n + l.length + 1, 0);
                ta.focus({ preventScroll: true });
                ta.setSelectionRange(at, at);
                const lh = parseFloat(getComputedStyle(ta).lineHeight) || 24;
                const offset = (line - 3) * lh;
                let scroller = ta.parentElement;
                while (scroller && scroller !== document.body) {
                    const flow = getComputedStyle(scroller).overflowY;
                    if ((flow === 'auto' || flow === 'scroll') && scroller.scrollHeight > scroller.clientHeight) break;
                    scroller = scroller.parentElement;
                }
                if (scroller && scroller !== document.body) {
                    scroller.scrollTop = Math.max(0, ta.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop + offset);
                    if (scroller.classList.contains('editor')) scroller.scrollIntoView({ block: 'nearest' });
                } else {
                    window.scrollTo(0, Math.max(0, ta.getBoundingClientRect().top + window.scrollY + offset));
                }
                if (opts.onCursor) opts.onCursor(line);
            },
            cursorLine,
            lock(locked) {
                ta.readOnly = locked;
                opts.lockEl.hidden = !locked;
                ta.closest('.editor').classList.toggle('locked', locked);
            },
            focus() { ta.focus(); }
        };
    };
})();
