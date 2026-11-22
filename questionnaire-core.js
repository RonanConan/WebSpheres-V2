const WebSpheresQuestionnaires = (() => {
    const FORMAT = 1;
    const TYPES = ['scale', 'choice-followup'];
    const METHODS = ['mean', 'sum', 'sum-from-min'];
    const COLUMNS = ['ID', 'SessionID', 'LastBlockStart', 'Practice', 'AppVersion', 'AfterBlock', 'Status', 'QuestionnaireID', 'QuestionnaireVersion', 'QOrder', 'ItemID', 'ItemOrder', 'Response', 'ResponseLabel', 'FollowUpPrompt', 'FollowUpText', 'ScaleMin', 'ScaleMax', 'Reverse', 'Subscales', 'AnsweredAt', 'SubmittedAt'];
    const FILE = /^(.*?)questionnaire-(\d{4}-\d{2}-\d{2}T[\d-]+)\.csv$/;
    const DEFINITIONS_FILE = /^(.*?)questionnaire-definitions-(\d{4}-\d{2}-\d{2}T[\d-]+)\.json$/;

    const defined = new Map();
    let order = [];

    function define(def) {
        defined.set(def && def.id, def);
    }

    function use(ids) {
        order = Array.isArray(ids) ? ids.slice() : [];
    }

    const get = (id) => defined.get(id) || null;
    const all = () => Array.from(defined.values());
    const active = () => order.map(get).filter(Boolean);
    const studyIds = () => order.slice();

    const isInt = (v) => typeof v === 'number' && Number.isInteger(v);
    const scaleMin = (def) => def.scale.values[0];
    const scaleMax = (def) => def.scale.values[def.scale.values.length - 1];

    function check(defs) {
        const problems = [];
        const qids = new Set(), itemIds = new Set();
        (defs || []).forEach((def, n) => {
            const where = def && def.id ? `Questionnaire ${def.id}` : `Questionnaire ${n + 1}`;
            if (!def || typeof def !== 'object') { problems.push(`${where} is missing.`); return; }
            if (!def.id || !/^[A-Za-z0-9-]+$/.test(def.id)) problems.push(`${where} needs an id made of letters, numbers and hyphens.`);
            if (qids.has(def.id)) problems.push(`${where} is listed twice.`);
            qids.add(def.id);
            if (!isInt(def.version) || def.version < 1) problems.push(`${where} needs a whole-number version of 1 or more.`);
            if (!def.title) problems.push(`${where} needs a title for participants.`);
            if (!TYPES.includes(def.type)) problems.push(`${where} has an unknown type "${def.type}".`);
            if (!Array.isArray(def.items) || !def.items.length) { problems.push(`${where} has no items.`); return; }
            if (def.type === 'scale') {
                const s = def.scale || {};
                const values = Array.isArray(s.values) ? s.values : [];
                if (values.length < 2 || !values.every(isInt) || !values.every((v, i) => i === 0 || v === values[i - 1] + 1)) problems.push(`${where} needs scale values that are consecutive whole numbers, such as 1 to 5.`);
                if (!Array.isArray(s.labels) || s.labels.length !== values.length) problems.push(`${where} needs one scale label per scale value (use "" for no label).`);
            }
            def.items.forEach((item, i) => {
                const at = `${where}, item ${i + 1}`;
                if (!item || !item.id || !/^[A-Za-z0-9_-]+$/.test(item.id)) { problems.push(`${at} needs an id made of letters, numbers, hyphens or underscores.`); return; }
                if (itemIds.has(item.id)) problems.push(`${at}: the item id ${item.id} is used more than once.`);
                itemIds.add(item.id);
                if (!item.text) problems.push(`${at} (${item.id}) has no text.`);
                if (def.type === 'choice-followup') {
                    if (!Array.isArray(item.options) || item.options.length < 2) problems.push(`${at} (${item.id}) needs at least two options.`);
                    else if (!item.options.every(o => item.followUp && (item.followUp[o] || item.followUp['*']))) problems.push(`${at} (${item.id}) needs a follow-up question for every option (or a "*" one for all of them).`);
                }
                if (def.type === 'scale' && item.reverse !== undefined && typeof item.reverse !== 'boolean') problems.push(`${at} (${item.id}) has a reverse setting that is not true or false.`);
            });
            const own = new Set(def.items.map(item => item && item.id));
            const scoreIds = new Set();
            (def.scores || []).forEach((sc, i) => {
                const at = `${where}, score ${i + 1}`;
                if (!sc || !sc.id) { problems.push(`${at} needs an id.`); return; }
                if (scoreIds.has(sc.id)) problems.push(`${at}: the score id ${sc.id} is used more than once.`);
                scoreIds.add(sc.id);
                if (def.type !== 'scale') problems.push(`${at} (${sc.id}): only rating-scale questionnaires can be scored.`);
                if (!METHODS.includes(sc.method)) problems.push(`${at} (${sc.id}) has an unknown method "${sc.method}".`);
                if (sc.multiply !== undefined && typeof sc.multiply !== 'number') problems.push(`${at} (${sc.id}) has a multiply value that is not a number.`);
                const items = scoreItems(def, sc);
                if (!items.length) problems.push(`${at} (${sc.id}) uses no items.`);
                items.forEach(id => { if (!own.has(id)) problems.push(`${at} (${sc.id}) uses ${id}, which is not an item of ${def.id}.`); });
            });
        });
        return problems;
    }

    function study() {
        const missingIds = order.filter(id => !defined.has(id));
        if (missingIds.length) return { defs: [], problems: missingIds.map(id => `${id} is listed in questionnaires/study.js, but its file is not loaded. Add a script tag for it to observer.html and analysis.html.`) };
        if (!order.length) return { defs: [], problems: ['No questionnaires are listed in questionnaires/study.js.'] };
        const defs = active();
        return { defs, problems: check(defs) };
    }

    const scoreItems = (def, sc) => sc.items === 'all' ? def.items.map(i => i.id) : (Array.isArray(sc.items) ? sc.items : []);

    function subscalesOf(def, itemId) {
        return (def.scores || []).filter(sc => scoreItems(def, sc).includes(itemId)).map(sc => sc.id);
    }

    function followPrompt(item, value) {
        const f = item.followUp || {};
        return f[value] || f['*'] || '';
    }

    function answered(def, item, answer) {
        if (!answer || answer.value === null || answer.value === undefined || answer.value === '') return false;
        if (def.type === 'scale') return def.scale.values.includes(answer.value);
        return item.options.includes(answer.value) && String(answer.text || '').trim().length > 0;
    }

    const missing = (def, answers) => def.items.filter(item => !answered(def, item, (answers || {})[item.id]));
    const count = (defs) => defs.reduce((n, def) => n + def.items.length, 0);
    const answeredCount = (defs, answers) => defs.reduce((n, def) => n + def.items.length - missing(def, answers).length, 0);

    function labelOf(def, item, value) {
        if (def.type !== 'scale') return value;
        const i = def.scale.values.indexOf(value);
        return i < 0 ? '' : def.scale.labels[i] || '';
    }

    const FORMULA_START = /^'*[=+\-@\t\r]/;
    const escapeText = (text) => (FORMULA_START.test(text) ? "'" + text : text);
    const unescapeText = (text) => (/^'+[=+\-@\t\r]/.test(text) ? text.slice(1) : text);

    function rawRows(defs, answers, meta) {
        const m = meta || {};
        const base = {
            ID: m.id || '', SessionID: m.sessionId || '', LastBlockStart: m.lastBlockStart || '', Practice: m.practice ? 1 : 0,
            AppVersion: m.appVersion || '', AfterBlock: m.afterBlock === undefined ? '' : m.afterBlock, Status: m.status || '', SubmittedAt: m.submittedAt || ''
        };
        const rows = [];
        defs.forEach((def, qi) => {
            const q = { QuestionnaireID: def.id, QuestionnaireVersion: def.version === undefined ? '' : def.version, QOrder: qi + 1 };
            if (!Array.isArray(def.items)) {
                rows.push(Object.assign({}, base, q));
                return;
            }
            def.items.forEach((item, ii) => {
                const a = (answers || {})[item.id] || {};
                const has = a.value !== null && a.value !== undefined && a.value !== '';
                const scale = def.type === 'scale';
                rows.push(Object.assign({}, base, q, {
                    ItemID: item.id, ItemOrder: ii + 1,
                    Response: has ? a.value : '',
                    ResponseLabel: has ? labelOf(def, item, a.value) : '',
                    FollowUpPrompt: !scale && has ? followPrompt(item, a.value) : '',
                    FollowUpText: !scale ? escapeText(String(a.text || '').trim()) : '',
                    ScaleMin: scale ? scaleMin(def) : '', ScaleMax: scale ? scaleMax(def) : '',
                    Reverse: scale ? (item.reverse ? 1 : 0) : '',
                    Subscales: subscalesOf(def, item.id).join(';'),
                    AnsweredAt: a.at || ''
                }));
            });
        });
        return rows;
    }

    function csvCell(v) {
        const s = v === null || v === undefined ? '' : String(v);
        return /[",\r\n]/.test(s) || /^\s|\s$/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }

    function toCsv(columns, rows) {
        return [columns.join(',')].concat(rows.map(r => columns.map(c => csvCell(r[c])).join(','))).join('\r\n') + '\r\n';
    }

    function parseCsv(text) {
        const rows = [];
        let row = [], cell = '', quoted = false, i = 0;
        const s = String(text || '').replace(/^﻿/, '');
        while (i < s.length) {
            const ch = s[i];
            if (quoted) {
                if (ch === '"') {
                    if (s[i + 1] === '"') { cell += '"'; i += 2; continue; }
                    quoted = false; i++; continue;
                }
                cell += ch; i++; continue;
            }
            if (ch === '"') { quoted = true; i++; continue; }
            if (ch === ',') { row.push(cell); cell = ''; i++; continue; }
            if (ch === '\r' || ch === '\n') {
                row.push(cell); rows.push(row); row = []; cell = '';
                i += ch === '\r' && s[i + 1] === '\n' ? 2 : 1;
                continue;
            }
            cell += ch; i++;
        }
        if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
        return rows.filter(r => r.length > 1 || r[0] !== '');
    }

    function readRaw(text) {
        const table = parseCsv(text);
        const header = table[0] || [];
        const rows = table.slice(1).map(cells => Object.fromEntries(header.map((h, i) => [h, cells[i] === undefined ? '' : cells[i]])));
        rows.forEach(r => { if (r.FollowUpText) r.FollowUpText = unescapeText(r.FollowUpText); });
        return { header, rows };
    }

    function scoredValue(def, item, value) {
        return item.reverse ? scaleMin(def) + scaleMax(def) - value : value;
    }

    const tidy = (x) => Number(x.toFixed(4));

    function score(def, responses) {
        const byId = new Map(def.items.map(item => [item.id, item]));
        return (def.scores || []).map(sc => {
            const ids = scoreItems(def, sc);
            const values = ids.map(id => {
                const v = (responses || {})[id];
                return byId.has(id) && isInt(v) && def.scale.values.includes(v) ? scoredValue(def, byId.get(id), v) : null;
            });
            const used = values.filter(v => v !== null);
            let value = null;
            if (used.length === ids.length && ids.length) {
                const multiply = sc.multiply === undefined ? 1 : sc.multiply;
                if (sc.method === 'mean') value = used.reduce((a, b) => a + b, 0) / used.length * multiply;
                else if (sc.method === 'sum') value = used.reduce((a, b) => a + b, 0) * multiply;
                else if (sc.method === 'sum-from-min') value = used.reduce((a, b) => a + b - scaleMin(def), 0) * multiply;
                value = tidy(value);
            }
            return { id: sc.id, label: sc.label || sc.id, method: sc.method, value, itemsUsed: used.length, itemsExpected: ids.length };
        });
    }

    function snapshot(defs) {
        return { format: FORMAT, questionnaires: JSON.parse(JSON.stringify(defs)) };
    }

    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

    return {
        FORMAT, COLUMNS, FILE, DEFINITIONS_FILE, define, use, get, all, active, studyIds, study, check, escapeText, unescapeText,
        followPrompt, answered, missing, count, answeredCount, labelOf, subscalesOf, scoredValue,
        rawRows, toCsv, parseCsv, readRaw, score, snapshot, same
    };
})();

if (typeof module !== 'undefined') module.exports = WebSpheresQuestionnaires;
