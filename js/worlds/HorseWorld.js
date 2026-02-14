import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Same horse model used in three.js examples (webgl_morphtargets_horse / instancing_morph)
const HORSE_GLB_URL = 'https://threejs.org/examples/models/gltf/Horse.glb';

// Horse is at (0, 0, -2). Isometric camera must be in FRONT (positive Z) and ABOVE (positive Y).
const HORSE_TARGET = new THREE.Vector3(0, 0.6, -2);

function createIsometricCamera() {
    const size = 5; // larger so whole horse fits
    const isoCamera = new THREE.OrthographicCamera(
        -size, size,
        size, -size,
        0.1, 100
    );
    // In front of and above the horse (positive Z = in front, positive Y = above)
    isoCamera.position.set(0, 2.5, 4);
    isoCamera.lookAt(HORSE_TARGET);
    isoCamera.updateProjectionMatrix();
    return isoCamera;
}

function updateIsometricCameraSize(isoCamera, width, height) {
    const aspect = width / height;
    const size = 5;
    if (aspect >= 1) {
        isoCamera.left = -size * aspect;
        isoCamera.right = size * aspect;
        isoCamera.top = size;
        isoCamera.bottom = -size;
    } else {
        isoCamera.left = -size;
        isoCamera.right = size;
        isoCamera.top = size / aspect;
        isoCamera.bottom = -size / aspect;
    }
    isoCamera.updateProjectionMatrix();
}

export class HorseWorld {
    constructor() {
        this.object = null;
        this.mixer = null;
        this.clock = new THREE.Clock();
        this.isoCamera = null;
    }

    getCamera() {
        return this.isoCamera;
    }

    enter(scene, renderer) {
        scene.background = new THREE.Color(0x1a1a2e);

        this.isoCamera = createIsometricCamera();
        const w = renderer.domElement.clientWidth || window.innerWidth;
        const h = renderer.domElement.clientHeight || window.innerHeight;
        updateIsometricCameraSize(this.isoCamera, w, h);

        this.object = new THREE.Group();
        scene.add(this.object);

        const loader = new GLTFLoader();
        loader.load(
            HORSE_GLB_URL,
            (gltf) => {
                const model = gltf.scene;
                model.scale.setScalar(2);
                model.position.set(0, 0, -2);
                model.rotation.y = Math.PI;
                this.object.add(model);

                // Optional: play morph/animations if present
                if (gltf.animations && gltf.animations.length > 0) {
                    this.mixer = new THREE.AnimationMixer(model);
                    const clip = gltf.animations[0];
                    this.mixer.clipAction(clip).play();
                }
            },
            undefined,
            (err) => console.error('Horse load error:', err)
        );

        const light = new THREE.DirectionalLight(0xffffff, 1);
        light.position.set(2, 5, 3);
        this.object.add(light);
        this.object.add(new THREE.AmbientLight(0xffffff, 0.4));
    }

    exit(scene) {
        if (this.object) {
            scene.remove(this.object);
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
        this.isoCamera = null;
    }

    onResize(width, height) {
        if (this.isoCamera) {
            updateIsometricCameraSize(this.isoCamera, width, height);
        }
    }

    update(time, frame, renderer, scene, camera) {
        if (this.mixer) {
            this.mixer.update(this.clock.getDelta());
        }
    }
}
