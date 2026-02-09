import * as THREE from 'three';

export class PanoramaWorld {
    constructor() {
        this.object = null;
    }

    enter(scene) {
        const worldGroup = new THREE.Group();
        const geometry = new THREE.SphereGeometry(500, 60, 40);
        geometry.scale(-1, 1, 1);

        const textureLoader = new THREE.TextureLoader();
        const texture = textureLoader.load(
            './assets/panorama.jpg',
            () => { console.log("Panorama loaded"); },
            undefined,
            (err) => { 
                console.warn("Panorama texture not found, using wireframe fallback.");
                const fallbackMat = new THREE.MeshBasicMaterial({ color: 0x00aa00, wireframe: true, side: THREE.BackSide });
            }
        );

        const material = new THREE.MeshBasicMaterial({ map: texture });
        const mesh = new THREE.Mesh(geometry, material);
        worldGroup.add(mesh);

        scene.add(worldGroup);
        this.object = worldGroup;
        
        // Ensure background is reset if coming from AR
        scene.background = new THREE.Color(0x101010);
    }

    exit(scene) {
        if (this.object) {
            scene.remove(this.object);
            this.object.traverse((child) => {
                if (child.isMesh) {
                    child.geometry.dispose();
                    if (child.material.map) child.material.map.dispose();
                    child.material.dispose();
                }
            });
            this.object = null;
        }
    }

    update(time, frame) {
        // No animation needed
    }
}