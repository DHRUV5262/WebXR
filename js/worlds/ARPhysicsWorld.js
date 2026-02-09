import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export class ARPhysicsWorld {
    constructor() {
        this.worldGroup = null;
        
        // Physics
        this.physicsWorld = null;
        this.sphereBody = null;
        this.planeBodies = new Map(); // Keep track of walls we create

        // Visuals
        this.sphereMesh = null;
        this.debugMeshes = new Group(); // For visualizing the invisible walls (optional)
        
        // AR Data
        this.planes = new Set();
    }

    enter(scene, renderer) {
        scene.background = null; // AR Mode
        this.worldGroup = new THREE.Group();
        scene.add(this.worldGroup);

        // 1. Initialize Physics World
        this.initPhysics();

        // 2. Initialize Visuals (The Sphere)
        this.initVisuals();

        console.log("AR Physics World: Scanning for planes...");
    }

    initPhysics() {
        this.physicsWorld = new CANNON.World();
        this.physicsWorld.gravity.set(0, -9.82, 0); // Earth gravity

        // Create a Physics Material (bouncy)
        const physicsMaterial = new CANNON.Material('bouncy');
        const physicsContactMaterial = new CANNON.ContactMaterial(
            physicsMaterial,
            physicsMaterial,
            { friction: 0.1, restitution: 0.7 } // Low friction, high bounce
        );
        this.physicsWorld.addContactMaterial(physicsContactMaterial);

        // Create Sphere Body
        const radius = 0.15; // 15cm radius
        this.sphereBody = new CANNON.Body({
            mass: 1, // Dynamic body
            shape: new CANNON.Sphere(radius),
            material: physicsMaterial
        });
        
        // Start position (floating in front of user)
        this.sphereBody.position.set(0, 0.5, -1); 
        this.physicsWorld.addBody(this.sphereBody);
    }

    initVisuals() {
        // Visual Sphere
        const geometry = new THREE.SphereGeometry(0.15, 32, 32);
        const material = new THREE.MeshStandardMaterial({ color: 0xff0000, roughness: 0.4 });
        this.sphereMesh = new THREE.Mesh(geometry, material);
        
        this.worldGroup.add(this.sphereMesh);
        
        // Add debug group for planes (initially empty)
        this.debugMeshes = new THREE.Group();
        this.worldGroup.add(this.debugMeshes);
    }

    exit(scene) {
        if (this.worldGroup) {
            scene.remove(this.worldGroup);
            this.worldGroup = null;
        }
        // Cleanup physics? simple GC usually handles it for JS
    }

    update(time, frame, renderer, scene, camera) {
        if (!frame) return;

        // 1. Step Physics
        // Fixed time step for stability (1/60th sec)
        this.physicsWorld.step(1 / 60);

        // 2. Sync Visuals to Physics
        if (this.sphereMesh && this.sphereBody) {
            this.sphereMesh.position.copy(this.sphereBody.position);
            this.sphereMesh.quaternion.copy(this.sphereBody.quaternion);
        }

        // 3. Detect Planes (WebXR)
        const referenceSpace = renderer.xr.getReferenceSpace();
        
        if (frame.detectedPlanes) {
            // Check for new or updated planes
            frame.detectedPlanes.forEach(plane => {
                this.updatePlanePhysics(plane, referenceSpace);
            });

            // Check for removed planes
            // (Simpler implementations might skip this, but good for completeness)
            for (const [plane, body] of this.planeBodies) {
                if (!frame.detectedPlanes.has(plane)) {
                    this.physicsWorld.removeBody(body);
                    this.planeBodies.delete(plane);
                }
            }
        }
    }

    updatePlanePhysics(plane, referenceSpace) {
        // This is where we will create the invisible wall for Cannon.js
        // We'll implement the geometry logic in the next step
        // const pose = frame.getPose(plane.planeSpace, referenceSpace);
        // ...
    }

    onSelect(controller) {
        // Interaction: Reset Sphere to Controller position
        if (this.sphereBody) {
             const tempMatrix = new THREE.Matrix4();
             tempMatrix.identity().extractRotation(controller.matrixWorld);
             
             // Get position 1m in front of controller
             const ray = new THREE.Ray();
             ray.origin.setFromMatrixPosition(controller.matrixWorld);
             ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);
             
             const spawnPos = ray.at(0.5, new THREE.Vector3()); // 0.5m in front

             // Reset Physics Body
             this.sphereBody.position.set(spawnPos.x, spawnPos.y, spawnPos.z);
             this.sphereBody.velocity.set(0, 0, 0);
             this.sphereBody.angularVelocity.set(0, 0, 0);
             
             // Wake it up if it was sleeping
             this.sphereBody.wakeUp();
        }
    }
}