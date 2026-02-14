import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Horse model – try CDN first (better CORS for localhost/file), then threejs.org
const HORSE_GLB_URLS = [
    'https://cdn.jsdelivr.net/gh/mrdoob/three.js@dev/examples/models/gltf/Horse.glb',
    'https://threejs.org/examples/models/gltf/Horse.glb'
];

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
        this.placeholderMesh = null; // visible until horse loads
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

        // Placeholder so something is visible immediately (and we know the view works)
        const placeholderGeo = new THREE.BoxGeometry(0.8, 0.6, 0.4);
        const placeholderMat = new THREE.MeshStandardMaterial({ color: 0x8b4513 });
        this.placeholderMesh = new THREE.Mesh(placeholderGeo, placeholderMat);
        this.placeholderMesh.position.set(0, 0.5, -2);
        this.object.add(this.placeholderMesh);

        const light = new THREE.DirectionalLight(0xffffff, 1.2);
        light.position.set(2, 5, 3);
        this.object.add(light);
        this.object.add(new THREE.AmbientLight(0xffffff, 0.6));

        const loader = new GLTFLoader();
        const self = this;
        let loaded = false;

        function tryLoad(index) {
            if (index >= HORSE_GLB_URLS.length) {
                console.warn('Horse: all URLs failed, keeping placeholder');
                return;
            }
            const url = HORSE_GLB_URLS[index];
            loader.load(
                url,
                (gltf) => {
                    if (loaded) return;
                    loaded = true;
                    if (self.placeholderMesh && self.object) {
                        self.object.remove(self.placeholderMesh);
                        self.placeholderMesh.geometry.dispose();
                        self.placeholderMesh.material.dispose();
                        self.placeholderMesh = null;
                    }
                    const model = gltf.scene;
                    model.scale.setScalar(2);
                    model.position.set(0, 0, -2);
                    model.rotation.y = Math.PI;
                    self.object.add(model);
                    if (gltf.animations && gltf.animations.length > 0) {
                        self.mixer = new THREE.AnimationMixer(model);
                        self.mixer.clipAction(gltf.animations[0]).play();
                    }
                    console.log('Horse: model loaded');
                },
                undefined,
                (err) => {
                    console.warn('Horse: load failed for', url, err);
                    tryLoad(index + 1);
                }
            );
        }
        tryLoad(0);
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
        this.placeholderMesh = null;
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
