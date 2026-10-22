AFRAME.registerComponent("hand-tracking-extras", {
  init: function () {
    this.el.addEventListener("enter-vr", this.play.bind(this));
    this.el.addEventListener("exit-vr", this.pause.bind(this));
  },

  tick: function () {
    return function () {
      if (this.isPaused) return;

      var frame = this.el.sceneEl.frame;
      var renderer = this.el.sceneEl.renderer;

      if (!frame || !renderer || !renderer.xr) return;

      var session = renderer.xr.getSession();
      if (!session) return;

      var referenceSpace = renderer.xr.getReferenceSpace();
      if (!referenceSpace) return;

      var handTrackingControls = this.el.components['hand-tracking-controls'];
      if (!handTrackingControls) return;

      var targetHandedness = handTrackingControls.data.hand;
      var handInputSource = null;

      for (let source of session.inputSources) {
        if (source.handedness === targetHandedness && source.hand) {
          handInputSource = source;
          break;
        }
      }

      if (!handInputSource) {
        if (this.HandData) this.HandData.invalidate();
        return;
      }

      if (!this.HandData) {
        this.createHandData();
      }

      this.HandData.updateData(handInputSource, frame, referenceSpace);
    };
  }(),

  createHandData: function () {
    const HandData = function () {
      const Joint_Count = 25;
      const rotMtx = { elements: new Float32Array(16) };
      const radii = new Float32Array(Joint_Count);
      const transforms = new Float32Array(4 * 4 * Joint_Count);
      var validPoses = false;

      var tmpVector = new THREE.Vector3();

      const JointObject = function (id, num, parent) {
        this.id = id;
        this.num = num;
        this.parent = parent;
      };

      JointObject.prototype.getPosition = function (_vector) {
        return this.parent.getPosition(this.num, _vector);
      };

      JointObject.prototype.isValid = function () {
        return this.parent.getValidity();
      };

      let num = 0;
      const joints = {
        Wrist: new JointObject("wrist", num++, this),
        T_Metacarpal: new JointObject("thumb-metacarpal", num++, this),
        T_Proximal: new JointObject("thumb-phalanx-proximal", num++, this),
        T_Distal: new JointObject("thumb-phalanx-distal", num++, this),
        T_Tip: new JointObject("thumb-tip", num++, this),
        I_Metacarpal: new JointObject("index-finger-metacarpal", num++, this),
        I_Proximal: new JointObject("index-finger-phalanx-proximal", num++, this),
        I_Intermediate: new JointObject("index-finger-phalanx-intermediate", num++, this),
        I_Distal: new JointObject("index-finger-phalanx-distal", num++, this),
        I_Tip: new JointObject("index-finger-tip", num++, this),
        M_Metacarpal: new JointObject("middle-finger-metacarpal", num++, this),
        M_Proximal: new JointObject("middle-finger-phalanx-proximal", num++, this),
        M_Intermediate: new JointObject("middle-finger-phalanx-intermediate", num++, this),
        M_Distal: new JointObject("middle-finger-phalanx-distal", num++, this),
        M_Tip: new JointObject("middle-finger-tip", num++, this),
        R_Metacarpal: new JointObject("ring-finger-metacarpal", num++, this),
        R_Proximal: new JointObject("ring-finger-phalanx-proximal", num++, this),
        R_Intermediate: new JointObject("ring-finger-phalanx-intermediate", num++, this),
        R_Distal: new JointObject("ring-finger-phalanx-distal", num++, this),
        R_Tip: new JointObject("ring-finger-tip", num++, this),
        L_Metacarpal: new JointObject("pinky-finger-metacarpal", num++, this),
        L_Proximal: new JointObject("pinky-finger-phalanx-proximal", num++, this),
        L_Intermediate: new JointObject("pinky-finger-phalanx-intermediate", num++, this),
        L_Distal: new JointObject("pinky-finger-phalanx-distal", num++, this),
        L_Tip: new JointObject("pinky-finger-tip", num++, this)
      };

      this.joints = joints;

      this.updateData = (inputSource, frame, referenceSpace) => {
        if (!inputSource.hand) return;
        frame.fillJointRadii(inputSource.hand.values(), radii);
        validPoses = frame.fillPoses(inputSource.hand.values(), referenceSpace, transforms);
      };

      this.getPosition = (id, _vector) => {
        const mtxOffset = id * 16;
        let vector = _vector ? _vector : tmpVector.clone();
        return vector.fromArray(transforms, mtxOffset + 12);
      };

      this.getValidity = () => validPoses;

      this.invalidate = () => {
        validPoses = false;
      };
    };

    this.HandData = new HandData();

    this.el.emit("hand-tracking-extras-ready", {
      data: this.HandData
    });
  },

  play: function () {
    this.isPaused = false;
  },

  pause: function () {
    this.isPaused = true;
  },

  remove: function () {
    this.el.removeEventListener("enter-vr", this.play);
    this.el.removeEventListener("exit-vr", this.pause);
  }
});