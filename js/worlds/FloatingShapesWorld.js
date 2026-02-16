import * as THREE from 'three';

export class FloatingShapesWorld {
    constructor() {
        this.object = null;
        this.instancedMeshes = [];
        this.instanceData = [];
        this.shapes = [];               // used when instancing is OFF (individual meshes)
        this.sharedGeometries = null;    // used when instancing is OFF (for disposal)
        this.useInstancing = true;
        this.boundary = 4;
        this.raycaster = new THREE.Raycaster();
        this.workingMatrix = new THREE.Matrix4();
        this.debugRayLine = null;
        this.debugRayTimeout = null;
        this._tempMatrix = new THREE.Matrix4();
        this._tempColor = new THREE.Color();
        this._dummy = new THREE.Object3D();
    }

    enter(scene, renderer) {
        this.scene = scene;
        this.object = new THREE.Group();

        const countEl = typeof document !== 'undefined' && document.getElementById('shape-count-value');
        const count = countEl ? Math.max(10, Math.min(10000, parseInt(countEl.textContent, 10) || 200)) : 200;
        const instancingEl = typeof document !== 'undefined' && document.getElementById('instancing-toggle');
        this.useInstancing = instancingEl ? instancingEl.checked : true;

        const geometries = [
            new THREE.BoxGeometry(0.5, 0.5, 0.5),
            new THREE.SphereGeometry(0.35, 16, 16),
            new THREE.ConeGeometry(0.25, 0.5, 16),
            new THREE.TorusGeometry(0.2, 0.08, 8, 20),
            new THREE.OctahedronGeometry(0.35)
        ];

        if (this.useInstancing) {
            this._enterInstanced(scene, count, geometries);
        } else {
            this.sharedGeometries = geometries;
            this._enterNonInstanced(scene, count, geometries);
        }

        scene.add(this.object);
        scene.background = new THREE.Color(0x101010);
    }

    _enterInstanced(scene, count, geometries) {
        const typeData = [[], [], [], [], []];
        for (let i = 0; i < count; i++) {
            const typeIndex = Math.floor(Math.random() * 5);
            const scale = Math.random() * 0.8 + 1.0;
            typeData[typeIndex].push({
                position: new THREE.Vector3(Math.random() * 6 - 3, Math.random() * 6 - 3, Math.random() * 6 - 3),
                velocity: new THREE.Vector3((Math.random() - 0.5) * 0.01, (Math.random() - 0.5) * 0.01, (Math.random() - 0.5) * 0.01),
                rotation: new THREE.Euler(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI),
                rotationSpeed: new THREE.Vector3(Math.random() * 0.02, Math.random() * 0.02, Math.random() * 0.02),
                scale: new THREE.Vector3(scale, scale, scale),
                color: new THREE.Color().setHex(Math.random() * 0xffffff),
                emissive: 0
            });
        }
        this.instanceData = typeData;
        const dummy = new THREE.Object3D();
        for (let t = 0; t < 5; t++) {
            const data = typeData[t];
            if (data.length === 0) continue;
            const material = new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.5, vertexColors: false });
            const mesh = new THREE.InstancedMesh(geometries[t], material, data.length);
            mesh.userData.instanceData = data;
            mesh.count = data.length;
            for (let i = 0; i < data.length; i++) {
                const d = data[i];
                dummy.position.copy(d.position);
                dummy.rotation.copy(d.rotation);
                dummy.scale.copy(d.scale);
                dummy.updateMatrix();
                mesh.setMatrixAt(i, dummy.matrix);
                mesh.setColorAt(i, d.color);
            }
            mesh.instanceMatrix.needsUpdate = true;
            if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
            this.object.add(mesh);
            this.instancedMeshes.push({ mesh, geometry: geometries[t], material });
        }
    }

    _enterNonInstanced(scene, count, geometries) {
        for (let i = 0; i < count; i++) {
            const typeIndex = Math.floor(Math.random() * 5);
            const scale = Math.random() * 0.8 + 1.0;
            const material = new THREE.MeshStandardMaterial({
                color: Math.random() * 0xffffff,
                roughness: 0.5,
                metalness: 0.5
            });
            const mesh = new THREE.Mesh(geometries[typeIndex], material);
            mesh.position.set(Math.random() * 6 - 3, Math.random() * 6 - 3, Math.random() * 6 - 3);
            mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
            mesh.scale.set(scale, scale, scale);
            mesh.userData.velocity = new THREE.Vector3(
                (Math.random() - 0.5) * 0.01,
                (Math.random() - 0.5) * 0.01,
                (Math.random() - 0.5) * 0.01
            );
            mesh.userData.rotationSpeed = {
                x: Math.random() * 0.02,
                y: Math.random() * 0.02,
                z: Math.random() * 0.02
            };
            this.object.add(mesh);
            this.shapes.push(mesh);
        }
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
            if (this.useInstancing) {
                this.instancedMeshes.forEach(({ mesh, geometry, material }) => {
                    geometry.dispose();
                    material.dispose();
                });
                this.instancedMeshes = [];
                this.instanceData = [];
            } else {
                this.shapes.forEach((mesh) => {
                    mesh.material.dispose();
                });
                this.shapes = [];
                if (this.sharedGeometries) {
                    this.sharedGeometries.forEach((g) => g.dispose());
                    this.sharedGeometries = null;
                }
            }
            this.object = null;
        }
    }

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
        const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
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

    pushShapeAtRay(raycaster) {
        this.showDebugRay(raycaster);
        if (!this.object) return;
        const intersects = raycaster.intersectObjects(this.object.children);
        if (intersects.length === 0) return;

        const hit = intersects[0];
        this.showDebugRay(raycaster, hit.distance);
        const direction = new THREE.Vector3()
            .subVectors(hit.point, raycaster.ray.origin)
            .normalize();

        if (this.useInstancing && hit.object.isInstancedMesh && hit.instanceId !== undefined) {
            const data = hit.object.userData.instanceData;
            if (!data || !data[hit.instanceId]) return;
            const d = data[hit.instanceId];
            d.velocity.addScaledVector(direction, 0.2);
            d.color.setHex(0xffffff);
            d.emissive = 1;
            d.rotationSpeed.x += 0.1;
            d.rotationSpeed.y += 0.1;
        } else if (!this.useInstancing && hit.object.isMesh) {
            const mesh = hit.object;
            mesh.userData.velocity.addScaledVector(direction, 0.2);
            mesh.material.color.setHex(0xffffff);
            mesh.material.emissive.setHex(0xff0000);
            mesh.userData.rotationSpeed.x += 0.1;
            mesh.userData.rotationSpeed.y += 0.1;
        }
    }

    onSelect(controller) {
        this.workingMatrix.identity().extractRotation(controller.matrixWorld);
        this.raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
        this.raycaster.ray.direction.set(0, 0, -1).applyMatrix4(this.workingMatrix);
        this.pushShapeAtRay(this.raycaster);
    }

    onPointerClick(raycaster) {
        this.pushShapeAtRay(raycaster);
    }

    update(time, frame) {
        if (this.useInstancing && this.instancedMeshes.length > 0) {
            const dummy = this._dummy;
            const red = 0xff0000;
            for (const { mesh } of this.instancedMeshes) {
                const data = mesh.userData.instanceData;
                for (let i = 0; i < data.length; i++) {
                    const d = data[i];
                    d.rotation.x += d.rotationSpeed.x;
                    d.rotation.y += d.rotationSpeed.y;
                    d.rotation.z += d.rotationSpeed.z;
                    d.position.add(d.velocity);
                    d.velocity.multiplyScalar(0.98);
                    if (d.velocity.length() < 0.01) d.velocity.normalize().multiplyScalar(0.01);
                    if (Math.abs(d.position.x) > this.boundary) d.velocity.x *= -1;
                    if (Math.abs(d.position.y) > this.boundary) d.velocity.y *= -1;
                    if (Math.abs(d.position.z) > this.boundary) d.velocity.z *= -1;
                    d.emissive *= 0.9;
                    this._tempColor.setHex(red).lerp(d.color, 1 - d.emissive);
                    dummy.position.copy(d.position);
                    dummy.rotation.copy(d.rotation);
                    dummy.scale.copy(d.scale);
                    dummy.updateMatrix();
                    mesh.setMatrixAt(i, dummy.matrix);
                    mesh.setColorAt(i, this._tempColor);
                }
                mesh.instanceMatrix.needsUpdate = true;
                if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
            }
        } else if (this.shapes.length > 0) {
            this.shapes.forEach((shape) => {
                shape.rotation.x += shape.userData.rotationSpeed.x;
                shape.rotation.y += shape.userData.rotationSpeed.y;
                shape.rotation.z += shape.userData.rotationSpeed.z;
                shape.position.add(shape.userData.velocity);
                shape.userData.velocity.multiplyScalar(0.98);
                if (shape.userData.velocity.length() < 0.01) shape.userData.velocity.normalize().multiplyScalar(0.01);
                if (Math.abs(shape.position.x) > this.boundary) shape.userData.velocity.x *= -1;
                if (Math.abs(shape.position.y) > this.boundary) shape.userData.velocity.y *= -1;
                if (Math.abs(shape.position.z) > this.boundary) shape.userData.velocity.z *= -1;
                if (shape.material.emissive.r > 0) shape.material.emissive.multiplyScalar(0.9);
            });
        }
    }
}
