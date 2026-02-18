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

    // 8. World selector: vertical snap carousel
    const carousel = initWorldCarousel(worldManager);
    worldManager.loadInitialWorld();
    carousel.setSelectedIndex(0);
    const fpsEl = document.getElementById('fps-display');
    if (fpsEl) fpsEl.classList.add('visible');

    // 9. Event Listeners
    window.addEventListener('resize', onWindowResize);

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

    renderer.setAnimationLoop(render);
}

/**
 * Vertical snap carousel for world selection.
 * Only the centered button is clickable; others are dimmed. Scroll snaps to center one item.
 */
function initWorldCarousel(worldManager) {
    const viewport = document.getElementById('world-selector-viewport');
    const track = document.getElementById('world-carousel-track');
    if (!viewport || !track) return { setSelectedIndex: () => {} };

    const names = worldManager.worldNames;
    const itemHeight = 54;
    const viewportHeight = 320;
    const trackPadding = 12;
    const firstItemCenter = trackPadding + 24;
    const viewportCenter = viewportHeight / 2;

    let currentScrollY = firstItemCenter - viewportCenter;
    let targetScrollY = currentScrollY;
    let isDragging = false;
    let dragStartY = 0;
    let dragStartScroll = 0;
    let snapTimeout = null;

    function clampScroll(y) {
        const minScroll = firstItemCenter - viewportCenter;
        const maxScroll = firstItemCenter + (names.length - 1) * itemHeight - viewportCenter;
        return Math.max(minScroll, Math.min(maxScroll, y));
    }

    function getCenteredIndex() {
        const centerInTrack = currentScrollY + viewportCenter;
        const index = Math.round((centerInTrack - firstItemCenter) / itemHeight);
        return Math.max(0, Math.min(names.length - 1, index));
    }

    function applyScroll() {
        track.style.transform = `translateY(${-currentScrollY}px)`;
        const centered = getCenteredIndex();
        track.querySelectorAll('.world-carousel-btn').forEach((btn, i) => {
            btn.classList.toggle('carousel-centered', i === centered);
            btn.dataset.index = i;
        });
    }

    function snapToNearest() {
        const centered = getCenteredIndex();
        targetScrollY = firstItemCenter + centered * itemHeight - viewportCenter;
        targetScrollY = clampScroll(targetScrollY);
    }

    // Build buttons
    names.forEach((name, i) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'world-carousel-btn' + (i === 0 ? ' carousel-centered' : '');
        btn.textContent = name;
        btn.dataset.index = i;
        btn.addEventListener('click', (e) => {
            const idx = parseInt(e.currentTarget.dataset.index, 10);
            if (getCenteredIndex() !== idx) return;
            worldManager.switchWorld(idx);
            worldManager.updateUI();
        });
        track.appendChild(btn);
    });

    viewport.addEventListener('wheel', (e) => {
        e.preventDefault();
        targetScrollY = clampScroll(targetScrollY + e.deltaY);
        clearTimeout(snapTimeout);
        snapTimeout = setTimeout(snapToNearest, 120);
    }, { passive: false });

    viewport.addEventListener('pointerdown', (e) => {
        if (!e.target.closest('.world-carousel-track')) return;
        isDragging = true;
        dragStartY = e.clientY;
        dragStartScroll = currentScrollY;
        viewport.setPointerCapture(e.pointerId);
    });
    viewport.addEventListener('pointermove', (e) => {
        if (!isDragging) return;
        const dy = e.clientY - dragStartY;
        targetScrollY = clampScroll(dragStartScroll + dy);
        clearTimeout(snapTimeout);
    });
    viewport.addEventListener('pointerup', (e) => {
        if (!isDragging) return;
        isDragging = false;
        viewport.releasePointerCapture(e.pointerId);
        snapTimeout = setTimeout(snapToNearest, 80);
    });

    let lastT = performance.now();
    function tick() {
        const t = performance.now();
        const dt = Math.min((t - lastT) / 1000, 0.1);
        lastT = t;
        currentScrollY += (targetScrollY - currentScrollY) * (1 - Math.exp(-12 * dt));
        applyScroll();
        requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);

    return {
        setSelectedIndex(i) {
            targetScrollY = clampScroll(firstItemCenter + i * itemHeight - viewportCenter);
            currentScrollY = targetScrollY;
            applyScroll();
        }
    };
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