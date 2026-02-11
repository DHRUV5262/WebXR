import { PanoramaWorld } from './worlds/PanoramaWorld.js';
import { VideoWorld } from './worlds/VideoWorld.js';
import { CubeMapWorld } from './worlds/CubeMapWorld.js';
import { ARCubeWorld } from './worlds/ARCubeWorld.js';
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
            ARCubeWorld
            // ARPhysicsWorld - Disabled for now
        ];
        this.worldNames = [
            "InDepth Panorama",
            "Panorama",
            "Video",
            "CubeMap",
            "AR Cube (Hit Test)"
            // "AR Physics (Walls)"
        ];
    }

    loadInitialWorld() {
        this.switchWorld(0);
    }

    switchWorld(index) {
        // Cleanup old world
        if (this.currentWorld) {
            this.currentWorld.exit(this.scene);
        }

        // Setup new world
        this.currentWorldIndex = index;
        const WorldClass = this.worldClasses[this.currentWorldIndex];
        this.currentWorld = new WorldClass();
        
        console.log(`Switching to world: ${this.worldNames[index]}`);
        this.currentWorld.enter(this.scene, this.renderer);
        
        this.updateUI();
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