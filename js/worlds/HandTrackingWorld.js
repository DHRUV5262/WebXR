import * as THREE from 'three';
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js';

/**
 * Hand Tracking World: WebXR hand tracking with box primitives on each joint.
 * Requires optionalFeatures: ['hand-tracking'] when starting the XR session.
 * Hands appear when the device supports hand tracking (e.g. Quest).
 */
export class HandTrackingWorld {
    constructor() {
        this.hand1 = null;
        this.hand2 = null;
        this.handModel1 = null;
        this.handModel2 = null;
    }

    enter(scene, renderer) {
        // AR: clear background so we see the real world
        scene.background = null;

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
