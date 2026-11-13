const WebSpheresAnalysis = (() => {
    const VERSION = '1.9.0';
    const COLUMNS = ['ID', 'Session', 'Block', 'BlockType', 'BlockNum', 'Trial', 'Target', 'Hand', 'Points', 'HitType', 'DecisionTime', 'MovementTime', 'BlockOrder', 'Phase', 'Condition', 'Mode', 'Group', 'DominantHand', 'LessAffectedHand'];
    const PROP_COLUMNS = ['ID', 'Session', 'Block', 'BlockType', 'BlockNum', 'Target', 'total_trials', 'targeted_hits', 'TargetedHand', 'Proportion'];
    const PSE_COLUMNS = ['ID', 'Session', 'Block', 'BlockType', 'BlockNum', 'TargetedHand', 'PSE_raw', 'PSE', 'PSE_bounded'];
    const BLOCK_COLUMNS = ['ID', 'Session', 'Block', 'BlockOrder', 'BlockType', 'BlockNum', 'Phase', 'Condition', 'Mode', 'BlockStart', 'BlockEnd', 'PlannedTrials', 'CompletedTrials', 'RowsInHandDB', 'EndReason', 'Plan', 'AppVersion', 'Practice', 'KinematicsFiles', 'SourceZip', 'SourceFolder', 'OtherCopies', 'Group', 'DominantHand', 'LessAffectedHand'];
    const GROUPS = { patients: 'Patient', controls: 'Control' };
    const REQUIRED = ['Trial', 'Target', 'Hand', 'Points', 'HitType', 'DecisionTime', 'TotalMovementTime'];
    const FILE_KIND = /^(.*?)(vr-session-data|session-info|kinematics-LEFT|kinematics-RIGHT)-(\d{4}-\d{2}-\d{2}T[\d-]+)\.csv$/;
    const CHANGE_FIELDS = new Set(['Condition', 'ParticipantID', 'Group', 'DominantHand']);
    const RESUME_LIMIT_MS = 24 * 60 * 60 * 1000;
    const { crc32 } = typeof WebSpheresZip !== 'undefined' ? WebSpheresZip : require('./zip-writer.js');

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
                crc: central.getUint32(at + 16, true),
                compressedSize: central.getUint32(at + 20, true),
                size: central.getUint32(at + 24, true),
                offset: central.getUint32(at + 42, true),
                path: decoder.decode(new Uint8Array(central.buffer, central.byteOffset + at + 46, nameLength)).replace(/\\/g, '/')
            });
            at += 46 + nameLength + central.getUint16(at + 30, true) + central.getUint16(at + 32, true);
        }
        return entries;
    }

    async function entryBytes(file, entry) {
        const head = new DataView(await file.slice(entry.offset, entry.offset + 30).arrayBuffer());
        if (head.getUint32(0, true) !== 0x04034b50) throw new Error('bad zip entry');
        const start = entry.offset + 30 + head.getUint16(26, true) + head.getUint16(28, true);
        const raw = file.slice(start, start + entry.compressedSize);
        if (entry.method !== 0 && entry.method !== 8) throw new Error('unsupported zip compression');
        const stream = entry.method === 8 ? raw.stream().pipeThrough(new DecompressionStream('deflate-raw')) : raw.stream();
        const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
        if (crc32(bytes) !== entry.crc) throw new Error('checksum mismatch');
        return bytes;
    }

    async function entryText(file, entry) {
        return new TextDecoder().decode(await entryBytes(file, entry));
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

    function splitFolder(folder, items) {
        const counts = {};
        items.forEach(item => { counts[item.kind] = (counts[item.kind] || 0) + 1; });
        const shared = Object.values(counts).some(n => n > 1);
        const groups = new Map();
        items.forEach(item => {
            const key = shared ? `${item.prefix}${item.stamp}` : '';
            if (!groups.has(key)) groups.set(key, { folder: shared ? [folder, key].filter(Boolean).join('/') : folder, group: {}, duplicate: false });
            const target = groups.get(key);
            if (target.group[item.kind]) target.duplicate = true;
            target.group[item.kind] = item.entry;
        });
        return Array.from(groups.values());
    }

    async function readExport(file, options) {
        const infoOnly = !!(options && options.infoOnly);
        const out = { name: file.name, size: file.size, file, sha256: '', blocks: [], problem: '' };
        let entries;
        try {
            entries = await zipEntries(file);
        } catch (e) {
            out.unreadable = e.name === 'NotReadableError' || e.name === 'NotFoundError';
            out.problem = out.unreadable ? 'This file could not be read. If it is stored in iCloud Drive or OneDrive, make sure it is downloaded to this computer, then read the sessions again.' : 'This file could not be read as a ZIP file.';
            return out;
        }
        const folders = new Map();
        entries.forEach(entry => {
            const parts = entry.path.split('/');
            const base = parts[parts.length - 1];
            if (parts.includes('__MACOSX') || base.startsWith('.')) return;
            const kind = FILE_KIND.exec(base);
            if (!kind) return;
            const folder = parts.slice(0, -1).join('/');
            if (!folders.has(folder)) folders.set(folder, []);
            folders.get(folder).push({ entry, prefix: kind[1], kind: kind[2], stamp: kind[3] });
        });
        for (const { folder, group, duplicate } of Array.from(folders).flatMap(([name, items]) => splitFolder(name, items))) {
            const trialEntry = group['vr-session-data'], infoEntry = group['session-info'];
            const block = { folder, problem: '', hasLeft: !!group['kinematics-LEFT'], hasRight: !!group['kinematics-RIGHT'], entries: { trial: trialEntry, left: group['kinematics-LEFT'], right: group['kinematics-RIGHT'] } };
            if (duplicate) block.problem = 'This folder in the ZIP file contains more than one file of the same type and cannot be processed reliably.';
            else if (!trialEntry) block.problem = 'This block has no trial file.';
            else if (!infoEntry) block.problem = 'This block has no session-info file, so its participant, condition and block order cannot be determined.';
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
                    block.problem = 'The files in this block could not be read. The ZIP file may be damaged.';
                }
            }
            out.blocks.push(block);
        }
        return out;
    }

    const trialCount = (n) => `${n} ${n === 1 ? 'trial' : 'trials'}`;
    const compareText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
    const occurrenceKey = () => {
        const seen = new Map();
        return (...parts) => {
            const base = parts.join('|');
            seen.set(base, (seen.get(base) || 0) + 1);
            return `${base}|${seen.get(base)}`;
        };
    };

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
            if (zip.unreadable) { result.stops.push(`${zip.name}: ${zip.problem}`); return; }
            if (zip.problem) { result.setAside.push({ name: zip.name, reason: zip.problem }); return; }
            if (!zip.blocks.length) { result.setAside.push({ name: zip.name, reason: 'This ZIP file contains no WebSpheres trial data.' }); return; }
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
                if (broken) { result.setAside.push({ name: label, reason: `${broken} ${broken === 1 ? 'row' : 'rows'} in the trial file ${broken === 1 ? 'has' : 'have'} an unexpected number of columns.` }); return; }
                if (!block.table.length) { result.setAside.push({ name: label, reason: 'This block has no trials.' }); return; }
                candidates.push({
                    zip, zipIndex, label, folder: block.folder, header: block.header, table: block.table, info: block.info,
                    practice: block.practice, hasLeft: block.hasLeft, hasRight: block.hasRight, entries: block.entries,
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
            if (!c.start) result.warnings.push(`${c.label} has no start time, so matching copies in other ZIP files cannot be identified.`);
            if (!byKey.has(key)) byKey.set(key, []);
            byKey.get(key).push(c);
        });
        const merged = [];
        byKey.forEach(copies => {
            const kinematics = (c) => [c.entries.left, c.entries.right].filter(Boolean);
            const kinematicsSize = (c) => kinematics(c).reduce((sum, entry) => sum + entry.size, 0);
            const ordered = copies.slice().sort((a, b) => b.table.length - a.table.length || kinematics(b).length - kinematics(a).length || kinematicsSize(b) - kinematicsSize(a));
            const best = ordered[0];
            ordered.slice(1).forEach(other => {
                const same = other.table.every((row, i) => rowSignature(row, other.index) === rowSignature(best.table[i], best.index));
                if (!same) result.stops.push(`${best.label} and ${other.label} contain different trial data for the same block. Remove the incorrect ZIP file, then try again.`);
            });
            best.zipIndexes = copies.map(c => c.zipIndex);
            best.otherCopies = ordered.slice(1).map(c => c.label);
            if (best.otherCopies.length) result.notes.push(`${best.label} was also found in ${best.otherCopies.join(' and ')}. The copy with the most trials, then the most kinematics data, was used.`);
            merged.push(best);
        });
        return merged;
    }

    function joinResumedSessions(groups) {
        const firstNumber = (group) => Math.min(...group.map(b => b.number));
        const lastNumber = (group) => Math.max(...group.map(b => b.number));
        const planOf = (group) => parsePlan((group.find(b => b.info.Plan) || { info: {} }).info.Plan);
        const samePlanSoFar = (earlier, group) => {
            const before = planOf(earlier), after = planOf(group);
            return earlier.every(b => before.has(b.number) && before.get(b.number) === after.get(b.number));
        };
        const startOf = (group) => group.map(b => b.start).sort(compareText)[0] || '';
        const lastStart = (group) => Math.max(...group.map(b => Date.parse(b.start)));
        const joined = [];
        groups.slice().sort((a, b) => compareText(startOf(a), startOf(b))).forEach(group => {
            const earlier = joined.slice().reverse().find(other => other[0].id === group[0].id && other[0].practice === group[0].practice);
            if (earlier && firstNumber(group) > 1 && samePlanSoFar(earlier, group) && lastNumber(earlier) < firstNumber(group) && Date.parse(startOf(group)) - lastStart(earlier) <= RESUME_LIMIT_MS) earlier.push(...group);
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
            if (observed && planned && observed !== planned) result.warnings.push(`${where}: block ${block.number} was run as ${observed}, although the plan specified ${planned}. The block is labelled ${observed}.`);
            if (!observed && !planned) result.warnings.push(`${where}: block ${block.number} has no readable condition.`);
            if (!observed && planned) result.warnings.push(`${where}: block ${block.number} has no readable condition. Its label, ${planned}, comes from the plan.`);
            return { number: block.number, start: block.start, type: observed || planned || 'unknown', block };
        });
        plan.forEach((type, number) => {
            if (!items.some(item => item.number === number)) {
                items.push({ number, start: '', type, block: null });
                result.warnings.push(`${where}: block ${number} was planned, but no data were found for it.`);
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

    function checkBlock(block, where, result, group) {
        const info = block.info;
        const completed = toInteger(info.TrialsCompleted);
        if (completed !== null && completed !== block.table.length) result.warnings.push(`${where}: the session-info file reports ${trialCount(completed)}, but the trial file contains ${block.table.length}.`);
        if (info.EndReason && info.EndReason !== 'finished') result.notes.push(`${where}: this block ended early after ${info.TotalTrials ? `${block.table.length} of ${info.TotalTrials} trials` : trialCount(block.table.length)}. All recorded trials were included.`);
        if (block.index.ParticipantID >= 0 && block.table.some(row => row[block.index.ParticipantID] !== block.id)) result.warnings.push(`${where}: some trial records have a different participant ID from their block.`);
        if (!block.id) result.warnings.push(`${where}: this block has no participant ID.`);
        if (!block.hasLeft || !block.hasRight) result.notes.push(`${where}: the kinematics files are incomplete. This block is in handDB, but it will be left out of the kinematics master.`);
        String(info.SetupChanges || '').split(';').filter(Boolean).forEach(change => {
            const parts = change.split('|');
            if (CHANGE_FIELDS.has(parts[2])) result.warnings.push(`${where}: ${parts[2] === 'DominantHand' && group === 'Patient' ? 'Less affected hand' : parts[2]} changed from ${parts[3]} to ${parts[4]} after trial ${parts[1]}. ${parts[2] === 'Group' ? 'All trials are labelled with the group of the folder they are in.' : 'All trials are labelled with the final value.'}`);
        });
    }

    function dominantHand(info) {
        return String(info.DominantHand || '').trim().toUpperCase();
    }

    function handColumns(info, group) {
        const hand = dominantHand(info);
        return group === 'Patient' ? { DominantHand: '', LessAffectedHand: hand } : { DominantHand: hand, LessAffectedHand: '' };
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
                BlockOrder: item.number, Phase: item.phase, Condition: condition, Mode: block.info.Mode || '', Group: group, ...handColumns(block.info, group)
            });
        });
        if (unreadable) result.warnings.push(`${where}: ${unreadable === 1 ? '1 value could not be read as a whole number and is' : `${unreadable} values could not be read as whole numbers and are`} recorded as NA.`);
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
            if (ids.size > 1) result.warnings.push(`These participant IDs are similar but will be treated as different participants: ${Array.from(ids).sort(compareText).join(', ')}.`);
        });
    }

    function recordedHands(blocks) {
        const hands = new Map();
        blocks.forEach(block => {
            if (!hands.has(block.ID)) hands.set(block.ID, new Set());
            if (block.DominantHand || block.LessAffectedHand) hands.get(block.ID).add(block.DominantHand || block.LessAffectedHand);
        });
        return hands;
    }

    function checkDominantHands(result, group) {
        const word = group === 'Patient' ? 'less affected hand' : 'dominant hand';
        const consequence = group === 'Patient' ? 'Check which hand is correct.' : 'Their handedness will be treated as not known.';
        recordedHands(result.blocks).forEach((hands, id) => {
            if (hands.size > 1) result.warnings.push(`Participant ${id || '(no ID)'} is recorded with more than one ${word}: ${Array.from(hands).sort(compareText).join(' and ')}. ${consequence}`);
            if (!hands.size) result.warnings.push(`Participant ${id || '(no ID)'} has no recorded ${word}.`);
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
        if (unrecorded.size) result.warnings.push(`These ZIP files do not specify a group, so their group cannot be checked against the ${folder} folder: ${Array.from(unrecorded).join(', ')}.`);
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
                checkBlock(block, where, result, groupLabel);
                const condition = buildRows(block, item, id, sessionNumber, result, where, groupLabel);
                result.blocks.push({
                    ID: id, Session: sessionNumber, Block: item.name, BlockOrder: item.number, BlockType: item.type, BlockNum: item.typeNumber,
                    Phase: item.phase, Condition: condition, Mode: block.info.Mode || '', BlockStart: block.info.SessionStartISO || '', BlockEnd: block.info.SessionEndISO || '',
                    PlannedTrials: toInteger(block.info.TotalTrials === undefined ? '' : block.info.TotalTrials), CompletedTrials: toInteger(block.info.TrialsCompleted === undefined ? '' : block.info.TrialsCompleted),
                    RowsInHandDB: block.table.length, EndReason: block.info.EndReason || '', Plan: block.info.Plan || '', AppVersion: block.info.AppVersion || '',
                    Practice: block.practice ? 'yes' : 'no', KinematicsFiles: block.hasLeft && block.hasRight ? 'both' : block.hasLeft ? 'left only' : block.hasRight ? 'right only' : 'none',
                    SourceZip: block.zip.name, SourceFolder: block.folder, OtherCopies: block.otherCopies.join('; '), Group: groupLabel, ...handColumns(block.info, groupLabel),
                    source: { file: block.zip.file, entries: block.entries }
                });
            });
        });
        checkSimilarIds(result.sessions, result);
        checkDominantHands(result, groupLabel);
        return result;
    }

    const cellText = (value) => (value === null || value === undefined ? 'NA' : typeof value === 'boolean' ? (value ? 'TRUE' : 'FALSE') : String(value));

    function csvValue(value) {
        if (value === null || value === undefined || typeof value === 'number' || typeof value === 'boolean') return cellText(value);
        return `"${String(value).replace(/"/g, '""')}"`;
    }

    function toCsv(columns, rows) {
        return [columns.map(csvValue).join(',')].concat(rows.map(row => columns.map(name => csvValue(row[name])).join(','))).join('\n') + '\n';
    }

    function kinematicsPlan(result) {
        const dominant = Object.create(null);
        recordedHands(result.blocks).forEach((hands, id) => { dominant[id] = hands.size === 1 ? Array.from(hands)[0] : ''; });
        const blocks = result.blocks.map(block => {
            const absent = [['kinematics-LEFT', block.source.entries.left], ['kinematics-RIGHT', block.source.entries.right]].filter(([, entry]) => !entry).map(([name]) => name);
            const { file, entries } = block.source;
            const offsets = absent.length ? null : { behaviour: entries.trial.offset, left: entries.left.offset, right: entries.right.offset };
            return { blockId: `${block.ID}/s${block.Session}/${block.Block}`, blockName: block.Block, participantId: block.ID, session: `s${block.Session}`, file, offsets, missing: absent.join(';') };
        });
        return { blocks, dominant };
    }

    const OTHER_HAND = { LEFT: 'RIGHT', RIGHT: 'LEFT' };
    const DOUBLE_EPSILON = 2.220446049250313e-16;
    const rValue = (x) => (Math.abs(x) >= 1e15 ? x : Number(x.toPrecision(15)));

    function targetedHands(result) {
        const targeted = Object.create(null);
        recordedHands(result.blocks).forEach((hands, id) => { targeted[id] = hands.size === 1 ? OTHER_HAND[Array.from(hands)[0]] || '' : ''; });
        return targeted;
    }

    function proportionRows(rows, targeted) {
        const blocks = new Map();
        rows.forEach(row => {
            if (row.Target === null || row.Target === undefined) return;
            const key = `${row.ID}|${row.Session}|${row.BlockOrder}`;
            if (!blocks.has(key)) blocks.set(key, { row, targets: new Map() });
            const targets = blocks.get(key).targets;
            if (!targets.has(row.Target)) targets.set(row.Target, { total: 0, hits: 0, missingHand: false });
            const count = targets.get(row.Target);
            count.total++;
            if (row.Hand === null) count.missingHand = true;
            else if (row.Hand === targeted[row.ID]) count.hits++;
        });
        const out = [];
        blocks.forEach(({ row, targets }) => {
            const hand = targeted[row.ID] || '';
            Array.from(targets.keys()).sort((a, b) => a - b).forEach(target => {
                const count = targets.get(target);
                const known = !!hand && !count.missingHand;
                const share = known ? count.hits / count.total * 100 : null;
                out.push({
                    ID: row.ID, Session: row.Session, Block: row.Block, BlockType: row.BlockType, BlockNum: row.BlockNum, Target: target,
                    total_trials: count.total, targeted_hits: known ? count.hits : null, TargetedHand: hand, Proportion: share === null ? null : rValue(share),
                    share, BlockOrder: row.BlockOrder
                });
            });
        });
        return out;
    }

    function logitInverse(eta) {
        const e = eta < -30 ? DOUBLE_EPSILON : eta > 30 ? 1 / DOUBLE_EPSILON : Math.exp(eta);
        return e / (1 + e);
    }

    function logitSlope(eta) {
        if (eta > 30 || eta < -30) return DOUBLE_EPSILON;
        const e = Math.exp(eta);
        return e / ((1 + e) * (1 + e));
    }

    const yLogY = (y, mu) => (y !== 0 ? y * Math.log(y / mu) : 0);
    const deviance = (ys, mus) => ys.reduce((sum, y, i) => sum + 2 * (yLogY(y, mus[i]) + yLogY(1 - y, 1 - mus[i])), 0);
    const dot = (u, v) => u.reduce((sum, value, i) => sum + value * v[i], 0);

    function weightedLine(xs, zs, ws) {
        const first = ws, second = xs.map((x, i) => x * ws[i]), target = zs.map((z, i) => z * ws[i]);
        const r11 = Math.sqrt(dot(first, first));
        const q1 = first.map(value => value / r11);
        const r12 = dot(q1, second);
        const rest = second.map((value, i) => value - r12 * q1[i]);
        const r22 = Math.sqrt(dot(rest, rest));
        if (!(r22 > 1e-11 * Math.sqrt(dot(second, second)))) return null;
        const q2 = rest.map(value => value / r22);
        const slope = dot(q2, target) / r22;
        return [(dot(q1, target) - r12 * slope) / r11, slope];
    }

    function fitLogistic(xs, ys) {
        let eta = ys.map(y => (y + 0.5) / 2).map(mu => Math.log(mu / (1 - mu)));
        let mu = eta.map(logitInverse);
        let devOld = deviance(ys, mu), coef = null;
        for (let iteration = 0; iteration < 25; iteration++) {
            const slopes = eta.map(logitSlope);
            const z = eta.map((value, i) => value + (ys[i] - mu[i]) / slopes[i]);
            const w = slopes.map((slope, i) => Math.sqrt(slope * slope / (mu[i] * (1 - mu[i]))));
            coef = weightedLine(xs, z, w);
            if (!coef) return null;
            eta = xs.map(x => coef[0] + coef[1] * x);
            mu = eta.map(logitInverse);
            const dev = deviance(ys, mu);
            if (Math.abs(dev - devOld) / (Math.abs(dev) + 0.1) < 1e-8) break;
            devOld = dev;
        }
        return coef;
    }

    function pseFor(points) {
        const usable = points.filter(point => point.share !== null);
        const coef = usable.length >= 2 ? fitLogistic(usable.map(point => point.Target), usable.map(point => point.share / 100)) : null;
        const raw = coef ? -coef[0] / coef[1] : NaN;
        if (Number.isNaN(raw)) return { raw: null, pse: null, bounded: null, coef: null };
        if (Math.abs(raw) > 1000) return { raw, pse: null, bounded: null, coef };
        return { raw, pse: Math.min(11, Math.max(1, raw)), bounded: raw < 1 || raw > 11, coef };
    }

    function pseRows(proportions) {
        const blocks = new Map();
        proportions.forEach(row => {
            const key = `${row.ID}|${row.Session}|${row.BlockOrder}`;
            if (!blocks.has(key)) blocks.set(key, []);
            blocks.get(key).push(row);
        });
        return Array.from(blocks.values()).map(points => {
            const first = points[0];
            const fit = first.TargetedHand ? pseFor(points) : { raw: null, pse: null, bounded: null, coef: null };
            return {
                ID: first.ID, Session: first.Session, Block: first.Block, BlockType: first.BlockType, BlockNum: first.BlockNum, TargetedHand: first.TargetedHand,
                PSE_raw: fit.raw === null ? null : rValue(fit.raw), PSE: fit.pse === null ? null : rValue(fit.pse), PSE_bounded: fit.bounded,
                BlockOrder: first.BlockOrder, coef: fit.coef, points
            };
        });
    }

    function pseTables(result) {
        const targeted = targetedHands(result);
        const proportions = proportionRows(result.rows, targeted);
        return { targeted, proportions, pse: pseRows(proportions) };
    }

    function pseProblems(tables, group) {
        const hand = group === 'patients' ? 'more affected hand' : 'non-dominant hand';
        const unknown = Array.from(new Set(tables.pse.filter(row => !row.TargetedHand).map(row => row.ID))).sort(compareText);
        return unknown.map(id => `Participant ${id || '(no ID)'}: the ${hand} is not known, so their proportions and PSE are blank.`);
    }

    function readTable(text) {
        const table = parseCsv(text || '');
        const header = table[0] || [];
        return table.slice(1).map(row => Object.fromEntries(header.map((name, i) => [name, row[i]])));
    }

    function readKinematics(run, group) {
        const file = (name) => (run.files.find(item => item.name === name) || { text: '' }).text;
        const summary = JSON.parse(file('batch_summary.json').replace(/"(?:[^"\\]|\\.)*"|-?\b(?:NaN|Infinity)\b/g, match => (match[0] === '"' ? match : 'null')));
        const unknown = (summary.handedness_not_known || summary.less_affected_hand_not_known || []).slice().sort(compareText);
        return {
            group,
            files: run.files, checksums: run.checksums, versions: run.versions, summary,
            master: file('kinematics_all_valid_reaches_master.csv'),
            masterRows: summary.analysis_master_rows,
            errors: readTable(file('processing_errors.csv')),
            incomplete: readTable(file('incomplete_file_triplets.csv')),
            reasons: readTable(file('qc_reason_counts.csv')).filter(item => item.qc_reason !== 'valid'),
            unknownHands: unknown
        };
    }

    function kinematicsProblems(kinematics) {
        return [
            ...kinematics.errors.map(item => `${item.block_id}: this block could not be processed, so it is not in the kinematics master. ${item.error_type}: ${item.error}`),
            ...kinematics.incomplete.map(item => `${item.block_id}: this block is not in the kinematics master. Missing: ${item.missing_files}`),
            ...kinematics.unknownHands.map(id => `Participant ${id || '(no ID)'}: ${kinematics.group === 'patients' ? 'the less affected hand is not known, so the less affected and more affected hand columns are blank.' : 'handedness is not known, so the dominant and non-dominant hand columns are blank.'}`)
        ];
    }

    function compareRows(oldRows, newRows, oldKey, newKey, where, differences) {
        const countNew = occurrenceKey(), countOld = occurrenceKey();
        const keyed = newRows.map(row => [countNew(...newKey(row)), row]);
        const fresh = new Map(keyed);
        const oldKeys = new Set(), examples = [];
        let changed = 0, missing = 0;
        oldRows.forEach(old => {
            const key = countOld(...oldKey(old));
            oldKeys.add(key);
            const row = fresh.get(key);
            if (!row) {
                missing++;
                if (examples.length < 5) examples.push(`${where(old)} is no longer present.`);
                return;
            }
            const differs = differences(row, old);
            if (differs) {
                changed++;
                if (examples.length < 5) examples.push(`${where(old)}: ${differs}.`);
            }
        });
        const addedRows = keyed.filter(([key]) => !oldKeys.has(key)).map(([, row]) => row);
        return { added: addedRows.length, addedRows, changed, missing, examples };
    }

    function compareKinematics(oldText, newText) {
        const oldTable = parseCsv(oldText), newTable = parseCsv(newText);
        if ((oldTable[0] || []).join() !== (newTable[0] || []).join()) return { comparable: false, examples: [] };
        const header = newTable[0] || [];
        const blockAt = header.indexOf('block_id'), trialAt = header.indexOf('trial');
        const sameValue = (a, b) => a === b || (a !== '' && b !== '' && Number(a) === Number(b));
        const keyOf = (row) => [row[blockAt], row[trialAt]];
        const differences = (row, old) => {
            const names = header.filter((_, i) => !sameValue(row[i], old[i]));
            return names.length ? `${names.join(', ')} changed` : '';
        };
        return { comparable: true, ...compareRows(oldTable.slice(1), newTable.slice(1), keyOf, keyOf, old => `${old[blockAt]}, trial ${old[trialAt]}`, differences) };
    }

    function reportText(exportsRead, result, createdIso, kinematics, group) {
        const list = (items) => items.length ? items.map(item => `- ${item}`) : ['- None'];
        const tables = pseTables(result);
        const count = (test) => tables.pse.filter(test).length;
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
            'ZIP files read (SHA-256):', ...list(exportsRead.map(zip => `${zip.name}: ${zip.sha256 || 'not available'}`)),
            '',
            'Proportions and PSE',
            `Blocks: ${tables.pse.length}`,
            `Blocks with a PSE inside targets 1 to 11: ${count(row => row.PSE !== null && !row.PSE_bounded)}`,
            `Blocks with a PSE outside targets 1 to 11, set to 1 or 11: ${count(row => row.PSE_bounded === true)}`,
            `Blocks without a PSE: ${count(row => row.PSE === null)}`,
            '',
            'PSE problems:', ...list(pseProblems(tables, group)),
            ...(kinematics ? [
                '',
                'Kinematics',
                `Pipeline version: ${kinematics.summary.pipeline_version}`,
                `Resampling and filter: ${kinematics.summary.configuration.resample_hz} Hz, ${kinematics.summary.configuration.filter_cutoff_hz} Hz low-pass`,
                `Blocks processed: ${kinematics.summary.processed_blocks}`,
                `Trials: ${kinematics.summary.trials_total}`,
                `Trials that passed the quality checks: ${kinematics.summary.trials_valid_core}`,
                `Rows in the kinematics master: ${kinematics.masterRows}`,
                '',
                'Kinematics problems:', ...list(kinematicsProblems(kinematics)),
                '',
                'Software:', ...list(Object.entries(kinematics.versions).map(([name, version]) => `${name} ${version}`)),
                '',
                'Python scripts (SHA-256):', ...list(Object.entries(kinematics.checksums).map(([name, sum]) => `${name}: ${sum}`))
            ] : ['', 'Kinematics: not calculated in this run, so the kinematics master was not updated.'])
        ].join('\n') + '\n';
    }

    function fileNames(group, practice) {
        const prefix = practice ? 'PRACTICE_' : '';
        return { master: `${prefix}handDB_${group}.csv`, kinematics: `${prefix}kinematicsDB_${group}.csv`, details: `${prefix}kinematics_details`, blocks: `${prefix}blocks_${group}.csv`, report: `${prefix}report_${group}.txt`, proportions: `${prefix}propDB_${group}.csv`, pse: `${prefix}pseDB_${group}.csv` };
    }

    async function addChecksums(exportsRead) {
        for (const zip of exportsRead) zip.sha256 = await sha256(zip.file);
    }

    function outputFiles(exportsRead, result, createdIso, group, practice, kinematics) {
        const names = fileNames(group, practice);
        const tables = pseTables(result);
        return [
            { path: names.master, parts: [toCsv(COLUMNS, result.rows)] },
            ...(kinematics ? [{ path: names.kinematics, parts: [kinematics.master] }] : []),
            { path: names.proportions, parts: [toCsv(PROP_COLUMNS, tables.proportions)] },
            { path: names.pse, parts: [toCsv(PSE_COLUMNS, tables.pse)] },
            { path: names.blocks, parts: [toCsv(BLOCK_COLUMNS, result.blocks)] },
            { path: names.report, parts: [reportText(exportsRead, result, createdIso, kinematics, group)] },
            ...(kinematics ? kinematics.files.filter(item => item.name !== 'kinematics_all_valid_reaches_master.csv').map(item => ({ folder: names.details, path: item.name, parts: [item.text] })) : [])
        ];
    }

    function checkStudyFolder(folder) {
        const name = folder.name;
        const lower = name.toLowerCase();
        if (Object.hasOwn(GROUPS, lower)) return { status: 'wrong', message: `You selected the ${name} folder. Select the experiment folder containing it.` };
        if (lower === 'zips' || lower === 'history') return { status: 'wrong', message: `You selected the ${name} folder. Select the experiment folder two levels above it.` };
        const miscased = folder.dirs.find(dir => Object.hasOwn(GROUPS, dir.toLowerCase()) && !Object.hasOwn(GROUPS, dir));
        if (miscased) return { status: 'wrong', message: `Rename the ${miscased} folder to ${miscased.toLowerCase()}, all in lower case, then select ${name} again.` };
        const present = Object.keys(GROUPS).filter(group => folder.dirs.includes(group));
        for (const group of present) {
            const wrongCase = folder.groups[group].find(dir => ['zips', 'history'].includes(dir.toLowerCase()) && !['zips', 'history'].includes(dir));
            if (wrongCase) return { status: 'wrong', message: `Rename the ${wrongCase} folder inside ${group} to ${wrongCase.toLowerCase()}, all in lower case, then select ${name} again.` };
        }
        const complete = present.filter(group => folder.groups[group].includes('zips'));
        if (complete.length === Object.keys(GROUPS).length) return { status: 'ok', message: `${name} contains the patients and controls folders.` };
        if (present.length) return { status: 'setup', message: `${name} is missing required folders. Select Set up this folder to create them.` };
        const other = folder.dirs.concat(folder.files).filter(item => !item.startsWith('.') && !/^(readme|license)/i.test(item));
        if (!other.length) return { status: 'setup', message: `${name} is empty. Select Set up this folder to create the patients and controls folders.` };
        return { status: 'wrong', message: `${name} has neither a patients nor a controls folder. Select the correct experiment folder, or create an empty folder for a new experiment.` };
    }

    function crossGroupStops(groupName, exportsRead, otherName, otherExports) {
        const keyOf = (block) => `${block.info.ParticipantID}|${block.info.SessionStartISO}`;
        const usable = (zip) => zip.blocks.filter(block => !block.problem && block.info.SessionStartISO);
        const other = new Map();
        otherExports.forEach(zip => usable(zip).forEach(block => other.set(keyOf(block), zip.name)));
        const stops = new Set();
        exportsRead.forEach(zip => usable(zip).forEach(block => {
            if (other.has(keyOf(block))) stops.add(`${zip.name} in ${groupName} and ${other.get(keyOf(block))} in ${otherName} contain the same session. Remove the ZIP file from the incorrect folder, then try again.`);
        }));
        return Array.from(stops);
    }

    function compareTable(oldText, columns, rows, keyColumns, where) {
        const table = parseCsv(oldText);
        if ((table[0] || []).join() !== columns.join()) return { comparable: false, examples: [] };
        const at = (name) => columns.indexOf(name);
        const oldRows = table.slice(1);
        const oldIds = new Set(oldRows.map(old => old[at('ID')]));
        const compared = compareRows(oldRows, rows,
            old => keyColumns.map(name => old[at(name)]),
            row => keyColumns.map(name => cellText(row[name])),
            old => where(name => old[at(name)]),
            (row, old) => columns.filter(name => cellText(row[name]) !== old[at(name)]).map(name => `${name} changed from ${old[at(name)]} to ${cellText(row[name])}`).join('; '));
        return { comparable: true, ...compared, addedParticipants: new Set(rows.map(row => row.ID).filter(id => !oldIds.has(id))).size };
    }

    function compareMaster(oldText, rows) {
        return compareTable(oldText, COLUMNS, rows, ['ID', 'Session', 'BlockOrder', 'Trial'], get => `Participant ${get('ID')}, session ${get('Session')}, block ${get('BlockOrder')}, trial ${get('Trial')}`);
    }

    function compareProportions(oldText, rows) {
        return compareTable(oldText, PROP_COLUMNS, rows, ['ID', 'Session', 'Block', 'Target'], get => `Participant ${get('ID')}, session ${get('Session')}, ${get('Block')}, target ${get('Target')}`);
    }

    function comparePse(oldText, rows) {
        return compareTable(oldText, PSE_COLUMNS, rows, ['ID', 'Session', 'Block'], get => `Participant ${get('ID')}, session ${get('Session')}, ${get('Block')}`);
    }

    return { VERSION, COLUMNS, BLOCK_COLUMNS, GROUPS, parseCsv, readExport, addChecksums, build, toCsv, reportText, fileNames, outputFiles, checkStudyFolder, crossGroupStops, compareMaster, kinematicsPlan, readKinematics, kinematicsProblems, compareKinematics, PROP_COLUMNS, PSE_COLUMNS, fitLogistic, proportionRows, pseRows, pseTables, pseProblems, compareProportions, comparePse };
})();

if (typeof module !== 'undefined') module.exports = WebSpheresAnalysis;
