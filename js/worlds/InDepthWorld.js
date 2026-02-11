import * as THREE from 'three';

export class InDepthWorld {
    constructor() {
        this.object = null;
        this.clock = new THREE.Clock();
    }

    enter(scene, renderer) {
        const worldGroup = new THREE.Group();

        // High detail sphere for displacement
        // Radius 6 matches the example (small radius, viewer inside)
        const geometry = new THREE.SphereGeometry(6, 256, 256);
        // Invert geometry to see inside
        geometry.scale(-1, 1, 1);

        const material = new THREE.MeshStandardMaterial({
            side: THREE.BackSide,
            displacementScale: -4.0, // Depth scale
            roughness: 1,
            metalness: 0
        });

        const mesh = new THREE.Mesh(geometry, material);
        worldGroup.add(mesh);

        // Load Textures
        const textureLoader = new THREE.TextureLoader();
        
        // Load Color Map
        textureLoader.load(
            './assets/kandao3.jpg',
            (texture) => {
                texture.colorSpace = THREE.SRGBColorSpace;
                texture.minFilter = THREE.NearestFilter;
                texture.generateMipmaps = false;
                material.map = texture;
                material.needsUpdate = true;
            }
        );

        // Load Depth Map
        textureLoader.load(
            './assets/kandao3_depthmap.jpg',
            (depthTexture) => {
                depthTexture.minFilter = THREE.NearestFilter;
                depthTexture.generateMipmaps = false;
                material.displacementMap = depthTexture;
                material.needsUpdate = true;
            },
            undefined,
            (err) => console.warn("Depth map not found", err)
        );

        scene.add(worldGroup);
        this.object = worldGroup;
        
        // Ensure background is reset
        scene.background = new THREE.Color(0x101010);
    }

    exit(scene) {
        if (this.object) {
            scene.remove(this.object);
            this.object.traverse((child) => {
                if (child.isMesh) {
                    child.geometry.dispose();
                    if (child.material.map) child.material.map.dispose();
                    if (child.material.displacementMap) child.material.displacementMap.dispose();
                    child.material.dispose();
                }
            });
            this.object = null;
        }
    }

    update(time, frame, renderer, scene, camera) {
        // Optional: Add subtle rotation if not in VR to show off depth
        if (!renderer.xr.isPresenting && this.object) {
             const t = this.clock.getElapsedTime();
             // Gentle sway to visualize parallax
             this.object.rotation.y = Math.sin(t * 0.1) * 0.1;
        }
    }
}
