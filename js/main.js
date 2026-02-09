import * as THREE from 'three';
import { ARButton } from 'three/addons/webxr/ARButton.js';
import { WorldManager } from './WorldManager.js';

let camera, scene, renderer;
let worldManager;
let controller;

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

    // 4. Add ARButton
    document.body.appendChild(ARButton.createButton(renderer, { 
        requiredFeatures: ['hit-test', 'local-floor'],
        optionalFeatures: ['dom-overlay', 'plane-detection'], 
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
    worldManager = new WorldManager(scene, renderer);

    // 8. Event Listeners
    window.addEventListener('resize', onWindowResize);
    
    const switchBtn = document.getElementById('switchWorld');
    if (switchBtn) {
        switchBtn.addEventListener('click', () => worldManager.cycleWorld());
    }

    const enterBtn = document.getElementById('enter-button');
    if (enterBtn) {
        enterBtn.addEventListener('click', () => {
            document.getElementById('landing-page').classList.add('hidden');
            document.getElementById('canvas-container').classList.add('visible');
            document.getElementById('world-ui').classList.add('visible');
        });
    }

    // 9. Start
    worldManager.loadInitialWorld();
    renderer.setAnimationLoop(render);
}

function onSelect() {
    worldManager.handleSelect(controller);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function render(timestamp, frame) {
    worldManager.update(timestamp, frame, camera);
    renderer.render(scene, camera);
}