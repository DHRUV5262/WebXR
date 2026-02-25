import * as THREE from 'three';

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
const ORBIT_RADIUS = 1.8;
const ORBIT_SPEED = 1.4;  // rad/s (A/D rotate around arm)

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
    }

    enter(scene, renderer, camera) {
        scene.background = new THREE.Color(0x1a1a2e);

        this.armGroup = new THREE.Group();
        this.armGroup.position.set(0, BASE_SIZE[1] / 2, ARM_Z); // Base bottom at y=0
        scene.add(this.armGroup);

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
        scene.add(this.ground);

        // Joint sphere geometry (shared) and material
        const jointGeom = new THREE.SphereGeometry(JOINT_SPHERE_RADIUS, 16, 16);
        const jointMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

        // Base (cube)
        const baseGeom = new THREE.BoxGeometry(BASE_SIZE[0], BASE_SIZE[1], BASE_SIZE[2]);
        const baseMat = new THREE.MeshStandardMaterial({
            color: 0x4a4a6a,
            roughness: 0.6,
            metalness: 0.2
        });
        this.base = new THREE.Mesh(baseGeom, baseMat);
        this.base.position.y = 0;
        this.armGroup.add(this.base);

        // Joint 0: base ↔ link1
        const joint0 = new THREE.Mesh(jointGeom, jointMat.clone());
        joint0.position.y = BASE_SIZE[1] / 2;
        this.armGroup.add(joint0);
        this.jointSpheres.push(joint0);

        // Link 1
        const link1Geom = new THREE.BoxGeometry(LINK1_SIZE[0], LINK1_SIZE[1], LINK1_SIZE[2]);
        const link1Mat = new THREE.MeshStandardMaterial({
            color: 0x5a5a8a,
            roughness: 0.6,
            metalness: 0.2
        });
        this.link1 = new THREE.Mesh(link1Geom, link1Mat);
        this.link1.position.y = BASE_SIZE[1] / 2 + LINK1_SIZE[1] / 2;
        this.armGroup.add(this.link1);

        const joint1 = new THREE.Mesh(jointGeom, jointMat.clone());
        joint1.position.y = LINK1_SIZE[1] / 2;
        this.link1.add(joint1);
        this.jointSpheres.push(joint1);

        // Link 2
        const link2Geom = new THREE.BoxGeometry(LINK2_SIZE[0], LINK2_SIZE[1], LINK2_SIZE[2]);
        const link2Mat = new THREE.MeshStandardMaterial({
            color: 0x6a6a9a,
            roughness: 0.6,
            metalness: 0.2
        });
        this.link2 = new THREE.Mesh(link2Geom, link2Mat);
        this.link2.position.y = LINK1_SIZE[1] / 2 + LINK2_SIZE[1] / 2;
        this.link1.add(this.link2);

        const joint2 = new THREE.Mesh(jointGeom, jointMat.clone());
        joint2.position.y = LINK2_SIZE[1] / 2;
        this.link2.add(joint2);
        this.jointSpheres.push(joint2);

        // Link 3
        const link3Geom = new THREE.BoxGeometry(LINK3_SIZE[0], LINK3_SIZE[1], LINK3_SIZE[2]);
        const link3Mat = new THREE.MeshStandardMaterial({
            color: 0x7a7aaa,
            roughness: 0.6,
            metalness: 0.2
        });
        this.link3 = new THREE.Mesh(link3Geom, link3Mat);
        this.link3.position.y = LINK2_SIZE[1] / 2 + LINK3_SIZE[1] / 2;
        this.link2.add(this.link3);

        const joint3 = new THREE.Mesh(jointGeom, jointMat.clone());
        joint3.position.y = LINK3_SIZE[1] / 2;
        this.link3.add(joint3);
        this.jointSpheres.push(joint3);

        // Link 4 (end-effector)
        const link4Geom = new THREE.BoxGeometry(LINK4_SIZE[0], LINK4_SIZE[1], LINK4_SIZE[2]);
        const link4Mat = new THREE.MeshStandardMaterial({
            color: 0x8a8aba,
            roughness: 0.6,
            metalness: 0.2
        });
        this.link4 = new THREE.Mesh(link4Geom, link4Mat);
        this.link4.position.y = LINK3_SIZE[1] / 2 + LINK4_SIZE[1] / 2;
        this.link4.userData.isEndEffector = true; // For later IK/controller target
        this.link3.add(this.link4);

        const joint4 = new THREE.Mesh(jointGeom, jointMat.clone());
        joint4.position.y = LINK4_SIZE[1] / 2;
        this.link4.add(joint4);
        this.jointSpheres.push(joint4);

        // Lights (added to armGroup so they are removed on exit)
        const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
        this.armGroup.add(hemi);
        const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
        dirLight.position.set(2, 4, 2);
        this.armGroup.add(dirLight);

        // Position camera to view arm (desktop: close, centered)
        camera.position.set(0, 1.0, 1.2);
        camera.lookAt(0, 0.6, ARM_Z);

        // --- Step 1: IK target sphere (bright orange) ---
        const targetGeom = new THREE.SphereGeometry(TARGET_SPHERE_RADIUS, 16, 16);
        const targetMat = new THREE.MeshBasicMaterial({ color: 0xff6600 });
        this.targetSphere = new THREE.Mesh(targetGeom, targetMat);
        this.targetSphere.position.copy(this.targetPosition);
        scene.add(this.targetSphere);

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

        // WebXR: right controller (for target in VR)
        this.rightController = renderer.xr.getController(1);
        scene.add(this.rightController);

        // Debug overlay (top-left)
        this.debugOverlay = document.createElement('div');
        this.debugOverlay.id = 'ik-arm-debug';
        this.debugOverlay.style.cssText = 'position:fixed;top:12px;left:12px;z-index:102;color:#fff;font-family:Poppins,sans-serif;font-size:13px;background:rgba(0,0,0,0.6);padding:8px 12px;border-radius:6px;pointer-events:none;';
        this.debugOverlay.textContent = 'EE: (—, —, —)  dist: —';
        document.body.appendChild(this.debugOverlay);

        // A/D orbit around arm (desktop)
        this.boundKeyDown = (e) => {
            const k = e.code;
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
        if (this.rightController && this.rightController.parent) {
            scene.remove(this.rightController);
            this.rightController = null;
        }
        if (this.targetSphere) {
            scene.remove(this.targetSphere);
            this.targetSphere.geometry.dispose();
            this.targetSphere.material.dispose();
            this.targetSphere = null;
        }
        if (this.debugOverlay && this.debugOverlay.parentNode) {
            this.debugOverlay.parentNode.removeChild(this.debugOverlay);
            this.debugOverlay = null;
        }
        if (this.armGroup) {
            scene.remove(this.armGroup);
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
            scene.remove(this.ground);
            this.ground.geometry.dispose();
            this.ground.material.dispose();
            this.ground = null;
        }
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
        if (!renderer.xr.isPresenting) {
            if (this.orbitKeys.a) this.orbitAngle += ORBIT_SPEED * dt;
            if (this.orbitKeys.d) this.orbitAngle -= ORBIT_SPEED * dt;
            camera.position.x = this.orbitCenter.x + ORBIT_RADIUS * Math.sin(this.orbitAngle);
            camera.position.y = this.orbitCenter.y;
            camera.position.z = this.orbitCenter.z + ORBIT_RADIUS * Math.cos(this.orbitAngle);
            camera.lookAt(this.orbitCenter);
        }

        // --- Target position: desktop = mouse on vertical plane; WebXR = right controller ---
        if (renderer.xr.isPresenting && this.rightController) {
            this.rightController.getWorldPosition(this.targetPosition);
        } else {
            this.raycaster.setFromCamera(this.pointer, camera);
            if (this.raycaster.ray.intersectPlane(this.ikPlane, this.ikPlaneIntersect)) {
                this.targetPosition.copy(this.ikPlaneIntersect);
            }
        }
        this.targetSphere.position.copy(this.targetPosition);

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

                // Clamp rotation to ±90°
                const angle = 2 * Math.acos(Math.min(1, Math.abs(this._deltaQ.w)));
                const clampAngle = Math.min(angle, CCD_MAX_ANGLE);
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
