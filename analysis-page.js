(() => {
    const $ = (id) => document.getElementById(id);
    const A = WebSpheresAnalysis;
    const STEPS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    const ZIPS_AT_ONCE = 8;
    const QUIET_CHECK_MS = 30000;
    const QUIET_CHECKS_ALLOWED = 20;
    const includePractice = /[?&]practice\b/.test(location.search);
    const state = { open: 1, reached: 1, busy: false, root: null, remembered: null, folderOk: false, group: '', zipCount: 0, exports: [], result: null, comparison: null, saved: false, finished: false, masterText: null, kin: null, kinFailed: false, kinComparison: null, kinMasterText: null, upToDate: false, psych: null, psychShown: [], propComparison: null, pseComparison: null, propMasterText: null, pseMasterText: null };

    try {
        const textSize = JSON.parse(localStorage.getItem('webspheres-observer-settings') || '{}').textSize;
        if ([1, 1.2, 1.4].includes(textSize)) document.documentElement.style.setProperty('--scale', textSize);
    } catch (e) {}

    const plural = (n, word) => `${n.toLocaleString('en-GB')} ${word}${n === 1 ? '' : 's'}`;
    const reaches = (n, label = '') => `${n.toLocaleString('en-GB')} ${label}${n === 1 ? 'reach' : 'reaches'}`;
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

    const needsConfirm = (c) => !!c && (!c.comparable || c.changed > 0 || c.missing > 0);

    function changeList(c) {
        if (!c || !c.comparable || !(c.changed + c.missing)) return [];
        const more = c.changed + c.missing - c.examples.length;
        return c.examples.concat(more > 0 ? [more === 1 ? 'There is 1 more.' : `There are ${more.toLocaleString('en-GB')} more.`] : []);
    }

    function renderKinematics() {
        const k = state.kin;
        $('kinematics').hidden = !k;
        if (!k) {
            ['kin-problems', 'kin-changes', 'kin-reasons'].forEach(id => { $(id).hidden = true; });
            return;
        }
        $('kin-totals').textContent = `${k.summary.trials_valid_core.toLocaleString('en-GB')} of ${plural(k.summary.trials_total, 'trial')} passed the quality checks. ${outputNames().kinematics} will contain ${reaches(k.masterRows)}.`;
        const c = state.kinComparison;
        $('kin-comparison').classList.toggle('bad', needsConfirm(c));
        if (!c) $('kin-comparison').textContent = 'This will be the first kinematics master for this group.';
        else if (!c.comparable) $('kin-comparison').textContent = 'The current kinematics master has different columns, so it could not be compared with these sessions.';
        else $('kin-comparison').textContent = `${reaches(c.added, 'new ')}, and ${plural(c.changed + c.missing, 'existing row')} changed.`;
        fillList('kin-problems', 'kin-problems-list', A.kinematicsProblems(k));
        fillList('kin-changes', 'kin-changes-list', changeList(c));
        fillList('kin-reasons', 'kin-reasons-list', k.reasons.map(item => `${item.qc_reason}: ${plural(+item.trials, 'trial')}`));
    }

    const CM = 72 / 2.54;
    const FIGURE = { width: 7, height: 6.5, dpi: 300 };
    const handWord = () => (state.group === 'patients' ? 'more affected hand' : 'non-dominant hand');
    const capitalise = (text) => text.charAt(0).toUpperCase() + text.slice(1);
    const blockLabel = (row) => `${row.ID || '(no ID)'}, session ${row.Session}, ${row.Block}`;
    const escapeXml = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const round = (value) => Math.round(value * 100) / 100;

    function pseFigureSvg(row) {
        const width = FIGURE.width * CM, height = FIGURE.height * CM;
        const left = 1.6 * CM, right = 0.35 * CM, top = 0.75 * CM, bottom = 1.25 * CM;
        const xMin = 0.65, xMax = 11.35, yMin = -5, yMax = 104;
        const sx = (x) => round(left + (x - xMin) / (xMax - xMin) * (width - left - right));
        const sy = (y) => round(top + (yMax - y) / (yMax - yMin) * (height - top - bottom));
        const line = (x1, y1, x2, y2, extra) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="black" stroke-width="0.5"${extra || ''}/>`;
        const text = (x, y, size, content, extra) => `<text x="${round(x)}" y="${round(y)}" font-size="${size}"${extra || ''}>${escapeXml(content)}</text>`;
        const axisY = sy(yMin), axisX = sx(xMin);
        const parts = [`<rect width="${round(width)}" height="${round(height)}" fill="white"/>`, text(0.15 * CM, 0.45 * CM, 8, blockLabel(row))];
        if (row.PSE !== null && !row.PSE_bounded) {
            const dash = ' stroke="#404040" stroke-width="0.7" stroke-dasharray="1.5 1.5"';
            parts.push(`<line x1="${axisX}" y1="${sy(50)}" x2="${sx(row.PSE)}" y2="${sy(50)}"${dash}/>`, `<line x1="${sx(row.PSE)}" y1="${sy(50)}" x2="${sx(row.PSE)}" y2="${axisY}"${dash}/>`);
        }
        if (row.coef) {
            const points = Array.from({ length: 100 }, (_, i) => 1 + i * 10 / 99).map(x => `${sx(x)},${sy(100 / (1 + Math.exp(-(row.coef[0] + row.coef[1] * x))))}`);
            parts.push(`<polyline points="${points.join(' ')}" fill="none" stroke="black" stroke-width="1.2"/>`);
        }
        row.points.filter(point => point.Proportion !== null).forEach(point => parts.push(`<circle cx="${sx(point.Target)}" cy="${sy(point.Proportion)}" r="3" fill="black"/>`));
        parts.push(line(axisX, axisY, sx(11), axisY), line(axisX, axisY, axisX, sy(100)));
        for (let target = 1; target <= 11; target++) parts.push(line(sx(target), axisY, sx(target), axisY + 3.5), text(sx(target), axisY + 13, 8, target, ' text-anchor="middle"'));
        [0, 25, 50, 75, 100].forEach(value => parts.push(line(axisX - 3.5, sy(value), axisX, sy(value)), text(axisX - 5.5, sy(value) + 2.8, 8, value, ' text-anchor="end"')));
        parts.push(text(sx(6), height - 0.2 * CM, 9, 'Target', ' text-anchor="middle"'));
        const middle = (sy(100) + axisY) / 2;
        parts.push(text(0.42 * CM, middle, 9, `${capitalise(handWord())} use (%)`, ` text-anchor="middle" transform="rotate(-90 ${round(0.42 * CM)} ${round(middle)})"`));
        return `<svg xmlns="http://www.w3.org/2000/svg" width="${FIGURE.width}cm" height="${FIGURE.height}cm" viewBox="0 0 ${round(width)} ${round(height)}" font-family="Arial, Helvetica, sans-serif">${parts.join('')}</svg>`;
    }

    function startDownload(name, blob) {
        const url = URL.createObjectURL(blob);
        const link = element('a');
        link.href = url;
        link.download = name;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        setMsg('g6-msg', `The download of ${name} started.`, 'ok');
    }

    function pngFrom(svg) {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
            const image = new Image();
            image.onload = () => {
                const canvas = element('canvas');
                canvas.width = Math.round(FIGURE.width / 2.54 * FIGURE.dpi);
                canvas.height = Math.round(FIGURE.height / 2.54 * FIGURE.dpi);
                const context = canvas.getContext('2d');
                context.fillStyle = 'white';
                context.fillRect(0, 0, canvas.width, canvas.height);
                context.drawImage(image, 0, 0, canvas.width, canvas.height);
                URL.revokeObjectURL(url);
                canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('png'))), 'image/png');
            };
            image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('svg')); };
            image.src = url;
        });
    }

    function figureName(row, extension) {
        return `${includePractice ? 'PRACTICE_' : ''}PSE_${state.group}_${row.ID || 'no-ID'}_session${row.Session}_${row.Block}.${extension}`;
    }

    function figureCard(row) {
        const svg = pseFigureSvg(row);
        const card = element('figure', 'pse-figure');
        card.appendChild(element('figcaption', '', blockLabel(row)));
        const holder = element('div', 'pse-svg');
        holder.innerHTML = svg;
        card.appendChild(holder);
        const actions = element('div', 'pse-actions');
        const saveSvg = element('button', '', 'Save SVG');
        saveSvg.addEventListener('click', () => startDownload(figureName(row, 'svg'), new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n${svg}`], { type: 'image/svg+xml' })));
        const savePng = element('button', '', 'Save PNG');
        savePng.addEventListener('click', () => pngFrom(svg).then(blob => startDownload(figureName(row, 'png'), blob), () => setMsg('g6-msg', 'The PNG could not be made. Save the SVG instead.', 'bad')));
        actions.append(saveSvg, savePng);
        card.appendChild(actions);
        return card;
    }

    function pseNote(row) {
        if (!row.TargetedHand) return `The ${handWord()} is not known.`;
        if (row.PSE_bounded) return `Outside targets 1 to 11 (${round(row.PSE_raw)}), so set to ${row.PSE}.`;
        if (row.PSE === null && row.PSE_raw !== null) return 'The curve is too flat to fit, so there is no PSE.';
        if (row.PSE === null) return 'Too few targets to fit a curve, so there is no PSE.';
        return '';
    }

    function tableOf(headings, rows) {
        const table = element('table', 'data');
        const head = element('tr');
        headings.forEach(heading => head.appendChild(element('th', '', heading)));
        table.appendChild(element('thead')).appendChild(head);
        const body = element('tbody');
        rows.forEach(cells => {
            const tr = element('tr');
            cells.forEach(cell => {
                const td = element('td', '', cell.text === undefined ? cell : cell.text);
                if (cell.title) td.title = cell.title;
                tr.appendChild(td);
            });
            body.appendChild(tr);
        });
        table.appendChild(body);
        return table;
    }

    function proportionCell(row, target) {
        const point = row.points.find(item => item.Target === target);
        if (!point) return { text: '', title: 'No reaches to this target' };
        if (point.Proportion === null) return { text: '–', title: `${reaches(point.total_trials)}, with a skipped trial or an unknown hand, so this target is left out of the fit` };
        return { text: String(Math.round(point.Proportion)), title: `${point.targeted_hits} of ${reaches(point.total_trials)}` };
    }

    function renderPsych() {
        const tables = state.psych;
        $('psych').hidden = !tables;
        if (!tables) {
            ['psych-problems', 'psych-changes'].forEach(id => { $(id).hidden = true; });
            return;
        }
        const shown = state.psychShown;
        const c = state.pseComparison;
        const confirm = needsConfirm(state.propComparison) || needsConfirm(c);
        $('psych-comparison').classList.toggle('bad', confirm);
        if (!c) $('psych-comparison').textContent = 'These will be the first proportions and PSE masters for this group.';
        else if (!c.comparable || !state.propComparison || !state.propComparison.comparable) $('psych-comparison').textContent = 'A current proportions or PSE master has different columns, so it could not be compared with these sessions.';
        else $('psych-comparison').textContent = `${plural(c.added, 'new block')}, and ${plural(c.changed + c.missing + state.propComparison.changed + state.propComparison.missing, 'existing row')} changed.`;
        $('psych-hand').textContent = `Percentage of reaches made with the ${handWord()} at each target. A dash means the target had a skipped trial, so it is left out of the fit, as in the R script.`;
        $('psych-shown').hidden = !shown.length;
        $('prop-table').replaceChildren(tableOf(['Participant', 'Session', 'Block', ...Array.from({ length: 11 }, (_, i) => String(i + 1))], shown.map(row => [row.ID, String(row.Session), row.Block, ...Array.from({ length: 11 }, (_, i) => proportionCell(row, i + 1))])));
        $('pse-table').replaceChildren(tableOf(['Participant', 'Session', 'Block', 'PSE', 'Note'], shown.map(row => [row.ID, String(row.Session), row.Block, row.PSE === null ? '' : row.PSE.toFixed(2), pseNote(row)])));
        $('pse-figures').replaceChildren(...shown.map(figureCard));
        fillList('psych-problems', 'psych-problems-list', A.pseProblems(tables, state.group));
        fillList('psych-changes', 'psych-changes-list', changeList(state.propComparison).concat(changeList(c)));
    }

    async function preparePsych() {
        const tables = A.pseTables(state.result);
        const names = outputNames();
        const groupDir = await state.root.getDirectoryHandle(state.group);
        const oldProportions = await readText(groupDir, names.proportions);
        const oldPse = await readText(groupDir, names.pse);
        state.psych = tables;
        state.propMasterText = oldProportions;
        state.pseMasterText = oldPse;
        state.propComparison = oldProportions === null ? null : A.compareProportions(oldProportions, tables.proportions);
        state.pseComparison = oldPse === null ? null : A.comparePse(oldPse, tables.pse);
        state.psychShown = state.pseComparison && state.pseComparison.comparable ? state.pseComparison.addedRows : tables.pse;
        $('g6-problems').hidden = !A.pseProblems(tables, state.group).length;
        $('g6-changes').hidden = !(needsConfirm(state.propComparison) || needsConfirm(state.pseComparison));
        const people = new Set(state.psychShown.map(row => row.ID)).size;
        setMsg('g6-msg', state.psychShown.length ? `Showing ${plural(state.psychShown.length, 'block')} from ${plural(people, 'participant')} added in this run.` : 'No blocks were added in this run. Every participant is in the proportions and PSE masters.');
        renderPsych();
    }

    function renderResults() {
        const result = state.result;
        $('results').hidden = !result;
        $('empty-view').hidden = !!result;
        if (!result) return;
        const people = new Set(result.sessions.map(s => s.id)).size;
        $('totals').textContent = `${groupTitle()}: ${plural(people, 'participant')}, ${plural(result.sessions.length, 'session')}, ${plural(result.blocks.length, 'block')}, ${plural(result.rows.length, 'trial')}`;
        const c = state.comparison;
        $('comparison').classList.toggle('bad', needsConfirm(c));
        if (!c) $('comparison').textContent = 'This will be the first master for this group.';
        else if (!c.comparable) $('comparison').textContent = 'The current master has different columns, so it could not be compared with these sessions.';
        else $('comparison').textContent = `${plural(c.addedParticipants, 'new participant')}, ${plural(c.added, 'new trial')}, and ${plural(c.changed + c.missing, 'existing row')} changed.`;
        fillList('changes', 'changes-list', changeList(c));
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
        if (n === 6) return !!state.psych && allTicked(6);
        if (n === 7) return (!!state.kin || state.kinFailed) && allTicked(7);
        if (n === 8) return state.saved;
        return allTicked(9) && !state.finished;
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
        document.querySelectorAll('.g-tick input').forEach(input => { input.disabled = state.busy; });
        $('g2-choose').disabled = $('g2-setup').disabled = $('g2-again').disabled = $('g4-recheck').disabled = state.busy;
        if (state.group && state.root) {
            const names = outputNames();
            $('g4-path').textContent = zipsPath();
            $('g8-path').textContent = `${state.root.name}/${state.group}/${names.master}`;
            $('g8-path-kin').textContent = `${state.root.name}/${state.group}/${names.kinematics}`;
            $('g8-path-prop').textContent = `${state.root.name}/${state.group}/${names.proportions}`;
            $('g8-path-pse').textContent = `${state.root.name}/${state.group}/${names.pse}`;
            $('g8-save').textContent = state.kinFailed ? 'Save the handDB master' : 'Save the master files';
        }
        $('g8-say').textContent = state.upToDate ? 'The master files are already up to date.' : state.kinFailed ? 'Save the handDB master here. The kinematics master will not be updated.' : 'Save the master files here.';
        $('g8-path-kin').hidden = state.kinFailed;
        $('g8-save').hidden = state.upToDate;
        $('g7-run').disabled = state.busy || !!state.kin;
        $('g8-save').disabled = state.busy || state.saved;
        document.querySelectorAll('[data-group]').forEach(button => button.classList.toggle('on', button.dataset.group === state.group));
        $('g9-again').hidden = !state.finished;
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
        if (n < 6) {
            state.psych = null;
            state.psychShown = [];
            state.propComparison = null;
            state.pseComparison = null;
            state.propMasterText = null;
            state.pseMasterText = null;
            $('g6-problems').hidden = true;
            $('g6-changes').hidden = true;
            setMsg('g6-msg', '');
            renderPsych();
        }
        if (n < 7) {
            state.kin = null;
            state.kinFailed = false;
            state.kinComparison = null;
            state.kinMasterText = null;
            $('g7-failed').hidden = true;
            $('g7-problems').hidden = true;
            $('g7-changes').hidden = true;
            setMsg('g7-msg', '');
            renderKinematics();
        }
        if (n < 8) { state.saved = false; state.upToDate = false; setMsg('g8-msg', ''); }
        setMsg('g9-msg', '');
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
        const group = state.group;
        try {
            const count = (await zipFiles(group)).length;
            if (group !== state.group) return;
            state.zipCount = count;
            if (state.zipCount) setMsg('g4-msg', `There ${state.zipCount === 1 ? 'is' : 'are'} ${plural(state.zipCount, 'ZIP file')} in this folder.`);
            else setMsg('g4-msg', 'No ZIP files found. Copy the session ZIP files into this folder, then select Check the folder again.', 'bad');
        } catch (e) {
            if (group !== state.group) return;
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

    async function readBytes(dir, name) {
        try {
            return new Uint8Array(await (await (await dir.getFileHandle(name)).getFile()).arrayBuffer());
        } catch (e) {
            if (e.name === 'NotFoundError') return null;
            throw e;
        }
    }

    const sameBytes = (a, b) => a.length === b.length && a.every((value, i) => value === b[i]);

    async function readZips(files, options) {
        const read = [];
        for (let i = 0; i < files.length; i += ZIPS_AT_ONCE) read.push(...await Promise.all(files.slice(i, i + ZIPS_AT_ONCE).map(file => A.readExport(file, options))));
        return read;
    }

    async function changedZip() {
        for (const zip of state.exports) {
            try {
                await zip.file.slice(0, 1).arrayBuffer();
            } catch (e) {
                return zip.name;
            }
        }
        return '';
    }

    const zipChanged = (name, outcome) => `${name} has changed or been removed since the sessions were read, so ${outcome}. Go back to step 4 and read the sessions again.`;

    async function readSessions() {
        state.busy = true;
        render();
        try {
            await countZips();
            if (!state.zipCount) return false;
            setMsg('g4-msg', `Reading ${plural(state.zipCount, 'ZIP file')}…`, 'busy');
            const files = await zipFiles(state.group);
            const other = state.group === 'patients' ? 'controls' : 'patients';
            state.exports = await readZips(files);
            const otherExports = await readZips(await zipFiles(other), { infoOnly: true });
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
            $('g5-changes').hidden = !needsConfirm(state.comparison);
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

    function runKinematics(job) {
        return new Promise((resolve, reject) => {
            const worker = new Worker('analysis-kinematics-worker.js', { type: 'module' });
            let quietChecks = 0, calculating = false;
            const watchdog = setInterval(() => {
                if (calculating) quietChecks++;
                if (quietChecks >= QUIET_CHECKS_ALLOWED) finish(reject, new Error('The kinematics program stopped responding.'));
            }, QUIET_CHECK_MS);
            const finish = (settle, value) => { clearInterval(watchdog); worker.terminate(); settle(value); };
            worker.onerror = (event) => finish(reject, new Error(event.message || 'The kinematics program could not start.'));
            worker.onmessageerror = () => finish(reject, new Error('The kinematics program sent a message that could not be read.'));
            worker.onmessage = ({ data }) => {
                quietChecks = 0;
                if (data.type === 'status' && data.stage === 'calculating') calculating = true;
                if (data.type === 'status') setMsg('g7-msg', data.stage === 'loading' ? 'Loading the kinematics program…' : 'Starting the calculation…', 'busy');
                if (data.type === 'progress') setMsg('g7-msg', `Calculating block ${data.completed.toLocaleString('en-GB')} of ${data.total.toLocaleString('en-GB')}…`, 'busy');
                if (data.type === 'done') finish(resolve, data);
                if (data.type === 'failed') finish(reject, new Error(data.message));
            };
            worker.postMessage(job);
        });
    }

    async function calculateKinematics() {
        resetAfter(7);
        state.kinFailed = false;
        $('g7-failed').hidden = true;
        $('g7-failed').querySelector('input').checked = false;
        state.busy = true;
        setMsg('g7-msg', 'Preparing the blocks…', 'busy');
        render();
        try {
            const changed = await changedZip();
            if (changed) {
                setMsg('g7-msg', zipChanged(changed, 'nothing was calculated'), 'bad');
                return;
            }
            const plan = A.kinematicsPlan(state.result);
            const run = await runKinematics({ group: state.group, blocks: plan.blocks, dominant: plan.dominant });
            const kinematics = A.readKinematics(run, state.group);
            if (!kinematics.masterRows) throw new Error(['No reach passed the quality checks, so the kinematics master would be empty.', ...A.kinematicsProblems(kinematics).slice(0, 1)].join(' '));
            const old = await readText(await state.root.getDirectoryHandle(state.group), outputNames().kinematics);
            const comparison = old === null ? null : A.compareKinematics(old, kinematics.master);
            state.kin = kinematics;
            state.kinMasterText = old;
            state.kinComparison = comparison;
            $('g7-problems').hidden = !A.kinematicsProblems(kinematics).length;
            $('g7-changes').hidden = !needsConfirm(comparison);
            setMsg('g7-msg', `Calculated ${plural(kinematics.summary.processed_blocks, 'block')}.`, 'ok');
            renderKinematics();
        } catch (e) {
            const changed = await changedZip();
            if (changed) {
                setMsg('g7-msg', zipChanged(changed, 'nothing was calculated'), 'bad');
                return;
            }
            state.kinFailed = true;
            $('g7-failed').hidden = false;
            setMsg('g7-msg', `The kinematics could not be calculated, and nothing was saved. Calculate them again, or tick the box below to save only the handDB master. Details: ${e.message}`, 'bad');
        } finally {
            state.busy = false;
            render();
        }
    }

    async function writeFile(dir, name, data) {
        const writable = await (await dir.getFileHandle(name, { create: true })).createWritable();
        await writable.write(data);
        await writable.close();
    }

    function historyName(taken, name, stamp) {
        const dot = name.lastIndexOf('.') > 0 ? name.lastIndexOf('.') : name.length;
        let candidate = `${name.slice(0, dot)}-${stamp}${name.slice(dot)}`;
        for (let i = 2; taken.has(candidate); i++) candidate = `${name.slice(0, dot)}-${stamp}-${i}${name.slice(dot)}`;
        taken.add(candidate);
        return candidate;
    }

    const withoutCreated = (text) => text.replace(/^Created: .*$/m, '');

    function sameOutput(file, old, bytes) {
        if (sameBytes(old, bytes)) return true;
        return file.path === outputNames().report && withoutCreated(new TextDecoder().decode(old)) === withoutCreated(file.parts[0]);
    }

    async function folderIn(groupDir, name, create) {
        try {
            return await groupDir.getDirectoryHandle(name, { create });
        } catch (e) {
            if (e.name === 'NotFoundError') return null;
            throw e;
        }
    }

    async function plannedChanges(groupDir, files, create) {
        const encoder = new TextEncoder();
        const changes = [], folders = new Map();
        for (const file of files) {
            if (file.folder && !folders.has(file.folder)) folders.set(file.folder, { dir: await folderIn(groupDir, file.folder, create), current: new Set() });
            const dir = file.folder ? folders.get(file.folder).dir : groupDir;
            if (file.folder) folders.get(file.folder).current.add(file.path);
            const bytes = encoder.encode(file.parts[0]);
            const old = dir ? await readBytes(dir, file.path) : null;
            if (!old || !sameOutput(file, old, bytes)) changes.push({ dir, path: file.path, label: file.folder ? `${file.folder}-${file.path}` : file.path, old, bytes });
        }
        for (const [folder, { dir, current }] of folders) {
            if (!dir) continue;
            for (const path of (await listFolder(dir)).files) {
                if (!current.has(path) && !path.startsWith('.') && !path.endsWith('.crswap')) changes.push({ dir, path, label: `${folder}-${path}`, old: await readBytes(dir, path), bytes: null });
            }
        }
        return changes;
    }

    async function pendingChanges(create) {
        const groupDir = await state.root.getDirectoryHandle(state.group);
        await A.addChecksums(state.exports);
        const created = new Date();
        const files = A.outputFiles(state.exports, state.result, created.toISOString(), state.group, includePractice, state.kin);
        return { created, changes: await plannedChanges(groupDir, files, create) };
    }

    async function nothingToSave() {
        try {
            return !(await changedZip()) && !(await pendingChanges(false)).changes.length;
        } catch (e) {
            return false;
        }
    }

    async function save() {
        state.busy = true;
        setMsg('g8-msg', 'Saving…', 'busy');
        render();
        const touched = [];
        let history;
        try {
            const names = outputNames();
            const groupDir = await state.root.getDirectoryHandle(state.group);
            const read = [[names.master, state.masterText], [names.proportions, state.propMasterText], [names.pse, state.pseMasterText], ...(state.kin ? [[names.kinematics, state.kinMasterText]] : [])];
            const unchangedSinceRead = await Promise.all(read.map(async ([name, text]) => (await readText(groupDir, name)) === text));
            if (unchangedSinceRead.includes(false)) {
                setMsg('g8-msg', 'A master file has changed since the sessions were read, so nothing was saved. Go back to step 4 and read the sessions again.', 'bad');
                return;
            }
            const changed = await changedZip();
            if (changed) {
                setMsg('g8-msg', zipChanged(changed, 'nothing was saved'), 'bad');
                return;
            }
            const { created, changes } = await pendingChanges(true);
            const stamp = created.toISOString().slice(0, 19).replace(/:/g, '-');
            history = await groupDir.getDirectoryHandle('history', { create: true });
            const taken = new Set((await listFolder(history)).files);
            for (const item of changes) {
                touched.push(item);
                if (item.old) {
                    item.copy = historyName(taken, item.label, stamp);
                    await writeFile(history, item.copy, item.old);
                }
            }
            for (const item of changes) {
                if (item.bytes) await writeFile(item.dir, item.path, item.bytes);
                else await item.dir.removeEntry(item.path);
                item.changed = true;
            }
            for (const item of changes) {
                if (item.bytes && !sameBytes(await readBytes(item.dir, item.path), item.bytes)) throw new Error('read-back mismatch');
            }
            state.saved = true;
            state.masterText = await readText(groupDir, names.master);
            state.propMasterText = await readText(groupDir, names.proportions);
            state.pseMasterText = await readText(groupDir, names.pse);
            if (state.kin) state.kinMasterText = await readText(groupDir, names.kinematics);
            const savedMasters = `Saved ${names.master} with ${plural(state.result.rows.length, 'trial')}, ${names.proportions} and ${names.pse} with ${plural(state.psych.pse.length, 'block')}`;
            setMsg('g8-msg', state.kin ? `${savedMasters}, and ${names.kinematics} with ${reaches(state.kin.masterRows)}.` : `${savedMasters}. ${names.kinematics} was not updated.`, 'ok');
        } catch (e) {
            const restored = await restoreFiles(history, touched);
            setMsg('g8-msg', restored
                ? 'The master files could not be saved, and any changes were undone. The ZIP files were not changed. Check your browser\'s permission to edit the folder, then try again.'
                : 'Saving failed, and some previous files could not be restored. Backup copies are in the history folder. The ZIP files were not changed.', 'bad');
        } finally {
            state.busy = false;
            render();
        }
    }

    async function restoreFiles(history, touched) {
        let restored = true;
        const ignoreMissing = (e) => { if (e.name !== 'NotFoundError') throw e; };
        for (const item of touched) {
            try {
                if (item.changed) {
                    if (item.old) await writeFile(item.dir, item.path, item.old);
                    else await item.dir.removeEntry(item.path).catch(ignoreMissing);
                }
                if (item.copy) await history.removeEntry(item.copy).catch(ignoreMissing);
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
        if (n === 5) {
            state.busy = true;
            render();
            try {
                await preparePsych();
            } catch (e) {
                state.psych = null;
                setMsg('g6-msg', 'The proportions and PSE could not be prepared. Go back to step 4 and read the sessions again.', 'bad');
                renderPsych();
            }
            state.busy = false;
        }
        if (n === 7) {
            state.busy = true;
            render();
            state.upToDate = await nothingToSave();
            state.busy = false;
            if (state.upToDate) state.saved = true;
        }
        if (n === 9) {
            state.finished = true;
            setMsg('g9-msg', `All steps are complete for ${groupTitle()}.`, 'ok');
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
    $('g4-recheck').addEventListener('click', () => {
        if (state.reached > 4) resetAfter(4);
        countZips();
    });
    window.addEventListener('beforeunload', (event) => { if (state.busy) event.preventDefault(); });
    $('g7-run').addEventListener('click', calculateKinematics);
    $('g8-save').addEventListener('click', save);
    $('g9-restart').addEventListener('click', () => {
        resetAfter(0);
        state.reached = 1;
        state.open = 1;
        render();
    });
    render();
    loadRemembered();
})();
