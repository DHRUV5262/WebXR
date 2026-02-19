import * as THREE from 'three';
import { ARButton } from 'three/addons/webxr/ARButton.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';
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

    // 4. XR button (AR or VR) – set when user picks a world on landing page

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

    // Landing page: each world button enters that world
    document.querySelectorAll('.world-entry-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            const index = parseInt(btn.getAttribute('data-world-index'), 10);
            if (isNaN(index)) return;
            document.getElementById('landing-page').classList.add('hidden');
            document.getElementById('canvas-container').classList.add('visible');
            document.getElementById('world-ui').classList.add('visible');
            const fpsEl = document.getElementById('fps-display');
            if (fpsEl) fpsEl.classList.add('visible');
            worldManager.switchWorld(index);
            setupXRButton(index);
        });
    });

    function setupXRButton(worldIndex) {
        const container = document.getElementById('xr-button-container');
        if (!container) return;
        container.innerHTML = '';
        const sessionType = worldManager.getSessionTypeForWorld(worldIndex);
        if (sessionType === 'vr') {
            const vrBtn = VRButton.createButton(renderer, {
                requiredFeatures: ['local-floor'],
                optionalFeatures: ['hand-tracking']
            });
            container.appendChild(vrBtn);
        } else {
            const arBtn = ARButton.createButton(renderer, {
                requiredFeatures: ['hit-test', 'local-floor'],
                optionalFeatures: ['dom-overlay', 'plane-detection', 'hand-tracking'],
                domOverlay: { root: document.body }
            });
            container.appendChild(arBtn);
        }
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

    // 9. Start
    worldManager.loadInitialWorld();
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