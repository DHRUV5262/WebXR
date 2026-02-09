import * as THREE from 'three';

export class CubeMapWorld {
    constructor() {
        // CubeMap is background only, no object group
    }

    enter(scene) {
        const loader = new THREE.CubeTextureLoader();
        loader.setPath('./assets/');

        const texture = loader.load([
            'px.jpg', 'nx.jpg',
            'py.jpg', 'ny.jpg',
            'pz.jpg', 'nz.jpg'
        ]);
        
        scene.background = texture;
    }

    exit(scene) {
        if (scene.background && scene.background.isTexture) {
            scene.background.dispose();
        }
        scene.background = new THREE.Color(0x101010);
    }

    update(time, frame) {
        // Static background
    }
}