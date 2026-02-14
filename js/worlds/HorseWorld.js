import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Same horse model used in three.js examples (webgl_morphtargets_horse / instancing_morph)
const HORSE_GLB_URL = 'https://threejs.org/examples/models/gltf/Horse.glb';

export class HorseWorld {
    constructor() {
        this.object = null;
        this.mixer = null;
        this.clock = new THREE.Clock();
    }

    enter(scene, renderer) {
        scene.background = new THREE.Color(0x1a1a2e);

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
    }

    update(time, frame, renderer, scene, camera) {
        if (this.mixer) {
            this.mixer.update(this.clock.getDelta());
        }
    }
}
