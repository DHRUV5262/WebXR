import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Same horse model used in three.js examples (webgl_morphtargets_horse / instancing_morph)
const HORSE_GLB_URL = 'https://threejs.org/examples/models/gltf/Horse.glb';

const PAN_SPEED = 0.08;
const ORBIT_SPEED = 0.03;
const ZOOM_SPEED = 0.5;

function updateIsometricCameraSize(isoCamera, width, height) {
    const aspect = width / height;
    const size = 3;
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

// Spherical position: camera orbits around target. theta = horizontal, phi = vertical (0 = from above)
function cameraPositionFromOrbit(target, distance, theta, phi) {
    const x = target.x + distance * Math.sin(phi) * Math.cos(theta);
    const y = target.y + distance * Math.cos(phi);
    const z = target.z + distance * Math.sin(phi) * Math.sin(theta);
    return new THREE.Vector3(x, y, z);
}

export class HorseWorld {
    constructor() {
        this.object = null;
        this.mixer = null;
        this.clock = new THREE.Clock();
        this.isoCamera = null;
        // Orbit state: target point, distance, angles (radians)
        this.target = new THREE.Vector3(0, 0.5, -2);
        this.distance = 5;
        this.theta = Math.PI * 0.5;  // 90° - camera in +Z (in front of horse)
        this.phi = Math.PI * 0.22;   // ~40° from top - clearly above the horse
        this.keys = new Set();
        this.boundKeyDown = this.onKeyDown.bind(this);
        this.boundKeyUp = this.onKeyUp.bind(this);
    }

    getCamera() {
        return this.isoCamera;
    }

    onKeyDown(e) {
        const k = e.code || e.key;
        if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowLeft', 'ArrowRight'].includes(k)) {
            e.preventDefault();
            this.keys.add(k);
        }
    }

    onKeyUp(e) {
        const k = e.code || e.key;
        this.keys.delete(k);
    }

    enter(scene, renderer) {
        scene.background = new THREE.Color(0x1a1a2e);

        this.isoCamera = new THREE.OrthographicCamera(-3, 3, 3, -3, 0.1, 100);
        const w = renderer.domElement.clientWidth || window.innerWidth;
        const h = renderer.domElement.clientHeight || window.innerHeight;
        updateIsometricCameraSize(this.isoCamera, w, h);

        this.target.set(0, 0.5, -2);
        this.distance = 5;
        this.theta = Math.PI * 0.5;
        this.phi = Math.PI * 0.22;
        this.updateCameraPosition();

        window.addEventListener('keydown', this.boundKeyDown);
        window.addEventListener('keyup', this.boundKeyUp);

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

    updateCameraPosition() {
        if (!this.isoCamera) return;
        const pos = cameraPositionFromOrbit(this.target, this.distance, this.theta, this.phi);
        this.isoCamera.position.copy(pos);
        this.isoCamera.lookAt(this.target);
    }

    exit(scene) {
        window.removeEventListener('keydown', this.boundKeyDown);
        window.removeEventListener('keyup', this.boundKeyUp);
        this.keys.clear();

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

        if (!this.isoCamera) return;

        // Left/Right arrow: orbit rotation
        if (this.keys.has('ArrowLeft')) {
            this.theta -= ORBIT_SPEED;
        }
        if (this.keys.has('ArrowRight')) {
            this.theta += ORBIT_SPEED;
        }

        // WASD: pan target in the horizontal plane (forward/right relative to view)
        const forward = new THREE.Vector3(
            -Math.sin(this.phi) * Math.cos(this.theta),
            0,
            -Math.sin(this.phi) * Math.sin(this.theta)
        ).normalize();
        const right = new THREE.Vector3(Math.cos(this.theta), 0, -Math.sin(this.theta));
        if (this.keys.has('KeyW')) {
            this.target.addScaledVector(forward, PAN_SPEED);
        }
        if (this.keys.has('KeyS')) {
            this.target.addScaledVector(forward, -PAN_SPEED);
        }
        if (this.keys.has('KeyA')) {
            this.target.addScaledVector(right, -PAN_SPEED);
        }
        if (this.keys.has('KeyD')) {
            this.target.addScaledVector(right, PAN_SPEED);
        }

        this.updateCameraPosition();
    }
}
