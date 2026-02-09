import * as THREE from 'three';

export class ARCubeWorld {
    constructor() {
        this.object = null;
        this.reticle = null;
        this.hitTestSource = null;
        this.hitTestSourceRequested = false;
        this.floorDetected = false;
        this.floorY = 0;
    }

    enter(scene, renderer) {
        // AR Mode: Clear background to see real world
        scene.background = null; 
        
        const worldGroup = new THREE.Group();
        
        // Create a physics-enabled cube
        const geometry = new THREE.BoxGeometry(0.3, 0.3, 0.3); 
        const material = new THREE.MeshStandardMaterial({ color: 0x00ff00, roughness: 0.7 });
        const cube = new THREE.Mesh(geometry, material);
        
        // Start position - Hidden until floor is found
        cube.visible = false; 
        cube.position.set(0, 0, 0);
        
        // Physics properties
        cube.userData.velocity = new THREE.Vector3(0, 0, 0);
        cube.userData.isSimulating = true;

        worldGroup.add(cube);
        scene.add(worldGroup);
        
        this.object = worldGroup;
        this.floorDetected = false;

        // Setup Reticle
        this.reticle = new THREE.Mesh(
            new THREE.RingGeometry(0.15, 0.2, 32).rotateX(-Math.PI / 2),
            new THREE.MeshBasicMaterial()
        );
        this.reticle.matrixAutoUpdate = false;
        this.reticle.visible = false;
        scene.add(this.reticle);

        // Notify UI (this is a bit hacky, ideally we use an event system)
        const btn = document.getElementById('switchWorld');
        if (btn) btn.textContent = `Switch World (Current: Scanning for Floor...)`;
    }

    exit(scene) {
        if (this.object) {
            scene.remove(this.object);
            // Cleanup geometry/materials...
            this.object = null;
        }
        if (this.reticle) {
            scene.remove(this.reticle);
            this.reticle.geometry.dispose();
            this.reticle.material.dispose();
            this.reticle = null;
        }
        this.hitTestSource = null;
        this.hitTestSourceRequested = false;
    }

    update(time, frame, renderer, scene, camera) {
        if (!frame) return;

        // --- Hit Testing ---
        const referenceSpace = renderer.xr.getReferenceSpace();
        const session = renderer.xr.getSession();

        if (this.hitTestSourceRequested === false) {
            session.requestReferenceSpace('viewer').then((refSpace) => {
                session.requestHitTestSource({ space: refSpace }).then((source) => {
                    this.hitTestSource = source;
                });
            });
            session.addEventListener('end', () => {
                this.hitTestSourceRequested = false;
                this.hitTestSource = null;
            });
            this.hitTestSourceRequested = true;
        }

        if (this.hitTestSource) {
            const hitTestResults = frame.getHitTestResults(this.hitTestSource);
            if (hitTestResults.length > 0) {
                const hit = hitTestResults[0];
                const hitPose = hit.getPose(referenceSpace);
                
                if (!this.floorDetected) {
                    this.reticle.visible = true;
                    this.reticle.matrix.fromArray(hitPose.transform.matrix);
                    
                    // AUTO-SPAWN
                    const cube = this.object.children[0];
                    if (cube && !cube.visible) {
                        const position = new THREE.Vector3();
                        position.setFromMatrixPosition(this.reticle.matrix);
                        this.floorY = position.y;
                        this.floorDetected = true;

                        cube.position.copy(position);
                        cube.position.y += 0.5; 
                        cube.visible = true;
                        
                        this.reticle.visible = false; 
                        
                        const btn = document.getElementById('switchWorld');
                        if (btn) btn.textContent = `Switch World (Current: AR Cube)`;
                    }
                } else {
                    this.reticle.visible = false;
                }
            } else {
                this.reticle.visible = false;
            }
        }

        // --- Controller Input (Button A) ---
        for (const source of session.inputSources) {
            if (source.gamepad) {
                // Check Button 4 (A/X)
                if (source.gamepad.buttons[4] && source.gamepad.buttons[4].pressed) {
                     const cube = this.object.children[0];
                     if (cube) this.applyJump(cube);
                }
            }
        }

        // --- Physics ---
        const cube = this.object.children[0];
        if (cube && cube.userData.isSimulating && cube.visible) {
            const delta = 0.016;
            
            cube.userData.velocity.y -= 9.8 * delta;
            cube.position.addScaledVector(cube.userData.velocity, delta);
            
            if (cube.position.y - 0.15 < this.floorY) {
                cube.position.y = this.floorY + 0.15;
                cube.userData.velocity.y *= -0.5;
                cube.userData.velocity.x *= 0.9;
                cube.userData.velocity.z *= 0.9;
                
                if (Math.abs(cube.userData.velocity.y) < 0.1) {
                    cube.userData.velocity.y = 0;
                }
            }
        }
    }

    onSelect(controller) {
        if (!this.object) return;
        
        const tempMatrix = new THREE.Matrix4();
        tempMatrix.identity().extractRotation(controller.matrixWorld);

        const raycaster = new THREE.Raycaster();
        raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
        raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

        const cube = this.object.children[0];
        if (cube) {
            const intersects = raycaster.intersectObject(cube);
            if (intersects.length > 0) {
                this.applyJump(cube);
            }
        }
    }

    applyJump(cube) {
        if (!cube.userData.velocity) cube.userData.velocity = new THREE.Vector3();
        cube.userData.velocity.y = 5.0; 
        cube.userData.velocity.x = (Math.random() - 0.5) * 2; 
        cube.userData.velocity.z = (Math.random() - 0.5) * 2;
        cube.material.color.setHex(Math.random() * 0xffffff);
    }
}