import { loadPyodide } from './vendor/pyodide/pyodide.mjs';

const LOCKED_SCRIPTS = {
    'kinematics_block_pipeline.py': 'ecaaa0b408546eb937b087b86cb9fbe0e466155038da25e2fbd692220bcc47dd',
    'kinematics_batch_pipeline.py': '567fc3331a5db668284d9b6857966003a638ea1b79e796fef540275873bda92e',
    'kinematics_batch_pipeline_controls.py': 'aca21c5bd647c08f1f1fd7084eb493cd8e99f8f185e27aee2c657e8b008886e0'
};
const ADAPTER = 'webspheres_adapter.py';
const PACKAGES = ['numpy', 'pandas', 'scipy', 'matplotlib'];
const ROOT = '/kin';
const INPUT = `${ROOT}/input`;
const DATA = `${INPUT}/data`;
const OUTPUT = `${ROOT}/output`;
const CODE = `${ROOT}/code`;

async function digest(bytes) {
    const hash = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
}

async function loadScripts(py) {
    const checksums = {};
    py.FS.mkdirTree(CODE);
    for (const name of Object.keys(LOCKED_SCRIPTS).concat(ADAPTER)) {
        const response = await fetch(new URL(`./analysis-python/${name}`, import.meta.url));
        if (!response.ok) throw new Error(`${name} could not be loaded.`);
        const bytes = new Uint8Array(await response.arrayBuffer());
        checksums[name] = await digest(bytes);
        if (LOCKED_SCRIPTS[name] && checksums[name] !== LOCKED_SCRIPTS[name]) throw new Error(`${name} is not the approved version of this script.`);
        py.FS.writeFile(`${CODE}/${name}`, bytes);
    }
    return checksums;
}

function prepareData(py, blocks) {
    const blobs = [];
    const manifestBlocks = blocks.map((block, index) => {
        const entry = { block_id: block.blockId, block_name: block.blockName, participant_id: block.participantId, session: block.session, session_folder: block.session, missing: block.missing || '' };
        if (!block.missing) {
            [['behaviour', block.behaviour], ['left', block.left], ['right', block.right]].forEach(([kind, data]) => {
                const name = `${index}-${kind}.csv`;
                blobs.push({ name, data });
                entry[kind] = `${DATA}/${name}`;
            });
        }
        return entry;
    });
    py.FS.mkdirTree(DATA);
    py.FS.mkdirTree(OUTPUT);
    py.FS.mount(py.FS.filesystems.WORKERFS, { blobs }, DATA);
    return manifestBlocks;
}

function readOutputs(py) {
    return py.FS.readdir(OUTPUT).filter(name => name !== '.' && name !== '..').sort().map(name => ({ name, text: py.FS.readFile(`${OUTPUT}/${name}`, { encoding: 'utf8' }) }));
}

async function run({ group, blocks, dominant }) {
    postMessage({ type: 'status', stage: 'loading' });
    let completed = 0, total = 0;
    const py = await loadPyodide({
        indexURL: new URL('./vendor/pyodide/', import.meta.url).href,
        stdout: (line) => {
            const progress = /^\[(\d+)\/(\d+)\] /.exec(line);
            if (!progress) return;
            completed = +progress[1];
            total = +progress[2];
            postMessage({ type: 'progress', completed, total });
        },
        stderr: () => {}
    });
    await py.loadPackage(PACKAGES, { messageCallback: () => {}, errorCallback: () => {} });
    const checksums = await loadScripts(py);
    const manifestBlocks = prepareData(py, blocks);
    const manifest = { group, blocks: manifestBlocks, dominant, input: INPUT, output: OUTPUT };
    py.FS.writeFile(`${ROOT}/manifest.json`, JSON.stringify(manifest));
    postMessage({ type: 'status', stage: 'calculating' });
    const versions = await py.runPythonAsync(`
import json, os, platform, sys
os.environ["MPLBACKEND"] = "agg"
sys.dont_write_bytecode = True
sys.path.insert(0, "${CODE}")
import numpy, pandas, scipy, matplotlib
import webspheres_adapter
webspheres_adapter.run("${ROOT}/manifest.json")
json.dumps({"python": platform.python_version(), "numpy": numpy.__version__, "pandas": pandas.__version__, "scipy": scipy.__version__, "matplotlib": matplotlib.__version__})
`);
    postMessage({ type: 'done', files: readOutputs(py), checksums, versions: { pyodide: py.version, ...JSON.parse(versions) } });
}

self.onmessage = async ({ data }) => {
    try {
        await run(data);
    } catch (error) {
        postMessage({ type: 'failed', message: String(error && error.message ? error.message : error) });
    }
};
