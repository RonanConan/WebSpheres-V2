const csvLines = async (file, offset) => {
    const head = new DataView(await file.slice(offset, offset + 30).arrayBuffer());
    const start = offset + 30 + head.getUint16(26, true) + head.getUint16(28, true);
    const raw = file.slice(start, start + head.getUint32(18, true)).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return (await new Response(raw).text()).trim().split('\n').slice(1);
};

self.onmessage = async ({ data }) => {
    postMessage({ type: 'status', stage: 'loading' });
    if (data.blocks.some(block => block.participantId === '668')) return;
    if (data.blocks.some(block => block.participantId === '666')) {
        postMessage({ type: 'failed', message: 'test failure' });
        return;
    }
    const master = ['block_id,trial,value'];
    const errors = ['block_id,participant_id,session,session_folder,error_type,error'];
    const incomplete = ['block_id,block_name,participant_id,session,session_folder,filename_participant_id,missing_files'];
    let processed = 0;
    for (const [index, block] of data.blocks.entries()) {
        postMessage({ type: 'progress', completed: index + 1, total: data.blocks.length });
        if (block.missing) {
            incomplete.push(`${block.blockId},${block.blockName},${block.participantId},${block.session},${block.session},${block.participantId},${block.missing}`);
        } else if (block.participantId === '667') {
            errors.push(`${block.blockId},${block.participantId},${block.session},${block.session},ValueError,bad block`);
        } else {
            processed++;
            for (const line of await csvLines(block.file, block.offsets.behaviour)) master.push(`${block.blockId},${line.split(',')[0]},1`);
        }
    }
    const rows = master.length - 1;
    const unknown = Object.keys(data.dominant).filter(id => !data.dominant[id]);
    const summary = { pipeline_version: 'test-version', configuration: { resample_hz: 90, filter_cutoff_hz: 6 }, processed_blocks: processed, trials_total: rows + 1, trials_valid_core: rows, analysis_master_rows: rows, [data.group === 'patients' ? 'less_affected_hand_not_known' : 'handedness_not_known']: unknown };
    const text = (lines) => lines.join('\n') + '\n';
    postMessage({
        type: 'done',
        checksums: { 'kinematics_block_pipeline.py': 'abc' },
        versions: { pyodide: 'test' },
        files: [
            { name: 'all_trial_metrics.csv', text: text(master) },
            { name: 'batch_summary.json', text: JSON.stringify(summary) },
            { name: 'incomplete_file_triplets.csv', text: text(incomplete) },
            { name: 'kinematics_all_valid_reaches_master.csv', text: text(master) },
            { name: 'processing_errors.csv', text: text(errors) },
            { name: 'qc_reason_counts.csv', text: text(['qc_reason,trials', `valid,${rows}`, 'raw_position_jump_in_target_window,1']) }
        ]
    });
};
