import { PanoramaWorld } from './worlds/PanoramaWorld.js';
import { VideoWorld } from './worlds/VideoWorld.js';
import { FloatingShapesWorld } from './worlds/FloatingShapesWorld.js';
import { ARPhysicsWorld } from './worlds/ARPhysicsWorld.js';
import { InDepthWorld } from './worlds/InDepthWorld.js';
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
            InDepthWorld,
            PanoramaWorld,
            FloatingShapesWorld,
            HandTrackingWorld,
            IKArmWorld
        ];
        this.worldNames = [
            "Video",
            "InDepth Panorama",
            "Panorama",
            "Floating Shapes",
            "Hand Tracking",
            "IK Arm Reach"
        ];

        // Session type per world: 'ar' = AR (real-world passthrough), 'vr' = VR (opaque, grey/solid)
        this.worldSessionTypes = [
            'vr',  // 0 Video
            'vr',  // 1 InDepth Panorama
            'vr',  // 2 Panorama
            'ar',  // 3 Floating Shapes
            'vr',  // 4 Hand Tracking
            'vr'   // 5 IK Arm Reach
        ];
        // Names that always use AR (used if index/config mismatch)
        this.arWorldNames = ['Floating Shapes'];

        // Info panel content per world: { title, content } (use \n for line breaks)
        this.worldInfoTexts = [
            {
                title: 'Video in VR',
                content: '360° video wrapped on a sphere around you.\n\nWhat this world is\n- Watch a single 360° clip in an immersive viewer.\n- Switch between local file and streamed presets.\n\nSources\n- Static: load a local 360° video.\n- Stream: pick a preset clip from the dropdown.\n\nControls (Desktop)\n- A – Rotate view left.\n- D – Rotate view right.\n\nControls (VR)\n- Look around to explore the video.'
            },
            {
                title: 'InDepth Panorama',
                content: 'Panorama with a depth map for a 3D effect. A depth image (grayscale: bright = near, dark = far) displaces the sphere so near and far elements respond correctly when you look around.\n\nControls (Desktop)\n- Scene rotates slowly.\n\nControls (VR)\n- Look around to explore.'
            },
            {
                title: 'Panorama',
                content: 'Single equirectangular 360° image on a sphere.\n\nControls (Desktop)\n- A – Rotate view left.\n- D – Rotate view right.\n\nControls (VR)\n- Look around to explore.'
            },
            {
                title: 'Floating Shapes',
                content: 'Instancing renders many shapes in one draw call, boosting performance instead of drawing each object individually per frame. Click to push; +/- adjusts count.\n\nControls (Desktop)\n- Click to push shapes. +/- change count.\n\nControls (VR)\n- Use controller to interact. +/- change count.'
            },
            {
                title: 'Hand Tracking',
                content: 'WebXR hand tracking. Left pinch = spawn sphere; right pinch = grab.\n\nControls (Desktop)\n- Not applicable (hand tracking in VR).\n\nControls (VR)\n- Left pinch at index tip spawns a sphere. Right pinch grabs a sphere.'
            },
            {
                title: 'IK Arm Reach',
                content: '4-link arm, CCD IK. Orange sphere = target; arm follows.\n\nControls (Desktop)\n- Gizmo: drag target. A/D: orbit. Spacebar: gripper. Reset: recenter.\n\nControls (VR)\n- Hand: target. Pinch: gripper. Trigger: reset.'
            }
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