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
 *     ├── camera          (we MOVE the camera with WASD + Arrow L/R)
 *     └── this.object     (Group fixed at 0, CAM_HEIGHT, FRONT_Z — horse + cubes)
 *
 * Camera movement: WASD moves camera, Arrow L/R rotates camera. Content stays fixed.
 * Axes: X = right, Y = up, Z = toward you. Camera looks along -Z.
 */
const HORSE_GLB_URL = 'https://threejs.org/examples/models/gltf/Horse.glb';
const HORSE_GLB_LOCAL = './assets/Horse.glb';

const CAM_HEIGHT = 1.6;
const FRONT_Z = -1.8;   // content group fixed in front of where camera starts
const HORSE_SCALE = 0.01; // smaller so you can see the scene properly
const MOVE_SPEED = 6;   // units per second (camera movement)
const ROTATE_SPEED = 2.2;

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

        // Content group stays FIXED; we move the camera with WASD/arrows.
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
            const root = gltf.scene;

            // Strip any camera nodes so nothing sticks to the viewer.
            const toRemove = [];
            root.traverse((child) => { if (child.isCamera) toRemove.push(child); });
            toRemove.forEach((c) => c.parent && c.parent.remove(c));

            root.scale.setScalar(HORSE_SCALE);
            root.position.set(-0.6, 0, 0);
            root.rotation.y = Math.PI;
            root.traverse((child) => {
                if (child.isMesh && child.material) {
                    const mat = child.material;
                    if (!Array.isArray(mat)) mat.side = THREE.DoubleSide;
                    else mat.forEach(m => { m.side = THREE.DoubleSide; });
                }
            });

            if (contentGroup.parent) {
                contentGroup.add(root);
                console.log('HorseWorld: horse added.');
            }

            // Keep full hierarchy so mixer can drive morph animation; enable clip and loop.
            if (gltf.animations && gltf.animations.length > 0) {
                this.mixer = new THREE.AnimationMixer(root);
                const action = this.mixer.clipAction(gltf.animations[0]);
                action.setLoop(THREE.LoopRepeat);
                action.play();
            }
        };
        const onError = (err) => {
            console.error('HorseWorld: CDN load failed:', err);
            loader.load(HORSE_GLB_LOCAL, onLoaded, undefined, (e) => console.error('HorseWorld: local load failed:', e));
        };
        loader.load(HORSE_GLB_URL, onLoaded, undefined, onError);

        this.object.add(new THREE.DirectionalLight(0xffffff, 1.2));
        this.object.add(new THREE.AmbientLight(0xffffff, 0.8));

        console.log('HorseWorld: WASD = move camera, Arrow L/R = rotate camera. Content fixed.');
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
        if (!this.camera || !this.keys) return;

        const yaw = this.camera.rotation.y;
        const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
        const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));

        if (this.keys['KeyW']) this.camera.position.addScaledVector(forward, MOVE_SPEED * delta);
        if (this.keys['KeyS']) this.camera.position.addScaledVector(forward, -MOVE_SPEED * delta);
        if (this.keys['KeyD']) this.camera.position.addScaledVector(right, MOVE_SPEED * delta);
        if (this.keys['KeyA']) this.camera.position.addScaledVector(right, -MOVE_SPEED * delta);
        if (this.keys['ArrowRight']) this.camera.rotation.y -= ROTATE_SPEED * delta;
        if (this.keys['ArrowLeft']) this.camera.rotation.y += ROTATE_SPEED * delta;
    }
}
