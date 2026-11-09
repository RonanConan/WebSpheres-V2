(() => {
    const $ = (id) => document.getElementById(id);
    const state = { files: [], exports: [], ignored: 0, result: null };

    try {
        const textSize = JSON.parse(localStorage.getItem('webspheres-observer-settings') || '{}').textSize;
        if ([1, 1.2, 1.4].includes(textSize)) document.documentElement.style.setProperty('--scale', textSize);
    } catch (e) {}

    const plural = (n, word) => `${n.toLocaleString('en-GB')} ${word}${n === 1 ? '' : 's'}`;
    const fileKey = (f) => `${f.webkitRelativePath || f.relativeName || f.name}|${f.size}|${f.lastModified}`;
    const isZip = (f) => /\.zip$/i.test(f.name);

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

    function phaseText(phase) {
        return { 'pre-boost': 'Pre-boost', boost: 'Boost', 'post-boost': 'Post-boost', 'no-boost': 'No boost', unknown: 'Unknown' }[phase];
    }

    function tile(item) {
        const classes = ['tile'];
        if (item.type === 'boost') classes.push('boost');
        if (!item.block) classes.push('nodata');
        const el = element('div', '');
        el.appendChild(element('div', 'tile-name', item.name));
        if (!item.block) {
            el.appendChild(element('div', 'tile-detail', 'No data found'));
        } else {
            const count = item.block.table.length;
            const planned = parseInt(item.block.info.TotalTrials, 10);
            const short = planned > count;
            if (short) classes.push('partial');
            el.appendChild(element('div', 'tile-count', short ? `${count} of ${planned} trials` : plural(count, 'trial')));
            el.appendChild(element('div', 'tile-detail', phaseText(item.phase)));
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

    function render() {
        const result = WebSpheresAnalysis.build(state.exports, { includePractice: $('include-practice').checked });
        state.result = result;
        const people = new Set(result.sessions.map(s => s.id)).size;
        $('results').hidden = false;
        $('totals').textContent = `${plural(people, 'participant')}, ${plural(result.sessions.length, 'session')}, ${plural(result.blocks.length, 'block')}, ${plural(result.rows.length, 'trial')}`;
        $('check-line').hidden = !result.rows.length;
        $('download').disabled = !result.rows.length || result.stops.length > 0;
        $('download-note').textContent = '';
        renderLayout(result);
        fillList('stops', 'stops-list', result.stops);
        fillList('warnings', 'warnings-list', result.warnings);
        fillList('notes', 'notes-list', result.notes);
        const aside = result.setAside.map(item => `${item.name}: ${item.reason}`);
        if (state.ignored) aside.push(`${plural(state.ignored, 'other file')} in the selection ${state.ignored === 1 ? 'was' : 'were'} not a zip.`);
        fillList('set-aside', 'set-aside-list', aside);
        const hasPractice = result.practiceLeftOut > 0 || $('include-practice').checked;
        $('practice-row').hidden = !hasPractice;
        $('practice-text').textContent = result.practiceLeftOut > 0
            ? `Include practice sessions (${plural(result.practiceLeftOut, 'practice block')} left out)`
            : 'Include practice sessions';
    }

    async function addFiles(files) {
        const known = new Set(state.files.map(fileKey));
        const zips = files.filter(isZip).filter(f => !known.has(fileKey(f)));
        state.ignored += files.filter(f => !isZip(f)).length;
        $('status').classList.remove('bad');
        if (!zips.length) {
            if (!state.files.length) {
                $('status').textContent = 'No zip files were found. Choose the zips saved by the Observer or the headset.';
                $('status').classList.add('bad');
            }
            return;
        }
        $('status').textContent = `Reading ${plural(zips.length, 'zip file')}.`;
        for (const file of zips) {
            state.files.push(file);
            state.exports.push(await WebSpheresAnalysis.readExport(file));
        }
        $('status').textContent = '';
        $('start-again').hidden = false;
        render();
    }

    function startAgain() {
        state.files = [];
        state.exports = [];
        state.ignored = 0;
        state.result = null;
        $('include-practice').checked = false;
        $('results').hidden = true;
        $('start-again').hidden = true;
        $('status').textContent = '';
        $('pick-files').value = '';
        $('pick-folder').value = '';
    }

    async function download() {
        $('download').disabled = true;
        const created = new Date();
        const stamp = created.toISOString().slice(0, 19).replace(/:/g, '-');
        const name = `handDB-${stamp}.zip`;
        const blob = await WebSpheresZip.make(WebSpheresAnalysis.outputFiles(state.exports, state.result, created.toISOString()));
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = name;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        $('download-note').textContent = `Download started: ${name}`;
        $('download').disabled = false;
    }

    function readEntry(entry) {
        if (entry.isFile) return new Promise((resolve) => entry.file((f) => resolve([f]), () => resolve([])));
        return new Promise((resolve) => {
            const reader = entry.createReader();
            const all = [];
            const next = () => reader.readEntries(async (batch) => {
                if (!batch.length) {
                    const nested = await Promise.all(all.map(readEntry));
                    resolve(nested.flat());
                    return;
                }
                all.push(...batch);
                next();
            }, () => resolve([]));
            next();
        });
    }

    async function droppedFiles(transfer) {
        const entries = Array.from(transfer.items || []).map(item => item.webkitGetAsEntry && item.webkitGetAsEntry()).filter(Boolean);
        if (!entries.length) return Array.from(transfer.files);
        return (await Promise.all(entries.map(readEntry))).flat();
    }

    $('choose-files').addEventListener('click', () => $('pick-files').click());
    $('choose-folder').addEventListener('click', () => $('pick-folder').click());
    $('start-again').addEventListener('click', startAgain);
    $('download').addEventListener('click', download);
    $('include-practice').addEventListener('change', render);
    ['pick-files', 'pick-folder'].forEach(id => $(id).addEventListener('change', (e) => {
        addFiles(Array.from(e.target.files));
        e.target.value = '';
    }));
    document.addEventListener('dragover', (e) => { e.preventDefault(); $('drop').classList.add('over'); });
    document.addEventListener('dragleave', (e) => { if (!e.relatedTarget) $('drop').classList.remove('over'); });
    document.addEventListener('drop', async (e) => {
        e.preventDefault();
        $('drop').classList.remove('over');
        addFiles(await droppedFiles(e.dataTransfer));
    });
})();
