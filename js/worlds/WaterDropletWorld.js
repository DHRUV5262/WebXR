import * as THREE from 'three';

/**
 * WaterDropletWorld
 * 
 * A custom shader world that renders water droplet-like materials.
 * Uses fragment shader to compute:
 * - Fresnel effect (edge glow)
 * - Refraction distortion
 * - Specular highlights
 * - Animated ripples
 * 
 * All shading calculations run in parallel on the GPU (fragment shader).
 */

const vertexShader = `
    varying vec3 vNormal;
    varying vec3 vViewPosition;
    varying vec2 vUv;
    varying vec3 vWorldPosition;

    void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewPosition = -mvPosition.xyz;
        vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * mvPosition;
    }
`;

const fragmentShader = `
    uniform float uTime;
    uniform vec3 uBaseColor;
    uniform vec3 uFresnelColor;
    uniform float uFresnelPower;
    uniform float uRefractionStrength;
    uniform samplerCube uEnvMap;
    uniform float uRippleSpeed;
    uniform float uRippleScale;

    varying vec3 vNormal;
    varying vec3 vViewPosition;
    varying vec2 vUv;
    varying vec3 vWorldPosition;

    // Simple noise function for ripples
    float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }

    float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = hash(i);
        float b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0));
        float d = hash(i + vec2(1.0, 1.0));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
    }

    // Layered noise for water ripple effect
    float ripple(vec2 uv, float time) {
        float n = 0.0;
        n += 0.5 * noise(uv * 4.0 + time * 0.5);
        n += 0.25 * noise(uv * 8.0 - time * 0.7);
        n += 0.125 * noise(uv * 16.0 + time * 1.1);
        return n;
    }

    void main() {
        vec3 normal = normalize(vNormal);
        vec3 viewDir = normalize(vViewPosition);

        // Animated ripple distortion on normal
        float rippleOffset = ripple(vUv * uRippleScale, uTime * uRippleSpeed);
        vec3 distortedNormal = normalize(normal + vec3(rippleOffset * 0.1, rippleOffset * 0.1, 0.0));

        // Fresnel effect (edge glow like water droplets)
        float fresnel = pow(1.0 - max(dot(viewDir, distortedNormal), 0.0), uFresnelPower);

        // Reflection direction for environment
        vec3 reflectDir = reflect(-viewDir, distortedNormal);
        
        // Refraction direction (simplified)
        vec3 refractDir = refract(-viewDir, distortedNormal, 1.0 / 1.33); // water IOR ~1.33

        // Sample environment map for reflection
        vec3 envReflect = textureCube(uEnvMap, reflectDir).rgb;
        vec3 envRefract = textureCube(uEnvMap, refractDir).rgb;

        // Mix refraction and reflection based on fresnel
        vec3 envColor = mix(envRefract, envReflect, fresnel * 0.5);

        // Specular highlight (Blinn-Phong style)
        vec3 lightDir = normalize(vec3(1.0, 1.0, 1.0));
        vec3 halfDir = normalize(viewDir + lightDir);
        float spec = pow(max(dot(distortedNormal, halfDir), 0.0), 64.0);
        vec3 specular = vec3(1.0) * spec * 0.8;

        // Combine: base color + environment + fresnel glow + specular
        vec3 baseContrib = uBaseColor * (1.0 - fresnel * 0.5);
        vec3 fresnelContrib = uFresnelColor * fresnel * 0.6;
        vec3 finalColor = baseContrib + envColor * 0.4 + fresnelContrib + specular;

        // Slight transparency variation based on fresnel
        float alpha = 0.7 + fresnel * 0.3;

        gl_FragColor = vec4(finalColor, alpha);
    }
`;

export class WaterDropletWorld {
    constructor() {
        this.object = null;
        this.clock = new THREE.Clock();
        this.droplets = [];
        this.shaderMaterial = null;
    }

    enter(scene, renderer) {
        const worldGroup = new THREE.Group();

        // Create a simple environment cube map (procedural gradient)
        const cubeRenderTarget = new THREE.WebGLCubeRenderTarget(256);
        const cubeCamera = new THREE.CubeCamera(0.1, 100, cubeRenderTarget);
        
        // Create a gradient sky sphere for the environment
        const skyGeo = new THREE.SphereGeometry(50, 32, 32);
        const skyMat = new THREE.ShaderMaterial({
            side: THREE.BackSide,
            uniforms: {},
            vertexShader: `
                varying vec3 vWorldPosition;
                void main() {
                    vec4 worldPos = modelMatrix * vec4(position, 1.0);
                    vWorldPosition = worldPos.xyz;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                varying vec3 vWorldPosition;
                void main() {
                    float y = normalize(vWorldPosition).y;
                    vec3 skyTop = vec3(0.1, 0.2, 0.4);
                    vec3 skyBottom = vec3(0.6, 0.7, 0.9);
                    vec3 color = mix(skyBottom, skyTop, y * 0.5 + 0.5);
                    gl_FragColor = vec4(color, 1.0);
                }
            `
        });
        const skySphere = new THREE.Mesh(skyGeo, skyMat);
        worldGroup.add(skySphere);

        // Update cube camera to capture environment
        cubeCamera.position.set(0, 1.6, 0);
        cubeCamera.update(renderer, skySphere);

        // Create shader material for water droplets
        this.shaderMaterial = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0.0 },
                uBaseColor: { value: new THREE.Color(0.2, 0.5, 0.8) },
                uFresnelColor: { value: new THREE.Color(0.8, 0.9, 1.0) },
                uFresnelPower: { value: 3.0 },
                uRefractionStrength: { value: 0.1 },
                uEnvMap: { value: cubeRenderTarget.texture },
                uRippleSpeed: { value: 1.0 },
                uRippleScale: { value: 3.0 }
            },
            vertexShader: vertexShader,
            fragmentShader: fragmentShader,
            transparent: true,
            side: THREE.DoubleSide
        });

        // Create multiple droplet spheres
        const dropletGeometry = new THREE.SphereGeometry(0.3, 64, 64);
        
        // Main large droplet
        const mainDroplet = new THREE.Mesh(dropletGeometry, this.shaderMaterial);
        mainDroplet.position.set(0, 1.6, -2);
        mainDroplet.scale.set(1.5, 1.2, 1.5); // Slightly flattened like a real droplet
        worldGroup.add(mainDroplet);
        this.droplets.push(mainDroplet);

        // Smaller surrounding droplets
        const positions = [
            { x: -1.2, y: 1.2, z: -2.5, s: 0.6 },
            { x: 1.3, y: 1.4, z: -2.3, s: 0.5 },
            { x: -0.8, y: 2.1, z: -2.8, s: 0.4 },
            { x: 0.9, y: 2.0, z: -2.6, s: 0.45 },
            { x: 0.0, y: 0.8, z: -1.8, s: 0.35 },
            { x: -1.5, y: 1.8, z: -3.0, s: 0.5 },
            { x: 1.6, y: 1.0, z: -2.9, s: 0.55 }
        ];

        positions.forEach(p => {
            const droplet = new THREE.Mesh(dropletGeometry, this.shaderMaterial);
            droplet.position.set(p.x, p.y, p.z);
            const scaleY = p.s * (0.8 + Math.random() * 0.2);
            droplet.scale.set(p.s, scaleY, p.s);
            worldGroup.add(droplet);
            this.droplets.push(droplet);
        });

        // Add a subtle floor plane
        const floorGeo = new THREE.PlaneGeometry(20, 20);
        const floorMat = new THREE.MeshStandardMaterial({
            color: 0x333344,
            roughness: 0.8,
            metalness: 0.2
        });
        const floor = new THREE.Mesh(floorGeo, floorMat);
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = 0;
        worldGroup.add(floor);

        // Add some lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
        worldGroup.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
        directionalLight.position.set(5, 10, 5);
        worldGroup.add(directionalLight);

        const pointLight = new THREE.PointLight(0x88ccff, 0.5, 10);
        pointLight.position.set(-2, 3, -2);
        worldGroup.add(pointLight);

        scene.add(worldGroup);
        this.object = worldGroup;
        scene.background = new THREE.Color(0x1a1a2e);
    }

    exit(scene) {
        if (this.object) {
            scene.remove(this.object);
            this.object.traverse((child) => {
                if (child.isMesh) {
                    child.geometry.dispose();
                    if (child.material.dispose) child.material.dispose();
                }
            });
            this.object = null;
        }
        this.droplets = [];
        this.shaderMaterial = null;
    }

    update(time, frame, renderer, scene, camera) {
        const elapsed = this.clock.getElapsedTime();

        // Update shader time uniform
        if (this.shaderMaterial) {
            this.shaderMaterial.uniforms.uTime.value = elapsed;
        }

        // Gentle floating animation for droplets
        this.droplets.forEach((droplet, i) => {
            const offset = i * 0.5;
            droplet.position.y += Math.sin(elapsed * 0.8 + offset) * 0.001;
            droplet.rotation.y = elapsed * 0.1 + offset;
        });
    }
}
