import { PanoramaWorld } from './worlds/PanoramaWorld.js';
import { VideoWorld } from './worlds/VideoWorld.js';
import { CubeMapWorld } from './worlds/CubeMapWorld.js';
import { ARCubeWorld } from './worlds/ARCubeWorld.js';
import { FloatingShapesWorld } from './worlds/FloatingShapesWorld.js';
import { ARPhysicsWorld } from './worlds/ARPhysicsWorld.js';
import { InDepthWorld } from './worlds/InDepthWorld.js';

export class WorldManager {
    constructor(scene, renderer) {
        this.scene = scene;
        this.renderer = renderer;
        this.currentWorld = null;
        this.currentWorldIndex = 0;
        
        // Define the cycle of worlds
        this.worldClasses = [
            InDepthWorld,
            PanoramaWorld,
            VideoWorld,
            CubeMapWorld,
            FloatingShapesWorld,
            ARCubeWorld
            // ARPhysicsWorld - Disabled for now
        ];
        this.worldNames = [
            "InDepth Panorama",
            "Panorama",
            "Video",
            "CubeMap",
            "Floating Shapes",
            "AR Cube (Hit Test)"
            // "AR Physics (Walls)"
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
            this.currentWorld.enter(this.scene, this.renderer);
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
            // AR World handles its own UI text during scanning, so we might check that
            if (this.worldNames[this.currentWorldIndex] !== "AR Cube") {
                btn.textContent = `Switch World (Current: ${this.worldNames[this.currentWorldIndex]})`;
            }
        }
    }
}