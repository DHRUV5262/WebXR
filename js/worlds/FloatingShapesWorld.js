import * as THREE from 'three';

export class FloatingShapesWorld {
    constructor() {
        this.object = null;
        this.instancedMeshes = [];      // one per geometry type
        this.instanceData = [];         // array of 5 arrays: per-instance { position, velocity, rotation, rotationSpeed, scale, color, emissive }
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
        const count = countEl ? Math.max(10, Math.min(2000, parseInt(countEl.textContent, 10) || 200)) : 200;

        // Original (larger) geometry sizes
        const geometries = [
            new THREE.BoxGeometry(0.2, 0.2, 0.2),
            new THREE.SphereGeometry(0.15, 16, 16),
            new THREE.ConeGeometry(0.15, 0.3, 16),
            new THREE.TorusGeometry(0.12, 0.05, 8, 20),
            new THREE.OctahedronGeometry(0.2)
        ];

        // Bucket instances by type
        const typeData = [[], [], [], [], []]; // 5 types
        for (let i = 0; i < count; i++) {
            const typeIndex = Math.floor(Math.random() * 5);
            const scale = Math.random() + 0.5;
            typeData[typeIndex].push({
                position: new THREE.Vector3(
                    Math.random() * 6 - 3,
                    Math.random() * 6 - 3,
                    Math.random() * 6 - 3
                ),
                velocity: new THREE.Vector3(
                    (Math.random() - 0.5) * 0.01,
                    (Math.random() - 0.5) * 0.01,
                    (Math.random() - 0.5) * 0.01
                ),
                rotation: new THREE.Euler(
                    Math.random() * Math.PI,
                    Math.random() * Math.PI,
                    Math.random() * Math.PI
                ),
                rotationSpeed: new THREE.Vector3(
                    Math.random() * 0.02,
                    Math.random() * 0.02,
                    Math.random() * 0.02
                ),
                scale: new THREE.Vector3(scale, scale, scale),
                color: new THREE.Color().setHex(Math.random() * 0xffffff),
                emissive: 0
            });
        }

        this.instanceData = typeData;

        for (let t = 0; t < 5; t++) {
            const data = typeData[t];
            if (data.length === 0) continue;

            const material = new THREE.MeshStandardMaterial({
                roughness: 0.5,
                metalness: 0.5,
                vertexColors: false
            });
            const mesh = new THREE.InstancedMesh(geometries[t], material, data.length);
            mesh.userData.instanceData = data;
            mesh.count = data.length;

            const dummy = new THREE.Object3D();
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
            this.instancedMeshes.forEach(({ mesh, geometry, material }) => {
                geometry.dispose();
                material.dispose();
            });
            this.instancedMeshes = [];
            this.instanceData = [];
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
        const mesh = hit.object;
        if (!mesh.isInstancedMesh || hit.instanceId === undefined) return;
        const data = mesh.userData.instanceData;
        if (!data || !data[hit.instanceId]) return;

        const d = data[hit.instanceId];
        const direction = new THREE.Vector3()
            .subVectors(hit.point, raycaster.ray.origin)
            .normalize();
        d.velocity.addScaledVector(direction, 0.2);
        d.color.setHex(0xffffff);
        d.emissive = 1;
        d.rotationSpeed.x += 0.1;
        d.rotationSpeed.y += 0.1;
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
    }
}
