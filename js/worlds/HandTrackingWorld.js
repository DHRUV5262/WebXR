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
        this.scaling = { active: false, initialDistance: 0, object: null, initialScale: 1 };
        this.handLeft = null;
        this.handRight = null;
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

        for (let i = 0; i < 2; i++) {
            const hand = renderer.xr.getHand(i);
            hand.addEventListener('connected', (e) => {
                hand.userData.handedness = e.data?.handedness || '';
                if (e.data?.handedness === 'left') this.handLeft = hand;
                else if (e.data?.handedness === 'right') this.handRight = hand;
            });
            hand.addEventListener('pinchstart', (e) => this._onPinchStart(e));
            hand.addEventListener('pinchend', () => this._onPinchEnd(hand));
            const handModel = handModelFactory.createHandModel(hand, 'boxes');
            hand.add(handModel);
            scene.add(hand);
            if (i === 0) { this.hand1 = hand; this.handModel1 = handModel; }
            else { this.hand2 = hand; this.handModel2 = handModel; }
        }
    }

    _onPinchStart(e) {
        const controller = e.target;
        const handedness = controller.userData.handedness;
        const indexTip = controller.joints?.['index-finger-tip'];
        if (!indexTip) return;

        if (handedness === 'left') {
            // If right hand is holding a sphere and left pinch hits it, start scaling
            if (this.grabbing && this.handRight) {
                const rightSelected = this.handRight.userData?.selected;
                const hitSphere = this._collideObject(indexTip);
                if (rightSelected && hitSphere === rightSelected) {
                    const tipRight = this.handRight.joints?.['index-finger-tip'];
                    if (tipRight) {
                        this.scaling.active = true;
                        this.scaling.object = hitSphere;
                        this.scaling.initialScale = hitSphere.scale.x;
                        indexTip.getWorldPosition(this._tmpVec1);
                        tipRight.getWorldPosition(this._tmpVec2);
                        this.scaling.initialDistance = this._tmpVec1.distanceTo(this._tmpVec2);
                        if (this.scaling.initialDistance < 0.001) this.scaling.initialDistance = 0.1;
                    }
                    return;
                }
            }
            // Spawn sphere at left index tip
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
        } else if (handedness === 'right') {
            const sphere = this._collideObject(indexTip);
            if (sphere) {
                this.grabbing = true;
                indexTip.attach(sphere);
                controller.userData.selected = sphere;
            }
        }
    }

    _onPinchEnd(hand) {
        const handedness = hand.userData.handedness;
        if (handedness === 'right' && hand.userData.selected) {
            const object = hand.userData.selected;
            this.spawnGroup.attach(object);
            hand.userData.selected = undefined;
            this.grabbing = false;
        }
        if (handedness === 'left') this.scaling.active = false;
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
        this.scaling.active = false;
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
        if (!this.scaling.active || !this.scaling.object || !this.handLeft || !this.handRight) return;
        const tipL = this.handLeft.joints?.['index-finger-tip'];
        const tipR = this.handRight.joints?.['index-finger-tip'];
        if (!tipL || !tipR || this.scaling.initialDistance <= 0) return;
        tipL.getWorldPosition(this._tmpVec1);
        tipR.getWorldPosition(this._tmpVec2);
        const distance = this._tmpVec1.distanceTo(this._tmpVec2);
        const newScale = this.scaling.initialScale * (distance / this.scaling.initialDistance);
        const clamped = Math.max(0.1, Math.min(5, newScale));
        this.scaling.object.scale.setScalar(clamped);
    }
}
