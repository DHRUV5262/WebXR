import * as THREE from 'three';

/**
 * WaterDropletWorld
 * 
 * Dynamic cube map reflections on water droplet-like spheres.
 * Uses the same technique as Three.js webgl_materials_cubemap_dynamic example:
 * - CubeCamera renders the scene from the droplet's position into a cube texture
 * - MeshPhysicalMaterial uses that texture for realistic reflections
 * - Updated every frame for dynamic reflections (moving objects are reflected)
 * 
 * Also includes:
 * - Transmission (see-through glass/water effect)
 * - High clearcoat for wet surface look
 * - Animated floating objects that get reflected in the droplets
 */

export class WaterDropletWorld {
    constructor() {
        this.object = null;
        this.clock = new THREE.Clock();
        this.droplets = [];
        this.dropletMaterial = null;
        this.cubeCamera = null;
        this.cubeRenderTarget = null;
        this.floatingObjects = [];
        this.mainDroplet = null;
    }

    enter(scene, renderer) {
        const worldGroup = new THREE.Group();

        // Dynamic cube render target for reflections (like the Three.js example)
        this.cubeRenderTarget = new THREE.WebGLCubeRenderTarget(256);
        this.cubeRenderTarget.texture.type = THREE.HalfFloatType;

        // CubeCamera at the main droplet's position
        this.cubeCamera = new THREE.CubeCamera(0.1, 100, this.cubeRenderTarget);
        worldGroup.add(this.cubeCamera);

        // Sky dome with gradient (environment)
        const skyGeo = new THREE.SphereGeometry(80, 64, 64);
        const skyMat = new THREE.ShaderMaterial({
            side: THREE.BackSide,
            uniforms: {
                uTime: { value: 0.0 }
            },
            vertexShader: `
                varying vec3 vWorldPosition;
                void main() {
                    vec4 worldPos = modelMatrix * vec4(position, 1.0);
                    vWorldPosition = worldPos.xyz;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform float uTime;
                varying vec3 vWorldPosition;
                void main() {
                    vec3 dir = normalize(vWorldPosition);
                    float y = dir.y;
                    
                    // Gradient sky
                    vec3 skyTop = vec3(0.05, 0.15, 0.35);
                    vec3 skyHorizon = vec3(0.4, 0.5, 0.7);
                    vec3 skyBottom = vec3(0.1, 0.1, 0.15);
                    
                    vec3 color;
                    if (y > 0.0) {
                        color = mix(skyHorizon, skyTop, pow(y, 0.5));
                    } else {
                        color = mix(skyHorizon, skyBottom, pow(-y, 0.5));
                    }
                    
                    // Subtle animated clouds/noise
                    float noise = sin(dir.x * 10.0 + uTime * 0.1) * sin(dir.z * 10.0 - uTime * 0.15) * 0.02;
                    color += noise;
                    
                    gl_FragColor = vec4(color, 1.0);
                }
            `
        });
        this.skyMaterial = skyMat;
        const skySphere = new THREE.Mesh(skyGeo, skyMat);
        worldGroup.add(skySphere);

        // Floating objects that will be reflected in the droplets
        const objectMaterial = new THREE.MeshStandardMaterial({
            color: 0xff6633,
            roughness: 0.3,
            metalness: 0.6
        });
        const objectMaterial2 = new THREE.MeshStandardMaterial({
            color: 0x33ff66,
            roughness: 0.4,
            metalness: 0.5
        });
        const objectMaterial3 = new THREE.MeshStandardMaterial({
            color: 0x3366ff,
            roughness: 0.2,
            metalness: 0.7
        });

        // Torus knot
        const torusKnot = new THREE.Mesh(
            new THREE.TorusKnotGeometry(0.4, 0.15, 100, 16),
            objectMaterial
        );
        torusKnot.position.set(-2, 2, -3);
        worldGroup.add(torusKnot);
        this.floatingObjects.push({ mesh: torusKnot, offset: 0 });

        // Cube
        const cube = new THREE.Mesh(
            new THREE.BoxGeometry(0.6, 0.6, 0.6),
            objectMaterial2
        );
        cube.position.set(2, 1.8, -2.5);
        worldGroup.add(cube);
        this.floatingObjects.push({ mesh: cube, offset: 1 });

        // Icosahedron
        const ico = new THREE.Mesh(
            new THREE.IcosahedronGeometry(0.4, 1),
            objectMaterial3
        );
        ico.position.set(0, 2.5, -4);
        worldGroup.add(ico);
        this.floatingObjects.push({ mesh: ico, offset: 2 });

        // Small spheres orbiting
        for (let i = 0; i < 5; i++) {
            const orbitSphere = new THREE.Mesh(
                new THREE.SphereGeometry(0.15, 16, 16),
                new THREE.MeshStandardMaterial({
                    color: new THREE.Color().setHSL(i / 5, 0.8, 0.5),
                    roughness: 0.3,
                    metalness: 0.5
                })
            );
            orbitSphere.position.set(
                Math.cos(i * Math.PI * 2 / 5) * 1.5,
                1.6,
                -2 + Math.sin(i * Math.PI * 2 / 5) * 1.5
            );
            worldGroup.add(orbitSphere);
            this.floatingObjects.push({ mesh: orbitSphere, offset: i * 0.5, orbit: true, orbitIndex: i });
        }

        // Main droplet material using MeshPhysicalMaterial for realistic reflections
        // This uses the dynamic cube map like the Three.js example
        this.dropletMaterial = new THREE.MeshPhysicalMaterial({
            color: 0x88ccff,
            envMap: this.cubeRenderTarget.texture,
            envMapIntensity: 1.0,
            roughness: 0.0,
            metalness: 0.0,
            transmission: 0.9,        // See-through like water/glass
            thickness: 0.5,           // Refraction thickness
            ior: 1.33,                // Water's index of refraction
            clearcoat: 1.0,           // Wet surface shine
            clearcoatRoughness: 0.0,
            transparent: true,
            opacity: 0.95
        });

        // Main large droplet
        const dropletGeometry = new THREE.SphereGeometry(0.5, 64, 64);
        this.mainDroplet = new THREE.Mesh(dropletGeometry, this.dropletMaterial);
        this.mainDroplet.position.set(0, 1.6, -2);
        this.mainDroplet.scale.set(1.2, 1.0, 1.2);
        worldGroup.add(this.mainDroplet);
        this.droplets.push(this.mainDroplet);

        // Position cube camera at main droplet
        this.cubeCamera.position.copy(this.mainDroplet.position);

        // Smaller surrounding droplets (share the same envMap for performance)
        const positions = [
            { x: -1.0, y: 1.3, z: -2.3, s: 0.4 },
            { x: 1.1, y: 1.4, z: -2.1, s: 0.35 },
            { x: -0.6, y: 2.0, z: -2.6, s: 0.3 },
            { x: 0.7, y: 1.9, z: -2.5, s: 0.32 },
            { x: 0.0, y: 1.0, z: -1.6, s: 0.25 },
            { x: -1.3, y: 1.7, z: -2.8, s: 0.38 },
            { x: 1.4, y: 1.1, z: -2.7, s: 0.4 }
        ];

        positions.forEach(p => {
            const droplet = new THREE.Mesh(dropletGeometry, this.dropletMaterial);
            droplet.position.set(p.x, p.y, p.z);
            const scaleY = p.s * (0.85 + Math.random() * 0.15);
            droplet.scale.set(p.s, scaleY, p.s);
            worldGroup.add(droplet);
            this.droplets.push(droplet);
        });

        // Floor with slight reflection
        const floorGeo = new THREE.PlaneGeometry(30, 30);
        const floorMat = new THREE.MeshStandardMaterial({
            color: 0x222233,
            roughness: 0.6,
            metalness: 0.3
        });
        const floor = new THREE.Mesh(floorGeo, floorMat);
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = 0;
        worldGroup.add(floor);

        // Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        worldGroup.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
        directionalLight.position.set(5, 15, 5);
        worldGroup.add(directionalLight);

        const pointLight1 = new THREE.PointLight(0xff8866, 0.8, 15);
        pointLight1.position.set(-3, 3, -2);
        worldGroup.add(pointLight1);

        const pointLight2 = new THREE.PointLight(0x6688ff, 0.8, 15);
        pointLight2.position.set(3, 2, -3);
        worldGroup.add(pointLight2);

        scene.add(worldGroup);
        this.object = worldGroup;
        this.renderer = renderer;
        scene.background = null; // Use sky sphere instead
    }

    exit(scene) {
        if (this.object) {
            scene.remove(this.object);
            this.object.traverse((child) => {
                if (child.isMesh) {
                    child.geometry.dispose();
                    if (child.material) {
                        if (child.material.dispose) child.material.dispose();
                    }
                }
            });
            this.object = null;
        }
        if (this.cubeRenderTarget) {
            this.cubeRenderTarget.dispose();
            this.cubeRenderTarget = null;
        }
        this.droplets = [];
        this.floatingObjects = [];
        this.dropletMaterial = null;
        this.cubeCamera = null;
        this.mainDroplet = null;
    }

    update(time, frame, renderer, scene, camera) {
        const elapsed = this.clock.getElapsedTime();

        // Update sky animation
        if (this.skyMaterial) {
            this.skyMaterial.uniforms.uTime.value = elapsed;
        }

        // Animate floating objects (they will be reflected in the droplets)
        this.floatingObjects.forEach((obj) => {
            const mesh = obj.mesh;
            
            if (obj.orbit) {
                // Orbiting spheres
                const angle = elapsed * 0.5 + obj.orbitIndex * Math.PI * 2 / 5;
                mesh.position.x = Math.cos(angle) * 1.8;
                mesh.position.z = -2 + Math.sin(angle) * 1.8;
                mesh.position.y = 1.6 + Math.sin(elapsed * 2 + obj.offset) * 0.3;
            } else {
                // Floating objects
                mesh.position.y += Math.sin(elapsed * 0.8 + obj.offset) * 0.002;
                mesh.rotation.x = elapsed * 0.3 + obj.offset;
                mesh.rotation.y = elapsed * 0.5 + obj.offset;
            }
        });

        // Gentle floating animation for droplets
        this.droplets.forEach((droplet, i) => {
            if (i === 0) return; // Don't move main droplet
            const offset = i * 0.7;
            droplet.position.y += Math.sin(elapsed * 0.6 + offset) * 0.0008;
        });

        // Update cube camera to capture dynamic reflections
        // Hide the main droplet temporarily so it doesn't reflect itself
        if (this.mainDroplet && this.cubeCamera && this.renderer) {
            this.mainDroplet.visible = false;
            this.cubeCamera.update(this.renderer, scene);
            this.mainDroplet.visible = true;
        }
    }
}
