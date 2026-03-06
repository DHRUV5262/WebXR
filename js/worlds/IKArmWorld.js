import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js';

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
const MIN_TARGET_DIST = 0.25;       // Target must stay at least this far from base (avoid pass-through)

// Gripper pinch mapping
const PINCH_CLOSED = 0.02;
const PINCH_OPEN = 0.08;
const GRIP_COLOR_OPEN = 0xe86c1a;
const GRIP_COLOR_CLOSED = 0x00ff88;
const EE_TOLERANCE = 0.01;          // Early exit when end-effector within 1 cm of target
const TARGET_SMOOTH = 0.18;         // Lerp factor for target (0=no move, 1=instant)
const ORBIT_RADIUS = 1.8;
const ORBIT_SPEED = 1.4;  // rad/s (A/D rotate around arm)

// WebXR teleoperation: operator station behind robot
const XR_STAGE_OFFSET = new THREE.Vector3(0, -0.1, -2.5);   // Y: less negative = you feel a bit lower in VR
const XR_NEUTRAL_TARGET_STAGE = new THREE.Vector3(0, 0.9, -0.5);   // reset position: close in front of arm
const HAND_DELTA_SCALE = 2.0;  // target moves 2× the distance of your hand (exaggerated)
const HAND_INDICATOR_RADIUS = 0.04;
const HAND_INDICATOR_COLOR = 0x3366aa;

// Link dimensions [width, height, depth] – height is along local Y (extend direction)
const BASE_SIZE = [0.5, 0.3, 0.5];   // base (wider, shorter)
const LINK1_SIZE = [0.2, 0.5, 0.2];
const LINK2_SIZE = [0.18, 0.45, 0.18];
const LINK3_SIZE = [0.16, 0.4, 0.16];
const LINK4_SIZE = [0.14, 0.3, 0.14];

// Per-joint max bend from rest (radians): [link3 wrist, link2 elbow, link1 shoulder, base]
const BEND_LIMITS = [
    (90 * Math.PI) / 180,   // wrist ~90°
    (135 * Math.PI) / 180,  // elbow ~135°
    (120 * Math.PI) / 180,  // shoulder ~120°
    (360 * Math.PI) / 180   // base full rotation
];

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
        this._basePos = new THREE.Vector3();
        this._pinchA = new THREE.Vector3();
        this._pinchB = new THREE.Vector3();
        this._restQuat = new THREE.Quaternion();  // identity = rest pose for bend limit
        this._slerpQuat = new THREE.Quaternion();

        this._trailPositions = [];
        this._trailMaxPoints = 200;
        this._trailLine = null;
        this._trailPrevPos = new THREE.Vector3();
        this._trailGeometry = null;

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

        this.clawLeft = null;
        this.clawRight = null;
        this.gripAmount = 1.0;
        this.spaceKeyDown = false;
        this.rightHand = null;
        this.rightHandModel = null;
        this._xrHands = [];
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

        // Gripper: two claws + housing, parented to link4 (end-effector)
        const gripperMat = new THREE.MeshStandardMaterial({
            color: GRIP_COLOR_OPEN,
            metalness: 0.7,
            roughness: 0.3
        });
        const clawGeom = new THREE.BoxGeometry(0.05, 0.15, 0.05);
        this.clawLeft = new THREE.Mesh(clawGeom, gripperMat.clone());
        // Raise claws slightly so they sit clearly above the end segment
        this.clawLeft.position.set(-0.08, 0.16, 0);
        this.clawLeft.name = 'clawLeft';
        this.link4.add(this.clawLeft);
        this.clawRight = new THREE.Mesh(clawGeom.clone(), gripperMat.clone());
        this.clawRight.position.set(0.08, 0.16, 0);
        this.clawRight.name = 'clawRight';
        this.link4.add(this.clawRight);
        const housingGeom = new THREE.CylinderGeometry(0.04, 0.04, 0.08, 16);
        const housing = new THREE.Mesh(housingGeom, gripperMat.clone());
        housing.position.set(0, 0.12, 0);
        this.link4.add(housing);

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

        const trailGeo = new THREE.BufferGeometry();
        const positions = new Float32Array(200 * 3);
        trailGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        trailGeo.setDrawRange(0, 0);
        const trailMat = new THREE.LineBasicMaterial({ vertexColors: true, linewidth: 2 });
        trailGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(200 * 3), 3));
        this._trailLine = new THREE.Line(trailGeo, trailMat);
        this._trailGeometry = trailGeo;
        this.xrStageGroup.add(this._trailLine);

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
        this.ikJoints = [this.link3, this.link2, this.link1];

        // Desktop: mouse → vertical plane (z = ARM_Z)
        this.boundPointerMove = (e) => {
            const canvas = e.target;
            const rect = canvas.getBoundingClientRect();
            this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        };
        this.rendererDomElement = renderer.domElement;
        this.rendererDomElement.addEventListener('pointermove', this.boundPointerMove);

        // WebXR: use the controller that reports handedness 'right' for target (not left)
        this.rightController = null;
        this._xrControllers = [];
        for (let i = 0; i <= 1; i++) {
            const c = renderer.xr.getController(i);
            this._xrControllers.push(c);
            scene.add(c);
            c.addEventListener('connected', (e) => {
                const handedness = (e.data && e.data.handedness) ? e.data.handedness : '';
                if (handedness === 'right') this.rightController = c;
            });
        }
        this._xrFirstFrame = true;
        this._boundRightSelect = () => {
            if (!this._xrTargetWorld) return;
            this._xrTargetWorld.copy(XR_STAGE_OFFSET).add(XR_NEUTRAL_TARGET_STAGE);
            this.targetSphere.position.copy(this._xrTargetWorld).sub(this.xrStageGroup.position);
        };
        this._xrControllers.forEach((c) => c.addEventListener('select', this._boundRightSelect));

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

        // A/D orbit around arm (desktop); spacebar = gripper close
        this.boundKeyDown = (e) => {
            const k = e.code;
            if (this.isDraggingGizmo) return;
            if (k === 'KeyA') this.orbitKeys.a = true;
            if (k === 'KeyD') this.orbitKeys.d = true;
            if (k === 'Space') this.spaceKeyDown = true;
        };
        this.boundKeyUp = (e) => {
            const k = e.code;
            if (k === 'KeyA') this.orbitKeys.a = false;
            if (k === 'KeyD') this.orbitKeys.d = false;
            if (k === 'Space') this.spaceKeyDown = false;
        };
        window.addEventListener('keydown', this.boundKeyDown);
        window.addEventListener('keyup', this.boundKeyUp);

        // Right hand for pinch gesture (WebXR hand tracking) – controls gripper
        this._xrHands = [];
        const handModelFactory = new XRHandModelFactory();
        for (let i = 0; i < 2; i++) {
            const hand = renderer.xr.getHand(i);
            this._xrHands.push(hand);
            hand.addEventListener('connected', (e) => {
                const handedness = e.data?.handedness || '';
                if (handedness === 'right') {
                    this.rightHand = hand;
                    if (!this.rightHandModel) {
                        this.rightHandModel = handModelFactory.createHandModel(hand, 'boxes');
                        hand.add(this.rightHandModel);
                    }
                }
            });
            scene.add(hand);
        }
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
        if (this._xrControllers && this._boundRightSelect) {
            this._xrControllers.forEach((c) => c.removeEventListener('select', this._boundRightSelect));
            this._xrControllers.forEach((c) => { if (c.parent) scene.remove(c); });
            this._xrControllers = [];
        }
        this.rightController = null;
        this._boundRightSelect = null;
        if (this._xrHands && this._xrHands.length) {
            this._xrHands.forEach((hand) => {
                if (hand.parent) scene.remove(hand);
            });
            this._xrHands = [];
        }
        this.rightHand = null;
        this.rightHandModel = null;
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
        if (this._trailLine) {
            if (this._trailLine.parent) this._trailLine.parent.remove(this._trailLine);
            this._trailGeometry.dispose();
            this._trailLine.material.dispose();
            this._trailLine = null;
            this._trailGeometry = null;
        }
        this._trailPositions = [];
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

            // In hand-tracking VR, rely on the cube hand model instead of the blue sphere.
            if (this.handIndicator && !this.rightHand) {
                this.handIndicator.visible = true;
                this.handIndicator.position.copy(this._handPosCurr);
            } else if (this.handIndicator) {
                this.handIndicator.visible = false;
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

        // --- Minimum target distance from base (avoid target passing through base / jitter) ---
        this.base.getWorldPosition(this._basePos);
        const distToTarget = this._basePos.distanceTo(this.targetPosition);
        if (distToTarget < MIN_TARGET_DIST && distToTarget > 1e-6) {
            this._desiredDir.subVectors(this.targetPosition, this._basePos).normalize();
            this.targetPosition.copy(this._basePos).addScaledVector(this._desiredDir, MIN_TARGET_DIST);
            this.targetSphere.position.copy(this.targetPosition).sub(this.xrStageGroup.position);
        }

        // --- CCD IK (end-effector back to base); ball joints with gentle bend limits ---
        for (let iter = 0; iter < CCD_ITERATIONS; iter++) {
            this.endEffectorTip.getWorldPosition(this._eePos);

            if (this._eePos.distanceTo(this.targetPosition) < EE_TOLERANCE) break;

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

                const angle = 2 * Math.acos(Math.min(1, Math.abs(this._deltaQ.w)));
                const clampAngle = Math.min(angle, CCD_MAX_ANGLE) * CCD_DAMPING;
                if (clampAngle < 1e-6) continue;
                this._axis.set(this._deltaQ.x, this._deltaQ.y, this._deltaQ.z);
                const axisLen = this._axis.length();
                if (axisLen < 1e-6) continue;
                this._axis.divideScalar(axisLen);
                this._deltaQ.setFromAxisAngle(this._axis, clampAngle);

                joint.quaternion.premultiply(this._deltaQ);

                // Gentle bend limit: max angle from rest (identity); slerp back if over
                const bendAngle = 2 * Math.acos(Math.min(1, Math.abs(joint.quaternion.w)));
                const maxBend = BEND_LIMITS[j];
                if (bendAngle > maxBend && maxBend < Math.PI * 1.99) {
                    this._slerpQuat.slerpQuaternions(
                        this._restQuat,
                        joint.quaternion,
                        maxBend / bendAngle
                    );
                    joint.quaternion.copy(this._slerpQuat);
                }

                scene.updateMatrixWorld(true);
            }
        }

        // After the CCD loop — base yaw: rotate to face target horizontally
        const localTarget = new THREE.Vector3();
        this.armGroup.worldToLocal(localTarget.copy(this.targetPosition));
        this.base.rotation.y = Math.atan2(localTarget.x, localTarget.z);
        scene.updateMatrixWorld(true);

        // --- Gripper: thumb–middle pinch (WebXR) or spacebar (desktop) ---
        if (this.clawLeft && this.clawRight) {
            if (renderer.xr.isPresenting && this.rightHand && this.rightHand.joints) {
                const thumbTip = this.rightHand.joints['thumb-tip'];
                const middleTip = this.rightHand.joints['middle-finger-tip'];
                if (thumbTip && middleTip) {
                    thumbTip.getWorldPosition(this._pinchA);
                    middleTip.getWorldPosition(this._pinchB);
                    const pinchDist = this._pinchA.distanceTo(this._pinchB);
                    this.gripAmount = Math.max(0, Math.min(1, (pinchDist - PINCH_CLOSED) / (PINCH_OPEN - PINCH_CLOSED)));
                }
            } else {
                this.gripAmount = this.spaceKeyDown ? 0 : 1;
            }
            this.clawLeft.position.x = THREE.MathUtils.lerp(-0.03, -0.08, this.gripAmount);
            this.clawRight.position.x = THREE.MathUtils.lerp(0.03, 0.08, this.gripAmount);
            const t = this.gripAmount < 0.2 ? 0 : this.gripAmount > 0.8 ? 1 : (this.gripAmount - 0.2) / 0.6;
            const clawColor = this.clawLeft.material.color;
            clawColor.setHex(GRIP_COLOR_OPEN).lerp(new THREE.Color(GRIP_COLOR_CLOSED), 1 - t);
            this.clawRight.material.color.copy(clawColor);
        }

        // --- Debug overlay ---
        this.endEffectorTip.getWorldPosition(this._eePos);
        const dist = this._eePos.distanceTo(this.targetPosition);
        const x = this._eePos.x.toFixed(2);
        const y = this._eePos.y.toFixed(2);
        const z = this._eePos.z.toFixed(2);
        const d = dist.toFixed(2);
        this.debugOverlay.textContent = `EE: (${x}, ${y}, ${z})  dist: ${d}`;

        // --- Trail recorder ---
        this.endEffectorTip.getWorldPosition(this._eePos);
        const speed = this._trailPrevPos.distanceTo(this._eePos) / Math.max(dt, 0.001);
        this._trailPrevPos.copy(this._eePos);
        const error = this._eePos.distanceTo(this.targetPosition);
        this._trailPositions.push({
            pos: this._eePos.clone(),
            error: Math.min(error, 1.5),
            speed: Math.min(speed, 2.0)
        });
        if (this._trailPositions.length > this._trailMaxPoints) {
            this._trailPositions.shift();
        }
        const posAttr = this._trailGeometry.attributes.position;
        const colAttr = this._trailGeometry.attributes.color;
        const _c = new THREE.Color();
        for (let i = 0; i < this._trailPositions.length; i++) {
            const p = this._trailPositions[i];
            posAttr.setXYZ(i, p.pos.x, p.pos.y, p.pos.z);
            const t = p.error / 1.5;
            _c.setRGB(Math.min(t * 2, 1.0), Math.max(1.0 - t, 0.0), 0.0);
            colAttr.setXYZ(i, _c.r, _c.g, _c.b);
        }
        posAttr.needsUpdate = true;
        colAttr.needsUpdate = true;
        this._trailGeometry.setDrawRange(0, this._trailPositions.length);
    }
}
