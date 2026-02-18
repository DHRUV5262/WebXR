import * as THREE from 'three';
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js';

// Fixed height above ground (y=0). Room is always at this world position — no AR floor.
const ROOM_FLOOR_HEIGHT = -9.5;

/**
 * Hand Tracking World: WebXR hand tracking with box primitives on each joint.
 * AR disabled: solid background + room mesh at a fixed height. Requires optionalFeatures: ['hand-tracking'].
 */
export class HandTrackingWorld {
    constructor() {
        this.hand1 = null;
        this.hand2 = null;
        this.handModel1 = null;
        this.handModel2 = null;
        this.roomGroup = null;
    }

    enter(scene, renderer) {
        // AR fully disabled: solid grey wrap-around (panorama style), no passthrough
        scene.background = new THREE.Color(0x404040);

        this.roomGroup = new THREE.Group();
        this.roomGroup.position.set(0, ROOM_FLOOR_HEIGHT, 0);

        // Panorama-style grey sphere: inverted so you're inside, grey tint wraps 360° around
        const sphereGeom = new THREE.SphereGeometry(500, 60, 40);
        sphereGeom.scale(-1, 1, 1);
        const sphereMat = new THREE.MeshBasicMaterial({
            color: 0x404040,
            side: THREE.BackSide
        });
        const greySphere = new THREE.Mesh(sphereGeom, sphereMat);
        this.roomGroup.add(greySphere);

        // Floor (light grey, matches reference)
        const floorSize = 6;
        const floorGeom = new THREE.PlaneGeometry(floorSize, floorSize);
        const floorMat = new THREE.MeshStandardMaterial({
            color: 0xa0a0a0,
            roughness: 0.9,
            metalness: 0.05
        });
        const floor = new THREE.Mesh(floorGeom, floorMat);
        floor.rotation.x = -Math.PI / 2;
        floor.receiveShadow = true;
        this.roomGroup.add(floor);

        scene.add(this.roomGroup);

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
        this.handModel1 = handModelFactory.createHandModel(this.hand1, 'boxes');
        this.hand1.add(this.handModel1);
        scene.add(this.hand1);

        this.hand2 = renderer.xr.getHand(1);
        this.handModel2 = handModelFactory.createHandModel(this.hand2, 'boxes');
        this.hand2.add(this.handModel2);
        scene.add(this.hand2);
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
