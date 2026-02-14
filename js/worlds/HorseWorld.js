import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Same horse model used in three.js examples (webgl_morphtargets_horse / instancing_morph)
const HORSE_GLB_URL = 'https://threejs.org/examples/models/gltf/Horse.glb';
const HORSE_GLB_LOCAL = './assets/Horse.glb';

// Camera in main.js is at (0, 1.6, 0) looking down -Z.
const CAM_HEIGHT = 1.6;
const FRONT_Z = -1.8; // 1.8m in front of camera

const MOVE_SPEED = 2.5;   // units per second
const ROTATE_SPEED = 2.0; // radians per second

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

        this.camera = camera;
        // Start in front of the scene so you're not under the horse
        this.camera.position.set(0, CAM_HEIGHT, 2);
        this.camera.rotation.set(0, 0, 0);

        // Keyboard: WASD + Arrow Left/Right (only active in Horse world)
        this.keys = {};
        this.boundKeyDown = (e) => { this.keys[e.code] = true; };
        this.boundKeyUp = (e) => { this.keys[e.code] = false; };
        window.addEventListener('keydown', this.boundKeyDown);
        window.addEventListener('keyup', this.boundKeyUp);

        this.object = new THREE.Group();
        scene.add(this.object);

        this.object = new THREE.Group();
        scene.add(this.object);

        // ---- 1) Big reference cube: MeshBasicMaterial so it's visible even without lights ----
        const cubeGeom = new THREE.BoxGeometry(0.5, 0.5, 0.5);
        const cubeMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        this.referenceCube = new THREE.Mesh(cubeGeom, cubeMat);
        this.referenceCube.position.set(0.6, CAM_HEIGHT, FRONT_Z); // to the right of center
        this.object.add(this.referenceCube);

        // ---- 2) Second cube (green) dead center in front ----
        const cube2Geom = new THREE.BoxGeometry(0.4, 0.4, 0.4);
        const cube2Mat = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
        const centerCube = new THREE.Mesh(cube2Geom, cube2Mat);
        centerCube.position.set(0, CAM_HEIGHT, FRONT_Z);
        this.object.add(centerCube);
        this.centerCube = centerCube;

        // ---- 3) Horse: load and place left of center ----
        const loader = new GLTFLoader();
        const onLoaded = (gltf) => {
            const model = gltf.scene;
            model.scale.setScalar(4);
            model.position.set(-0.6, CAM_HEIGHT, FRONT_Z);
            model.rotation.y = Math.PI;
            model.traverse((child) => {
                if (child.isMesh && child.material) {
                    const mat = child.material;
                    if (!Array.isArray(mat)) mat.side = THREE.DoubleSide;
                    else mat.forEach(m => { m.side = THREE.DoubleSide; });
                }
            });
            this.object.add(model);
            console.log('HorseWorld: horse loaded.');
            if (gltf.animations && gltf.animations.length > 0) {
                this.mixer = new THREE.AnimationMixer(model);
                this.mixer.clipAction(gltf.animations[0]).play();
            }
        };
        const onError = (err) => {
            console.error('HorseWorld: CDN load failed:', err);
            loader.load(HORSE_GLB_LOCAL, onLoaded, undefined, (e) => console.error('HorseWorld: local load failed:', e));
        };
        loader.load(HORSE_GLB_URL, onLoaded, undefined, onError);

        // ---- 4) Lights (for horse materials that need it) ----
        this.object.add(new THREE.DirectionalLight(0xffffff, 1.2));
        this.object.add(new THREE.AmbientLight(0xffffff, 0.8));

        console.log('HorseWorld: entered. WASD = move, Arrow L/R = rotate.');
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
