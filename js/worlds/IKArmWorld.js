import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';

/**
 * IKArmWorld: A 4-link robotic arm made from cubes with visible joint spheres.
 * Static hierarchy, no IK yet. Ready for later extension where the end-effector
 * will be driven by a WebXR controller/hand target.
 *
 * Hierarchy: base → link1 → link2 → link3 → link4
 * White spheres mark each joint/attachment point between links.
 */
const ARM_Z = -0.8;        // Arm in front of camera (desktop-friendly)
const JOINT_SPHERE_RADIUS = 0.06;
const GROUND_SIZE = 8;
const TARGET_SPHERE_RADIUS = 0.08;
const CCD_ITERATIONS = 4;
const CCD_MAX_ANGLE = Math.PI / 2;  // ±90° clamp
const CCD_DAMPING = 0.45;           // Scale per-step rotation to reduce jitter/overshoot
const TARGET_SMOOTH = 0.18;         // Lerp factor for target (0=no move, 1=instant)
const ORBIT_RADIUS = 1.8;
const ORBIT_SPEED = 1.4;  // rad/s (A/D rotate around arm)

// WebXR teleoperation: operator station behind robot
const XR_STAGE_OFFSET = new THREE.Vector3(0, -0.3, -2.5);  // scene offset so user sees robot in front
const XR_NEUTRAL_TARGET_STAGE = new THREE.Vector3(0, 1.35, -0.3);  // neutral target in stage space (in front of arm)
const HAND_DELTA_SCALE = 1.5;
const HAND_INDICATOR_RADIUS = 0.04;
const HAND_INDICATOR_COLOR = 0x3366aa;

// Link dimensions [width, height, depth] – height is along local Y (extend direction)
const BASE_SIZE = [0.5, 0.3, 0.5];   // base (wider, shorter)
const LINK1_SIZE = [0.2, 0.5, 0.2];
const LINK2_SIZE = [0.18, 0.45, 0.18];
const LINK3_SIZE = [0.16, 0.4, 0.16];
const LINK4_SIZE = [0.14, 0.3, 0.14];

export class IKArmWorld {
    constructor() {
        this.armGroup = null;
        this.ground = null;
        // Keep references for disposal and future IK extension (e.g. endEffector = link4)
        this.base = null;
        this.link1 = null;
        this.link2 = null;
        this.link3 = null;
        this.link4 = null;
        this.jointSpheres = [];

        // IK target (orange sphere)
        this.targetSphere = null;
        this.targetPosition = new THREE.Vector3(0, 1.0, ARM_Z);

        // CCD: joints from end-effector back to base (the Object3Ds we rotate)
        this.ikJoints = [];

        // End-effector tip (world position used for IK)
        this.endEffectorTip = null;

        // Desktop: raycaster + vertical plane for mouse projection
        this.pointer = new THREE.Vector2(-999, -999);
        this.raycaster = new THREE.Raycaster();
        this.ikPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -ARM_Z);
        this.ikPlaneIntersect = new THREE.Vector3();
        this._targetDesired = new THREE.Vector3(0, 1.0, ARM_Z);  // Raw target before smoothing
        this.boundPointerMove = null;

        // WebXR: right controller
        this.rightController = null;

        // Debug overlay
        this.debugOverlay = null;

        // CCD temp vectors/quaternion
        this._eePos = new THREE.Vector3();
        this._jointPos = new THREE.Vector3();
        this._currentDir = new THREE.Vector3();
        this._desiredDir = new THREE.Vector3();
        this._deltaQ = new THREE.Quaternion();
        this._axis = new THREE.Vector3();

        // Orbit camera around arm (A = left, D = right, desktop only)
        this.orbitAngle = 0;
        this.orbitCenter = new THREE.Vector3(0, 0.6, ARM_Z);
        this.orbitKeys = { a: false, d: false };
        this.boundKeyDown = null;
        this.boundKeyUp = null;
        this._lastUpdateTime = 0;

        // Transform gizmo for dragging the IK target along XYZ axes (desktop)
        this.transformControls = null;
        this.isDraggingGizmo = false;

        // WebXR teleoperation: stage (robot + target in one group, offset in XR)
        this.xrStageGroup = null;
        this.handIndicator = null;
        this._handPosPrev = new THREE.Vector3();
        this._handPosCurr = new THREE.Vector3();
        this._xrTargetWorld = new THREE.Vector3();
        this._xrFirstFrame = true;
        this._boundRightSelect = null;
    }

    enter(scene, renderer, camera) {
        scene.background = new THREE.Color(0x1a1a2e);
        this.sceneRef = scene;

        // WebXR: stage group so we can offset the whole robot scene (operator behind robot)
        this.xrStageGroup = new THREE.Group();
        this.xrStageGroup.position.set(0, 0, 0);

        this.armGroup = new THREE.Group();
        this.armGroup.position.set(0, BASE_SIZE[1] / 2, ARM_Z); // Base bottom at y=0
        this.xrStageGroup.add(this.armGroup);

        // Ground plane
        const groundGeom = new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE);
        const groundMat = new THREE.MeshStandardMaterial({
            color: 0x2d2d44,
            roughness: 0.9,
            metalness: 0.05
        });
        this.ground = new THREE.Mesh(groundGeom, groundMat);
        this.ground.rotation.x = -Math.PI / 2;
        this.ground.receiveShadow = true;
        this.xrStageGroup.add(this.ground);

        // Joint sphere geometry (shared) and material – servo knuckles
        const jointGeom = new THREE.SphereGeometry(JOINT_SPHERE_RADIUS * 1.2, 24, 24);
        const jointMat = new THREE.MeshStandardMaterial({
            color: 0x00aaff,
            roughness: 0.4,
            metalness: 0.7
        });

        // Part 1 — static foot plate (not part of IK chain)
        const footGeom = new THREE.CylinderGeometry(0.5, 0.6, 0.1, 32);
        const footMat = new THREE.MeshStandardMaterial({
            color: 0x1a1a1a,
            roughness: 0.3,
            metalness: 0.9
        });
        const footPlate = new THREE.Mesh(footGeom, footMat);
        // Slightly below the first joint / arm group origin so it sits on the ground visually
        footPlate.position.y = -BASE_SIZE[1] / 2;
        this.armGroup.add(footPlate);

        // Part 2 — rotating waist (IK base joint)
        const baseGeom = new THREE.SphereGeometry(0.28, 32, 24);
        const baseMat = new THREE.MeshStandardMaterial({
            color: 0x3a3a3a,
            roughness: 0.35,
            metalness: 0.8
        });
        this.base = new THREE.Mesh(baseGeom, baseMat);
        this.base.position.y = 0;
        this.armGroup.add(this.base);

        // Waist rotation seam ring around the equator
        const waistRingGeom = new THREE.TorusGeometry(0.3, 0.04, 16, 32);
        const waistRingMat = new THREE.MeshStandardMaterial({
            color: 0x3a3a3a,
            roughness: 0.35,
            metalness: 0.8
        });
        const waistRing = new THREE.Mesh(waistRingGeom, waistRingMat);
        waistRing.rotation.x = Math.PI / 2;
        this.base.add(waistRing);

        // Joint 0: base ↔ link1
        const joint0 = new THREE.Mesh(jointGeom, jointMat.clone());
        joint0.position.y = BASE_SIZE[1] / 2;
        this.armGroup.add(joint0);
        this.jointSpheres.push(joint0);

        // Link 1 – lower arm cylinder + joint collar
        const link1Geom = new THREE.CylinderGeometry(
            LINK1_SIZE[0] * 0.6,
            LINK1_SIZE[0] * 0.6,
            LINK1_SIZE[1],
            32
        );
        const link1Mat = new THREE.MeshStandardMaterial({
            color: 0x3d3d3d,
            roughness: 0.4,
            metalness: 0.7
        });
        this.link1 = new THREE.Mesh(link1Geom, link1Mat);
        this.link1.position.y = BASE_SIZE[1] / 2 + LINK1_SIZE[1] / 2;
        this.armGroup.add(this.link1);

        // Collar at top of link1
        const collar1Geom = new THREE.TorusGeometry(LINK1_SIZE[0] * 0.7, LINK1_SIZE[0] * 0.15, 12, 24);
        const collarMat = new THREE.MeshStandardMaterial({
            color: 0x3d3d3d,
            roughness: 0.4,
            metalness: 0.7
        });
        const collar1 = new THREE.Mesh(collar1Geom, collarMat);
        collar1.rotation.x = Math.PI / 2;
        collar1.position.y = LINK1_SIZE[1] / 2;
        this.link1.add(collar1);

        const joint1 = new THREE.Mesh(jointGeom, jointMat.clone());
        joint1.position.y = LINK1_SIZE[1] / 2;
        this.link1.add(joint1);
        this.jointSpheres.push(joint1);

        // Link 2 – mid arm cylinder + joint collar
        const link2Geom = new THREE.CylinderGeometry(
            LINK2_SIZE[0] * 0.6,
            LINK2_SIZE[0] * 0.6,
            LINK2_SIZE[1],
            32
        );
        const link2Mat = new THREE.MeshStandardMaterial({
            color: 0x3d3d3d,
            roughness: 0.4,
            metalness: 0.7
        });
        this.link2 = new THREE.Mesh(link2Geom, link2Mat);
        this.link2.position.y = LINK1_SIZE[1] / 2 + LINK2_SIZE[1] / 2;
        this.link1.add(this.link2);

        const collar2Geom = new THREE.TorusGeometry(LINK2_SIZE[0] * 0.7, LINK2_SIZE[0] * 0.15, 12, 24);
        const collar2 = new THREE.Mesh(collar2Geom, collarMat.clone());
        collar2.rotation.x = Math.PI / 2;
        collar2.position.y = LINK2_SIZE[1] / 2;
        this.link2.add(collar2);

        const joint2 = new THREE.Mesh(jointGeom, jointMat.clone());
        joint2.position.y = LINK2_SIZE[1] / 2;
        this.link2.add(joint2);
        this.jointSpheres.push(joint2);

        // Link 3 – upper arm cylinder
        const link3Geom = new THREE.CylinderGeometry(
            LINK3_SIZE[0] * 0.55,
            LINK3_SIZE[0] * 0.55,
            LINK3_SIZE[1],
            32
        );
        const link3Mat = new THREE.MeshStandardMaterial({
            color: 0x3d3d3d,
            roughness: 0.4,
            metalness: 0.7
        });
        this.link3 = new THREE.Mesh(link3Geom, link3Mat);
        this.link3.position.y = LINK2_SIZE[1] / 2 + LINK3_SIZE[1] / 2;
        this.link2.add(this.link3);

        const joint3 = new THREE.Mesh(jointGeom, jointMat.clone());
        joint3.position.y = LINK3_SIZE[1] / 2;
        this.link3.add(joint3);
        this.jointSpheres.push(joint3);

        // Link 4 (end-effector segment)
        const link4Geom = new THREE.CylinderGeometry(
            LINK4_SIZE[0] * 0.5,
            LINK4_SIZE[0] * 0.5,
            LINK4_SIZE[1],
            32
        );
        const link4Mat = new THREE.MeshStandardMaterial({
            color: 0x3d3d3d,
            roughness: 0.4,
            metalness: 0.7
        });
        this.link4 = new THREE.Mesh(link4Geom, link4Mat);
        this.link4.position.y = LINK3_SIZE[1] / 2 + LINK4_SIZE[1] / 2;
        this.link4.userData.isEndEffector = true; // For later IK/controller target
        this.link3.add(this.link4);

        // Tool / gripper tip – small cone at former end-effector sphere position
        const tipGeom = new THREE.ConeGeometry(LINK4_SIZE[0] * 0.7, LINK4_SIZE[1] * 0.6, 24);
        const tipMat = new THREE.MeshStandardMaterial({
            color: 0xe86c1a,
            roughness: 0.4,
            metalness: 0.7
        });
        const tip = new THREE.Mesh(tipGeom, tipMat);
        tip.position.y = LINK4_SIZE[1] / 2;
        this.link4.add(tip);

        // Lights (added to armGroup so they are removed on exit)
        const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
        this.armGroup.add(hemi);
        const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
        dirLight.position.set(2, 4, 2);
        this.armGroup.add(dirLight);

        // Extra point light near the arm to show metallic highlights
        const pointLight = new THREE.PointLight(0xffffff, 1.2, 6);
        pointLight.position.set(1.0, 1.5, ARM_Z + 0.3);
        this.armGroup.add(pointLight);

        // Position camera to view arm (desktop: close, centered)
        camera.position.set(0, 1.0, 1.2);
        camera.lookAt(0, 0.6, ARM_Z);

        // --- Step 1: IK target sphere (bright orange) ---
        const targetGeom = new THREE.SphereGeometry(TARGET_SPHERE_RADIUS, 16, 16);
        const targetMat = new THREE.MeshBasicMaterial({ color: 0xff6600 });
        this.targetSphere = new THREE.Mesh(targetGeom, targetMat);
        this.targetSphere.position.copy(this.targetPosition);
        this.xrStageGroup.add(this.targetSphere);
        scene.add(this.xrStageGroup);

        // Hand indicator (blue sphere at right hand, WebXR only – in scene so it follows hand in world)
        const handGeom = new THREE.SphereGeometry(HAND_INDICATOR_RADIUS, 16, 16);
        const handMat = new THREE.MeshBasicMaterial({
            color: HAND_INDICATOR_COLOR,
            transparent: true,
            opacity: 0.85
        });
        this.handIndicator = new THREE.Mesh(handGeom, handMat);
        this.handIndicator.visible = false;
        scene.add(this.handIndicator);

        // TransformControls gizmo for desktop axis dragging
        this.transformControls = new TransformControls(camera, renderer.domElement);
        this.transformControls.setMode('translate');
        this.transformControls.size = 0.75;
        this.transformControls.attach(this.targetSphere);
        scene.add(this.transformControls);

        this.transformControls.addEventListener('dragging-changed', (event) => {
            const dragging = event.value;
            this.isDraggingGizmo = dragging;
            if (dragging) {
                this.orbitKeys.a = false;
                this.orbitKeys.d = false;
            }
        });

        // End-effector tip helper (for CCD: world position of link4 tip)
        this.endEffectorTip = new THREE.Object3D();
        this.endEffectorTip.position.set(0, LINK4_SIZE[1] / 2, 0);
        this.link4.add(this.endEffectorTip);

        // CCD joints: from end-effector back to base [link3, link2, link1, base]
        this.ikJoints = [this.link3, this.link2, this.link1, this.base];

        // Desktop: mouse → vertical plane (z = ARM_Z)
        this.boundPointerMove = (e) => {
            const canvas = e.target;
            const rect = canvas.getBoundingClientRect();
            this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        };
        this.rendererDomElement = renderer.domElement;
        this.rendererDomElement.addEventListener('pointermove', this.boundPointerMove);

        // WebXR: right controller (for target in VR) + reset target on select/trigger
        this.rightController = renderer.xr.getController(1);
        scene.add(this.rightController);
        this._xrFirstFrame = true;
        this._boundRightSelect = () => {
            if (!this._xrTargetWorld) return;
            this._xrTargetWorld.copy(XR_STAGE_OFFSET).add(XR_NEUTRAL_TARGET_STAGE);
            this.targetSphere.position.copy(this._xrTargetWorld).sub(this.xrStageGroup.position);
        };
        this.rightController.addEventListener('select', this._boundRightSelect);

        // Debug overlay + Reset button container (top-right, stacked)
        this.ikArmUI = document.createElement('div');
        this.ikArmUI.style.cssText =
            'position:fixed;top:12px;right:12px;z-index:102;display:flex;flex-direction:column;align-items:flex-end;gap:6px;';
        document.body.appendChild(this.ikArmUI);

        this.debugOverlay = document.createElement('div');
        this.debugOverlay.id = 'ik-arm-debug';
        this.debugOverlay.style.cssText =
            'color:#fff;font-family:Poppins,sans-serif;font-size:13px;background:rgba(0,0,0,0.6);padding:8px 12px;border-radius:6px;pointer-events:none;';
        this.debugOverlay.textContent = 'EE: (—, —, —)  dist: —';
        this.ikArmUI.appendChild(this.debugOverlay);

        this.resetButton = document.createElement('button');
        this.resetButton.textContent = 'Reset Target';
        this.resetButton.style.cssText =
            'padding:6px 10px;font-size:12px;font-family:Poppins,sans-serif;border-radius:4px;border:none;cursor:pointer;background:#ff6600;color:#fff;box-shadow:0 2px 4px rgba(0,0,0,0.4);';
        this.resetButton.onclick = () => {
            // Reset target back to default position in front of arm
            this.targetPosition.set(0, 1.0, ARM_Z);
            this._targetDesired.copy(this.targetPosition);
            this.targetSphere.position.copy(this.targetPosition);
        };
        this.ikArmUI.appendChild(this.resetButton);

        // A/D orbit around arm (desktop)
        this.boundKeyDown = (e) => {
            const k = e.code;
            if (this.isDraggingGizmo) return;
            if (k === 'KeyA') this.orbitKeys.a = true;
            if (k === 'KeyD') this.orbitKeys.d = true;
        };
        this.boundKeyUp = (e) => {
            const k = e.code;
            if (k === 'KeyA') this.orbitKeys.a = false;
            if (k === 'KeyD') this.orbitKeys.d = false;
        };
        window.addEventListener('keydown', this.boundKeyDown);
        window.addEventListener('keyup', this.boundKeyUp);
    }

    exit(scene) {
        window.removeEventListener('keydown', this.boundKeyDown);
        window.removeEventListener('keyup', this.boundKeyUp);
        this.boundKeyDown = null;
        this.boundKeyUp = null;
        if (this.boundPointerMove && this.rendererDomElement) {
            this.rendererDomElement.removeEventListener('pointermove', this.boundPointerMove);
            this.boundPointerMove = null;
            this.rendererDomElement = null;
        }
        if (this.rightController) {
            if (this._boundRightSelect) this.rightController.removeEventListener('select', this._boundRightSelect);
            this._boundRightSelect = null;
            if (this.rightController.parent) scene.remove(this.rightController);
            this.rightController = null;
        }
        if (this.handIndicator) {
            scene.remove(this.handIndicator);
            this.handIndicator.geometry.dispose();
            this.handIndicator.material.dispose();
            this.handIndicator = null;
        }
        if (this.transformControls) {
            scene.remove(this.transformControls);
            if (this.transformControls.dispose) this.transformControls.dispose();
            this.transformControls = null;
        }
        if (this.ikArmUI && this.ikArmUI.parentNode) {
            this.ikArmUI.parentNode.removeChild(this.ikArmUI);
            this.ikArmUI = null;
            this.debugOverlay = null;
            this.resetButton = null;
        }
        if (this.xrStageGroup && this.xrStageGroup.parent) scene.remove(this.xrStageGroup);
        if (this.targetSphere) {
            if (this.targetSphere.parent) this.targetSphere.parent.remove(this.targetSphere);
            this.targetSphere.geometry.dispose();
            this.targetSphere.material.dispose();
            this.targetSphere = null;
        }
        if (this.armGroup) {
            if (this.armGroup.parent) this.armGroup.parent.remove(this.armGroup);
            this.armGroup.traverse((child) => {
                if (child.isMesh) {
                    if (child.geometry) child.geometry.dispose();
                    if (child.material) {
                        if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
                        else child.material.dispose();
                    }
                }
            });
            this.armGroup = null;
        }
        if (this.ground) {
            if (this.ground.parent) this.ground.parent.remove(this.ground);
            this.ground.geometry.dispose();
            this.ground.material.dispose();
            this.ground = null;
        }
        this.xrStageGroup = null;
        this.sceneRef = null;
        this.base = null;
        this.link1 = null;
        this.link2 = null;
        this.link3 = null;
        this.link4 = null;
        this.jointSpheres = [];
        this.ikJoints = [];
        this.endEffectorTip = null;
        scene.background = new THREE.Color(0x101010);
    }

    /**
     * Update target from mouse (desktop) or right controller (WebXR), run CCD IK, update overlay.
     */
    update(time, frame, renderer, scene, camera) {
        if (!this.armGroup || !this.link4 || !this.endEffectorTip) return;

        const now = time || performance.now();
        const dt = this._lastUpdateTime > 0 ? (now - this._lastUpdateTime) / 1000 : 0.016;
        this._lastUpdateTime = now;

        // --- Orbit camera around arm (A = left, D = right, desktop only) ---
        if (!renderer.xr.isPresenting && !this.isDraggingGizmo) {
            // D = rotate right, A = rotate left (from viewer perspective)
            if (this.orbitKeys.a) this.orbitAngle -= ORBIT_SPEED * dt;
            if (this.orbitKeys.d) this.orbitAngle += ORBIT_SPEED * dt;
            camera.position.x = this.orbitCenter.x + ORBIT_RADIUS * Math.sin(this.orbitAngle);
            camera.position.y = this.orbitCenter.y;
            camera.position.z = this.orbitCenter.z + ORBIT_RADIUS * Math.cos(this.orbitAngle);
            camera.lookAt(this.orbitCenter);
        }

        // --- Target position source ---
        // Desktop: TransformControls moves targetSphere directly.
        // WebXR: delta-based teleoperation (hand movement → target offset in robot space).
        if (renderer.xr.isPresenting && this.rightController && this.xrStageGroup) {
            this.xrStageGroup.position.copy(XR_STAGE_OFFSET);
            this.rightController.getWorldPosition(this._handPosCurr);

            if (this.handIndicator) {
                this.handIndicator.visible = true;
                this.handIndicator.position.copy(this._handPosCurr);
            }

            if (this._xrFirstFrame) {
                this._handPosPrev.copy(this._handPosCurr);
                this._xrTargetWorld.copy(XR_STAGE_OFFSET).add(XR_NEUTRAL_TARGET_STAGE);
                this.targetSphere.position.copy(this._xrTargetWorld).sub(this.xrStageGroup.position);
                this._xrFirstFrame = false;
            } else {
                this._currentDir.subVectors(this._handPosCurr, this._handPosPrev);
                this._xrTargetWorld.addScaledVector(this._currentDir, HAND_DELTA_SCALE);
                this.targetSphere.position.copy(this._xrTargetWorld).sub(this.xrStageGroup.position);
                this._handPosPrev.copy(this._handPosCurr);
            }
        } else {
            this.xrStageGroup.position.set(0, 0, 0);
            if (this.handIndicator) this.handIndicator.visible = false;
            this._xrFirstFrame = true;
        }
        this.targetSphere.getWorldPosition(this.targetPosition);

        // --- CCD IK (end-effector back to base) ---
        for (let iter = 0; iter < CCD_ITERATIONS; iter++) {
            this.endEffectorTip.getWorldPosition(this._eePos);

            for (let j = 0; j < this.ikJoints.length; j++) {
                const joint = this.ikJoints[j];
                joint.getWorldPosition(this._jointPos);

                this._currentDir.subVectors(this._eePos, this._jointPos);
                this._desiredDir.subVectors(this.targetPosition, this._jointPos);

                const curLen = this._currentDir.length();
                const desLen = this._desiredDir.length();
                if (curLen < 1e-6 || desLen < 1e-6) continue;

                this._currentDir.normalize();
                this._desiredDir.normalize();

                this._deltaQ.setFromUnitVectors(this._currentDir, this._desiredDir);

                // Clamp rotation to ±90° and damp to reduce jitter
                const angle = 2 * Math.acos(Math.min(1, Math.abs(this._deltaQ.w)));
                const clampAngle = Math.min(angle, CCD_MAX_ANGLE) * CCD_DAMPING;
                if (clampAngle < 1e-6) continue;
                this._axis.set(this._deltaQ.x, this._deltaQ.y, this._deltaQ.z);
                const axisLen = this._axis.length();
                if (axisLen < 1e-6) continue;
                this._axis.divideScalar(axisLen);
                this._deltaQ.setFromAxisAngle(this._axis, clampAngle);

                joint.quaternion.premultiply(this._deltaQ);
                scene.updateMatrixWorld(true);
            }
        }

        // --- Debug overlay ---
        this.endEffectorTip.getWorldPosition(this._eePos);
        const dist = this._eePos.distanceTo(this.targetPosition);
        const x = this._eePos.x.toFixed(2);
        const y = this._eePos.y.toFixed(2);
        const z = this._eePos.z.toFixed(2);
        const d = dist.toFixed(2);
        this.debugOverlay.textContent = `EE: (${x}, ${y}, ${z})  dist: ${d}`;
    }
}
