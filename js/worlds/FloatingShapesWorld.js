import * as THREE from 'three';

export class FloatingShapesWorld {
    constructor() {
        this.object = null;
        this.shapes = []; // Renamed from 'cubes' to 'shapes'
        this.boundary = 4; 
        
        // Raycaster for click detection
        this.raycaster = new THREE.Raycaster();
        this.workingMatrix = new THREE.Matrix4();
        this.debugRayLine = null;
        this.debugRayTimeout = null;
    }

    enter(scene, renderer) {
        this.scene = scene;
        this.object = new THREE.Group();

        // 1. Define multiple geometries
        const geometries = [
            new THREE.BoxGeometry(0.2, 0.2, 0.2),
            new THREE.SphereGeometry(0.15, 16, 16),
            new THREE.ConeGeometry(0.15, 0.3, 16),
            new THREE.TorusGeometry(0.12, 0.05, 8, 20),
            new THREE.OctahedronGeometry(0.2)
        ];

        // Create 200 random shapes
        for (let i = 0; i < 200; i++) {
            const material = new THREE.MeshStandardMaterial({
                color: Math.random() * 0xffffff,
                roughness: 0.5,
                metalness: 0.5
            });

            // Pick a random geometry from the list
            const geometry = geometries[Math.floor(Math.random() * geometries.length)];
            
            const object = new THREE.Mesh(geometry, material);

            // Random position
            object.position.x = Math.random() * 6 - 3;
            object.position.y = Math.random() * 6 - 3; // Keep it somewhat centered vertically
            object.position.z = Math.random() * 6 - 3;

            // Random rotation
            object.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);

            // Random scale
            const scale = Math.random() + 0.5;
            object.scale.set(scale, scale, scale);

            // Custom data
            object.userData = {
                rotationSpeed: {
                    x: Math.random() * 0.02,
                    y: Math.random() * 0.02,
                    z: Math.random() * 0.02
                },
                // Use a THREE.Vector3 for velocity so we can use vector helpers
                velocity: new THREE.Vector3(
                    (Math.random() - 0.5) * 0.01,
                    (Math.random() - 0.5) * 0.01,
                    (Math.random() - 0.5) * 0.01
                )
            };

            this.object.add(object);
            this.shapes.push(object);
        }

        scene.add(this.object);
        scene.background = new THREE.Color(0x101010);
    }

    exit(scene) {
        if (this.debugRayTimeout) clearTimeout(this.debugRayTimeout);
        if (this.debugRayLine && this.scene) {
            this.scene.remove(this.debugRayLine);
            this.debugRayLine.geometry.dispose();
            this.debugRayLine.material.dispose();
            this.debugRayLine = null;
        }
        this.scene = null;
        if (this.object) {
            scene.remove(this.object);
            this.shapes.forEach(shape => {
                // Note: Geometries are shared, but for simplicity here we let them be cleaned up by GC or explicit disposal if we tracked them better.
                // In a robust app, we'd dispose the 5 shared geometries separately.
                shape.material.dispose();
            });
            this.shapes = [];
            this.object = null;
        }
    }

    // Draw a short-lived debug line along the raycaster (desktop click or VR/AR trigger)
    showDebugRay(raycaster, length = 8) {
        if (!this.scene) return;
        if (this.debugRayTimeout) clearTimeout(this.debugRayTimeout);
        if (this.debugRayLine) {
            this.scene.remove(this.debugRayLine);
            this.debugRayLine.geometry.dispose();
            this.debugRayLine.material.dispose();
        }
        const start = raycaster.ray.origin.clone();
        const end = start.clone().add(raycaster.ray.direction.clone().multiplyScalar(length));
        const points = [start, end];
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({ color: 0x00ff00, linewidth: 2 });
        this.debugRayLine = new THREE.Line(geometry, material);
        this.scene.add(this.debugRayLine);
        this.debugRayTimeout = setTimeout(() => {
            if (this.scene && this.debugRayLine) {
                this.scene.remove(this.debugRayLine);
                this.debugRayLine.geometry.dispose();
                this.debugRayLine.material.dispose();
                this.debugRayLine = null;
            }
            this.debugRayTimeout = null;
        }, 400);
    }

    // Shared: push the first shape hit by the given raycaster (used by both mouse and VR controller)
    pushShapeAtRay(raycaster) {
        this.showDebugRay(raycaster);
        if (!this.object) return;
        const intersects = raycaster.intersectObjects(this.object.children);
        if (intersects.length === 0) return;

        const hit = intersects[0];
        // Optional: shorten debug ray to hit point so it's clear what was hit
        this.showDebugRay(raycaster, hit.distance);
        const selectedObject = hit.object;
        // Direction away from the click/controller (world space)
        const direction = new THREE.Vector3()
            .subVectors(hit.point, raycaster.ray.origin)
            .normalize();

        selectedObject.userData.velocity.addScaledVector(direction, 0.2);
        selectedObject.material.color.setHex(0xffffff);
        selectedObject.material.emissive.setHex(0xff0000);
        selectedObject.userData.rotationSpeed.x += 0.1;
        selectedObject.userData.rotationSpeed.y += 0.1;
    }

    // VR/AR: controller trigger
    onSelect(controller) {
        this.workingMatrix.identity().extractRotation(controller.matrixWorld);
        this.raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
        this.raycaster.ray.direction.set(0, 0, -1).applyMatrix4(this.workingMatrix);
        this.pushShapeAtRay(this.raycaster);
    }

    // Desktop: mouse click — pass a raycaster already set from camera + mouse
    onPointerClick(raycaster) {
        this.pushShapeAtRay(raycaster);
    }

    update(time, frame) {
        this.shapes.forEach(shape => {
            // Rotation
            shape.rotation.x += shape.userData.rotationSpeed.x;
            shape.rotation.y += shape.userData.rotationSpeed.y;
            shape.rotation.z += shape.userData.rotationSpeed.z;

            // Movement
            shape.position.add(shape.userData.velocity);

            // Friction (slow down the "impulse" from clicks over time)
            shape.userData.velocity.multiplyScalar(0.98);
            
            // Keep a minimum speed so they don't stop completely
            if (shape.userData.velocity.length() < 0.01) {
                 shape.userData.velocity.normalize().multiplyScalar(0.01);
            }

            // Boundary Check (Bounce)
            if (Math.abs(shape.position.x) > this.boundary) shape.userData.velocity.x *= -1;
            if (Math.abs(shape.position.y) > this.boundary) shape.userData.velocity.y *= -1;
            if (Math.abs(shape.position.z) > this.boundary) shape.userData.velocity.z *= -1;
            
            // Reduce glow over time
            if (shape.material.emissive.r > 0) {
                shape.material.emissive.multiplyScalar(0.9);
            }
        });
    }
}
