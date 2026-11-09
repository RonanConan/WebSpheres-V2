(() => {
    const $ = (id) => document.getElementById(id);
    const A = WebSpheresAnalysis;
    const STEPS = [1, 2, 3, 4, 5, 6, 7];
    const includePractice = /[?&]practice\b/.test(location.search);
    const state = { open: 1, reached: 1, busy: false, root: null, remembered: null, folderOk: false, group: '', zipCount: 0, exports: [], result: null, comparison: null, saved: false, finished: false, masterText: null };

    try {
        const textSize = JSON.parse(localStorage.getItem('webspheres-observer-settings') || '{}').textSize;
        if ([1, 1.2, 1.4].includes(textSize)) document.documentElement.style.setProperty('--scale', textSize);
    } catch (e) {}

    const plural = (n, word) => `${n.toLocaleString('en-GB')} ${word}${n === 1 ? '' : 's'}`;
    const stepEl = (n) => document.querySelector(`.step[data-step="${n}"]`);
    const ticksIn = (n) => Array.from(stepEl(n).querySelectorAll('.g-tick input')).filter(input => !input.closest('[hidden]'));
    const allTicked = (n) => ticksIn(n).every(input => input.checked);
    const groupTitle = () => (state.group === 'patients' ? 'Patients' : 'Controls');
    const zipsPath = () => `${state.root.name}/${state.group}/zips`;
    const outputNames = () => A.fileNames(state.group, includePractice);

    function setMsg(id, text, kind) {
        $(id).textContent = text;
        $(id).classList.remove('ok', 'bad', 'busy');
        if (kind) $(id).classList.add(kind);
    }

    function element(tag, className, text) {
        const el = document.createElement(tag);
        if (className) el.className = className;
        if (text !== undefined) el.textContent = text;
        return el;
    }

    function fillList(sectionId, listId, items) {
        $(sectionId).hidden = !items.length;
        $(listId).replaceChildren(...items.map(item => element('li', '', item)));
    }

    function dateText(iso) {
        const date = new Date(iso);
        return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    }

    function tile(item) {
        const classes = ['tile'];
        if (item.type === 'boost') classes.push('boost');
        if (!item.block) classes.push('nodata');
        const el = element('div');
        el.appendChild(element('div', 'tile-name', item.name));
        if (!item.block) {
            el.appendChild(element('div', 'tile-detail', 'No data found'));
        } else {
            const count = item.block.table.length;
            const planned = parseInt(item.block.info.TotalTrials, 10);
            const short = planned > count;
            if (short) classes.push('partial');
            el.appendChild(element('div', 'tile-count', short ? `${count} of ${planned} trials` : plural(count, 'trial')));
            el.appendChild(element('div', 'tile-detail', { 'pre-boost': 'Pre-boost', boost: 'Boost', 'post-boost': 'Post-boost', 'no-boost': 'No boost', unknown: 'Unknown' }[item.phase]));
            el.appendChild(element('div', 'tile-detail', `Mode: ${item.block.info.Mode || 'not recorded'}`));
            el.style.flexGrow = String(Math.max(count, 1));
        }
        el.className = classes.join(' ');
        return el;
    }

    function renderLayout(result) {
        const participants = new Map();
        result.sessions.forEach(session => {
            if (!participants.has(session.id)) participants.set(session.id, []);
            participants.get(session.id).push(session);
        });
        const sections = [];
        participants.forEach((sessions, id) => {
            const section = element('section', 'participant');
            section.appendChild(element('h2', '', id ? `Participant ${id}` : 'No participant ID'));
            sessions.forEach(session => {
                const row = element('div', 'session');
                const label = element('div');
                label.appendChild(element('div', 'session-name', `Session ${session.number}${session.practice ? ' (practice)' : ''}`));
                label.appendChild(element('div', 'session-date', dateText(session.start)));
                const strip = element('div', 'strip');
                session.items.forEach(item => strip.appendChild(tile(item)));
                row.append(label, strip);
                section.appendChild(row);
            });
            sections.push(section);
        });
        $('layout').replaceChildren(...sections);
    }

    function comparisonUnchanged() {
        const c = state.comparison;
        return !!c && c.comparable && c.added === 0 && c.changed === 0 && c.missing === 0;
    }

    function comparisonNeedsConfirm() {
        const c = state.comparison;
        return !!c && (!c.comparable || c.changed > 0 || c.missing > 0);
    }

    function renderResults() {
        const result = state.result;
        $('results').hidden = !result;
        $('empty-view').hidden = !!result;
        if (!result) return;
        const people = new Set(result.sessions.map(s => s.id)).size;
        $('totals').textContent = `${groupTitle()}: ${plural(people, 'participant')}, ${plural(result.sessions.length, 'session')}, ${plural(result.blocks.length, 'block')}, ${plural(result.rows.length, 'trial')}`;
        const c = state.comparison;
        $('comparison').classList.toggle('bad', comparisonNeedsConfirm());
        if (!c) $('comparison').textContent = 'This will be the first master for this group.';
        else if (!c.comparable) $('comparison').textContent = 'The current master has different columns, so it could not be compared with these sessions.';
        else $('comparison').textContent = `${plural(c.addedParticipants, 'new participant')}, ${plural(c.added, 'new trial')}, and ${plural(c.changed + c.missing, 'existing row')} changed.`;
        const changes = c && c.comparable && c.changed + c.missing ? c.examples.concat(c.changed + c.missing > c.examples.length ? [c.changed + c.missing - c.examples.length === 1 ? 'There is 1 more.' : `There are ${(c.changed + c.missing - c.examples.length).toLocaleString('en-GB')} more.`] : []) : [];
        fillList('changes', 'changes-list', changes);
        renderLayout(result);
        fillList('stops', 'stops-list', result.stops);
        fillList('group-mismatch', 'group-mismatch-list', result.groupMismatches);
        fillList('warnings', 'warnings-list', result.warnings);
        fillList('notes', 'notes-list', result.notes);
        fillList('set-aside', 'set-aside-list', result.setAside.map(item => `${item.name}: ${item.reason}`));
    }

    function canLeave(n) {
        if (n === 1) return allTicked(1);
        if (n === 2) return !!state.root && state.folderOk;
        if (n === 3) return !!state.group;
        if (n === 4) return allTicked(4) && state.zipCount > 0;
        if (n === 5) return !!state.result && state.result.rows.length > 0 && state.result.stops.length === 0 && allTicked(5);
        if (n === 6) return state.saved;
        return allTicked(7) && !state.finished;
    }

    function render() {
        STEPS.forEach(n => {
            const el = stepEl(n);
            el.classList.toggle('open', state.open === n);
            el.classList.toggle('current', state.reached === n && !state.finished);
            el.classList.toggle('done', n < state.reached || state.finished);
            el.querySelector('.step-head').disabled = n > state.reached || state.busy;
            el.querySelector(`[data-next="${n}"]`).disabled = state.busy || !canLeave(n);
        });
        stepEl(2).querySelector('.step-val').textContent = state.reached > 2 && state.root ? state.root.name : '';
        stepEl(3).querySelector('.step-val').textContent = state.reached > 3 && state.group ? groupTitle() : '';
        stepEl(4).querySelector('.step-val').textContent = state.reached > 4 ? plural(state.zipCount, 'ZIP file') : '';
        $('g2-again').hidden = !state.remembered || !!state.root;
        $('g2-again').textContent = state.remembered ? `Use ${state.remembered.name} again` : '';
        $('g2-choose').disabled = $('g2-setup').disabled = $('g2-again').disabled = $('g4-recheck').disabled = state.busy;
        if (state.group && state.root) {
            const names = outputNames();
            $('g4-path').textContent = zipsPath();
            $('g6-path').textContent = `${state.root.name}/${state.group}/${names.master}`;
            $('g6-save').textContent = `Save ${names.master}`;
        }
        $('g6-say').textContent = comparisonUnchanged() ? 'The master is already up to date.' : 'Save the master file here.';
        $('g6-save').hidden = comparisonUnchanged();
        $('g6-save').disabled = state.busy || state.saved;
        document.querySelectorAll('[data-group]').forEach(button => button.classList.toggle('on', button.dataset.group === state.group));
        $('g7-again').hidden = !state.finished;
    }

    function resetAfter(n) {
        state.reached = Math.min(state.reached, n);
        state.open = n;
        state.finished = false;
        STEPS.filter(s => s > n).forEach(s => stepEl(s).querySelectorAll('.g-tick input').forEach(input => { input.checked = false; }));
        if (n < 2) { state.root = null; state.folderOk = false; setMsg('g2-msg', ''); $('g2-setup').hidden = true; }
        if (n < 3) state.group = '';
        if (n < 4) { state.zipCount = 0; setMsg('g4-msg', ''); }
        if (n < 5) {
            state.exports = [];
            state.result = null;
            state.comparison = null;
            state.masterText = null;
            $('g5-warned').hidden = true;
            $('g5-group').hidden = true;
            $('g5-changes').hidden = true;
            setMsg('g5-msg', '');
            renderResults();
        }
        if (n < 6) { state.saved = false; setMsg('g6-msg', ''); }
        setMsg('g7-msg', '');
    }

    async function listFolder(dir) {
        const dirs = [], files = [];
        for await (const [name, handle] of dir.entries()) (handle.kind === 'directory' ? dirs : files).push(name);
        return { dirs, files };
    }

    function openHandleStore() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('webspheres-analysis', 1);
            request.onupgradeneeded = () => request.result.createObjectStore('handles');
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async function rememberFolder(handle) {
        try {
            const db = await openHandleStore();
            db.transaction('handles', 'readwrite').objectStore('handles').put(handle, 'study');
            db.close();
        } catch (e) {}
    }

    async function loadRemembered() {
        try {
            const db = await openHandleStore();
            const handle = await new Promise((resolve) => {
                const request = db.transaction('handles').objectStore('handles').get('study');
                request.onsuccess = () => resolve(request.result || null);
                request.onerror = () => resolve(null);
            });
            db.close();
            state.remembered = handle;
            render();
        } catch (e) {}
    }

    async function inspectFolder() {
        const top = await listFolder(state.root);
        const groups = {};
        for (const group of Object.keys(A.GROUPS)) {
            if (top.dirs.includes(group)) groups[group] = (await listFolder(await state.root.getDirectoryHandle(group))).dirs;
        }
        const check = A.checkStudyFolder({ name: state.root.name, dirs: top.dirs, files: top.files, groups });
        state.folderOk = check.status === 'ok';
        $('g2-setup').hidden = check.status !== 'setup';
        setMsg('g2-msg', check.message, check.status === 'ok' ? 'ok' : check.status === 'setup' ? 'busy' : 'bad');
        if (check.status === 'ok') { state.remembered = state.root; await rememberFolder(state.root); }
    }

    async function useFolder(handle) {
        resetAfter(1);
        state.reached = 2;
        state.open = 2;
        state.root = handle;
        try {
            await inspectFolder();
        } catch (e) {
            state.root = null;
            state.folderOk = false;
            setMsg('g2-msg', 'The folder could not be read. Select it again and grant access when prompted. On a Mac, check your browser\'s permissions under System Settings → Privacy & Security → Files and Folders.', 'bad');
        }
        render();
    }

    async function chooseFolder() {
        let handle;
        try {
            handle = await window.showDirectoryPicker({ id: 'webspheres-study', mode: 'readwrite' });
        } catch (e) {
            if (e.name === 'AbortError') setMsg('g2-msg', 'No folder was selected. If you already chose one, try again and grant access when prompted.', 'busy');
            else setMsg('g2-msg', 'That folder cannot be used. Select the experiment folder inside your GitHub folder.', 'bad');
            return;
        }
        await useFolder(handle);
    }

    async function useRemembered() {
        const handle = state.remembered;
        try {
            if (await handle.requestPermission({ mode: 'readwrite' }) !== 'granted') {
                setMsg('g2-msg', 'Access was not granted. Select the folder again and allow access when prompted.', 'bad');
                return;
            }
        } catch (e) {
            setMsg('g2-msg', 'That folder is no longer available. Select the experiment folder again.', 'bad');
            return;
        }
        await useFolder(handle);
    }

    async function setUpFolder() {
        try {
            for (const group of Object.keys(A.GROUPS)) {
                const dir = await state.root.getDirectoryHandle(group, { create: true });
                await dir.getDirectoryHandle('zips', { create: true });
                await dir.getDirectoryHandle('history', { create: true });
            }
            await inspectFolder();
        } catch (e) {
            setMsg('g2-msg', 'The folders could not be created. Check that your browser has permission to edit this folder.', 'bad');
        }
        render();
    }

    async function zipFiles(group) {
        const zips = await (await state.root.getDirectoryHandle(group)).getDirectoryHandle('zips');
        const files = [];
        for await (const [name, handle] of zips.entries()) {
            if (handle.kind === 'file' && !name.startsWith('.') && /\.zip$/i.test(name)) files.push(handle);
        }
        return Promise.all(files.sort((a, b) => (a.name < b.name ? -1 : 1)).map(handle => handle.getFile()));
    }

    async function strayItems(group) {
        const zips = await (await state.root.getDirectoryHandle(group)).getDirectoryHandle('zips');
        const { dirs, files } = await listFolder(zips);
        return dirs.concat(files.filter(name => !/\.zip$/i.test(name))).filter(name => !name.startsWith('.') && !name.endsWith('.crswap')).sort();
    }

    async function iCloudPlaceholders(group) {
        const groupDir = await state.root.getDirectoryHandle(group);
        const names = (await listFolder(groupDir)).files.concat((await listFolder(await groupDir.getDirectoryHandle('zips'))).files);
        return names.filter(name => /^\..+\.icloud$/.test(name)).map(name => name.slice(1, -7)).sort();
    }

    async function countZips() {
        if (!state.root || !state.group) return;
        try {
            state.zipCount = (await zipFiles(state.group)).length;
            if (state.zipCount) setMsg('g4-msg', `There ${state.zipCount === 1 ? 'is' : 'are'} ${plural(state.zipCount, 'ZIP file')} in this folder.`);
            else setMsg('g4-msg', 'No ZIP files found. Copy the session ZIP files into this folder, then select Check the folder again.', 'bad');
        } catch (e) {
            state.zipCount = 0;
            setMsg('g4-msg', 'The folder could not be read. Go back to step 2 and select it again.', 'bad');
        }
        render();
    }

    async function readText(dir, name) {
        try {
            return await (await (await dir.getFileHandle(name)).getFile()).text();
        } catch (e) {
            if (e.name === 'NotFoundError') return null;
            throw e;
        }
    }

    async function readSessions() {
        state.busy = true;
        render();
        try {
            await countZips();
            if (!state.zipCount) return false;
            setMsg('g4-msg', `Reading ${plural(state.zipCount, 'ZIP file')}…`, 'busy');
            const files = await zipFiles(state.group);
            const other = state.group === 'patients' ? 'controls' : 'patients';
            state.exports = [];
            for (const file of files) state.exports.push(await A.readExport(file));
            const otherExports = [];
            for (const file of await zipFiles(other)) otherExports.push(await A.readExport(file, { infoOnly: true }));
            const result = A.build(state.exports, { includePractice, group: state.group });
            result.stops.push(...A.crossGroupStops(state.group, state.exports, other, otherExports));
            const stray = await strayItems(state.group);
            if (stray.length) result.warnings.push(`The following items in the ${state.group} zips folder were skipped because they are not ZIP files: ${stray.join(', ')}. Loose files and files inside subfolders are not included. If any of these are sessions, copy the original ZIP files into this folder.`);
            const notDownloaded = await iCloudPlaceholders(state.group);
            if (notDownloaded.length) result.stops.push(`The following files are stored in iCloud but have not been downloaded to this computer: ${notDownloaded.join(', ')}. Download them in Finder, then read the sessions again.`);
            state.result = result;
            const groupDir = await state.root.getDirectoryHandle(state.group);
            const old = await readText(groupDir, outputNames().master);
            state.masterText = old;
            state.comparison = old === null ? null : A.compareMaster(old, result.rows);
            setMsg('g4-msg', `${plural(state.zipCount, 'ZIP file')} read.`);
            $('g5-warned').hidden = !result.warnings.length;
            $('g5-group').hidden = !result.groupMismatches.length;
            $('g5-changes').hidden = !comparisonNeedsConfirm();
            if (result.stops.length) setMsg('g5-msg', 'Resolve the problem on the right, then return to step 4 and read the sessions again.', 'bad');
            else if (!result.rows.length) setMsg('g5-msg', 'No usable trials were found. See the list on the right.', 'bad');
            else setMsg('g5-msg', '');
            renderResults();
            return true;
        } catch (e) {
            setMsg('g4-msg', 'The sessions could not be read. Go back to step 2 and select the folder again.', 'bad');
            return false;
        } finally {
            state.busy = false;
            render();
        }
    }

    async function writeText(dir, name, text) {
        const writable = await (await dir.getFileHandle(name, { create: true })).createWritable();
        await writable.write(text);
        await writable.close();
    }

    async function historyName(history, name, stamp) {
        const dot = name.lastIndexOf('.');
        const existing = (await listFolder(history)).files;
        let candidate = `${name.slice(0, dot)}-${stamp}${name.slice(dot)}`;
        for (let i = 2; existing.includes(candidate); i++) candidate = `${name.slice(0, dot)}-${stamp}-${i}${name.slice(dot)}`;
        return candidate;
    }

    async function save() {
        state.busy = true;
        setMsg('g6-msg', 'Saving…', 'busy');
        render();
        const replaced = [];
        let groupDir, history;
        try {
            groupDir = await state.root.getDirectoryHandle(state.group);
            if (await readText(groupDir, outputNames().master) !== state.masterText) {
                setMsg('g6-msg', 'The master has changed since the sessions were read, so nothing was saved. Go back to step 4 and read the sessions again.', 'bad');
                return;
            }
            const created = new Date();
            const stamp = created.toISOString().slice(0, 19).replace(/:/g, '-');
            await A.addChecksums(state.exports);
            const files = A.outputFiles(state.exports, state.result, created.toISOString(), state.group, includePractice);
            history = await groupDir.getDirectoryHandle('history', { create: true });
            for (const file of files) {
                const old = await readText(groupDir, file.path);
                const copy = old === null ? '' : await historyName(history, file.path, stamp);
                if (copy) await writeText(history, copy, old);
                replaced.push({ path: file.path, old, copy });
            }
            for (const file of files) await writeText(groupDir, file.path, file.parts[0]);
            if (await readText(groupDir, files[0].path) !== files[0].parts[0]) throw new Error('read-back mismatch');
            state.saved = true;
            setMsg('g6-msg', `Saved ${files[0].path} with ${plural(state.result.rows.length, 'trial')}.`, 'ok');
        } catch (e) {
            const restored = await restoreFiles(groupDir, history, replaced);
            setMsg('g6-msg', restored
                ? 'The master could not be saved, and any changes were undone. The ZIP files were not changed. Check your browser\'s permission to edit the folder, then try again.'
                : 'Saving failed, and some previous files could not be restored. Backup copies are in the history folder. The ZIP files were not changed.', 'bad');
        } finally {
            state.busy = false;
            render();
        }
    }

    async function restoreFiles(groupDir, history, replaced) {
        let restored = true;
        for (const item of replaced) {
            try {
                if (item.old === null) await groupDir.removeEntry(item.path).catch(e => { if (e.name !== 'NotFoundError') throw e; });
                else await writeText(groupDir, item.path, item.old);
                if (item.copy) await history.removeEntry(item.copy);
            } catch (e) {
                restored = false;
            }
        }
        return restored;
    }

    async function next(n) {
        if (!canLeave(n)) return;
        if (n === 4) {
            resetAfter(4);
            if (!(await readSessions())) return;
        }
        if (n === 5 && comparisonUnchanged()) state.saved = true;
        if (n === 7) {
            state.finished = true;
            setMsg('g7-msg', `All steps are complete for ${groupTitle()}.`, 'ok');
            render();
            return;
        }
        state.reached = Math.max(state.reached, n + 1);
        state.open = n + 1;
        render();
        if (n === 3) countZips();
    }

    function chooseGroup(group) {
        if (state.group !== group) {
            resetAfter(3);
            state.group = group;
        }
        render();
    }

    if (!WebSpheresBrowser.supported() || WebSpheresBrowser.embedded() || typeof window.showDirectoryPicker !== 'function') {
        $('browser-stop').hidden = false;
        $('steps').hidden = true;
        $('empty-view').hidden = true;
        return;
    }

    $('practice-banner').hidden = !includePractice;
    document.querySelectorAll('[data-open]').forEach(button => button.addEventListener('click', () => { state.open = +button.dataset.open; render(); }));
    document.querySelectorAll('[data-next]').forEach(button => button.addEventListener('click', () => next(+button.dataset.next)));
    document.querySelectorAll('[data-group]').forEach(button => button.addEventListener('click', () => chooseGroup(button.dataset.group)));
    document.querySelectorAll('.g-tick input').forEach(input => input.addEventListener('change', () => {
        const n = +input.closest('.step').dataset.step;
        if (!input.checked && (state.reached > n || state.finished)) {
            resetAfter(n);
            input.checked = false;
        }
        render();
    }));
    $('g2-choose').addEventListener('click', chooseFolder);
    $('g2-again').addEventListener('click', useRemembered);
    $('g2-setup').addEventListener('click', setUpFolder);
    $('g4-recheck').addEventListener('click', countZips);
    $('g6-save').addEventListener('click', save);
    $('g7-restart').addEventListener('click', () => {
        resetAfter(0);
        state.reached = 1;
        state.open = 1;
        render();
    });
    render();
    loadRemembered();
})();
