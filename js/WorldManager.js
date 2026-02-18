import { PanoramaWorld } from './worlds/PanoramaWorld.js';
import { VideoWorld } from './worlds/VideoWorld.js';
import { CubeMapWorld } from './worlds/CubeMapWorld.js';
import { ARCubeWorld } from './worlds/ARCubeWorld.js';
import { FloatingShapesWorld } from './worlds/FloatingShapesWorld.js';
import { ARPhysicsWorld } from './worlds/ARPhysicsWorld.js';
import { InDepthWorld } from './worlds/InDepthWorld.js';
import { HorseWorld } from './worlds/HorseWorld.js';
import { HandTrackingWorld } from './worlds/HandTrackingWorld.js';

export class WorldManager {
    constructor(scene, renderer, camera) {
        this.scene = scene;
        this.renderer = renderer;
        this.camera = camera;
        this.currentWorld = null;
        this.currentWorldIndex = 0;
        
        // Video first for demos (e.g. teleoperation); rest in order
        this.worldClasses = [
            VideoWorld,
            HorseWorld,
            InDepthWorld,
            PanoramaWorld,
            CubeMapWorld,
            FloatingShapesWorld,
            HandTrackingWorld,
            ARCubeWorld
        ];
        this.worldNames = [
            "Video",
            "Horse",
            "InDepth Panorama",
            "Panorama",
            "CubeMap",
            "Floating Shapes",
            "Hand Tracking",
            "AR Cube (Hit Test)"
        ];
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

    refreshCurrentWorld() {
        if (!this.currentWorld) return;
        try {
            this.currentWorld.exit(this.scene);
            this.currentWorld.enter(this.scene, this.renderer, this.camera);
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
            if (this.worldNames[this.currentWorldIndex] !== "AR Cube (Hit Test)") {
                btn.textContent = `Switch World (Current: ${this.worldNames[this.currentWorldIndex]})`;
            }
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
    }
}