import { PanoramaWorld } from './worlds/PanoramaWorld.js';
import { VideoWorld } from './worlds/VideoWorld.js';
import { FloatingShapesWorld } from './worlds/FloatingShapesWorld.js';
import { ARPhysicsWorld } from './worlds/ARPhysicsWorld.js';
import { InDepthWorld } from './worlds/InDepthWorld.js';
import { HorseWorld } from './worlds/HorseWorld.js';
import { HandTrackingWorld } from './worlds/HandTrackingWorld.js';
import { IKArmWorld } from './worlds/IKArmWorld.js';

export class WorldManager {
    constructor(scene, renderer, camera) {
        this.scene = scene;
        this.renderer = renderer;
        this.camera = camera;
        this.currentWorld = null;
        this.currentWorldIndex = 0;
        
        // Define the cycle of worlds (Video first for sharing/demo)
        this.worldClasses = [
            VideoWorld,
            HorseWorld,
            InDepthWorld,
            PanoramaWorld,
            FloatingShapesWorld,
            HandTrackingWorld,
            IKArmWorld
        ];
        this.worldNames = [
            "Video",
            "Horse",
            "InDepth Panorama",
            "Panorama",
            "Floating Shapes",
            "Hand Tracking",
            "IK Arm Reach"
        ];

        // Session type per world: 'ar' = AR (real-world passthrough), 'vr' = VR (opaque, grey/solid)
        this.worldSessionTypes = [
            'vr',  // 0 Video
            'vr',  // 1 Horse
            'vr',  // 2 InDepth Panorama
            'vr',  // 3 Panorama
            'ar',  // 4 Floating Shapes
            'vr',  // 5 Hand Tracking
            'vr'   // 6 IK Arm Reach
        ];
        // Names that always use AR (used if index/config mismatch)
        this.arWorldNames = ['Floating Shapes'];

        // Info panel content per world: { title, content }
        this.worldInfoTexts = [
            { title: 'Video in VR', content: '360° video projected on a sphere. Use VR to look around.' },
            { title: 'Horse', content: 'Animated horse. WASD move camera, Arrow keys rotate.' },
            { title: 'InDepth Panorama', content: 'Custom shader panorama with depth.' },
            { title: 'Panorama', content: 'Equirectangular panorama mapping.' },
            { title: 'Floating Shapes', content: 'Instanced shapes. Click to push. Adjust count with +/-.' },
            { title: 'Hand Tracking', content: 'WebXR hand tracking. Left pinch = spawn, right pinch = grab.' },
            { title: 'IK Arm Reach', content: '4-link arm with CCD IK. Drag the orange target with the transform gizmo. A / D keys rotate the camera around the arm. Reset Target to recenter.' }
        ];
    }

    getSessionTypeForWorld(index) {
        const name = this.worldNames[index];
        if (this.arWorldNames.includes(name)) return 'ar';
        return this.worldSessionTypes[index] === 'ar' ? 'ar' : 'vr';
    }

    loadInitialWorld() {
        this.switchWorld(0);
    }

    switchWorld(index) {
        console.log(`[WorldManager] switchWorld called with index ${index}`);
        
        // Cleanup old world
        if (this.currentWorld) {
            console.log(`[WorldManager] Exiting current world: ${this.worldNames[this.currentWorldIndex]}`);
            try {
                this.currentWorld.exit(this.scene);
                console.log(`[WorldManager] Exit successful`);
            } catch (e) {
                console.error(`[WorldManager] Error exiting world:`, e);
            }
        }

        // Setup new world
        this.currentWorldIndex = index;
        const WorldClass = this.worldClasses[this.currentWorldIndex];
        
        console.log(`[WorldManager] Creating new world instance`);
        this.currentWorld = new WorldClass();
        
        console.log(`[WorldManager] Entering new world: ${this.worldNames[index]}`);
        try {
            this.currentWorld.enter(this.scene, this.renderer, this.camera);
            console.log(`[WorldManager] Enter successful`);
        } catch (e) {
            console.error(`[WorldManager] Error entering world:`, e);
        }
        
        this.updateUI();

        // Reset camera rotation when leaving Video/Panorama (so other worlds start upright)
        const isNewWorldVideoOrPanorama = this.worldNames[index] === 'Video' || this.worldNames[index] === 'Panorama';
        if (!isNewWorldVideoOrPanorama) {
            this.camera.rotation.set(0, 0, 0);
        }

        console.log(`[WorldManager] switchWorld complete`);
    }

    cycleWorld() {
        let nextIndex = (this.currentWorldIndex + 1) % this.worldClasses.length;
        this.switchWorld(nextIndex);
    }

    isCurrentWorldFloatingShapes() {
        return this.currentWorld && this.currentWorld.constructor.name === 'FloatingShapesWorld';
    }

    isCurrentWorldVideo() {
        return this.currentWorld && this.currentWorld.constructor.name === 'VideoWorld';
    }

    isCurrentWorldPanorama() {
        return this.currentWorld && this.currentWorld.constructor.name === 'PanoramaWorld';
    }

    isWASDRotationWorld() {
        return this.isCurrentWorldVideo() || this.isCurrentWorldPanorama();
    }

    refreshCurrentWorld(options) {
        if (!this.currentWorld) return;
        try {
            this.currentWorld.exit(this.scene);
            this.currentWorld.enter(this.scene, this.renderer, this.camera, options);
        } catch (e) {
            console.error('[WorldManager] refreshCurrentWorld error:', e);
        }
    }

    update(time, frame, camera) {
        if (this.currentWorld && this.currentWorld.update) {
            this.currentWorld.update(time, frame, this.renderer, this.scene, camera);
        }
    }

    handleSelect(controller) {
        if (this.currentWorld && this.currentWorld.onSelect) {
            this.currentWorld.onSelect(controller);
        }
    }

    handlePointerClick(raycaster) {
        if (this.currentWorld && this.currentWorld.onPointerClick) {
            this.currentWorld.onPointerClick(raycaster);
        }
    }

    updateUI() {
        const btn = document.getElementById('switchWorld');
        if (btn) {
            btn.textContent = `Switch World (Current: ${this.worldNames[this.currentWorldIndex]})`;
        }
        const shapeBar = document.getElementById('shape-count-bar');
        if (shapeBar) {
            if (this.worldNames[this.currentWorldIndex] === "Floating Shapes") {
                shapeBar.classList.add('visible');
            } else {
                shapeBar.classList.remove('visible');
            }
        }
        const videoSourceBar = document.getElementById('video-source-bar');
        if (videoSourceBar) {
            if (this.worldNames[this.currentWorldIndex] === "Video") {
                videoSourceBar.classList.add('visible');
            } else {
                videoSourceBar.classList.remove('visible');
            }
        }
        const infoPanel = document.getElementById('info-panel');
        const infoTitle = document.getElementById('info-panel-title');
        const infoContent = document.getElementById('info-panel-content');
        if (infoPanel && infoTitle && infoContent) {
            const info = this.worldInfoTexts[this.currentWorldIndex];
            if (info) {
                infoTitle.textContent = info.title;
                infoContent.textContent = info.content;
            }
        }
    }
}