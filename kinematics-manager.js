AFRAME.registerComponent('kinematics-manager', {
    init: function() {
        this.leftHandData = [];
        this.rightHandData = [];
        this.isTracking = false;
        this.sessionStartTime = 0;

        this.leftController = document.querySelector('[hand-tracking-controls="hand: left"]');
        this.rightController = document.querySelector('[hand-tracking-controls="hand: right"]');
        this.homeRectangle = document.querySelector('#home-rectangle');

        this.jointMatrix = new THREE.Matrix4();
        this.tmpScale = new THREE.Vector3();
        this.headPos = new THREE.Vector3();
        this.headQuat = new THREE.Quaternion();
        this.leftWrist = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };
        this.rightWrist = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };
    },

    startTracking: function(startTime) {
        this.isTracking = true;
        this.sessionStartTime = startTime || Date.now();
    },

    tick: function() {
        if (!this.isTracking) return;

        const timestamp = Date.now() - this.sessionStartTime;

        const leftPos = this.getHandPosition(this.leftController);
        const rightPos = this.getHandPosition(this.rightController);

        const homePos = this.homeRectangle.getAttribute('position');

        const sphereManager = document.querySelector('#sphere-manager').components['sphere-manager'];
        let targetX = '';
        let targetY = '';
        let targetZ = '';

        if (sphereManager && sphereManager.activeSphere) {
            const targetPos = sphereManager.activeSphere.getAttribute('position');
            targetX = targetPos.x;
            targetY = targetPos.y;
            targetZ = targetPos.z;
        }

        this.updateHead();

        const dataManager = document.querySelector('#data-manager')?.components?.['data-manager'];
        const recentreCount = dataManager?.recentreCount ?? 0;

        const common = `${homePos.x},${homePos.y},${homePos.z},${targetX},${targetY},${targetZ}`;
        const head = `${this.r5(this.headPos.x)},${this.r5(this.headPos.y)},${this.r5(this.headPos.z)},` +
            `${this.r6(this.headQuat.x)},${this.r6(this.headQuat.y)},${this.r6(this.headQuat.z)},${this.r6(this.headQuat.w)}`;

        if (leftPos) {
            const valid = this.updateWrist(this.leftController, this.leftWrist);
            this.leftHandData.push(this.buildRow(timestamp, leftPos, common, valid, this.leftWrist, head, recentreCount));
        }

        if (rightPos) {
            const valid = this.updateWrist(this.rightController, this.rightWrist);
            this.rightHandData.push(this.buildRow(timestamp, rightPos, common, valid, this.rightWrist, head, recentreCount));
        }
    },

    updateHead: function() {
        const sceneEl = this.el.sceneEl;
        const xr = sceneEl.renderer?.xr;
        const frame = sceneEl.frame;
        const refSpace = xr?.getSession?.() ? xr.getReferenceSpace() : null;

        if (frame && refSpace) {
            try {
                const pose = frame.getViewerPose(refSpace);
                if (pose) {
                    const p = pose.transform.position;
                    const q = pose.transform.orientation;
                    this.headPos.set(p.x, p.y, p.z);
                    this.headQuat.set(q.x, q.y, q.z, q.w);
                }
            } catch (e) {}
            return;
        }

        const cameraEl = sceneEl.camera?.el;
        if (cameraEl) {
            cameraEl.object3D.getWorldPosition(this.headPos);
            cameraEl.object3D.getWorldQuaternion(this.headQuat);
        }
    },

    r5: function(v) {
        return Math.round(v * 1e5) / 1e5;
    },

    r6: function(v) {
        return Math.round(v * 1e6) / 1e6;
    },

    isHandValid: function(handController) {
        const htc = handController?.components?.['hand-tracking-controls'];
        const controller = handController?.components?.['tracked-controls']?.controller;
        return !!(htc && htc.hasPoses && controller && controller.hand);
    },

    updateWrist: function(handController, wrist) {
        const valid = this.isHandValid(handController);
        if (valid) {
            const htc = handController.components['hand-tracking-controls'];
            this.jointMatrix.fromArray(htc.jointPoses, 0);
            this.jointMatrix.decompose(wrist.pos, wrist.quat, this.tmpScale);
        }
        return valid;
    },

    buildRow: function(timestamp, tip, common, valid, wrist, head, recentreCount) {
        return `${timestamp},${tip.x},${tip.y},${tip.z},${common},${valid ? 1 : 0},` +
            `${this.r5(wrist.pos.x)},${this.r5(wrist.pos.y)},${this.r5(wrist.pos.z)},` +
            `${this.r6(wrist.quat.x)},${this.r6(wrist.quat.y)},${this.r6(wrist.quat.z)},${this.r6(wrist.quat.w)},` +
            `${head},${recentreCount}\n`;
    },

    getHandPosition: function(handController) {
        if (!handController?.components?.['hand-tracking-controls']) {
            return null;
        }
        return handController.components['hand-tracking-controls'].indexTipPosition;
    },

    exportCSV: function() {
        if (this.leftHandData.length > 0) {
            this.exportHandData(this.leftHandData, 'LEFT');
        }

        if (this.rightHandData.length > 0) {
            this.exportHandData(this.rightHandData, 'RIGHT');
        }
    },

    exportHandData: function(rows, hand) {
        const header = 'Timestamp,HandX,HandY,HandZ,HomeX,HomeY,HomeZ,TargetX,TargetY,TargetZ,' +
            'Valid,WristX,WristY,WristZ,WristQX,WristQY,WristQZ,WristQW,' +
            'HeadX,HeadY,HeadZ,HeadQX,HeadQY,HeadQZ,HeadQW,RecentreCount\n';

        const blob = new Blob([header].concat(rows), { type: 'text/csv' });
        const url = URL.createObjectURL(blob);

        const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
        const filename = `kinematics-${hand}-${timestamp}.csv`;

        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.style.display = 'none';

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        URL.revokeObjectURL(url);
    }
});
