import * as THREE from 'three';

export class VideoWorld {
    constructor() {
        this.object = null;
        this.video = null;
    }

    enter(scene) {
        const worldGroup = new THREE.Group();
        const video = document.createElement('video');
        video.id = 'world-video';
        video.src = './assets/video.mp4';
        video.crossOrigin = 'anonymous';
        video.loop = true;
        video.muted = true; 
        video.playsInline = true;
        
        video.addEventListener('error', (e) => {
            const err = video.error;
            console.error("Error loading video:", err);
        });

        video.play().catch(e => console.warn("Video autoplay blocked", e));

        const texture = new THREE.VideoTexture(video);
        texture.colorSpace = THREE.SRGBColorSpace;

        const geometry = new THREE.SphereGeometry(500, 60, 40);
        geometry.scale(-1, 1, 1);

        const material = new THREE.MeshBasicMaterial({ map: texture });
        const mesh = new THREE.Mesh(geometry, material);
        
        worldGroup.add(mesh);
        scene.add(worldGroup);
        
        this.object = worldGroup;
        this.video = video;
        
        scene.background = new THREE.Color(0x101010);
    }

    exit(scene) {
        if (this.object) {
            scene.remove(this.object);
            this.object.traverse((child) => {
                if (child.isMesh) {
                    child.geometry.dispose();
                    if (child.material.map) child.material.map.dispose();
                    child.material.dispose();
                }
            });
            this.object = null;
        }
        if (this.video) {
            this.video.pause();
            this.video.remove();
            this.video = null;
        }
    }

    update(time, frame) {
        // Video updates automatically via texture
    }
}