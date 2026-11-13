(function (root) {
    const WSA = root.WSA = root.WSA || {};

    function diffLines(a, b) {
        const x = a === '' ? [] : a.replace(/\n$/, '').split('\n');
        const y = b === '' ? [] : b.replace(/\n$/, '').split('\n');
        const n = x.length;
        const m = y.length;
        const t = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
        for (let i = n - 1; i >= 0; i--) {
            for (let j = m - 1; j >= 0; j--) {
                t[i][j] = x[i] === y[j] ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
            }
        }
        const ops = [];
        let i = 0;
        let j = 0;
        while (i < n && j < m) {
            if (x[i] === y[j]) {
                ops.push({ op: ' ', a: i, b: j, text: x[i] });
                i++;
                j++;
            } else if (t[i + 1][j] >= t[i][j + 1]) {
                ops.push({ op: '-', a: i, text: x[i] });
                i++;
            } else {
                ops.push({ op: '+', b: j, text: y[j] });
                j++;
            }
        }
        while (i < n) ops.push({ op: '-', a: i, text: x[i++] });
        while (j < m) ops.push({ op: '+', b: j, text: y[j++] });
        return ops;
    }

    function hunks(ops, context) {
        const out = [];
        const changed = ops.map((o, k) => (o.op !== ' ' ? k : -1)).filter(k => k >= 0);
        if (!changed.length) return out;
        let start = Math.max(0, changed[0] - context);
        let end = Math.min(ops.length - 1, changed[0] + context);
        for (let c = 1; c < changed.length; c++) {
            if (changed[c] - context <= end + 1) {
                end = Math.min(ops.length - 1, changed[c] + context);
            } else {
                out.push([start, end]);
                start = Math.max(0, changed[c] - context);
                end = Math.min(ops.length - 1, changed[c] + context);
            }
        }
        out.push([start, end]);
        return out.map(([s, e]) => {
            const part = ops.slice(s, e + 1);
            let aStart = null;
            let bStart = null;
            let aCount = 0;
            let bCount = 0;
            for (let k = s; k <= e; k++) {
                const o = ops[k];
                if (o.op !== '+') {
                    if (aStart === null) aStart = o.a;
                    aCount++;
                }
                if (o.op !== '-') {
                    if (bStart === null) bStart = o.b;
                    bCount++;
                }
            }
            const before = ops.slice(0, s);
            if (aStart === null) aStart = before.filter(o => o.op !== '+').length - 1;
            if (bStart === null) bStart = before.filter(o => o.op !== '-').length - 1;
            return { aStart: aStart + 1, aCount, bStart: bStart + 1, bCount, lines: part };
        });
    }

    function unified(name, a, b) {
        if (a === b) return '';
        const ops = diffLines(a === null ? '' : a, b === null ? '' : b);
        let text = `diff --git a/${name} b/${name}\n`;
        if (a === null) text += 'new file mode 100644\n';
        if (b === null) text += 'deleted file mode 100644\n';
        text += `--- ${a === null ? '/dev/null' : 'a/' + name}\n+++ ${b === null ? '/dev/null' : 'b/' + name}\n`;
        hunks(ops, 3).forEach(h => {
            text += `@@ -${h.aStart},${h.aCount} +${h.bStart},${h.bCount} @@\n`;
            h.lines.forEach(o => { text += o.op + o.text + '\n'; });
        });
        return text;
    }

    function counts(a, b) {
        const ops = diffLines(a || '', b || '');
        return { added: ops.filter(o => o.op === '+').length, removed: ops.filter(o => o.op === '-').length };
    }

    function hash(text) {
        let h1 = 0x811c9dc5;
        let h2 = 0x01000193;
        for (let i = 0; i < text.length; i++) {
            h1 = Math.imul(h1 ^ text.charCodeAt(i), 16777619) >>> 0;
            h2 = Math.imul(h2 + text.charCodeAt(i), 2246822519) >>> 0;
        }
        return (h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0')).slice(0, 7);
    }

    function tokens(line) {
        const out = [];
        const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
        let m;
        while ((m = re.exec(line))) out.push(m[1] !== undefined ? m[1] : m[2] !== undefined ? m[2] : m[3]);
        return out;
    }

    const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

    WSA.diffLines = diffLines;
    WSA.unifiedDiff = unified;

    WSA.createGit = function (io, saved) {
        const s = saved || { initialised: false, user: '', commits: {}, branches: {}, head: 'main', index: null, seq: 0 };

        const files = () => io.getFiles();
        const names = () => Object.keys(files()).sort();
        const headId = () => (s.initialised ? s.branches[s.head] || null : null);
        const tree = id => (id ? s.commits[id].files : {});
        const index = () => s.index || {};

        function ancestors(id) {
            const seen = new Set();
            const stack = id ? [id] : [];
            while (stack.length) {
                const c = stack.pop();
                if (!c || seen.has(c)) continue;
                seen.add(c);
                s.commits[c].parents.forEach(p => stack.push(p));
            }
            return seen;
        }

        function status() {
            const head = tree(headId());
            const idx = index();
            const work = files();
            const all = new Set([...Object.keys(head), ...Object.keys(idx), ...Object.keys(work)]);
            const staged = [];
            const unstaged = [];
            const untracked = [];
            [...all].sort().forEach(f => {
                const inIdx = has(idx, f);
                if (inIdx || has(head, f)) {
                    if (idx[f] !== head[f]) staged.push({ file: f, kind: !has(head, f) ? 'new file' : !inIdx ? 'deleted' : 'modified' });
                }
                if (!inIdx && has(work, f)) untracked.push(f);
                else if (inIdx && work[f] !== idx[f]) unstaged.push({ file: f, kind: !has(work, f) ? 'deleted' : 'modified' });
            });
            return { staged, unstaged, untracked, clean: !staged.length && !unstaged.length && !untracked.length };
        }

        function changedFromHead() {
            const head = tree(headId());
            const work = files();
            return names().filter(f => work[f] !== head[f]);
        }

        function need(init) {
            if (init && !s.initialised) throw new Error('This folder isn\'t a git repository yet. Start one with: git init');
        }

        function commitFiles(message, parents, filesSnapshot) {
            s.seq++;
            const id = hash(`${message}|${parents.join(',')}|${s.seq}|${JSON.stringify(filesSnapshot)}`);
            s.commits[id] = { id, message, parents, files: Object.assign({}, filesSnapshot), author: s.email ? `${s.user} <${s.email}>` : s.user, seq: s.seq };
            return id;
        }

        const cmds = {
            init() {
                if (s.initialised) return 'Reinitialized existing Git repository in /spheres-practice/.git/';
                s.initialised = true;
                s.head = 'main';
                s.branches = { main: null };
                s.index = {};
                return 'Initialized empty Git repository in /spheres-practice/.git/';
            },
            config(args) {
                if (args[0] === '--global') args = args.slice(1);
                const field = { 'user.name': 'user', 'user.email': 'email' }[args[0]];
                if (!field) throw new Error('This terminal only supports: git config --global user.name "Your Name" and git config --global user.email "you@example.com"');
                if (args.length === 1) {
                    if (!s[field]) throw new Error(field === 'user' ? 'No name is set yet. Set one with: git config --global user.name "Your Name"' : 'No email is set yet. Set one with: git config --global user.email "you@example.com"');
                    return s[field];
                }
                s[field] = args.slice(1).join(' ').trim();
                return '';
            },
            status() {
                need(true);
                const st = status();
                const lines = [`On branch ${s.head}`];
                if (!headId()) lines.push('', 'No commits yet');
                if (st.staged.length) {
                    lines.push('', 'Changes to be committed:', '  (use "git restore --staged <file>..." to unstage)');
                    st.staged.forEach(x => lines.push(`\t${(x.kind + ':').padEnd(12)}${x.file}`));
                }
                if (st.unstaged.length) {
                    lines.push('', 'Changes not staged for commit:', '  (use "git add <file>..." to update what will be committed)', '  (use "git restore <file>..." to discard changes in working directory)');
                    st.unstaged.forEach(x => lines.push(`\t${(x.kind + ':').padEnd(12)}${x.file}`));
                }
                if (st.untracked.length) {
                    lines.push('', 'Untracked files:', '  (use "git add <file>..." to include in what will be committed)');
                    st.untracked.forEach(f => lines.push(`\t${f}`));
                }
                if (st.clean) lines.push(headId() ? 'nothing to commit, working tree clean' : '\nnothing to commit (create/copy files and use "git add" to track)');
                else if (!st.staged.length && !st.unstaged.length) lines.push('', 'nothing added to commit but untracked files present (use "git add" to track)');
                else if (!st.staged.length) lines.push('', 'no changes added to commit (use "git add" and/or "git commit -a")');
                return lines.join('\n');
            },
            add(args) {
                need(true);
                if (!args.length) throw new Error('Name the files to add, or add every file with: git add .');
                const work = files();
                const idx = Object.assign({}, index());
                const targets = args.some(a => a === '.' || a === '-A' || a === '--all') ? names() : args;
                for (const f of targets) {
                    if (!has(work, f) && !has(idx, f)) throw new Error(`There's no file called ${f}. Check the spelling.`);
                    if (has(work, f)) idx[f] = work[f];
                    else delete idx[f];
                }
                s.index = idx;
                return '';
            },
            commit(args) {
                need(true);
                const k = args.indexOf('-m');
                if (k === -1 || args[k + 1] === undefined) throw new Error('Add a message that describes the change: git commit -m "Your message"');
                const message = args[k + 1].trim();
                if (!message) throw new Error('The commit message is empty. Describe the change in a few words.');
                if (!s.user || !s.email) throw new Error(`Git needs to know who you are before you commit. Set your ${!s.user && !s.email ? 'name and email' : !s.user ? 'name' : 'email'} first: git config --global user.${!s.user ? 'name "Your Name"' : 'email "you@example.com"'}`);
                const st = status();
                if (!st.staged.length) {
                    if (st.unstaged.length || st.untracked.length) throw new Error('Nothing is staged, so there\'s nothing to commit. Stage changes first with git add.');
                    throw new Error('Nothing has changed since the last commit, so there\'s nothing to commit.');
                }
                const parent = headId();
                const before = tree(parent);
                const id = commitFiles(message, parent ? [parent] : [], index());
                s.branches[s.head] = id;
                const changedFiles = Object.keys(Object.assign({}, before, index())).filter(f => before[f] !== index()[f]);
                let add = 0;
                let del = 0;
                changedFiles.forEach(f => {
                    const c = counts(before[f] || '', index()[f] || '');
                    add += c.added;
                    del += c.removed;
                });
                const summary = ` ${changedFiles.length} file${changedFiles.length === 1 ? '' : 's'} changed` + (add ? `, ${add} insertion${add === 1 ? '' : 's'}(+)` : '') + (del ? `, ${del} deletion${del === 1 ? '' : 's'}(-)` : '');
                return `[${s.head}${parent ? '' : ' (root-commit)'} ${id}] ${message}\n${summary}`;
            },
            branch(args) {
                need(true);
                if (!args.length) return Object.keys(s.branches).sort().map(b => (b === s.head ? '* ' : '  ') + b).join('\n');
                const name = args[0];
                if (!headId()) throw new Error('Make a first commit before making a branch. A branch starts from a commit.');
                if (!/^[A-Za-z0-9][\w./-]*$/.test(name)) throw new Error(`"${name}" can't be a branch name. Use letters, numbers and hyphens, with no spaces.`);
                if (has(s.branches, name)) throw new Error(`A branch called ${name} already exists.`);
                s.branches[name] = headId();
                return '';
            },
            switch(args) {
                need(true);
                let create = false;
                if (args[0] === '-c' || args[0] === '-b') {
                    create = true;
                    args = args.slice(1);
                }
                const name = args[0];
                if (!name) throw new Error('Name the branch to switch to: git switch branch-name');
                if (create) cmds.branch([name]);
                else if (!has(s.branches, name)) throw new Error(`There's no branch called ${name}. See the branches with: git branch`);
                if (name === s.head && !create) return `Already on '${name}'`;
                const sameCommit = s.branches[name] === headId();
                if (!sameCommit && !status().clean) throw new Error('You have changes that aren\'t committed, and switching branches would lose them. Commit them or discard them first.');
                s.head = name;
                if (!sameCommit && s.branches[name] !== null) {
                    const t = tree(s.branches[name]);
                    if (JSON.stringify(t) !== JSON.stringify(files())) io.setFiles(Object.assign({}, t));
                    s.index = Object.assign({}, t);
                }
                return create ? `Switched to a new branch '${name}'` : `Switched to branch '${name}'`;
            },
            log(args) {
                need(true);
                if (!headId()) throw new Error(`Your current branch '${s.head}' does not have any commits yet`);
                const decorate = id => {
                    const refs = Object.keys(s.branches).filter(b => s.branches[b] === id).sort((a, b) => (a === s.head ? -1 : b === s.head ? 1 : a.localeCompare(b)));
                    if (!refs.length) return '';
                    return ' (' + refs.map(b => (b === s.head ? `HEAD -> ${b}` : b)).join(', ') + ')';
                };
                const order = [];
                let c = headId();
                while (c) {
                    order.push(c);
                    c = s.commits[c].parents[0];
                }
                if (args.includes('--oneline')) return order.map(id => `${id}${decorate(id)} ${s.commits[id].message}`).join('\n');
                return order.map(id => `commit ${id}${decorate(id)}\nAuthor: ${s.commits[id].author}\n\n    ${s.commits[id].message}\n`).join('\n');
            },
            diff(args) {
                need(true);
                const staged = args.includes('--staged') || args.includes('--cached');
                const a = staged ? tree(headId()) : index();
                const b = staged ? index() : files();
                const only = args.filter(x => !x.startsWith('--'));
                const fs = names().concat(Object.keys(a)).filter((f, k, arr) => arr.indexOf(f) === k).sort().filter(f => !only.length || only.includes(f));
                return fs.map(f => (staged || has(a, f) ? unified(f, has(a, f) ? a[f] : null, has(b, f) ? b[f] : null) : '')).join('').replace(/\n$/, '');
            },
            restore(args) {
                need(true);
                const staged = args.includes('--staged');
                const targetsRaw = args.filter(x => !x.startsWith('--'));
                if (!targetsRaw.length) throw new Error('Name the files to restore, or restore every file with: git restore .');
                const targets = targetsRaw.includes('.') ? names() : targetsRaw;
                if (staged) {
                    const head = tree(headId());
                    const idx = Object.assign({}, index());
                    targets.forEach(f => {
                        if (has(head, f)) idx[f] = head[f];
                        else delete idx[f];
                    });
                    s.index = idx;
                } else {
                    const idx = index();
                    const work = Object.assign({}, files());
                    targets.forEach(f => {
                        if (!has(work, f) && !has(idx, f)) throw new Error(`There's no file called ${f}. Check the spelling.`);
                        if (has(idx, f)) work[f] = idx[f];
                    });
                    io.setFiles(work);
                }
                return '';
            },
            merge(args) {
                need(true);
                const name = args[0];
                if (!name) throw new Error('Name the branch to merge: git merge branch-name');
                if (!has(s.branches, name)) throw new Error(`There's no branch called ${name}. See the branches with: git branch`);
                if (!status().clean) throw new Error('Commit or discard your changes before merging.');
                const ours = headId();
                const theirs = s.branches[name];
                if (!theirs || ancestors(ours).has(theirs)) return 'Already up to date.';
                if (!ours || ancestors(theirs).has(ours)) {
                    const before = tree(ours);
                    const after = tree(theirs);
                    s.branches[s.head] = theirs;
                    io.setFiles(Object.assign({}, after));
                    s.index = Object.assign({}, after);
                    const changed = Object.keys(Object.assign({}, before, after)).filter(f => before[f] !== after[f]);
                    return `Updating ${ours}..${theirs}\nFast-forward\n` + changed.map(f => {
                        const c = counts(before[f] || '', after[f] || '');
                        return ` ${f} | ${c.added + c.removed} ${'+'.repeat(c.added)}${'-'.repeat(c.removed)}`;
                    }).join('\n') + `\n ${changed.length} file${changed.length === 1 ? '' : 's'} changed`;
                }
                const baseSet = ancestors(ours);
                let base = null;
                const queue = [theirs];
                const seen = new Set();
                while (queue.length && !base) {
                    const c = queue.shift();
                    if (seen.has(c)) continue;
                    seen.add(c);
                    if (baseSet.has(c)) base = c;
                    else s.commits[c].parents.forEach(p => queue.push(p));
                }
                const b = tree(base);
                const o = tree(ours);
                const t = tree(theirs);
                const merged = {};
                const conflicts = [];
                Object.keys(Object.assign({}, b, o, t)).forEach(f => {
                    if (o[f] === t[f]) merged[f] = o[f];
                    else if (o[f] === b[f]) merged[f] = t[f];
                    else if (t[f] === b[f]) merged[f] = o[f];
                    else conflicts.push(f);
                    if (merged[f] === undefined) delete merged[f];
                });
                if (conflicts.length) throw new Error(`Both branches changed ${conflicts.join(' and ')}. Combining changes to the same file is called resolving a conflict, and this terminal doesn't support it. The merge was stopped, and nothing has changed.`);
                const id = commitFiles(`Merge branch '${name}'`, [ours, theirs], merged);
                s.branches[s.head] = id;
                io.setFiles(Object.assign({}, merged));
                s.index = Object.assign({}, merged);
                return 'Merge made by the \'ort\' strategy.';
            }
        };
        cmds.checkout = args => cmds.switch(args);

        function exec(line) {
            const parts = tokens(line.trim());
            if (!parts.length) return { output: '' };
            if (parts[0] !== 'git') return { error: `This terminal only runs git commands. "${parts[0]}" isn't one.` };
            const cmd = parts[1];
            if (!cmd) return { output: 'Try one of: git init, git status, git add, git commit, git branch, git switch, git log, git diff, git restore, git merge, git config' };
            if (!has(cmds, cmd)) return { error: `This terminal doesn't support "git ${cmd}". It supports: init, config, status, add, commit, branch, switch, checkout, log, diff, restore and merge.` };
            try {
                const output = cmds[cmd](parts.slice(2));
                io.changed && io.changed();
                return { output: output || '' };
            } catch (e) {
                return { error: e.message };
            }
        }

        return {
            state: s,
            exec,
            status,
            headId,
            tree,
            ancestors,
            changedFromHead,
            commits: () => Object.values(s.commits).sort((a, b) => a.seq - b.seq)
        };
    };

    if (typeof module !== 'undefined') module.exports = WSA;
})(typeof window !== 'undefined' ? window : globalThis);
