import * as THREE from 'three';

// R2 bucket base URL (your public development URL)
const R2_BASE_URL = 'https://pub-c6b463f6a5db4393ab03e82c1f1f9c2d.r2.dev';

// Video source URLs
const STATIC_VIDEO_URL = './assets/video.mp4';
const STREAM_EARTH_URL = `https://pub-c6b463f6a5db4393ab03e82c1f1f9c2d.r2.dev/earth.mp4`;
const STREAM_WATERFALL_URL = `https://pub-c6b463f6a5db4393ab03e82c1f1f9c2d.r2.dev/Shower.mp4`;

function getVideoSourceUrl(mode) {
    const m = mode != null ? mode : (document.getElementById('videoSourceSelect')?.value || 'static');
    switch (m) {
        case 'stream-earth':
            return STREAM_EARTH_URL;
        case 'stream-waterfall':
            return STREAM_WATERFALL_URL;
        case 'static':
        default:
            return STATIC_VIDEO_URL;
    }
}

export class VideoWorld {
    constructor() {
        this.object = null;
        this.video = null;
    }

    enter(scene, _renderer, _camera, options) {
        const worldGroup = new THREE.Group();
        const video = document.createElement('video');
        video.id = 'world-video';
        const sourceMode = (options && options.videoSource) || null;
        const url = getVideoSourceUrl(sourceMode);
        video.src = url;
        video.crossOrigin = 'anonymous';
        video.loop = true;
        video.muted = true;
        video.playsInline = true;
        video.preload = 'auto';
        video.load();

        video.addEventListener('error', (e) => {
            const err = video.error;
            console.error("VideoWorld: Error loading video", err?.message || err);
        });
        video.addEventListener('loadeddata', () => console.log("VideoWorld: Video data loaded (streaming ok)"));

        video.play().catch(e => console.warn("VideoWorld: Autoplay blocked", e));

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