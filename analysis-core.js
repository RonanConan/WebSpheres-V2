const WebSpheresAnalysis = (() => {
    const VERSION = '1.1.0';
    const COLUMNS = ['ID', 'Session', 'Block', 'BlockType', 'BlockNum', 'Trial', 'Target', 'Hand', 'Points', 'HitType', 'DecisionTime', 'MovementTime', 'BlockOrder', 'Phase', 'Condition', 'Mode', 'Group'];
    const BLOCK_COLUMNS = ['ID', 'Session', 'Block', 'BlockOrder', 'BlockType', 'BlockNum', 'Phase', 'Condition', 'Mode', 'BlockStart', 'BlockEnd', 'PlannedTrials', 'CompletedTrials', 'RowsInHandDB', 'EndReason', 'Plan', 'AppVersion', 'Practice', 'KinematicsFiles', 'SourceZip', 'SourceFolder', 'OtherCopies', 'Group'];
    const GROUPS = { patients: 'Patient', controls: 'Control' };
    const REQUIRED = ['Trial', 'Target', 'Hand', 'Points', 'HitType', 'DecisionTime', 'TotalMovementTime'];
    const FILE_KIND = /(vr-session-data|session-info|kinematics-LEFT|kinematics-RIGHT)-\d{4}-\d{2}-\d{2}T[\d-]+\.csv$/;
    const CHANGE_FIELDS = new Set(['Condition', 'ParticipantID', 'Group']);

    async function zipEntries(file) {
        const tailSize = Math.min(file.size, 65557);
        const tail = new DataView(await file.slice(file.size - tailSize).arrayBuffer());
        let end = -1;
        for (let i = tail.byteLength - 22; i >= 0; i--) {
            if (tail.getUint32(i, true) === 0x06054b50) { end = i; break; }
        }
        if (end < 0) throw new Error('not a zip');
        const count = tail.getUint16(end + 10, true);
        const size = tail.getUint32(end + 12, true);
        const offset = tail.getUint32(end + 16, true);
        const central = new DataView(await file.slice(offset, offset + size).arrayBuffer());
        const decoder = new TextDecoder();
        const entries = [];
        let at = 0;
        for (let i = 0; i < count; i++) {
            if (central.getUint32(at, true) !== 0x02014b50) throw new Error('bad zip directory');
            const nameLength = central.getUint16(at + 28, true);
            entries.push({
                method: central.getUint16(at + 10, true),
                compressedSize: central.getUint32(at + 20, true),
                offset: central.getUint32(at + 42, true),
                path: decoder.decode(new Uint8Array(central.buffer, central.byteOffset + at + 46, nameLength))
            });
            at += 46 + nameLength + central.getUint16(at + 30, true) + central.getUint16(at + 32, true);
        }
        return entries;
    }

    async function entryText(file, entry) {
        const head = new DataView(await file.slice(entry.offset, entry.offset + 30).arrayBuffer());
        if (head.getUint32(0, true) !== 0x04034b50) throw new Error('bad zip entry');
        const start = entry.offset + 30 + head.getUint16(26, true) + head.getUint16(28, true);
        const raw = file.slice(start, start + entry.compressedSize);
        if (entry.method === 0) return raw.text();
        if (entry.method !== 8) throw new Error('unsupported zip compression');
        return new Response(raw.stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
    }

    function parseCsv(text) {
        const rows = [];
        let row = [], field = '', quoted = false;
        for (let i = 0; i < text.length; i++) {
            const c = text[i];
            if (quoted) {
                if (c !== '"') field += c;
                else if (text[i + 1] === '"') { field += '"'; i++; }
                else quoted = false;
            } else if (c === '"') quoted = true;
            else if (c === ',') { row.push(field); field = ''; }
            else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
            else if (c !== '\r') field += c;
        }
        if (field !== '' || row.length) { row.push(field); rows.push(row); }
        return rows.filter(r => r.length > 1 || r[0] !== '');
    }

    function parseInfo(text) {
        const info = {};
        text.split(/\r?\n/).slice(1).forEach(line => {
            const comma = line.indexOf(',');
            if (comma > 0) info[line.slice(0, comma)] = line.slice(comma + 1);
        });
        return info;
    }

    async function sha256(file) {
        if (!globalThis.crypto || !globalThis.crypto.subtle) return '';
        const digest = await globalThis.crypto.subtle.digest('SHA-256', await file.arrayBuffer());
        return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
    }

    async function readExport(file, options) {
        const infoOnly = !!(options && options.infoOnly);
        const out = { name: file.name, size: file.size, file, sha256: '', blocks: [], problem: '' };
        let entries;
        try {
            entries = await zipEntries(file);
        } catch (e) {
            out.problem = 'This file could not be read as a zip.';
            return out;
        }
        const groups = new Map();
        entries.forEach(entry => {
            const base = entry.path.split('/').pop();
            const kind = FILE_KIND.exec(base);
            if (!kind) return;
            const folder = entry.path.slice(0, entry.path.length - base.length).replace(/\/$/, '');
            if (!groups.has(folder)) groups.set(folder, {});
            groups.get(folder)[kind[1]] = entry;
        });
        for (const [folder, group] of groups) {
            const trialEntry = group['vr-session-data'], infoEntry = group['session-info'];
            const block = { folder, problem: '', hasLeft: !!group['kinematics-LEFT'], hasRight: !!group['kinematics-RIGHT'] };
            if (!trialEntry) block.problem = 'This block has no trial file.';
            else if (!infoEntry) block.problem = 'This block has no session-info file, so its layout cannot be read.';
            else {
                try {
                    if (!infoOnly) {
                        const table = parseCsv(await entryText(file, trialEntry));
                        block.header = table[0] || [];
                        block.table = table.slice(1);
                    }
                    block.info = parseInfo(await entryText(file, infoEntry));
                    block.practice = block.info.Practice === '1' || /^PRACTICE_/.test(trialEntry.path.split('/').pop());
                } catch (e) {
                    block.problem = 'The files in this block could not be read.';
                }
            }
            out.blocks.push(block);
        }
        return out;
    }

    const compareText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

    function toInteger(value) {
        const text = String(value).trim();
        if (text === '') return null;
        const number = Number(text);
        return Number.isFinite(number) ? Math.trunc(number) : null;
    }

    function parsePlan(text) {
        const plan = new Map();
        String(text || '').split('|').forEach(part => {
            const pieces = part.split(':');
            const number = parseInt(pieces[0], 10);
            if (number > 0 && (pieces[1] === 'boost' || pieces[1] === 'no-boost')) plan.set(number, pieces[1] === 'boost' ? 'boost' : 'baseline');
        });
        return plan;
    }

    function conditionType(value) {
        const text = String(value === undefined ? '' : value).trim();
        return text === '1' ? 'baseline' : text === '2' ? 'boost' : '';
    }

    function blockNumber(info, folder) {
        const stated = parseInt(info.Block || info.Run, 10);
        if (stated > 0) return stated;
        const inFolder = /(?:block|run)(\d+)/i.exec(folder);
        return inFolder ? parseInt(inFolder[1], 10) : 1;
    }

    function columnIndexes(header) {
        const index = {};
        REQUIRED.forEach(name => { index[name] = header.indexOf(name); });
        index.ParticipantID = header.indexOf('ParticipantID');
        return index;
    }

    function rowSignature(row, index) {
        return REQUIRED.map(name => row[index[name]]).join('\u0001');
    }

    function collectBlocks(exportsRead, result, includePractice) {
        const candidates = [];
        exportsRead.forEach((zip, zipIndex) => {
            if (zip.problem) { result.setAside.push({ name: zip.name, reason: zip.problem }); return; }
            if (!zip.blocks.length) { result.setAside.push({ name: zip.name, reason: 'This zip has no WebSpheres trial data.' }); return; }
            zip.blocks.forEach(block => {
                const label = block.folder ? `${zip.name}, ${block.folder}` : zip.name;
                if (block.problem) { result.setAside.push({ name: label, reason: block.problem }); return; }
                if (block.practice && !includePractice) {
                    result.practiceLeftOut++;
                    if (!result.setAside.some(item => item.name === zip.name)) result.setAside.push({ name: zip.name, reason: 'This is a practice session, so it was left out.' });
                    return;
                }
                const missing = REQUIRED.filter(name => !block.header.includes(name));
                if (missing.length) { result.setAside.push({ name: label, reason: `The trial file is missing these columns: ${missing.join(', ')}.` }); return; }
                const broken = block.table.filter(row => row.length !== block.header.length).length;
                if (broken) { result.setAside.push({ name: label, reason: `${broken} rows in the trial file have the wrong number of columns.` }); return; }
                if (!block.table.length) { result.setAside.push({ name: label, reason: 'This block has no trials.' }); return; }
                candidates.push({
                    zip, zipIndex, label, folder: block.folder, header: block.header, table: block.table, info: block.info,
                    practice: block.practice, hasLeft: block.hasLeft, hasRight: block.hasRight,
                    id: block.info.ParticipantID === undefined ? '' : block.info.ParticipantID,
                    start: block.info.SessionStartISO || '',
                    number: blockNumber(block.info, block.folder),
                    index: columnIndexes(block.header)
                });
            });
        });
        return candidates;
    }

    function mergeCopies(candidates, result) {
        const byKey = new Map();
        candidates.forEach(c => {
            const key = c.start ? `${c.practice}|${c.id}|${c.start}` : `${c.zipIndex}|${c.folder}`;
            if (!c.start) result.warnings.push(`${c.label} has no start time, so copies of it in other zips cannot be recognised.`);
            if (!byKey.has(key)) byKey.set(key, []);
            byKey.get(key).push(c);
        });
        const merged = [];
        byKey.forEach(copies => {
            const ordered = copies.slice().sort((a, b) => b.table.length - a.table.length);
            const best = ordered[0];
            ordered.slice(1).forEach(other => {
                const same = other.table.every((row, i) => rowSignature(row, other.index) === rowSignature(best.table[i], best.index));
                if (!same) result.stops.push(`${best.label} and ${other.label} are the same block but their trials differ. Remove the wrong zip and try again.`);
            });
            best.zipIndexes = copies.map(c => c.zipIndex);
            best.otherCopies = ordered.slice(1).map(c => c.label);
            if (best.otherCopies.length) result.notes.push(`${best.label} was also found in ${best.otherCopies.join(' and ')}. The most complete copy was used.`);
            merged.push(best);
        });
        return merged;
    }

    function joinResumedSessions(groups) {
        const firstNumber = (group) => Math.min(...group.map(b => b.number));
        const lastNumber = (group) => Math.max(...group.map(b => b.number));
        const planOf = (group) => (group.find(b => b.info.Plan) || { info: {} }).info.Plan || '';
        const startOf = (group) => group.map(b => b.start).sort(compareText)[0] || '';
        const joined = [];
        groups.slice().sort((a, b) => compareText(startOf(a), startOf(b))).forEach(group => {
            const earlier = joined.slice().reverse().find(other => other[0].id === group[0].id && other[0].practice === group[0].practice);
            if (earlier && firstNumber(group) > 1 && planOf(group) && planOf(earlier) === planOf(group) && lastNumber(earlier) < firstNumber(group)) earlier.push(...group);
            else joined.push(group);
        });
        return joined;
    }

    function groupSessions(blocks, zipCount) {
        const parent = Array.from({ length: zipCount }, (_, i) => i);
        const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
        blocks.forEach(b => b.zipIndexes.forEach(i => { parent[find(i)] = find(b.zipIndexes[0]); }));
        const sessions = new Map();
        blocks.forEach(b => {
            const key = `${find(b.zipIndex)}|${b.practice}|${b.id}`;
            if (!sessions.has(key)) sessions.set(key, []);
            sessions.get(key).push(b);
        });
        return joinResumedSessions(Array.from(sessions.values()));
    }

    function layoutSession(blocks, id, sessionNumber, result) {
        const where = `Participant ${id || '(no ID)'}, session ${sessionNumber}`;
        const latest = blocks.slice().sort((a, b) => b.number - a.number).find(b => b.info.Plan);
        const plan = parsePlan(latest ? latest.info.Plan : '');
        const items = blocks.map(block => {
            const observed = conditionType(block.info.Condition);
            const planned = plan.get(block.number);
            if (observed && planned && observed !== planned) result.warnings.push(`${where}: block ${block.number} ran as ${observed}, but the plan listed it as ${planned}. It is labelled ${observed}.`);
            if (!observed && !planned) result.warnings.push(`${where}: block ${block.number} has no readable condition.`);
            return { number: block.number, start: block.start, type: observed || planned || 'unknown', block };
        });
        plan.forEach((type, number) => {
            if (!items.some(item => item.number === number)) {
                items.push({ number, start: '', type, block: null });
                result.warnings.push(`${where}: block ${number} is in the plan, but no data for it was found.`);
            }
        });
        items.sort((a, b) => a.number - b.number || compareText(a.start, b.start));
        items.forEach((item, i) => {
            if (i && item.number === items[i - 1].number) result.warnings.push(`${where}: more than one block is numbered ${item.number}.`);
        });
        const hasBoost = items.some(item => item.type === 'boost');
        const counts = {};
        let seenBoost = false;
        items.forEach(item => {
            counts[item.type] = (counts[item.type] || 0) + 1;
            item.typeNumber = counts[item.type];
            item.name = `${item.type}-${item.typeNumber}`;
            if (item.type === 'boost') { item.phase = 'boost'; seenBoost = true; }
            else if (item.type === 'unknown') item.phase = 'unknown';
            else if (!hasBoost) item.phase = 'no-boost';
            else item.phase = seenBoost ? 'post-boost' : 'pre-boost';
        });
        return items;
    }

    function checkBlock(block, where, result) {
        const info = block.info;
        const completed = toInteger(info.TrialsCompleted);
        if (completed !== null && completed !== block.table.length) result.warnings.push(`${where}: session-info says ${completed} trials, but the trial file has ${block.table.length}.`);
        if (info.EndReason && info.EndReason !== 'finished') result.notes.push(`${where}: this block ended early with ${block.table.length} of ${info.TotalTrials || 'its planned'} trials. All of them were kept.`);
        if (block.index.ParticipantID >= 0 && block.table.some(row => row[block.index.ParticipantID] !== block.id)) result.warnings.push(`${where}: some trials carry a different participant ID from the block.`);
        if (!block.id) result.warnings.push(`${where}: this block has no participant ID.`);
        if (!block.hasLeft || !block.hasRight) result.notes.push(`${where}: kinematics files are incomplete. handDB does not need them.`);
        String(info.SetupChanges || '').split(';').filter(Boolean).forEach(change => {
            const parts = change.split('|');
            if (CHANGE_FIELDS.has(parts[2])) result.warnings.push(`${where}: ${parts[2]} changed from ${parts[3]} to ${parts[4]} after trial ${parts[1]}. All trials carry the final label.`);
        });
    }

    function buildRows(block, item, id, sessionNumber, result, where, group) {
        const condition = item.type === 'boost' ? 'BT' : item.type === 'baseline' ? 'NM' : 'unknown';
        const at = block.index;
        let unreadable = 0;
        const integer = (value) => {
            const number = toInteger(value);
            if (number === null) unreadable++;
            return number;
        };
        block.table.forEach(row => {
            const hand = row[at.Hand].trim().toUpperCase();
            const hitType = row[at.HitType].trim().toLowerCase();
            result.rows.push({
                ID: id, Session: sessionNumber, Block: item.name, BlockType: item.type, BlockNum: item.typeNumber,
                Trial: integer(row[at.Trial]), Target: integer(row[at.Target]),
                Hand: hand === 'NA' || hand === '' ? null : hand,
                Points: integer(row[at.Points]), HitType: hitType,
                DecisionTime: integer(row[at.DecisionTime]), MovementTime: integer(row[at.TotalMovementTime]),
                BlockOrder: item.number, Phase: item.phase, Condition: condition, Mode: block.info.Mode || '', Group: group
            });
        });
        if (unreadable) result.warnings.push(`${where}: ${unreadable} values could not be read as whole numbers and are recorded as NA.`);
        return condition;
    }

    function checkSimilarIds(sessions, result) {
        const groups = new Map();
        sessions.forEach(s => {
            const key = s.id.trim().toLowerCase().replace(/^0+(?=.)/, '');
            if (!groups.has(key)) groups.set(key, new Set());
            groups.get(key).add(s.id);
        });
        groups.forEach(ids => {
            if (ids.size > 1) result.warnings.push(`These IDs look alike but are treated as different people: ${Array.from(ids).sort(compareText).join(', ')}.`);
        });
    }

    function checkRecordedGroups(blocks, folder, label, result) {
        const mismatched = new Map(), unrecorded = new Set();
        blocks.forEach(block => {
            const recorded = block.info.Group;
            if (!recorded) unrecorded.add(block.zip.name);
            else if (recorded !== label) mismatched.set(block.zip.name, recorded);
        });
        mismatched.forEach((recorded, name) => result.groupMismatches.push(`${name} was recorded as ${recorded}, but it is in the ${folder} folder.`));
        if (unrecorded.size) result.warnings.push(`These zips do not record a group, so they could not be checked against the ${folder} folder: ${Array.from(unrecorded).join(', ')}.`);
    }

    function build(exportsRead, options) {
        const includePractice = !!(options && options.includePractice);
        const groupLabel = (options && GROUPS[options.group]) || '';
        const result = { rows: [], blocks: [], sessions: [], stops: [], warnings: [], notes: [], setAside: [], practiceLeftOut: 0, groupMismatches: [] };
        const merged = mergeCopies(collectBlocks(exportsRead, result, includePractice), result);
        if (groupLabel) checkRecordedGroups(merged, options.group, groupLabel, result);
        const firstStart = (group) => group.map(b => b.start).sort(compareText)[0] || '';
        const grouped = groupSessions(merged, exportsRead.length).sort((a, b) => compareText(a[0].id, b[0].id) || compareText(firstStart(a), firstStart(b)));
        const numberFor = new Map();
        grouped.forEach(group => {
            const id = group[0].id;
            const sessionNumber = (numberFor.get(id) || 0) + 1;
            numberFor.set(id, sessionNumber);
            const items = layoutSession(group, id, sessionNumber, result);
            result.sessions.push({ id, number: sessionNumber, start: firstStart(group), practice: group[0].practice, items });
            items.filter(item => item.block).forEach(item => {
                const block = item.block;
                const where = `Participant ${id || '(no ID)'}, session ${sessionNumber}, ${item.name}`;
                checkBlock(block, where, result);
                const condition = buildRows(block, item, id, sessionNumber, result, where, groupLabel);
                result.blocks.push({
                    ID: id, Session: sessionNumber, Block: item.name, BlockOrder: item.number, BlockType: item.type, BlockNum: item.typeNumber,
                    Phase: item.phase, Condition: condition, Mode: block.info.Mode || '', BlockStart: block.info.SessionStartISO || '', BlockEnd: block.info.SessionEndISO || '',
                    PlannedTrials: toInteger(block.info.TotalTrials === undefined ? '' : block.info.TotalTrials), CompletedTrials: toInteger(block.info.TrialsCompleted === undefined ? '' : block.info.TrialsCompleted),
                    RowsInHandDB: block.table.length, EndReason: block.info.EndReason || '', Plan: block.info.Plan || '', AppVersion: block.info.AppVersion || '',
                    Practice: block.practice ? 'yes' : 'no', KinematicsFiles: block.hasLeft && block.hasRight ? 'both' : block.hasLeft ? 'left only' : block.hasRight ? 'right only' : 'none',
                    SourceZip: block.zip.name, SourceFolder: block.folder, OtherCopies: block.otherCopies.join('; '), Group: groupLabel
                });
            });
        });
        checkSimilarIds(result.sessions, result);
        return result;
    }

    function csvValue(value) {
        if (value === null || value === undefined) return 'NA';
        if (typeof value === 'number') return String(value);
        return `"${String(value).replace(/"/g, '""')}"`;
    }

    function toCsv(columns, rows) {
        return [columns.map(csvValue).join(',')].concat(rows.map(row => columns.map(name => csvValue(row[name])).join(','))).join('\n') + '\n';
    }

    function reportText(exportsRead, result, createdIso) {
        const list = (items) => items.length ? items.map(item => `- ${item}`) : ['- None'];
        return [
            'WebSpheres handDB report',
            `Created: ${createdIso}`,
            `Program version: ${VERSION}`,
            `Group: ${result.rows[0] ? result.rows[0].Group : ''}`,
            '',
            `Participants: ${new Set(result.sessions.map(s => s.id)).size}`,
            `Sessions: ${result.sessions.length}`,
            `Blocks: ${result.blocks.length}`,
            `Trials: ${result.rows.length}`,
            `Practice blocks left out: ${result.practiceLeftOut}`,
            '',
            'Must be fixed:', ...list(result.stops),
            '',
            'Recorded group differs from the folder (confirmed by the person saving):', ...list(result.groupMismatches),
            '',
            'Warnings:', ...list(result.warnings),
            '',
            'Notes:', ...list(result.notes),
            '',
            'Files or blocks not used:', ...list(result.setAside.map(item => `${item.name}: ${item.reason}`)),
            '',
            'Zips read (SHA-256):', ...list(exportsRead.map(zip => `${zip.name}: ${zip.sha256 || 'not available'}`))
        ].join('\n') + '\n';
    }

    function fileNames(group, practice) {
        const prefix = practice ? 'PRACTICE_' : '';
        return { master: `${prefix}handDB_${group}.csv`, blocks: `${prefix}blocks_${group}.csv`, report: `${prefix}report_${group}.txt` };
    }

    async function addChecksums(exportsRead) {
        for (const zip of exportsRead) zip.sha256 = await sha256(zip.file);
    }

    function outputFiles(exportsRead, result, createdIso, group, practice) {
        const names = fileNames(group, practice);
        return [
            { path: names.master, parts: [toCsv(COLUMNS, result.rows)] },
            { path: names.blocks, parts: [toCsv(BLOCK_COLUMNS, result.blocks)] },
            { path: names.report, parts: [reportText(exportsRead, result, createdIso)] }
        ];
    }

    function checkStudyFolder(folder) {
        const name = folder.name;
        const lower = name.toLowerCase();
        if (Object.hasOwn(GROUPS, lower)) return { status: 'wrong', message: `You selected the ${name} folder. Select the experiment folder that contains it.` };
        if (lower === 'zips' || lower === 'history') return { status: 'wrong', message: `You selected the ${name} folder. Select the experiment folder two levels above it.` };
        const miscased = folder.dirs.find(dir => Object.hasOwn(GROUPS, dir.toLowerCase()) && !Object.hasOwn(GROUPS, dir));
        if (miscased) return { status: 'wrong', message: `Rename the ${miscased} folder to ${miscased.toLowerCase()}, all in lower case, then select ${name} again.` };
        const present = Object.keys(GROUPS).filter(group => folder.dirs.includes(group));
        const complete = present.filter(group => folder.groups[group].includes('zips'));
        if (complete.length === Object.keys(GROUPS).length) return { status: 'ok', message: `${name} is an experiment folder. It has patients and controls folders.` };
        if (present.length) return { status: 'setup', message: `${name} is missing some of the folders it needs. Select Set up this folder to add them.` };
        const other = folder.dirs.concat(folder.files).filter(item => !item.startsWith('.') && !/^(readme|license)/i.test(item));
        if (!other.length) return { status: 'setup', message: `${name} is empty. Select Set up this folder to create the patients and controls folders.` };
        return { status: 'wrong', message: `${name} is not an experiment folder because it has no patients or controls folder. Select the experiment folder. For a new experiment, make a new empty folder first.` };
    }

    function crossGroupStops(groupName, exportsRead, otherName, otherExports) {
        const keyOf = (block) => `${block.info.ParticipantID}|${block.info.SessionStartISO}`;
        const usable = (zip) => zip.blocks.filter(block => !block.problem && block.info.SessionStartISO);
        const other = new Map();
        otherExports.forEach(zip => usable(zip).forEach(block => other.set(keyOf(block), zip.name)));
        const stops = new Set();
        exportsRead.forEach(zip => usable(zip).forEach(block => {
            if (other.has(keyOf(block))) stops.add(`${zip.name} in ${groupName} and ${other.get(keyOf(block))} in ${otherName} hold the same session. Remove it from the wrong folder and try again.`);
        }));
        return Array.from(stops);
    }

    function compareMaster(oldText, rows) {
        const table = parseCsv(oldText);
        if ((table[0] || []).join() !== COLUMNS.join()) return { comparable: false, examples: [] };
        const text = (value) => (value === null || value === undefined ? 'NA' : String(value));
        const counter = () => {
            const seen = new Map();
            return (id, session, order, trial) => {
                const base = [id, session, order, trial].join('|');
                seen.set(base, (seen.get(base) || 0) + 1);
                return `${base}|${seen.get(base)}`;
            };
        };
        const freshKey = counter();
        const keyedRows = rows.map(row => [freshKey(row.ID, text(row.Session), text(row.BlockOrder), text(row.Trial)), row]);
        const fresh = new Map(keyedRows);
        const oldKey = counter();
        const at = (name) => COLUMNS.indexOf(name);
        const oldKeys = new Set(), oldIds = new Set(), examples = [];
        let changed = 0, missing = 0;
        table.slice(1).forEach(old => {
            const id = old[at('ID')], where = `Participant ${id}, session ${old[at('Session')]}, block ${old[at('BlockOrder')]}, trial ${old[at('Trial')]}`;
            const key = oldKey(id, old[at('Session')], old[at('BlockOrder')], old[at('Trial')]);
            oldKeys.add(key);
            oldIds.add(id);
            const row = fresh.get(key);
            if (!row) {
                missing++;
                if (examples.length < 5) examples.push(`${where} is no longer present.`);
                return;
            }
            const differs = COLUMNS.filter(name => text(row[name]) !== old[at(name)]);
            if (differs.length) {
                changed++;
                if (examples.length < 5) examples.push(`${where}: ${differs.map(name => `${name} was ${old[at(name)]}, now ${text(row[name])}`).join('; ')}.`);
            }
        });
        const addedRows = keyedRows.filter(([key]) => !oldKeys.has(key)).map(([, row]) => row);
        return { comparable: true, oldRows: table.length - 1, added: addedRows.length, changed, missing, addedParticipants: new Set(rows.map(row => row.ID).filter(id => !oldIds.has(id))).size, examples };
    }

    return { VERSION, COLUMNS, BLOCK_COLUMNS, GROUPS, parseCsv, readExport, addChecksums, build, toCsv, reportText, fileNames, outputFiles, checkStudyFolder, crossGroupStops, compareMaster };
})();

if (typeof module !== 'undefined') module.exports = WebSpheresAnalysis;
