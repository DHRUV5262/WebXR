import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Same horse model used in three.js examples (webgl_morphtargets_horse / instancing_morph)
const HORSE_GLB_URL = 'https://threejs.org/examples/models/gltf/Horse.glb';
// Fallback if you put Horse.glb in your project's assets folder (e.g. when CDN is blocked)
const HORSE_GLB_LOCAL = './assets/Horse.glb';

// Camera in your app is at (0, 1.6, 0) looking down -Z. "In front" = negative Z.
const CAM_HEIGHT = 1.6;
const FRONT_DISTANCE = 2.5;

export class HorseWorld {
    constructor() {
        this.object = null;
        this.referenceCube = null;
        this.mixer = null;
        this.clock = new THREE.Clock();
    }

    enter(scene, renderer) {
        scene.background = new THREE.Color(0x1a1a2e);

        this.object = new THREE.Group();
        scene.add(this.object);

        // ---- 1) Reference cube: same height as camera, 2m in front ----
        const cubeGeom = new THREE.BoxGeometry(0.25, 0.25, 0.25);
        const cubeMat = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
        this.referenceCube = new THREE.Mesh(cubeGeom, cubeMat);
        this.referenceCube.position.set(0, CAM_HEIGHT, -FRONT_DISTANCE + 0.5); // slightly closer so cube is in front
        this.object.add(this.referenceCube);

        // ---- 2) Horse: right in front of camera ----
        const loader = new GLTFLoader();
        const onLoaded = (gltf) => {
            const model = gltf.scene;
            // Horse.glb is small; scale up so it's visible
            model.scale.setScalar(4);
            // Position in front of camera (same height, 2.5m ahead)
            model.position.set(0, CAM_HEIGHT, -FRONT_DISTANCE);
            model.rotation.y = Math.PI;
            // Ensure all meshes are visible (some GLBs have backface culling)
            model.traverse((child) => {
                if (child.isMesh && child.material) {
                    const mat = child.material;
                    if (!Array.isArray(mat)) mat.side = THREE.DoubleSide;
                    else mat.forEach(m => { m.side = THREE.DoubleSide; });
                }
            });
            this.object.add(model);
            console.log('HorseWorld: horse loaded and added to scene.');

            if (gltf.animations && gltf.animations.length > 0) {
                this.mixer = new THREE.AnimationMixer(model);
                this.mixer.clipAction(gltf.animations[0]).play();
            }
        };
        const onError = (err) => {
            console.error('HorseWorld: load failed (try local file or check network):', err);
            loader.load(HORSE_GLB_LOCAL, onLoaded, undefined, (e) => console.error('HorseWorld: local load also failed:', e));
        };
        loader.load(HORSE_GLB_URL, onLoaded, undefined, onError);

        // ---- 3) Lights ----
        const light = new THREE.DirectionalLight(0xffffff, 1.2);
        light.position.set(2, 5, 3);
        this.object.add(light);
        this.object.add(new THREE.AmbientLight(0xffffff, 0.6));
    }

    exit(scene) {
        if (this.object) {
            scene.remove(this.object);
            if (this.referenceCube) {
                this.referenceCube.geometry?.dispose();
                this.referenceCube.material?.dispose();
                this.referenceCube = null;
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
        if (this.mixer) {
            this.mixer.update(this.clock.getDelta());
        }
    }
}
