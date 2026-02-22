import * as THREE from 'three';

/**
 * IKArmWorld: A 4-link robotic arm made from cubes with visible joint spheres.
 * Static hierarchy, no IK yet. Ready for later extension where the end-effector
 * will be driven by a WebXR controller/hand target.
 *
 * Hierarchy: base → link1 → link2 → link3 → link4
 * White spheres mark each joint/attachment point between links.
 */
const ARM_Z = -2;           // Distance in front of camera
const JOINT_SPHERE_RADIUS = 0.06;
const GROUND_SIZE = 8;

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

        // Position camera to view arm
        camera.position.set(0, 1.6, 2);
        camera.lookAt(0, 0.8, ARM_Z);
    }

    exit(scene) {
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
        scene.background = new THREE.Color(0x101010);
    }

    /**
     * No animation or IK yet. Placeholder for future update loop
     * when end-effector is driven by WebXR controller/hand target.
     */
    update(/* time, frame, renderer, scene, camera */) {}
}
