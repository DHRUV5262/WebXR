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
            side: THREE.DoubleSide, // Render both sides to be safe
            displacementScale: -4.0, 
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
                console.log("InDepthWorld: Color texture loaded");
                texture.colorSpace = THREE.SRGBColorSpace;
                texture.minFilter = THREE.NearestFilter;
                texture.generateMipmaps = false;
                material.map = texture;
                material.needsUpdate = true;
            },
            undefined,
            (err) => console.error("InDepthWorld: Error loading color texture", err)
        );

        // Load Depth Map
        textureLoader.load(
            './assets/kandao3_depthmap.jpg',
            (depthTexture) => {
                console.log("InDepthWorld: Depth texture loaded");
                depthTexture.minFilter = THREE.NearestFilter;
                depthTexture.generateMipmaps = false;
                material.displacementMap = depthTexture;
                material.needsUpdate = true;
            },
            undefined,
            (err) => console.error("InDepthWorld: Error loading depth map", err)
        );

        scene.add(worldGroup);
        this.object = worldGroup;
        
        // FIX: Raise the world to eye-level (approx 1.6m)
        // This ensures the user's head is in the center of the sphere, 
        // matching the position of the camera that took the photo.
        this.object.position.y = 1.6;

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
        // Continuous 360 rotation if not in VR
        if (!renderer.xr.isPresenting && this.object) {
             // Rotate slowly around Y axis
             this.object.rotation.y += 0.001; 
        }
    }
}
