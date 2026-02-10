import * as THREE from 'three';

export class DepthPanoramaWorld {
    constructor() {
        this.object = null;
    }

    enter(scene) {
        // 1. Geometry: High segment count for potential depth displacement
        // We use a smaller radius (20) to allow for 6DOF parallax if we implemented full displacement
        // But for now, we just want correct mapping.
        const geometry = new THREE.SphereGeometry(20, 60, 40);
        geometry.scale(-1, 1, 1); // Invert geometry to view from inside

        // 2. Load the Texture (Top/Bottom format)
        const loader = new THREE.TextureLoader();
        const texture = loader.load('./assets/kandao3.jpg');
        
        // Optimize texture settings
        texture.minFilter = THREE.NearestFilter;
        texture.magFilter = THREE.NearestFilter;
        texture.generateMipmaps = false;

        // 3. Shader Material to handle Top/Bottom Split
        const material = new THREE.ShaderMaterial({
            uniforms: {
                panoMap: { value: texture },
                opacity: { value: 1.0 }
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
                }
            `,
            fragmentShader: `
                uniform sampler2D panoMap;
                uniform float opacity;
                varying vec2 vUv;
                
                void main() {
                    // Map the top half of the texture (V: 0.5 to 1.0) to the sphere
                    // The standard UV y goes 0..1. We compress it to 0.5..1.0
                    vec2 colorUv = vec2(vUv.x, vUv.y * 0.5 + 0.5);
                    
                    vec4 color = texture2D(panoMap, colorUv);
                    gl_FragColor = vec4( color.rgb, opacity );
                }
            `,
            side: THREE.BackSide,
            transparent: true
        });

        this.object = new THREE.Mesh(geometry, material);
        scene.add(this.object);
        
        // Reset background
        scene.background = new THREE.Color(0x101010);
    }

    update(time, frame, renderer, scene, camera) {
        // No animation needed for static pano
    }

    exit(scene) {
        if (this.object) {
            scene.remove(this.object);
            this.object.geometry.dispose();
            this.object.material.uniforms.panoMap.value.dispose();
            this.object.material.dispose();
            this.object = null;
        }
    }
}
