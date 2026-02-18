import * as THREE from 'three';
import { ARButton } from 'three/addons/webxr/ARButton.js';
import { WorldManager } from './WorldManager.js';

let camera, scene, renderer;
let worldManager;
let controller;
let pointerRaycaster;
let pointerMouse;

init();

function init() {
    // 1. Setup Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x101010);

    // 2. Setup Camera
    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 1.6, 0);

    // 3. Setup Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;
    
    document.getElementById('canvas-container').appendChild(renderer.domElement);

    // Mouse click for desktop (e.g. Floating Shapes)
    pointerRaycaster = new THREE.Raycaster();
    pointerMouse = new THREE.Vector2();
    renderer.domElement.addEventListener('pointerdown', onPointerDown);

    // 4. Add ARButton
    document.body.appendChild(ARButton.createButton(renderer, { 
        requiredFeatures: ['hit-test', 'local-floor'],
        optionalFeatures: ['dom-overlay', 'plane-detection', 'hand-tracking'], 
        domOverlay: { root: document.body } 
    }));

    // 5. Setup Controller
    controller = renderer.xr.getController(0);
    controller.addEventListener('select', onSelect);
    scene.add(controller);

    // 6. Basic Lights
    const light = new THREE.HemisphereLight(0xffffff, 0x444444, 3);
    light.position.set(0, 20, 0);
    scene.add(light);

    // 7. World Manager
    worldManager = new WorldManager(scene, renderer, camera);

    // 8. Event Listeners
    window.addEventListener('resize', onWindowResize);
    
    const switchBtn = document.getElementById('switchWorld');
    if (switchBtn) {
        switchBtn.addEventListener('click', () => worldManager.cycleWorld());
    }

    // World selection carousel (landing): build from world names, snap to center, enter on click
    const viewport = document.getElementById('world-carousel-viewport');
    const track = document.getElementById('world-carousel-track');
    const WORLD_ITEM_HEIGHT = 76;
    if (viewport && track) {
        const names = worldManager.worldNames;
        const vh = viewport.clientHeight || 280;
        const padding = Math.max(0, (vh / 2) - (WORLD_ITEM_HEIGHT / 2));
        track.style.paddingTop = padding + 'px';
        track.style.paddingBottom = padding + 'px';
        names.forEach((name, i) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'world-option' + (i === 0 ? ' center' : '');
            btn.dataset.worldIndex = String(i);
            btn.textContent = name;
            track.appendChild(btn);
        });
        let scrollEndTimer = null;
        function updateCenterFromScroll() {
            const scrollTop = track.scrollTop;
            const centerY = vh / 2;
            let bestIndex = 0;
            let bestDist = Infinity;
            const options = track.querySelectorAll('.world-option');
            options.forEach((el, i) => {
                const rect = el.getBoundingClientRect();
                const viewportRect = viewport.getBoundingClientRect();
                const elCenter = rect.top - viewportRect.top + rect.height / 2;
                const dist = Math.abs(elCenter - centerY);
                if (dist < bestDist) {
                    bestDist = dist;
                    bestIndex = i;
                }
            });
            options.forEach((el, i) => el.classList.toggle('center', i === bestIndex));
        }
        function snapToClosest() {
            const options = track.querySelectorAll('.world-option');
            const centerY = vh / 2;
            let bestIndex = 0;
            let bestDist = Infinity;
            let bestElement = null;
            options.forEach((el, i) => {
                const rect = el.getBoundingClientRect();
                const viewportRect = viewport.getBoundingClientRect();
                const elCenter = rect.top - viewportRect.top + rect.height / 2;
                const dist = Math.abs(elCenter - centerY);
                if (dist < bestDist) {
                    bestDist = dist;
                    bestIndex = i;
                    bestElement = el;
                }
            });
            if (bestElement) {
                const rect = bestElement.getBoundingClientRect();
                const viewportRect = viewport.getBoundingClientRect();
                const elementTopRelativeToTrack = rect.top - viewportRect.top + track.scrollTop;
                const elementCenter = elementTopRelativeToTrack + rect.height / 2;
                const targetScroll = elementCenter - (vh / 2);
                track.scrollTo({ top: Math.max(0, Math.min(targetScroll, track.scrollHeight - vh)), behavior: 'smooth' });
            }
            options.forEach((el, i) => el.classList.toggle('center', i === bestIndex));
        }
        track.addEventListener('scroll', () => {
            updateCenterFromScroll();
            clearTimeout(scrollEndTimer);
            scrollEndTimer = setTimeout(snapToClosest, 120);
        });
        track.addEventListener('click', (e) => {
            const btn = e.target.closest('.world-option');
            if (!btn || !btn.classList.contains('center')) return;
            const index = parseInt(btn.dataset.worldIndex, 10);
            worldManager.switchWorld(index);
            document.getElementById('landing-page').classList.add('hidden');
            document.getElementById('canvas-container').classList.add('visible');
            document.getElementById('world-ui').classList.add('visible');
            const fpsEl = document.getElementById('fps-display');
            if (fpsEl) fpsEl.classList.add('visible');
            worldManager.updateUI();
        });
    }

    // Shape count +/- (only in Floating Shapes; step 1000)
    const shapeMinus = document.getElementById('shape-count-minus');
    const shapePlus = document.getElementById('shape-count-plus');
    const shapeCountValue = document.getElementById('shape-count-value');
    const MIN_SHAPES = 10;
    const MAX_SHAPES = 10000;
    const SHAPE_STEP = 1000;
    if (shapeMinus && shapePlus && shapeCountValue) {
        shapeMinus.addEventListener('click', () => {
            let n = parseInt(shapeCountValue.textContent, 10) || 1000;
            n = Math.max(MIN_SHAPES, n - SHAPE_STEP);
            shapeCountValue.textContent = n;
            if (worldManager.isCurrentWorldFloatingShapes()) worldManager.refreshCurrentWorld();
        });
        shapePlus.addEventListener('click', () => {
            let n = parseInt(shapeCountValue.textContent, 10) || 1000;
            n = Math.min(MAX_SHAPES, n + SHAPE_STEP);
            shapeCountValue.textContent = n;
            if (worldManager.isCurrentWorldFloatingShapes()) worldManager.refreshCurrentWorld();
        });
    }

    const instancingToggle = document.getElementById('instancing-toggle');
    if (instancingToggle) {
        instancingToggle.addEventListener('change', () => {
            if (worldManager.isCurrentWorldFloatingShapes()) worldManager.refreshCurrentWorld();
        });
    }

    const videoSourceSelect = document.getElementById('videoSourceSelect');
    if (videoSourceSelect) {
        videoSourceSelect.addEventListener('change', () => {
            if (worldManager.isCurrentWorldVideo()) worldManager.refreshCurrentWorld();
        });
    }

    // 9. Start (no world loaded until user picks one from landing carousel)
    renderer.setAnimationLoop(render);
}

function onSelect() {
    worldManager.handleSelect(controller);
}

function onPointerDown(event) {
    const canvas = renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    pointerMouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointerMouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    pointerRaycaster.setFromCamera(pointerMouse, camera);
    worldManager.handlePointerClick(pointerRaycaster);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

let lastFpsTime = 0;
let frameCount = 0;
let fpsValue = 0;

function render(timestamp, frame) {
    const now = timestamp || performance.now();
    frameCount++;
    const elapsed = now - lastFpsTime;
    if (elapsed >= 200) {
        fpsValue = Math.round((frameCount * 1000) / elapsed);
        frameCount = 0;
        lastFpsTime = now;
        const fpsEl = document.getElementById('fps-display');
        if (fpsEl) fpsEl.textContent = `FPS: ${fpsValue}`;
    }
    worldManager.update(timestamp, frame, camera);
    renderer.render(scene, camera);
}