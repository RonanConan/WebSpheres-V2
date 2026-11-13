(function () {
    const WSA = window.WSA;
    const { pass, fail, nudge } = WSA;
    const esc = WSA.esc;
    const FN = 'floating-number.js';
    const ALL = ['index.html', 'sphere-manager.js', 'score-manager.js', 'floating-number.js', 'data-manager.js'];
    const isWhiteLine = l => /const color/.test(l) && /#FFD700/i.test(l) && /['"](#FFFFFF|#FFF|white)['"]\s*;?\s*$/i.test(l);
    const hasWhite = text => (text || '').split('\n').some(isWhiteLine);

    function oneLineChange(before, after) {
        const ops = WSA.diffLines(before || '', after || '');
        const removed = ops.filter(o => o.op === '-');
        const added = ops.filter(o => o.op === '+');
        return { removed, added, single: removed.length === 1 && added.length === 1 };
    }

    function branchCommit(git) {
        const main = git.state.branches.main;
        const others = Object.keys(git.state.branches).filter(b => b !== 'main' && git.state.branches[b] && git.state.branches[b] !== main);
        return others.length ? { name: others[0], id: git.state.branches[others[0]] } : null;
    }

    window.LESSONS = window.LESSONS || [];
    window.LESSONS.push({
        id: 'version-control',
        title: 'Version control',
        subtitle: 'Saving, comparing and undoing with git',
        workspace: true,
        git: true,
        names: [],
        types: {},
        starterCode: '',
        intro: `
            <p><b>Version control</b> keeps a history of a project's files. You can see what changed and when, try changes safely, and go back if something goes wrong. WebSpheres uses a version control system called <b>git</b>, as most software projects do.</p>
            <ul class="parts">
                <li>A <b>repository</b> is a project folder whose history git keeps.</li>
                <li>A <b>commit</b> is a saved snapshot of the files, with a message that describes the change.</li>
                <li>A <b>branch</b> is a separate line of commits. You can try a change on a branch without touching the main version, which is on a branch called <code>main</code>.</li>
            </ul>
            <pre class="snippet">main:             First version
                         \\
brighter-labels:          White labels</pre>
            <p>In this lesson you make the branch <code>brighter-labels</code> from the first commit, add a commit to it, and then <b>merge</b> it, which brings that commit into <code>main</code>.</p>
            <p>This lesson uses Spheres Practice again, starting from the original files. Two new tabs sit under the code:</p>
            <ul class="parts">
                <li><b>Source control</b> has buttons for each git action, like the Source Control panel in VS Code.</li>
                <li><b>Terminal</b> lets you type git commands, as you would on a real computer. Each button in Source control runs one of these commands, and you can see it in the Terminal tab.</li>
            </ul>
            <p>Everything stays in your browser. Nothing is uploaded.</p>`,
        steps: [
            {
                type: 'quiz',
                title: 'What is a commit?',
                goal: 'Choose what a commit does.',
                explain: `<p>Read the explanation at the top of the lesson first.</p>`,
                question: 'What does a commit do?',
                options: [
                    { text: 'It saves a snapshot of the files, with a message, that you can go back to', correct: true, why: 'Correct. Each commit is one saved version of the project.' },
                    { text: 'It uploads the files to the internet', correct: false, why: 'That\'s called pushing, which this lesson doesn\'t cover. A commit stays on your own computer.' },
                    { text: 'It deletes the old versions of the files', correct: false, why: 'Git keeps every commit, so the old versions stay available.' },
                    { text: 'It checks the code for bugs', correct: false, why: 'Git saves whatever the files contain, whether or not the code works.' }
                ],
                success: 'Correct. A history of commits is a history of the project.',
                hints: [
                    'Think of a commit as a save point.',
                    'A commit stays on your computer.',
                    'The answer is the first option.'
                ]
            },
            {
                type: 'task',
                title: 'Introduce yourself',
                goal: 'In the Terminal tab, set the name and email that git will put on your commits.',
                explain: `<p>Every commit records who made it. Git needs your name and email before your first commit.</p><ol><li>Open the <b>Terminal</b> tab under the code.</li><li>Type <code>git config --global user.name "Your Name"</code>, with your own name between the quotes, and press Enter.</li><li>Type <code>git config --global user.email "you@example.com"</code>, with your own email, and press Enter.</li><li>To check them, type <code>git config --global user.name</code> without a name, and press Enter.</li></ol><p><code>--global</code> saves the setting for every repository on the computer, so on a real computer you only do this once. Here, both are only saved in your browser.</p>`,
                hints: [
                    'Click in the Terminal tab\'s input line, which starts with <code>$</code>.',
                    'The commands start with <code>git config --global user.name</code> and <code>git config --global user.email</code>, followed by your name or email in quotes.',
                    'For example: <code>git config --global user.name "Sam Smith"</code>, then <code>git config --global user.email "sam@example.com"</code>, pressing Enter after each.'
                ],
                check(ws) {
                    const st = ws.git.state;
                    if (!st.user) return fail('No name is set yet. Type <code>git config --global user.name "Your Name"</code> in the Terminal tab, and press Enter.');
                    if (!st.email) return fail('Your name is set. Now set your email: <code>git config --global user.email "you@example.com"</code>');
                    return pass(`Git will put <b>${esc(st.user)} &lt;${esc(st.email)}&gt;</b> on your commits.`);
                }
            },
            {
                type: 'task',
                title: 'The first commit',
                goal: 'Turn the project into a repository, and commit every file with the message <code>First version</code>.',
                explain: `<p>You can use either the Source control tab or the Terminal tab. Both do the same thing.</p><table class="ops"><tr><td><b>Source control</b></td><td><b>Terminal</b></td></tr><tr><td>Initialise repository</td><td><code>git init</code></td></tr><tr><td>Stage all</td><td><code>git add .</code></td></tr><tr><td>Type the message, then Commit</td><td><code>git commit -m "First version"</code></td></tr></table><p><b>Staging</b> chooses which changes go into the next commit. <code>git add .</code> stages everything. Use <code>git status</code> at any time to see where things stand.</p><p>Here, the first branch is called <code>main</code>. On a real computer, older versions of git call it <code>master</code> instead. <code>git status</code> shows its name.</p>`,
                hints: [
                    'Start with <code>git init</code>, or the Initialise repository button.',
                    'Then stage every file with <code>git add .</code>, or Stage all.',
                    'Finally, run <code>git commit -m "First version"</code>, or type the message and press Commit.'
                ],
                check(ws) {
                    const g = ws.git;
                    if (!g.state.initialised) return fail('The project isn\'t a repository yet. Run <code>git init</code>, or press Initialise repository.');
                    const head = g.headId();
                    if (!head) return fail('There are no commits yet. Stage the files, then commit them.');
                    const tree = g.tree(head);
                    const missing = ALL.filter(f => !(f in tree));
                    if (missing.length) return fail(`The commit doesn't include <code>${esc(missing[0])}</code>. Stage every file with <code>git add .</code>, then commit again.`);
                    if (!g.status().clean) return fail('Some changes aren\'t committed. Check with <code>git status</code>.');
                    const msg = g.state.commits[head].message;
                    const note = msg === 'First version' ? '' : ` Your message is "${esc(msg)}" rather than "First version", which is fine: any clear message works.`;
                    return pass(`The repository has its first commit, with all five files.${note} Run <code>git log --oneline</code> in the Terminal tab to see it.`);
                }
            },
            {
                type: 'task',
                title: 'Make a branch',
                goal: 'Make a branch called <code>brighter-labels</code>, and switch to it.',
                explain: `<p>A branch lets you try a change without touching <code>main</code>. If the change works, you can bring it into <code>main</code> later. If it doesn't, <code>main</code> is unchanged.</p><table class="ops"><tr><td><b>Source control</b></td><td><b>Terminal</b></td></tr><tr><td>Type the name, then Create and switch</td><td><code>git switch -c brighter-labels</code></td></tr></table><p>Branch names can't contain spaces, so words are joined with hyphens. <code>git branch</code> lists the branches, with a star next to the current one.</p>`,
                hints: [
                    'In the Source control tab, type the name in the box next to Create and switch.',
                    'In the Terminal tab, <code>-c</code> means "create".',
                    'Run <code>git switch -c brighter-labels</code>'
                ],
                check(ws) {
                    const g = ws.git;
                    if (!g.headId()) return fail('Make the first commit before making a branch.');
                    if (g.state.head === 'main') return fail('You\'re still on <code>main</code>. Create the branch and switch to it.');
                    const note = g.state.head === 'brighter-labels' ? '' : ` It's called <code>${esc(g.state.head)}</code> rather than brighter-labels, which works just as well.`;
                    return pass(`You're on your new branch.${note} Commits you make now go on this branch, not on main.`);
                }
            },
            {
                type: 'task',
                title: 'Change and compare',
                goal: 'On your branch, change the colour of normal hits in <code>floating-number.js</code> to white, <code>"#FFFFFF"</code>. Then look at the change in the side-by-side comparison.',
                explain: `<ol><li>Open <code>floating-number.js</code>, and change <code>'#CCCCCC'</code> to <code>'#FFFFFF'</code> on the line that makes <code>color</code>, as in lesson 11.</li><li>Open the <b>Source control</b> tab. The file is listed under Changes.</li><li>Click the file's name. The comparison shows the last commit on the left and your file on the right, with the changed line marked.</li></ol><p><code>git diff</code> shows the same change in the Terminal tab, with a minus sign before the old line and a plus sign before the new one.</p>`,
                hints: [
                    'The line to change is <code>const color = hitType === \'critical\' ? \'#FFD700\' : \'#CCCCCC\';</code>',
                    'After changing it, click <code>floating-number.js</code> in the Source control tab.',
                    'Change <code>\'#CCCCCC\'</code> to <code>\'#FFFFFF\'</code>, then click the file name under Changes.'
                ],
                check(ws) {
                    const g = ws.git;
                    if (g.state.head === 'main') return fail('You\'re on <code>main</code>. Switch to your branch first, so that main stays unchanged.');
                    const changed = g.changedFromHead();
                    if (!changed.length) return fail('Nothing has changed since the last commit yet.');
                    if (changed.length > 1 || changed[0] !== FN) return fail(`Only <code>${FN}</code> should change. These files are different from the last commit: ${changed.map(f => `<code>${esc(f)}</code>`).join(', ')}.`);
                    const d = oneLineChange(g.tree(g.headId())[FN], ws.files[FN]);
                    if (!d.single) return fail(`Exactly one line should change. Your file has ${d.removed.length} removed and ${d.added.length} added ${d.added.length === 1 ? 'line' : 'lines'}.`);
                    if (!isWhiteLine(d.added[0].text)) return fail('The changed line should make normal hits white and keep critical hits gold.');
                    if (!ws.step.diffViewed) return nudge('Are you sure? The change is right. Now click <code>floating-number.js</code> in the Source control tab, to see the comparison.');
                    return pass('One line changed, and the comparison shows exactly which. Checking a change like this before committing is a good habit.');
                }
            },
            {
                type: 'task',
                title: 'Commit on the branch',
                goal: 'Commit the change on your branch, with a message that describes it.',
                explain: `<p>A good commit message says what changed, in a few words. For example, <code>Make normal hit labels white</code>.</p><table class="ops"><tr><td><b>Source control</b></td><td><b>Terminal</b></td></tr><tr><td>Stage, type the message, then Commit</td><td><code>git add floating-number.js</code><br><code>git commit -m "Your message"</code></td></tr></table>`,
                hints: [
                    'Stage the file first: the Stage button, or <code>git add floating-number.js</code>.',
                    'Then commit with a message.',
                    'Run <code>git add floating-number.js</code>, then <code>git commit -m "Make normal hit labels white"</code>.'
                ],
                check(ws) {
                    const g = ws.git;
                    if (g.state.head === 'main') return fail('You\'re on <code>main</code>. The change should be committed on your branch.');
                    const head = g.headId();
                    const main = g.state.branches.main;
                    if (head === main) return fail('Your branch has no new commit yet. Stage the change, then commit it.');
                    if (!g.status().clean) return fail('Some changes aren\'t committed yet. Check with <code>git status</code>.');
                    const c = g.state.commits[head];
                    if (c.parents[0] !== main) return fail('Your branch should have exactly one new commit after main\'s first commit.');
                    const d = oneLineChange(g.tree(main)[FN], g.tree(head)[FN]);
                    if (!d.single || !isWhiteLine(d.added[0].text)) return fail('The new commit should contain only the white label change.');
                    if (c.message.trim().split(/\s+/).length < 2) return nudge(`Are you sure? The message "${esc(c.message)}" is very short. Describe the change in a few words, so that it makes sense in the history months later.`);
                    return pass(`Committed on <code>${esc(g.state.head)}</code>: "${esc(c.message)}". Run <code>git log --oneline</code> to see both commits.`);
                }
            },
            {
                type: 'task',
                title: 'Back to main',
                predict: {
                    question: 'When you switch back to <code>main</code>, what happens to your white labels?',
                    options: ['They disappear from the files, but stay saved on your branch', 'They stay in the files', 'They\'re deleted for good'],
                    answer: 0,
                    explain: 'Switching to <code>main</code> puts the files back as they are in main\'s last commit. Your change is still saved in the commit on your branch.'
                },
                goal: 'Switch back to <code>main</code>. Then run the game, and score a normal hit.',
                explain: `<table class="ops"><tr><td><b>Source control</b></td><td><b>Terminal</b></td></tr><tr><td>Choose main, then Switch</td><td><code>git switch main</code></td></tr></table><p>Look at <code>floating-number.js</code> after switching, and at the label colour in the game.</p>`,
                hints: [
                    'Choose <code>main</code> in the branch list, then press Switch.',
                    'Or run <code>git switch main</code> in the Terminal tab.',
                    'Run <code>git switch main</code>, press Run above the files, and score a normal hit.'
                ],
                check(ws) {
                    const g = ws.git;
                    if (g.state.head !== 'main') return fail('Switch to <code>main</code> first.');
                    if (hasWhite(ws.files[FN])) return fail('<code>floating-number.js</code> still has the white colour. Check that you\'re on main with <code>git status</code>.');
                    if (!ws.ran) return fail('Press Run, so that the game uses main\'s files.');
                    if (!ws.logs.some(l => l.kind === 'log' && /Type normal/.test(l.text))) return fail('Score a normal hit, and look at its label.');
                    return pass('On main, normal hits are grey again. Your white labels are safe in the commit on your branch.');
                }
            },
            {
                type: 'task',
                title: 'Undo a mess',
                goal: 'Change two files in any way you like. Then discard all your changes, so that every file matches the last commit again.',
                explain: `<p>Git can undo changes that you haven't committed. This is useful when an experiment goes wrong.</p><table class="ops"><tr><td><b>Source control</b></td><td><b>Terminal</b></td></tr><tr><td>Discard, next to each file</td><td><code>git restore .</code></td></tr></table><p>Discarding can't be undone, so check with <code>git status</code> or the comparison first. In real projects, only discard changes you don't need.</p>`,
                hints: [
                    'Type anything into two different files. The Source control tab lists both under Changes.',
                    'Press Discard next to each file, or run <code>git restore .</code> in the Terminal tab.',
                    'After discarding, <code>git status</code> should say "nothing to commit, working tree clean".'
                ],
                check(ws) {
                    const g = ws.git;
                    if (ws.step.dirtyMax < 2) return fail('First change two different files, so that both are listed under Changes.');
                    if (g.state.head !== 'main') return fail('Stay on <code>main</code> for this step.');
                    if (g.changedFromHead().length) return fail(`These files still have changes: ${g.changedFromHead().map(f => `<code>${esc(f)}</code>`).join(', ')}. Discard them.`);
                    return pass('Every file matches the last commit again. The mess is gone, and nothing that was committed was lost.');
                }
            },
            {
                type: 'task',
                title: 'Merge the branch',
                goal: 'In the Terminal tab, merge your branch into <code>main</code> with <code>git merge</code>. Then show the history with <code>git log --oneline</code>.',
                explain: `<p>Merging brings the commits from one branch into the branch you're on. Here, main hasn't changed since you made your branch, so git simply moves main forward to your commit. This is called a fast-forward.</p><ol><li>Check that you're on main: <code>git status</code>.</li><li>Run <code>git merge brighter-labels</code>, using your branch's name.</li><li>Run <code>git log --oneline</code>. The newest commit is at the top, and both branch names point to it.</li></ol>`,
                hints: [
                    'You need to be on main, and type the commands in the Terminal tab.',
                    'The command is <code>git merge</code>, followed by your branch\'s name.',
                    'Run <code>git merge brighter-labels</code>, then <code>git log --oneline</code>.'
                ],
                check(ws) {
                    const g = ws.git;
                    const b = branchCommit(g) || Object.keys(g.state.branches).filter(n => n !== 'main').map(n => ({ name: n, id: g.state.branches[n] }))[0];
                    if (g.state.head !== 'main') return fail('Switch to <code>main</code> first. Merging brings the branch into the branch you\'re on.');
                    if (!b) return fail('There\'s no branch to merge.');
                    if (!g.ancestors(g.headId()).has(b.id)) return fail(`main doesn't include your branch's commit yet. Run <code>git merge ${esc(b.name)}</code> in the Terminal tab.`);
                    const typed = ws.step.commands;
                    if (!typed.some(c => c.ok && /^git merge\b/.test(c.line))) return fail('Type the <code>git merge</code> command in the Terminal tab.');
                    if (!typed.some(c => c.ok && /^git log\b/.test(c.line))) return fail('Now show the history with <code>git log --oneline</code>.');
                    if (!hasWhite(ws.files[FN])) return fail('After the merge, <code>floating-number.js</code> should have the white colour.');
                    return pass('main now includes your change, and the history shows how it got there. This is the everyday git cycle: branch, change, commit, compare and merge.');
                }
            }
        ],
        learned: [
            'A repository keeps the history of a project. Each commit is a saved snapshot with a message.',
            'Staging chooses which changes go into the next commit.',
            'A branch lets you try changes without touching main. Switching branches changes the files to match.',
            'Comparing shows exactly what changed. Discarding undoes changes that aren\'t committed.',
            'Merging brings a branch\'s commits into the branch you\'re on.'
        ],
        real: {
            file: 'WebSpheres',
            where: 'five commits from 9 to 11 November 2026, from git log --oneline',
            code: `d569dbe Ignore the local Claude settings and audit notes
7fbd82f Fix the max and cloud review findings in the Analysis page (1.8.0)
b7f9550 Fix the Analysis review findings and require a group choice (1.7.0, 2.8.1)
3f235e8 Add affected-hand columns to the patient kinematics master (1.6.0)
e342c7b Use affected-hand wording for patient sessions (1.5.0)`,
            note: `<p>This is part of the real WebSpheres history. Each message says what changed in a few words, and some name the version number.</p><p>The same habits apply to WebSpheres: work on a branch, write a clear message for each commit, never edit data files or change their columns, and don't push without asking. Sharing work on GitHub, called pushing and pulling, is left for later.</p>`
        }
    });
})();
