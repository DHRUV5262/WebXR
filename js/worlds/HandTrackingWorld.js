import * as THREE from 'three';
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js';

// Fixed height above ground (y=0). Room is always at this world position — no AR floor.
const ROOM_FLOOR_HEIGHT = -5.5;
const SPHERE_RADIUS = 0.05;

/**
 * Hand Tracking World: WebXR hand tracking with pinch-to-spawn (left) and pinch-to-grab (right).
 * AR disabled: solid background + room mesh. Requires optionalFeatures: ['hand-tracking'].
 */
export class HandTrackingWorld {
    constructor() {
        this.hand1 = null;
        this.hand2 = null;
        this.handModel1 = null;
        this.handModel2 = null;
        this.roomGroup = null;
        this.spawnGroup = null;
        this.spheres = [];
        this.grabbing = false;
        this._tmpVec1 = new THREE.Vector3();
        this._tmpVec2 = new THREE.Vector3();
    }

    enter(scene, renderer) {
        // AR fully disabled: solid background, no passthrough
        scene.background = new THREE.Color(0xf0f0f0);

        this.roomGroup = new THREE.Group();
        // Fixed position: room spawns at this height above ground, never follows AR floor
        this.roomGroup.position.set(0, ROOM_FLOOR_HEIGHT, 0);

        // Floor only (grey plane, no walls)
        const floorSize = 6;
        const floorGeom = new THREE.PlaneGeometry(floorSize, floorSize);
        const floorMat = new THREE.MeshStandardMaterial({
            color: 0x9a9a9a,
            roughness: 0.9,
            metalness: 0.05
        });
        const floor = new THREE.Mesh(floorGeom, floorMat);
        floor.rotation.x = -Math.PI / 2;
        floor.receiveShadow = true;
        this.roomGroup.add(floor);

        scene.add(this.roomGroup);

        this.spawnGroup = new THREE.Group();
        scene.add(this.spawnGroup);

        // Room lights
        const hemi = new THREE.HemisphereLight(0xffffff, 0xbbbbbb, 1.2);
        hemi.position.set(0, 4, 0);
        this.roomGroup.add(hemi);
        const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
        dirLight.position.set(0, 4, 2);
        dirLight.castShadow = true;
        this.roomGroup.add(dirLight);

        const handModelFactory = new XRHandModelFactory();

        this.hand1 = renderer.xr.getHand(0);
        this.hand1.addEventListener('pinchstart', (e) => this._onPinchStartLeft(e));
        this.handModel1 = handModelFactory.createHandModel(this.hand1, 'boxes');
        this.hand1.add(this.handModel1);
        scene.add(this.hand1);

        this.hand2 = renderer.xr.getHand(1);
        this.hand2.addEventListener('pinchstart', (e) => this._onPinchStartRight(e));
        this.hand2.addEventListener('pinchend', () => this._onPinchEndRight());
        this.handModel2 = handModelFactory.createHandModel(this.hand2, 'boxes');
        this.hand2.add(this.handModel2);
        scene.add(this.hand2);
    }

    _onPinchStartLeft() {
        const controller = this.hand1;
        const indexTip = controller.joints?.['index-finger-tip'];
        if (!indexTip) return;

        const geometry = new THREE.SphereGeometry(SPHERE_RADIUS, 16, 16);
        const material = new THREE.MeshStandardMaterial({
            color: Math.random() * 0xffffff,
            roughness: 1,
            metalness: 0
        });
        const sphere = new THREE.Mesh(geometry, material);
        sphere.geometry.computeBoundingSphere();

        indexTip.getWorldPosition(this._tmpVec1);
        sphere.position.copy(this._tmpVec1);

        this.spheres.push(sphere);
        this.spawnGroup.add(sphere);
    }

    _onPinchStartRight() {
        const controller = this.hand2;
        const indexTip = controller.joints?.['index-finger-tip'];
        if (!indexTip) return;

        const sphere = this._collideObject(indexTip);
        if (sphere) {
            this.grabbing = true;
            indexTip.attach(sphere);
            controller.userData.selected = sphere;
        }
    }

    _onPinchEndRight() {
        const controller = this.hand2;
        if (controller.userData.selected) {
            const object = controller.userData.selected;
            this.spawnGroup.attach(object);
            controller.userData.selected = undefined;
            this.grabbing = false;
        }
    }

    _collideObject(indexTip) {
        const tipWorld = indexTip.getWorldPosition(this._tmpVec1);
        for (let i = 0; i < this.spheres.length; i++) {
            const sphere = this.spheres[i];
            const sphereWorld = sphere.getWorldPosition(this._tmpVec2);
            const dist = tipWorld.distanceTo(sphereWorld);
            const threshold = (sphere.geometry.boundingSphere?.radius ?? SPHERE_RADIUS) * sphere.scale.x * 1.5;
            if (dist < threshold) return sphere;
        }
        return null;
    }

    exit(scene) {
        if (this.hand1 && this.hand1.parent) {
            scene.remove(this.hand1);
            this.hand1.remove(this.handModel1);
            this._disposeHandModel(this.handModel1);
            this.handModel1 = null;
            this.hand1 = null;
        }
        if (this.hand2 && this.hand2.parent) {
            scene.remove(this.hand2);
            this.hand2.remove(this.handModel2);
            this._disposeHandModel(this.handModel2);
            this.handModel2 = null;
            this.hand2 = null;
        }
        if (this.roomGroup) {
            scene.remove(this.roomGroup);
            this.roomGroup.traverse((child) => {
                if (child.isMesh) {
                    if (child.geometry) child.geometry.dispose();
                    if (child.material) {
                        if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
                        else child.material.dispose();
                    }
                }
            });
            this.roomGroup = null;
        }
        if (this.spawnGroup) {
            scene.remove(this.spawnGroup);
        }
        this.spheres.forEach((sphere) => {
            if (sphere.parent) sphere.parent.remove(sphere);
            if (sphere.geometry) sphere.geometry.dispose();
            if (sphere.material) sphere.material.dispose();
        });
        this.spheres = [];
        this.spawnGroup = null;
        this.grabbing = false;
        scene.background = new THREE.Color(0x101010);
    }

    _disposeHandModel(handModel) {
        if (!handModel) return;
        handModel.traverse((child) => {
            if (child.isMesh) {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
                    else child.material.dispose();
                }
            }
        });
    }

    update() {
        // Joint poses are updated by Three.js WebXRController each frame
    }
}
