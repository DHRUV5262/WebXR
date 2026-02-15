import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/*
 * Matches the official three.js example: webgl_instancing_morph
 * https://github.com/mrdoob/three.js/blob/dev/examples/webgl_instancing_morph.html
 *
 * That example uses only the FIRST CHILD of glb.scene as the horse (dummy = glb.scene.children[0])
 * and never adds the full glb.scene to the scene — so we do the same: add only the mesh (first child)
 * to our content group. That avoids any root transform or extra nodes (e.g. camera) from the GLB.
 *
 * SCENE HIERARCHY:
 *   scene
 *     ├── camera
 *     └── this.object (Group we move with WASD)
 *           ├── referenceCube (red), centerCube (green)
 *           ├── horseMesh (glb.scene.children[0] only) at local (-0.6, 0, 0)
 *           └── lights
 *
 * Morph animation: mixer runs on glb.scene (kept in memory, not in scene) so the clip still
 * updates the same mesh by reference. Camera vs object: we move this.object, camera stays fixed.
 * Axes: X = right, Y = up, Z = toward you. Camera looks along -Z.
 */
const HORSE_GLB_URL = 'https://threejs.org/examples/models/gltf/Horse.glb';
const HORSE_GLB_LOCAL = './assets/Horse.glb';

const CAM_HEIGHT = 1.6;
const FRONT_Z = -1.8;   // content group placed this far in front of camera
const MOVE_SPEED = 2.5; // units per second (moving the content group)
const ROTATE_SPEED = 2.0;

export class HorseWorld {
    constructor() {
        this.object = null;
        this.referenceCube = null;
        this.centerCube = null;
        this.mixer = null;
        this.clock = new THREE.Clock();
        this.keys = {};
        this.boundKeyDown = null;
        this.boundKeyUp = null;
    }

    enter(scene, renderer, camera) {
        scene.background = new THREE.Color(0x2d2d44);

        this.camera = camera; // only for reset on exit
        camera.position.set(0, CAM_HEIGHT, 2);
        camera.rotation.set(0, 0, 0);

        this.keys = {};
        this.boundKeyDown = (e) => { this.keys[e.code] = true; };
        this.boundKeyUp = (e) => { this.keys[e.code] = false; };
        window.addEventListener('keydown', this.boundKeyDown);
        window.addEventListener('keyup', this.boundKeyUp);

        // Single group for horse + cubes. We move THIS group with WASD/arrows (camera stays put).
        this.object = new THREE.Group();
        this.object.position.set(0, CAM_HEIGHT, FRONT_Z);
        scene.add(this.object);

        // All positions are LOCAL to this.object (origin = center of content).
        const cubeGeom = new THREE.BoxGeometry(0.5, 0.5, 0.5);
        const cubeMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        this.referenceCube = new THREE.Mesh(cubeGeom, cubeMat);
        this.referenceCube.position.set(0.6, 0, 0);
        this.object.add(this.referenceCube);

        const cube2Geom = new THREE.BoxGeometry(0.4, 0.4, 0.4);
        const cube2Mat = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
        this.centerCube = new THREE.Mesh(cube2Geom, cube2Mat);
        this.centerCube.position.set(0, 0, 0);
        this.object.add(this.centerCube);

        // Capture group reference so the async callback always adds the horse to THIS group (not camera).
        const contentGroup = this.object;

        const loader = new GLTFLoader();
        const onLoaded = (gltf) => {
            // Same as official example: use only the first child (the actual horse mesh), not glb.scene.
            // This avoids root transforms and any extra nodes (e.g. camera) that could stick to the viewer.
            const root = gltf.scene;
            const horseMesh = root.children && root.children[0];
            if (!horseMesh) {
                console.warn('HorseWorld: no children in GLB scene, adding root.');
                contentGroup.parent && contentGroup.add(root);
                root.scale.setScalar(4);
                root.position.set(-0.6, 0, 0);
                root.rotation.y = Math.PI;
                if (gltf.animations && gltf.animations.length > 0) {
                    this.mixer = new THREE.AnimationMixer(root);
                    this.mixer.clipAction(gltf.animations[0]).play();
                }
                return;
            }

            root.remove(horseMesh);
            horseMesh.scale.setScalar(4);
            horseMesh.position.set(-0.6, 0, 0);
            horseMesh.rotation.y = Math.PI;
            if (horseMesh.material) {
                const mat = horseMesh.material;
                if (!Array.isArray(mat)) mat.side = THREE.DoubleSide;
                else mat.forEach(m => { m.side = THREE.DoubleSide; });
            }

            if (contentGroup.parent) {
                contentGroup.add(horseMesh);
                console.log('HorseWorld: horse mesh (first child) added to content group.');
            }

            // Mixer on full scene so the clip still updates the mesh by reference.
            if (gltf.animations && gltf.animations.length > 0) {
                this.mixer = new THREE.AnimationMixer(root);
                this.mixer.clipAction(gltf.animations[0]).play();
            }
        };
        const onError = (err) => {
            console.error('HorseWorld: CDN load failed:', err);
            loader.load(HORSE_GLB_LOCAL, onLoaded, undefined, (e) => console.error('HorseWorld: local load failed:', e));
        };
        loader.load(HORSE_GLB_URL, onLoaded, undefined, onError);

        this.object.add(new THREE.DirectionalLight(0xffffff, 1.2));
        this.object.add(new THREE.AmbientLight(0xffffff, 0.8));

        console.log('HorseWorld: WASD = move content, Arrow L/R = rotate content. Camera fixed.');
    }

    exit(scene) {
        window.removeEventListener('keydown', this.boundKeyDown);
        window.removeEventListener('keyup', this.boundKeyUp);
        this.boundKeyDown = null;
        this.boundKeyUp = null;
        this.keys = {};
        if (this.camera) {
            this.camera.position.set(0, 1.6, 0);
            this.camera.rotation.set(0, 0, 0);
            this.camera = null;
        }
        if (this.object) {
            scene.remove(this.object);
            if (this.referenceCube) {
                this.referenceCube.geometry?.dispose();
                this.referenceCube.material?.dispose();
                this.referenceCube = null;
            }
            if (this.centerCube) {
                this.centerCube.geometry?.dispose();
                this.centerCube.material?.dispose();
                this.centerCube = null;
            }
            this.object.traverse((child) => {
                if (child.isMesh) {
                    child.geometry?.dispose();
                    if (child.material) {
                        if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
                        else child.material.dispose();
                    }
                }
            });
            this.object = null;
        }
        this.mixer = null;
    }

    update(time, frame, renderer, scene, camera) {
        const delta = this.clock.getDelta();
        if (this.mixer) this.mixer.update(delta);
        if (!this.object || !this.keys) return;

        const yaw = this.object.rotation.y;
        const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
        const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));

        if (this.keys['KeyW']) this.object.position.addScaledVector(forward, MOVE_SPEED * delta);
        if (this.keys['KeyS']) this.object.position.addScaledVector(forward, -MOVE_SPEED * delta);
        if (this.keys['KeyD']) this.object.position.addScaledVector(right, MOVE_SPEED * delta);
        if (this.keys['KeyA']) this.object.position.addScaledVector(right, -MOVE_SPEED * delta);
        if (this.keys['ArrowRight']) this.object.rotation.y -= ROTATE_SPEED * delta;
        if (this.keys['ArrowLeft']) this.object.rotation.y += ROTATE_SPEED * delta;
    }
}
