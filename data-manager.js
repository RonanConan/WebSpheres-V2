AFRAME.registerComponent('data-manager', {
    NOTES_HEADER: 'Run,Trial,RunTimeMs,ReceivedRunTimeMs,DateTime,Type,Text,Old,New,Estimated\n',

    TRIAL_HEADER: 'Trial,Timestamp,Target,Hand,Points,HitType,DecisionTime,TotalMovementTime,RecentreCount,ParticipantID,Run\n',

    init: function() {
        this.trialData = [];
        this.trialNumber = 0;
        this.sphereAppearTime = 0;
        this.currentDecisionTime = 0;
        this.currentMovementTime = 0;
        this.totalTrials = 352;
        this.sessionStartTime = 0;
        this.recentreCount = 0;
        this.participantId = '';
        this.experimenter = '';
        this.sessionEndTime = 0;
        this.lastExportTimestamp = '';
        this.xrModes = [];
        this.el.sceneEl?.addEventListener?.('enter-vr', () => {
            if (this.sessionStartTime > 0 && !this.sessionEndTime) this.noteXrMode();
        });
        this.pauses = [];
        this.setupUnlocks = [];
        this.setupChanges = [];
        this.finalExportScheduled = false;
        this.runClosing = false;
        this.runNumber = 1;
        this.plan = null;
        this.completedRuns = [];
        this.frozenInfo = null;
        this.breakBefore = '';
        this.recalibrated = [];
        this.recalibratedBefore = [];
        this.betweenRecentres = 0;
        this.zipping = 0;
        this.breakSavedRun = 0;
        this.notes = [];
        this.noteIds = new Set();
        this.setupManualExport();
    },

    sessionTime: function() {
        return this.sessionStartTime > 0 ? Date.now() - this.sessionStartTime : 0;
    },

    startPause: function() {
        this.pauses.push({ start: this.sessionTime(), end: null });
    },

    endPause: function() {
        const last = this.pauses[this.pauses.length - 1];
        if (last && last.end === null) last.end = this.sessionTime();
    },

    logSetupUnlock: function() {
        this.setupUnlocks.push(this.sessionTime());
    },

    logSetupChange: function (field, before, after) {
        const clean = (v) => String(v).replace(/[;|,\r\n]/g, ' ');
        this.setupChanges.push(`${this.sessionTime()}|${this.trialNumber}|${field}|${clean(before)}|${clean(after)}`);
        this.notes.push({ run: this.runNumber, trial: this.trialNumber, time: this.sessionTime(), received: this.sessionTime(), dateTime: new Date().toISOString(), type: 'setup', text: field, old: String(before), new: String(after), estimated: false });
    },

    scheduleFinalExport: function() {
        if (this.finalExportScheduled) return;
        this.finalExportScheduled = true;
        this.runClosing = true;
        this.sessionEndTime = Date.now();
        setTimeout(() => {
            document.querySelector('#kinematics-manager').components['kinematics-manager'].stopTracking();
            this.runClosing = false;
            this.frozenInfo = this.buildSessionInfo();
            const sphereManager = document.querySelector('#sphere-manager')?.components?.['sphere-manager'];
            if (!sphereManager || sphereManager.phase === 'complete') this.exportAll();
            else this.saveForBreak();
            sphereManager?.markStateChanged();
        }, 1000);
    },

    addNote: function(note) {
        if (!note || typeof note.id !== 'string' || typeof note.text !== 'string' || !note.text.trim() || note.text.length > 500) return { ok: false, reason: 'Note: 1-500 characters' };
        if (note.type !== 'note' && note.type !== 'alert') return { ok: false, reason: 'Note: unknown type' };
        if (this.noteIds.has(note.id)) return { ok: true };
        this.noteIds.add(note.id);
        this.notes.push({ run: Number(note.run) || this.runNumber, trial: Number(note.trial) || 0, time: Math.round(Number(note.time)) || 0, received: this.sessionTime(), dateTime: String(note.dateTime || ''), type: note.type, text: note.text.trim(), old: '', new: '', estimated: !!note.estimated });
        return { ok: true };
    },

    notesCsv: function() {
        if (!this.notes.length) return '';
        const field = (v) => /[",\r\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);
        return this.NOTES_HEADER + this.notes.map(n => [n.run, n.trial, n.time, n.received, n.dateTime, n.type, field(n.text), field(n.old), field(n.new), n.estimated ? 1 : 0].join(',') + '\n').join('');
    },

    saveForBreak: function() {
        const link = this.plan?.runs[this.runNumber - 1];
        if (!link?.off || this.breakSavedRun === this.runNumber) return;
        this.breakSavedRun = this.runNumber;
        this.exportAll();
    },

    isSaving: function() {
        return this.zipping > 0 || (this.downloadQueue?.length ?? 0) > 0;
    },

    sessionPrefix: function() {
        return this.participantId ? this.participantId + '_' : 'session-';
    },

    plannedRuns: function() {
        return Math.max(this.plan ? this.plan.runs.length : 1, this.runNumber);
    },

    planText: function() {
        if (!this.plan) return '';
        return this.plan.runs.map((r, i) => `${i + 1}:${r.condition === 2 ? 'boost' : 'no-boost'}:${r.off ? 'headset-off' : 'headset-on'}${r.recal ? ':recalibrate' : ''}`).join('|');
    },

    runPrefix: function(participantId, run) {
        const id = participantId ? participantId + '_' : '';
        return this.plannedRuns() > 1 ? `${id}run${run}_` : id;
    },

    filePrefix: function() {
        return this.runPrefix(this.participantId, this.runNumber);
    },

    sessionInfo: function() {
        return this.frozenInfo || this.buildSessionInfo();
    },

    archiveRun: function(kinematicsManager) {
        this.completedRuns.push({
            run: this.runNumber,
            participantId: this.participantId,
            trials: this.trialData,
            kinL: kinematicsManager.leftHandData,
            kinR: kinematicsManager.rightHandData,
            info: this.sessionInfo(),
            ms: this.sessionEndTime - this.sessionStartTime,
            recentres: this.recentreCount,
            pauses: this.pauses.length
        });
    },

    prepareNextRun: function() {
        const finished = this.plan?.runs[this.runNumber - 1];
        this.breakBefore = finished?.off ? 'headset-off' : 'headset-on';
        this.recalibratedBefore = this.recalibrated;
        this.recalibrated = [];
        this.betweenRecentres = 0;
        this.runNumber++;
        this.trialData = [];
        this.trialNumber = 0;
        this.recentreCount = 0;
        this.pauses = [];
        this.setupUnlocks = [];
        this.setupChanges = [];
        this.sessionEndTime = 0;
        this.sphereAppearTime = 0;
        this.currentDecisionTime = 0;
        this.currentMovementTime = 0;
        this.finalExportScheduled = false;
        this.frozenInfo = null;
    },

    fileTimestamp: function() {
        return new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    },

    formatTrialRow: function(trial) {
        return `${trial.trial},${trial.timestamp},${trial.target},${trial.hand},${trial.points},${trial.hitType},${trial.decisionTime},${trial.totalMovementTime},${trial.recentreCount},${trial.participantId},${trial.run}\n`;
    },

    buildSessionInfo: function() {
        const sphereManager = document.querySelector('#sphere-manager')?.components?.['sphere-manager'];
        const scoreManager = document.querySelector('#score-display')?.components?.['score-manager'];
        const home = document.querySelector('#home-rectangle')?.getAttribute('position') || {};
        const reach = sphereManager?.calib?.reach || {};
        const perHand = sphereManager?.calib?.lap?.left ? sphereManager.calib.lap : null;
        const iso = (t) => t > 0 ? new Date(t).toISOString() : '';
        const rows = [
            ['ParticipantID', this.participantId],
            ['AppVersion', typeof APP_VERSION !== 'undefined' ? APP_VERSION : ''],
            ['SessionStartISO', iso(this.sessionStartTime)],
            ['SessionEndISO', iso(this.sessionEndTime)],
            ['EndReason', sphereManager?.endReason ?? ''],
            ['DominantHand', scoreManager?.dominantHand ?? ''],
            ['Condition', scoreManager?.currentCondition ?? ''],
            ['Mode', sphereManager?.mode ?? ''],
            ['TotalTrials', sphereManager?.totalTrials ?? this.totalTrials],
            ['TrialsCompleted', this.trialNumber],
            ['ReachHand', reach.done ? reach.hand : ''],
            ['ReachDistance', reach.done ? reach.distance : ''],
            ['Radius', sphereManager?.radius ?? ''],
            ['Height', sphereManager?.height ?? ''],
            ['HomeX', home.x ?? ''],
            ['HomeY', home.y ?? ''],
            ['HomeZ', home.z ?? ''],
            ['RecentreCount', this.recentreCount],
            ['Pauses', this.pauses.map(p => `${p.start}-${p.end === null ? '' : p.end}`).join(';')],
            ['SetupUnlocks', this.setupUnlocks.join(';')],
            ['Experimenter', this.experimenter],
            ['HomeMode', sphereManager?.homeMode ?? ''],
            ['HomeLeftX', perHand?.left.x ?? ''],
            ['HomeLeftY', perHand?.left.y ?? ''],
            ['HomeLeftZ', perHand?.left.z ?? ''],
            ['HomeRightX', perHand?.right.x ?? ''],
            ['HomeRightY', perHand?.right.y ?? ''],
            ['HomeRightZ', perHand?.right.z ?? ''],
            ['SetupChanges', this.setupChanges.join(';')],
            ['Run', this.runNumber],
            ['PlannedRuns', this.plannedRuns()],
            ['Plan', this.planText()],
            ['BreakBefore', this.breakBefore],
            ['RecalibratedBefore', this.recalibratedBefore.join(';')],
            ['XRMode', this.xrModes.join(';')]
        ];
        return 'Key,Value\n' + rows.map(([k, v]) => `${k},${v}\n`).join('');
    },

    queueDownload: function(job) {
        this.downloadQueue = this.downloadQueue || [];
        this.downloadCount = this.downloadCount || 0;
        this.downloadQueue.push(job);
        this.pumpDownloads();
    },

    pumpDownloads: function() {
        if (this.downloadTimer) return;
        while (this.downloadQueue.length && this.downloadCount < 4) {
            this.downloadQueue.shift()();
            this.downloadCount++;
        }
        if (this.downloadCount >= 4) {
            this.downloadTimer = setTimeout(() => {
                this.downloadTimer = null;
                this.downloadCount = 0;
                this.pumpDownloads();
            }, 1000);
        }
    },

    downloadBlob: function(filename, blob) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 10000);
    },

    download: function(filename, parts) {
        this.queueDownload(() => this.downloadBlob(filename, new Blob(parts, { type: 'text/csv' })));
    },

    saveFiles: function(files, zipName) {
        if (!files.length) return;
        const sphereManager = document.querySelector('#sphere-manager')?.components?.['sphere-manager'];
        const loose = () => files.forEach(f => this.download(f.name, f.parts));
        const finish = () => {
            this.zipping--;
            sphereManager?.markStateChanged();
        };
        this.zipping++;
        const zipped = typeof WebSpheresZip === 'undefined'
            ? Promise.reject(new Error('Zip unavailable'))
            : WebSpheresZip.make(files.map(f => ({ path: f.run ? `run${f.run}/${f.name}` : f.name, parts: f.parts })));
        zipped.then(blob => this.downloadBlob(zipName, blob)).catch(loose).then(finish);
    },

    exportAll: function() {
        const timestamp = this.fileTimestamp();
        const kinematicsManager = document.querySelector('#kinematics-manager').components['kinematics-manager'];
        this.lastExportTimestamp = timestamp;
        const files = [];
        const addRun = (run, prefix, trials, kinL, kinR, info) => {
            const add = (name, parts) => files.push({ run, name: `${prefix}${name}-${timestamp}.csv`, parts });
            if (trials.length) add('vr-session-data', [this.TRIAL_HEADER].concat(trials.map(t => this.formatTrialRow(t))));
            if (kinL.length) add('kinematics-LEFT', [kinematicsManager.HEADER].concat(kinL));
            if (kinR.length) add('kinematics-RIGHT', [kinematicsManager.HEADER].concat(kinR));
            if (info) add('session-info', [info]);
        };
        this.completedRuns.forEach(r => addRun(r.run, this.runPrefix(r.participantId, r.run), r.trials, r.kinL, r.kinR, r.info));
        addRun(this.runNumber, this.filePrefix(), this.trialData, kinematicsManager.leftHandData, kinematicsManager.rightHandData, this.sessionStartTime > 0 ? this.sessionInfo() : '');
        const notes = this.notesCsv();
        if (notes) files.push({ run: 0, name: `${this.sessionPrefix()}notes-${timestamp}.csv`, parts: [notes] });
        this.saveFiles(files, `${this.sessionPrefix()}${timestamp}.zip`);
    },
    
    setupManualExport: function() {
        this.buttonPressCount = 0;
        this.lastPressTime = 0;
        this.listenerAttached = false;
        
        // Try to attach listener periodically until successful
        this.attachInterval = setInterval(() => {
            this.tryAttachListener();
        }, 1000);
    },
    
    tryAttachListener: function() {
        if (this.listenerAttached) return;
        
        const rightController = document.querySelector('[meta-touch-controls="hand: right"]');
        if (rightController) {
            rightController.addEventListener('abuttondown', () => {
                this.handleAButtonPress();
            });
            this.listenerAttached = true;
            clearInterval(this.attachInterval);
        }
    },
    
    handleAButtonPress: function() {
        const currentTime = Date.now();
        
        // Reset count if more than 2 seconds since last press
        if (currentTime - this.lastPressTime > 2000) {
            this.buttonPressCount = 0;
        }
        
        this.buttonPressCount++;
        this.lastPressTime = currentTime;
        
        console.log(`A button pressed ${this.buttonPressCount}/5 times`);
        
        if (this.buttonPressCount >= 5) {
            this.exportCSV();
            this.buttonPressCount = 0; // Reset after export
        }
    },
    
    startSession: function(startTime) {
        this.sessionStartTime = startTime || Date.now();
        this.xrModes = [];
        this.noteXrMode();
    },

    xrMode: function() {
        const scene = this.el.sceneEl;
        return scene?.is?.('ar-mode') ? 'ar' : scene?.is?.('vr-mode') ? 'vr' : '';
    },

    noteXrMode: function() {
        const mode = this.xrMode();
        if (mode && !this.xrModes.includes(mode)) this.xrModes.push(mode);
    },
    
    logRecentre: function() {
        const sphereManager = document.querySelector('#sphere-manager')?.components?.['sphere-manager'];
        if (sphereManager?.phase === 'between') this.betweenRecentres++;
        else if (this.sessionStartTime > 0) this.recentreCount++;
    },
    
    startDecisionTimer: function() {
        this.sphereAppearTime = Date.now();
        this.currentDecisionTime = 0;
    },
    
    stopDecisionTimer: function() {
        if (this.sphereAppearTime > 0) {
            this.currentDecisionTime = Date.now() - this.sphereAppearTime;
        }
    },
    
    calculateAndStoreMovementTime: function() {
        if (this.sphereAppearTime > 0) {
            this.currentMovementTime = Date.now() - this.sphereAppearTime;
        }
    },
    
    recordTrial: function(targetPosition, handUsed, points, hitType, decisionTime) {
        this.trialNumber++;
        this.trialData.push({
            trial: this.trialNumber,
            timestamp: Date.now() - this.sessionStartTime,
            target: targetPosition + 1, // Convert 0-10 to 1-11
            hand: handUsed,
            points: points,
            hitType: hitType,
            decisionTime: decisionTime,
            totalMovementTime: this.currentMovementTime,
            recentreCount: this.recentreCount,
            participantId: this.participantId,
            run: this.runNumber
        });
        
        console.log(`Trial ${this.trialNumber}: Target ${targetPosition + 1}, Hand ${handUsed}, Points ${points}, Type ${hitType}, Decision Time ${decisionTime}ms`);
        
        // Reset timer for next trial
        this.sphereAppearTime = 0;
        this.currentDecisionTime = 0;
        this.currentMovementTime = 0;
        
        // Check if session complete (110 trials)
        if (this.trialNumber >= this.totalTrials) {
            const sphereManager = document.querySelector('#sphere-manager')?.components?.['sphere-manager'];
            if (sphereManager?.completeSession) sphereManager.completeSession('finished');
            else this.scheduleFinalExport();
        }
    },
    
    exportCSV: function(timestamp) {
        if (this.trialData.length === 0) {
            return;
        }
        const csvContent = this.TRIAL_HEADER + this.trialData.map(trial => this.formatTrialRow(trial)).join('');
        this.download(`${this.filePrefix()}vr-session-data-${timestamp || this.fileTimestamp()}.csv`, [csvContent]);
    },
    
    updateTotalTrials: function(newTotal) {
        this.totalTrials = newTotal;
    },
    
    getTrialCount: function() {
        return this.trialNumber;
    },
    
    resetSession: function() {
        this.trialData = [];
        this.trialNumber = 0;
        this.recentreCount = 0;
    }
});
