import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Same horse model used in three.js examples (webgl_morphtargets_horse / instancing_morph)
const HORSE_GLB_URL = 'https://threejs.org/examples/models/gltf/Horse.glb';

const PAN_SPEED = 0.12;
const ROTATE_SPEED = 0.03;

function createIsometricCamera() {
    const size = 5;
    const isoCamera = new THREE.OrthographicCamera(
        -size, size,
        size, -size,
        0.1, 100
    );
    isoCamera.position.set(0, 2.5, 4);
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
        this.cameraTarget = new THREE.Vector3(0, 0.6, -2);
        this.keys = {};
        this._boundKeyDown = this._onKeyDown.bind(this);
        this._boundKeyUp = this._onKeyUp.bind(this);
    }

    getCamera() {
        return this.isoCamera;
    }

    _onKeyDown(e) {
        this.keys[e.code] = true;
    }

    _onKeyUp(e) {
        this.keys[e.code] = false;
    }

    enter(scene, renderer) {
        scene.background = new THREE.Color(0x1a1a2e);

        this.isoCamera = createIsometricCamera();
        // Start under the horse (low Y), in front (positive Z), looking up at the horse
        this.isoCamera.position.set(0, 0.4, 4);
        this.cameraTarget.set(0, 1.2, -2);
        this.isoCamera.lookAt(this.cameraTarget);

        const w = renderer.domElement.clientWidth || window.innerWidth;
        const h = renderer.domElement.clientHeight || window.innerHeight;
        updateIsometricCameraSize(this.isoCamera, w, h);

        document.addEventListener('keydown', this._boundKeyDown);
        document.addEventListener('keyup', this._boundKeyUp);

        this.object = new THREE.Group();
        scene.add(this.object);

        // Ground plane so we see the space and lighting
        const groundGeo = new THREE.PlaneGeometry(8, 8);
        const groundMat = new THREE.MeshStandardMaterial({ color: 0x2d2d44 });
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.rotation.x = -Math.PI / 2;
        ground.position.set(0, 0, -2);
        this.object.add(ground);

        const loader = new GLTFLoader();
        loader.load(
            HORSE_GLB_URL,
            (gltf) => {
                const model = gltf.scene;
                model.scale.setScalar(3);
                model.position.set(0, 0, -2);
                model.rotation.y = Math.PI;
                model.traverse((child) => {
                    if (child.isMesh && child.material) {
                        child.material = child.material.clone();
                        child.material.color?.setHex(0xcccccc);
                    }
                });
                this.object.add(model);

                if (gltf.animations && gltf.animations.length > 0) {
                    this.mixer = new THREE.AnimationMixer(model);
                    this.mixer.clipAction(gltf.animations[0]).play();
                }
            },
            undefined,
            (err) => console.error('Horse load error:', err)
        );

        const light = new THREE.DirectionalLight(0xffffff, 1.2);
        light.position.set(3, 6, 4);
        this.object.add(light);
        this.object.add(new THREE.AmbientLight(0xffffff, 0.6));
    }

    exit(scene) {
        document.removeEventListener('keydown', this._boundKeyDown);
        document.removeEventListener('keyup', this._boundKeyUp);
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
        const dt = this.clock.getDelta();
        const cam = this.isoCamera;
        if (cam) {
            const pan = PAN_SPEED * (dt * 60);
            const rot = ROTATE_SPEED * (dt * 60);

            if (this.keys['KeyW']) {
                this.cameraTarget.z -= pan;
                cam.position.z -= pan;
            }
            if (this.keys['KeyS']) {
                this.cameraTarget.z += pan;
                cam.position.z += pan;
            }
            if (this.keys['KeyA']) {
                this.cameraTarget.x -= pan;
                cam.position.x -= pan;
            }
            if (this.keys['KeyD']) {
                this.cameraTarget.x += pan;
                cam.position.x += pan;
            }
            if (this.keys['ArrowLeft'] || this.keys['ArrowRight']) {
                const dx = cam.position.x - this.cameraTarget.x;
                const dz = cam.position.z - this.cameraTarget.z;
                const rxz = Math.sqrt(dx * dx + dz * dz);
                let theta = Math.atan2(dx, dz);
                theta += this.keys['ArrowLeft'] ? rot : -rot;
                cam.position.x = this.cameraTarget.x + rxz * Math.sin(theta);
                cam.position.z = this.cameraTarget.z + rxz * Math.cos(theta);
            }
            cam.lookAt(this.cameraTarget);
        }
        if (this.mixer) {
            this.mixer.update(dt);
        }
    }
}
