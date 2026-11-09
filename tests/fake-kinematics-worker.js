const csvLines = async (blob) => (await blob.text()).trim().split('\n').slice(1);

self.onmessage = async ({ data }) => {
    postMessage({ type: 'status', stage: 'loading' });
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
            for (const line of await csvLines(block.behaviour)) master.push(`${block.blockId},${line.split(',')[0]},1`);
        }
    }
    const rows = master.length - 1;
    const summary = { pipeline_version: 'test-version', configuration: { resample_hz: 90, filter_cutoff_hz: 6 }, processed_blocks: processed, trials_total: rows + 1, trials_valid_core: rows, analysis_master_rows: rows };
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
