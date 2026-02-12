import * as THREE from 'three';

export class FloatingCubesWorld {
    constructor() {
        this.object = null;
        this.cubes = [];
        this.boundary = 3; // Defines the box size (-3 to 3)
    }

    enter(scene, renderer) {
        // Create a container group for all cubes
        this.object = new THREE.Group();

        // Geometry for all cubes (reuse one geometry for performance)
        const geometry = new THREE.BoxGeometry(0.2, 0.2, 0.2);

        // Create 200 random cubes
        for (let i = 0; i < 200; i++) {
            const material = new THREE.MeshStandardMaterial({
                color: Math.random() * 0xffffff,
                roughness: 0.7,
                metalness: 0.0
            });

            const object = new THREE.Mesh(geometry, material);

            // Random position: spread out in a volume
            object.position.x = Math.random() * 4 - 2;
            object.position.y = Math.random() * 4 - 2;
            object.position.z = Math.random() * 4 - 2;

            // Random rotation
            object.rotation.x = Math.random() * 2 * Math.PI;
            object.rotation.y = Math.random() * 2 * Math.PI;
            object.rotation.z = Math.random() * 2 * Math.PI;

            // Random scale
            object.scale.x = Math.random() + 0.5;
            object.scale.y = Math.random() + 0.5;
            object.scale.z = Math.random() + 0.5;

            // Store custom rotation speed for animation
            object.userData.rotationSpeed = {
                x: Math.random() * 0.01,
                y: Math.random() * 0.01,
                z: Math.random() * 0.01
            };

            // Store velocity for movement
            object.userData.velocity = {
                x: (Math.random() - 0.5) * 0.02,
                y: (Math.random() - 0.5) * 0.02,
                z: (Math.random() - 0.5) * 0.02
            };

            this.object.add(object);
            this.cubes.push(object);
        }

        scene.add(this.object);
        
        // Reset background to dark gray
        scene.background = new THREE.Color(0x101010);
    }

    exit(scene) {
        if (this.object) {
            scene.remove(this.object);
            
            // Cleanup memory
            this.cubes.forEach(cube => {
                cube.geometry.dispose(); 
                cube.material.dispose();
            });
            
            this.cubes = [];
            this.object = null;
        }
    }

    update(time, frame) {
        // Animate each cube individually
        this.cubes.forEach(cube => {
            // Rotation
            cube.rotation.x += cube.userData.rotationSpeed.x;
            cube.rotation.y += cube.userData.rotationSpeed.y;
            cube.rotation.z += cube.userData.rotationSpeed.z;

            // Position Movement
            cube.position.x += cube.userData.velocity.x;
            cube.position.y += cube.userData.velocity.y;
            cube.position.z += cube.userData.velocity.z;

            // Boundary Check (Bounce off walls)
            if (cube.position.x < -this.boundary || cube.position.x > this.boundary) {
                cube.userData.velocity.x *= -1;
            }
            if (cube.position.y < -this.boundary || cube.position.y > this.boundary) {
                cube.userData.velocity.y *= -1;
            }
            if (cube.position.z < -this.boundary || cube.position.z > this.boundary) {
                cube.userData.velocity.z *= -1;
            }
        });
    }
}
