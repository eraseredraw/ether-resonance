// ============================================
// ETHER RESONANCE — v5.0.0
// Three.js + WebGL particle visualization
// Modular: shapes / colors / audio / shaders / drawing / exporters
// ============================================
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

import {
    SHAPES,
    setShapeState, getShapeState,
    setFormScaleMod, setFormRotationSpeedMod,
    setOffsetSource, getOffsetSource, clearOffsets, regenerateOffsets,
    writePositionsToArray, writeShapePosition,
    setMouseState, triggerWave
} from './shapes.js';
import {
    setColorState, setHueOffsetMod, setColorTime,
    writeColorsToArray, writeParticleColor
} from './colors.js';
import { AudioEngine } from './audio.js';
import {
    createParticleMaterial, updateParticleMaterial,
    createOrbMaterial, updateOrbMaterial,
    createRGBShiftPass, createStarfield
} from './shaders.js';
import { DrawingPad } from './drawing.js';
import {
    downloadBlob, buildPlyText, buildObjText, buildGlbBuffer,
    generateExportCode, exportImage, exportVideo
} from './exporters.js';

window.THREE = THREE;

// ============================================
// GLOBAL STATE
// ============================================
let scene, camera, renderer, controls;
let particleSystem, geometry, material;
let composer, bloomPass;
let isInitialized = false;
let isPaused = false;
let liveUpdateEnabled = false;

const MAX_PARTICLES = 100000;
let particleCount = 40000;
let positions, colors;

// Particle field state
let time = 0;
let simSpeed = 0.5;
let lastFrameTime = performance.now();

let currentShape = 'sphere';
let formScale = 150;
let formRotationSpeed = 0.3;
let formChaos = 0;

let colorMode = 'ice';
let hueOffset = 0;
let colorSaturation = 0.8;
let colorAnimation = 'static';

let bloomEnabled = true;
let bloomIntensity = 3.0;
let trailEnabled = false;
let particleSize = 0.5;
let twinkleEnabled = true;

let autoRotate = true;
let rotateSpeed = 0.5;

let targetZoomDistance = 412;
let activeAspect = null;

// FPS
let frameCount = 0;
let lastFpsTime = performance.now();
let fps = 0;
let lastQualityAdjustTime = 0;

// Audio
let audioEngine = null;
let audioIntensity = 1.0;
let godModeActive = false;
let lastGodDecision = 0;
let lastGodColorSwitch = 0;

// Morph state
let isMorphing = false;
let morphProgress = 0;
let morphDuration = 1.0;
let morphStart = null;
let morphTarget = null;
let morphTargetShape = null;

// Color recompute flag (colors only change on user input)
let colorsDirty = true;

// Drawing pad
let drawingPad = null;

// Scene extras
let orbMesh = null;
let orbMaterial = null;
let starfield = null;
let rgbShiftPass = null;
let orbEnabled = true;
let starfieldEnabled = true;
let aberrationEnabled = false;

// Camera preset target (smooth glide)
let camTarget = null;

// Pointer interaction
let pointerActive = false;
let pointerWorld = new THREE.Vector3(0, 0, 0);
const pointerRaycaster = new THREE.Raycaster();
const pointerPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);

// ============================================
// CACHED MATH CONSTANTS (Zero GC)
// ============================================
const PI2 = Math.PI * 2;
const SQRT_PI = Math.sqrt(Math.PI);

const boundSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 650);

// Sync state into modules (audio modulation lives there too)
function syncShapeState() {
    setShapeState({ currentShape, formScale, formRotationSpeed, formChaos });
}

function syncColorState() {
    setColorState({ colorMode, hueOffset, colorSaturation, colorAnimation });
}

// ============================================
// INITIALIZATION
// ============================================
function createRenderer() {
    try {
        return new THREE.WebGLRenderer({
            antialias: true,
            alpha: true,
            powerPreference: "high-performance"
        });
    } catch (err) {
        const el = document.getElementById('webgl-error');
        if (el) el.classList.add('visible');
        document.getElementById('loading')?.classList.add('hidden');
        throw new Error('WebGL unavailable: ' + err.message);
    }
}

function init() {
    try {
        // Respect OS "reduce motion" — no auto-orbit, no twinkle
        if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            autoRotate = false;
            twinkleEnabled = false;
        }

        updateLoading(10, 'Creating scene...');

        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x000005);
        scene.fog = new THREE.FogExp2(0x000005, 0.001);

        camera = new THREE.PerspectiveCamera(
            75,
            window.innerWidth / window.innerHeight,
            0.1,
            2000
        );
        camera.position.z = 400;
        camera.position.y = 100;

        renderer = createRenderer();

        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
        renderer.toneMapping = THREE.ReinhardToneMapping;
        renderer.domElement.tabIndex = 1;
        renderer.domElement.style.outline = 'none';
        document.body.appendChild(renderer.domElement);

        controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controls.enableZoom = false;
        controls.enablePan = false;
        controls.enableRotate = true;
        controls.autoRotate = autoRotate;
        controls.autoRotateSpeed = rotateSpeed;
        controls.minDistance = 10;
        controls.maxDistance = 2000;
        controls.touches = {
            ONE: THREE.TOUCH.ROTATE,
            TWO: THREE.TOUCH.DOLLY_PAN
        };

        updateLoading(30, 'Creating particles...');
        rebuildParticles();

        updateLoading(50, 'Forging the core...');
        createOrb();

        updateLoading(60, 'Sowing the stars...');
        createStarfieldInScene();

        updateLoading(70, 'Setting up post-processing...');
        setupPostProcessing();

        updateLoading(90, 'Finalizing...');
        setupEventListeners();
        setupDragAndDrop();

        targetZoomDistance = camera.position.length();
        updateHudFormName();

        // Restore preset from URL hash (#preset=...)
        try {
            const m = location.hash.match(/#preset=([A-Za-z0-9+/=]+)/);
            if (m) {
                const cfg = JSON.parse(decodeURIComponent(atob(m[1])));
                applyConfig(cfg);
                console.log('Preset restored from URL');
            }
        } catch (e) {
            console.warn('Invalid preset hash:', e);
        }

        updateLoading(100, 'Ready!');
        setTimeout(() => {
            document.getElementById('loading').classList.add('hidden');
        }, 300);

        console.log('✅ Ether Resonance initialized successfully!');
        isInitialized = true;
        animate();
    } catch (error) {
        console.error('❌ Initialization error:', error);
        const status = document.getElementById('load-status');
        if (status) {
            status.textContent = 'ERROR: ' + error.message;
            status.style.color = 'red';
        }
    }
}

// ============================================
// PARTICLES
// ============================================
function rebuildParticles() {
    if (geometry) geometry.dispose();
    if (material) material.dispose();
    if (particleSystem) scene.remove(particleSystem);

    positions = new Float32Array(MAX_PARTICLES * 3);
    colors = new Float32Array(MAX_PARTICLES * 3);

    geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setDrawRange(0, particleCount);

    material = createParticleMaterial({ size: particleSize });
    updateParticleMaterial(material, { pixelRatio: renderer ? renderer.getPixelRatio() : 1 });

    particleSystem = new THREE.Points(geometry, material);
    scene.add(particleSystem);

    syncShapeState();
    syncColorState();
    regenerateOffsets(particleCount);
    writePositionsToArray(positions, particleCount, time);
    writeColorsToArray(colors, particleCount, time);
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
    boundSphere.radius = formScale * 4 + 50;
    geometry.boundingSphere = boundSphere;
    colorsDirty = false;
    isMorphing = false;
}

function updateParticles() {
    if (!isInitialized || !geometry || !geometry.attributes || !geometry.attributes.position) return;
    if (particleCount <= 0 || particleCount > MAX_PARTICLES) return;

    const posAttr = geometry.attributes.position;
    const colAttr = geometry.attributes.color;

    syncShapeState();
    setColorTime(time);
    writePositionsToArray(posAttr.array, particleCount, time);
    posAttr.needsUpdate = true;

    if (colorsDirty) {
        writeColorsToArray(colAttr.array, particleCount, time);
        colAttr.needsUpdate = true;
        colorsDirty = false;
    }

    geometry.setDrawRange(0, particleCount);

    // Fixed bounding sphere (radius covers shape + offsets + chaos worst case)
    boundSphere.radius = formScale * 4 + 50;
    geometry.boundingSphere = boundSphere;
}

// ============================================
// MORPHING
// ============================================
function easeInOutCubic(p) {
    return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

function morphToShape(targetShape, duration = 1.0) {
    if (!geometry || !geometry.attributes.position) return;
    if (targetShape === currentShape) {
        isMorphing = false;
        morphStart = null;
        morphTarget = null;
        updateParticles();
        return;
    }
    const posArr = geometry.attributes.position.array;
    morphStart = new Float32Array(posArr.subarray(0, particleCount * 3));
    morphTarget = new Float32Array(particleCount * 3);
    morphTargetShape = targetShape;
    morphDuration = duration;
    morphProgress = 0;
    isMorphing = true;
}

function advanceMorph(dt) {
    const posArr = geometry.attributes.position.array;

    // Live target: recompute with current time so there is no jump on completion
    syncShapeState();
    writePositionsToArray(morphTarget, particleCount, time);

    morphProgress = Math.min(morphProgress + dt / morphDuration, 1);
    const eased = easeInOutCubic(morphProgress);

    for (let i = 0; i < particleCount; i++) {
        const o = i * 3;
        posArr[o] = morphStart[o] + (morphTarget[o] - morphStart[o]) * eased;
        posArr[o + 1] = morphStart[o + 1] + (morphTarget[o + 1] - morphStart[o + 1]) * eased;
        posArr[o + 2] = morphStart[o + 2] + (morphTarget[o + 2] - morphStart[o + 2]) * eased;
    }
    geometry.attributes.position.needsUpdate = true;

    if (colorsDirty) {
        setColorTime(time);
        writeColorsToArray(geometry.attributes.color.array, particleCount, time);
        geometry.attributes.color.needsUpdate = true;
        colorsDirty = false;
    }

    if (morphProgress >= 1) {
        currentShape = morphTargetShape;
        isMorphing = false;
        morphStart = null;
        morphTarget = null;
    }
}

// ============================================
// SCENE EXTRAS (orb, starfield, RGB shift)
// ============================================
function createOrb() {
    const geo = new THREE.SphereGeometry(55, 96, 96);
    orbMaterial = createOrbMaterial();
    orbMesh = new THREE.Mesh(geo, orbMaterial);
    orbMesh.visible = orbEnabled;
    scene.add(orbMesh);
}

function createStarfieldInScene() {
    starfield = createStarfield(1200, 1500);
    starfield.visible = starfieldEnabled;
    scene.add(starfield);
}

function setSceneToggle(name, enabled) {
    if (name === 'orb') {
        orbEnabled = enabled;
        if (orbMesh) orbMesh.visible = enabled;
    } else if (name === 'starfield') {
        starfieldEnabled = enabled;
        if (starfield) starfield.visible = enabled;
    } else if (name === 'aberration') {
        aberrationEnabled = enabled;
        if (rgbShiftPass) rgbShiftPass.enabled = enabled;
    }
}

function setCameraPreset(preset) {
    if (!camera) return;
    if (controls && !controls._camPresetHooked) {
        controls._camPresetHooked = true;
        controls.addEventListener('start', () => { camTarget = null; });
    }
    let target;
    if (preset === 'front') target = new THREE.Vector3(0, 0, 480);
    else if (preset === 'top') target = new THREE.Vector3(0, 480, 1);
    else if (preset === 'orbit') target = new THREE.Vector3(0, 100, 400);
    camTarget = target;
    targetZoomDistance = target.length();
    if (preset !== 'orbit' && controls) controls.autoRotate = false;
    else if (preset === 'orbit' && controls) controls.autoRotate = autoRotate;
    showNotification('CAMERA: ' + preset.toUpperCase());
}

// ============================================
// POST PROCESSING
// ============================================
function setupPostProcessing() {
    composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    const bloomResolution = new THREE.Vector2(
        Math.floor(window.innerWidth / 2),
        Math.floor(window.innerHeight / 2)
    );

    bloomPass = new UnrealBloomPass(
        bloomResolution,
        bloomIntensity,
        0.4,
        0.85
    );
    composer.addPass(bloomPass);

    rgbShiftPass = createRGBShiftPass(0.0025);
    rgbShiftPass.enabled = aberrationEnabled;
    composer.addPass(rgbShiftPass);

    window.adjustBloomQuality = function (fps) {
        if (fps < 30) {
            bloomPass.strength = Math.max(0.5, bloomIntensity * 0.5);
            bloomPass.resolution.set(
                Math.floor(window.innerWidth / 4),
                Math.floor(window.innerHeight / 4)
            );
        } else if (fps < 55) {
            bloomPass.strength = bloomIntensity;
            bloomPass.resolution.set(
                Math.floor(window.innerWidth / 2),
                Math.floor(window.innerHeight / 2)
            );
        } else {
            bloomPass.strength = bloomIntensity;
            bloomPass.resolution.set(
                Math.floor(window.innerWidth),
                Math.floor(window.innerHeight)
            );
        }
    };
}

// ============================================
// EVENT LISTENERS
// ============================================
function setupEventListeners() {
    // Resize
    window.addEventListener('resize', () => {
        applyAspect();
    }, { passive: true });

    // --- Simulation ---
    const slider = document.getElementById('particle-count-slider');
    slider.addEventListener('input', e => {
        const newCount = parseInt(e.target.value);
        if (newCount !== particleCount) {
            particleCount = newCount;
            rebuildParticles();
        }
        document.getElementById('particle-count-value').textContent =
            (particleCount / 1000).toFixed(0) + 'K';
        document.getElementById('particle-count').textContent = particleCount.toLocaleString();
    });

    document.getElementById('particle-size').addEventListener('input', e => {
        particleSize = parseFloat(e.target.value);
        updateParticleMaterial(material, { size: particleSize });
        document.getElementById('particle-size-value').textContent = e.target.value;
    });

    document.getElementById('sim-speed').addEventListener('input', e => {
        simSpeed = parseFloat(e.target.value);
        document.getElementById('sim-speed-value').textContent = e.target.value;
    });

    document.getElementById('bloom-toggle').addEventListener('change', e => {
        bloomEnabled = e.target.checked;
        if (bloomPass) bloomPass.enabled = bloomEnabled;
    });

    document.getElementById('bloom-intensity').addEventListener('input', e => {
        bloomIntensity = parseFloat(e.target.value);
        if (bloomPass) bloomPass.strength = bloomIntensity;
        document.getElementById('bloom-intensity-value').textContent = e.target.value;
    });

    document.getElementById('trail-toggle').addEventListener('change', e => {
        trailEnabled = e.target.checked;
    });

    // --- Form ---
    document.getElementById('shape-select').addEventListener('change', e => {
        morphToShape(e.target.value, 1.0);
        updateHudFormName();
    });

    document.getElementById('form-scale').addEventListener('input', e => {
        formScale = parseInt(e.target.value);
        document.getElementById('form-scale-value').textContent = e.target.value;
    });

    document.getElementById('form-rotation').addEventListener('input', e => {
        formRotationSpeed = parseFloat(e.target.value);
        document.getElementById('form-rotation-value').textContent = e.target.value;
    });

    document.getElementById('form-chaos').addEventListener('input', e => {
        formChaos = parseInt(e.target.value);
        document.getElementById('form-chaos-value').textContent = e.target.value;
    });

    // --- Color ---
    document.getElementById('color-mode').addEventListener('change', e => {
        colorMode = e.target.value;
        colorsDirty = true;
        updateParticles();
    });

    document.getElementById('hue-offset').addEventListener('input', e => {
        hueOffset = parseInt(e.target.value);
        document.getElementById('hue-offset-value').textContent = e.target.value + '°';
        colorsDirty = true;
        updateParticles();
    });

    document.getElementById('anim-select').addEventListener('change', e => {
        colorAnimation = e.target.value;
        colorsDirty = true;
        updateParticles();
    });

    // --- Audio ---
    document.getElementById('btn-audio-mic')?.addEventListener('click', startMic);
    document.getElementById('btn-audio-system')?.addEventListener('click', startSystemAudio);
    document.getElementById('btn-audio-file')?.addEventListener('click', loadAudioTrack);
    document.getElementById('btn-audio-stop')?.addEventListener('click', stopAudio);

    document.getElementById('audio-intensity')?.addEventListener('input', e => {
        audioIntensity = parseFloat(e.target.value);
        document.getElementById('audio-intensity-value').textContent = audioIntensity.toFixed(2);
    });

    document.getElementById('twinkle-toggle')?.addEventListener('change', e => {
        twinkleEnabled = e.target.checked;
        updateParticleMaterial(material, { twinkle: twinkleEnabled });
    });

    document.getElementById('btn-god-mode')?.addEventListener('click', toggleGodMode);

    // Playback controls (file mode)
    document.getElementById('btn-play-pause-track')?.addEventListener('click', () => {
        if (audioEngine) {
            audioEngine.togglePlay();
            updatePlaybackUI();
        }
    });
    document.getElementById('audio-seek')?.addEventListener('input', e => {
        if (audioEngine) audioEngine.setSeek(parseFloat(e.target.value) / 100);
    });
    document.getElementById('audio-volume')?.addEventListener('input', e => {
        if (audioEngine) audioEngine.setVolume(parseFloat(e.target.value) / 100);
    });

    // --- Camera ---
    document.getElementById('rotate-speed').addEventListener('input', e => {
        rotateSpeed = parseFloat(e.target.value);
        document.getElementById('rotate-speed-value').textContent = e.target.value;
        if (controls) controls.autoRotateSpeed = rotateSpeed;
    });

    document.getElementById('auto-rotate').addEventListener('change', e => {
        autoRotate = e.target.checked;
        if (controls) controls.autoRotate = autoRotate;
    });

    // --- Camera presets ---
    document.getElementById('btn-cam-front')?.addEventListener('click', () => setCameraPreset('front'));
    document.getElementById('btn-cam-top')?.addEventListener('click', () => setCameraPreset('top'));
    document.getElementById('btn-cam-orbit')?.addEventListener('click', () => setCameraPreset('orbit'));

    // --- Scene toggles ---
    document.getElementById('orb-toggle')?.addEventListener('change', e => setSceneToggle('orb', e.target.checked));
    document.getElementById('starfield-toggle')?.addEventListener('change', e => setSceneToggle('starfield', e.target.checked));
    document.getElementById('aberration-toggle')?.addEventListener('change', e => setSceneToggle('aberration', e.target.checked));

    // --- Pointer interaction (repulse + click shockwave) ---
    renderer.domElement.addEventListener('pointermove', (e) => {
        pointerActive = true;
        updatePointerWorld(e);
        setMouseState(pointerWorld.x, pointerWorld.y, 26);
    });
    renderer.domElement.addEventListener('pointerleave', () => {
        pointerActive = false;
        setMouseState(-9999, -9999, 0);
    });
    renderer.domElement.addEventListener('pointerdown', (e) => {
        updatePointerWorld(e);
        triggerWave(pointerWorld.x, pointerWorld.y, time);
    });

    // --- Export ---
    document.getElementById('btn-platform-vanilla')?.addEventListener('click', () => exportCode('vanilla'));
    document.getElementById('btn-platform-react')?.addEventListener('click', () => exportCode('react'));
    document.getElementById('btn-platform-three')?.addEventListener('click', () => exportCode('three'));
    document.getElementById('btn-platform-image')?.addEventListener('click', () => exportImage(renderer, composer, camera, {
        resolution: document.getElementById('export-resolution').value,
        format: document.getElementById('export-format').value,
        notify: showNotification
    }));
    document.getElementById('btn-platform-ply')?.addEventListener('click', () => exportPly());
    document.getElementById('btn-platform-glb')?.addEventListener('click', () => exportGlb());
    document.getElementById('btn-platform-obj')?.addEventListener('click', () => exportObj());
    document.getElementById('btn-download-code')?.addEventListener('click', () => exportCode(document.getElementById('export-platform').value));
    document.getElementById('btn-copy')?.addEventListener('click', copyCode);
    document.getElementById('btn-record-video')?.addEventListener('click', () => exportVideo(renderer, {
        duration: parseInt(document.getElementById('video-duration').value || '8'),
        notify: showNotification
    }));

    // --- Aspect ratio ---
    document.getElementById('btn-aspect-1-1')?.addEventListener('click', () => setAspectRatio('1:1'));
    document.getElementById('btn-aspect-16-9')?.addEventListener('click', () => setAspectRatio('16:9'));
    document.getElementById('btn-aspect-9-16')?.addEventListener('click', () => setAspectRatio('9:16'));
    document.getElementById('btn-aspect-4-3')?.addEventListener('click', () => setAspectRatio('4:3'));
    document.getElementById('btn-aspect-3-4')?.addEventListener('click', () => setAspectRatio('3:4'));
    document.getElementById('btn-aspect-custom')?.addEventListener('click', () => setAspectRatio('custom'));

    // --- Form buttons ---
    document.getElementById('btn-form-sphere')?.addEventListener('click', () => setForm('sphere'));
    document.getElementById('btn-form-cube')?.addEventListener('click', () => setForm('cube'));
    document.getElementById('btn-form-helix')?.addEventListener('click', () => setForm('helix'));
    document.getElementById('btn-form-donut')?.addEventListener('click', () => setForm('donut'));
    document.getElementById('btn-form-ribbon')?.addEventListener('click', () => setForm('ribbon'));
    document.getElementById('btn-form-vortex')?.addEventListener('click', () => setForm('vortex'));

    // --- Actions ---
    document.getElementById('btn-initialize')?.addEventListener('click', initializeNeuralLink);
    document.getElementById('btn-live-update')?.addEventListener('click', toggleLiveUpdate);
    document.getElementById('btn-build-3d')?.addEventListener('click', toggleLiveUpdate);
    document.getElementById('btn-play-pause')?.addEventListener('click', togglePlayPause);
    document.getElementById('btn-copy-prompt')?.addEventListener('click', copyPrompt);
    document.getElementById('btn-save-local')?.addEventListener('click', () => savePreset(4, document.getElementById('btn-save-local')));
    document.getElementById('btn-publish')?.addEventListener('click', publishPreset);
    document.getElementById('btn-ai-guide')?.addEventListener('click', toggleGuide);
    document.getElementById('btn-guide-close')?.addEventListener('click', () => { document.getElementById('guide').classList.add('hidden'); });

    // --- Upload ---
    document.getElementById('btn-upload-image')?.addEventListener('click', () => uploadFile('image'));
    document.getElementById('btn-upload-video')?.addEventListener('click', () => uploadFile('video'));
    document.getElementById('btn-upload-3d')?.addEventListener('click', () => uploadFile('3d'));
    document.getElementById('btn-upload-blueprint')?.addEventListener('click', () => uploadFile('blueprint'));
    document.getElementById('btn-load-cloud')?.addEventListener('click', loadCloudShape);

    // --- Drawing pad ---
    drawingPad = new DrawingPad(() => {
        setOffsetSource(drawingPad.toOffsetSource(particleCount));
        regenerateOffsets(particleCount);
        colorsDirty = true;
        updateParticles();
        showNotification('DRAWING APPLIED');
    });

    document.getElementById('drawing-pad-toggle')?.addEventListener('click', toggleDrawingPad);
    document.getElementById('btn-open-drawing')?.addEventListener('click', () => { drawingPad.clear(); });
    document.getElementById('btn-pen')?.addEventListener('click', () => selectTool('pen'));
    document.getElementById('btn-eraser')?.addEventListener('click', () => selectTool('eraser'));
    document.getElementById('btn-undo')?.addEventListener('click', () => drawingPad.undo());
    document.getElementById('btn-redo')?.addEventListener('click', () => drawingPad.redo());
    document.getElementById('btn-sym')?.addEventListener('click', () => drawingPad.setSymmetry(!drawingPad.symmetry));
    document.getElementById('btn-pulsar')?.addEventListener('click', () => drawingPad.setPulsar(!drawingPad.pulsar));
    document.getElementById('btn-live-update')?.addEventListener('click', () => {
        drawingPad.setLiveApply(!drawingPad.liveApply);
        const btn = document.getElementById('btn-live-update');
        btn.textContent = drawingPad.liveApply ? '⚡ LIVE: ON' : '⚡ LIVE: OFF';
    });
    document.getElementById('draw-brush-size')?.addEventListener('input', e => {
        drawingPad.setBrushSize(e.target.value);
        document.getElementById('draw-brush-size-value').textContent = e.target.value;
    });

    // --- Panel toggles ---
    document.getElementById('hud-toggle')?.addEventListener('click', toggleHUD);
    document.getElementById('controls-toggle')?.addEventListener('click', toggleControls);

    // --- Keyboard ---
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') {
            e.preventDefault();
            toggleHUD();
            toggleControls();
        } else if (e.key === ' ' && !e.repeat) {
            e.preventDefault();
            togglePlayPause();
        } else if ((e.key === 'r' || e.key === 'R') && !e.repeat) {
            randomize();
        } else if ((e.key === 'c' || e.key === 'C') && !e.repeat) {
            resetCamera();
        }
    });

    // --- Zoom (single handler: smooth target zoom) ---
    renderer.domElement.addEventListener('wheel', (e) => {
        e.preventDefault();
        const factor = Math.exp(e.deltaY * 0.0008);
        targetZoomDistance = Math.max(10, Math.min(targetZoomDistance * factor, 2000));
    }, { passive: false });

    // --- Pinch-to-zoom (mobile) ---
    let initialPinchDistance = null;
    renderer.domElement.addEventListener('touchstart', (e) => {
        if (e.touches.length === 2) {
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            initialPinchDistance = Math.sqrt(dx * dx + dy * dy);
        }
    }, { passive: true });

    renderer.domElement.addEventListener('touchmove', (e) => {
        if (e.touches.length === 2 && initialPinchDistance !== null) {
            e.preventDefault();
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            const currentDistance = Math.sqrt(dx * dx + dy * dy);
            const zoomDelta = (initialPinchDistance - currentDistance) * 0.5;
            targetZoomDistance = Math.max(10, Math.min(targetZoomDistance + zoomDelta, 2000));
        }
    }, { passive: false });

    renderer.domElement.addEventListener('touchend', () => {
        initialPinchDistance = null;
    });
}

// ============================================
// DRAG & DROP
// ============================================
function setupDragAndDrop() {
    const overlay = document.getElementById('drop-overlay');
    if (!overlay) return;

    let dragDepth = 0;
    window.addEventListener('dragenter', e => {
        e.preventDefault();
        dragDepth++;
        overlay.classList.add('active');
    });
    window.addEventListener('dragleave', () => {
        dragDepth = Math.max(0, dragDepth - 1);
        if (dragDepth === 0) overlay.classList.remove('active');
    });
    window.addEventListener('dragover', e => e.preventDefault());
    window.addEventListener('drop', e => {
        e.preventDefault();
        dragDepth = 0;
        overlay.classList.remove('active');
        const files = e.dataTransfer && e.dataTransfer.files;
        if (!files || !files.length) return;
        const f = files[0];
        const ext = (f.name.split('.').pop() || '').toLowerCase();
        if (f.type.startsWith('image/')) {
            handleUpload('image', f);
        } else if (['obj', 'glb', 'gltf', 'ply'].includes(ext)) {
            handleUpload('3d', f);
        } else if (f.type.startsWith('audio/')) {
            handleUpload('audio', f);
        } else {
            showNotification('UNSUPPORTED FILE TYPE');
        }
    });
}

// ============================================
// AUDIO REACTIVITY
// ============================================
async function startMic() {
    try {
        audioEngine = new AudioEngine();
        await audioEngine.startMic();
        setAudioStatus('MIC: ONLINE', 'on');
        showNotification('MIC ENABLED');
    } catch (err) {
        audioEngine = null;
        setAudioStatus('MIC ERROR');
        showNotification('MIC ACCESS DENIED');
    }
}

async function startSystemAudio() {
    try {
        audioEngine = new AudioEngine();
        await audioEngine.startSystem();
        setAudioStatus('SYSTEM AUDIO: ONLINE', 'on');
        showNotification('SYSTEM AUDIO CAPTURED');
    } catch (err) {
        audioEngine = null;
        setAudioStatus('SYSTEM CAPTURE CANCELLED');
        showNotification('SYSTEM CAPTURE FAILED');
    }
}

async function loadAudioTrack() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*';
    input.onchange = async e => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            audioEngine = new AudioEngine();
            await audioEngine.loadFile(file);
            setAudioStatus('TRACK: ' + file.name, 'on');
            document.getElementById('playback-row')?.classList.add('visible');
            updatePlaybackUI();
            showNotification('AUDIO TRACK LOADED');
        } catch (err) {
            audioEngine = null;
            setAudioStatus('TRACK ERROR');
            showNotification('AUDIO LOAD FAILED');
        }
    };
    input.click();
}

function stopAudio() {
    if (audioEngine) audioEngine.stop();
    audioEngine = null;
    setAudioStatus('OFF');
    document.getElementById('playback-row')?.classList.remove('visible');
    showNotification('AUDIO DISABLED');
}

function updatePlaybackUI() {
    if (!audioEngine) return;
    const btn = document.getElementById('btn-play-pause-track');
    if (btn) btn.textContent = audioEngine.isPlaying() ? '⏸️' : '▶️';
    const seek = document.getElementById('audio-seek');
    if (seek) seek.value = Math.round(audioEngine.getProgress() * 100);
}

function toggleGodMode() {
    godModeActive = !godModeActive;
    const btn = document.getElementById('btn-god-mode');
    if (btn) {
        btn.textContent = godModeActive ? '🤖 GOD: ON' : '🤖 God Mode';
        btn.classList.toggle('active', godModeActive);
    }
    showNotification(godModeActive ? 'GOD MODE ENABLED' : 'GOD MODE DISABLED');
}

function setAudioStatus(text, cls) {
    const el = document.getElementById('audio-status');
    if (!el) return;
    el.textContent = text;
    el.className = 'audio-status' + (cls ? ' ' + cls : '');
}

// Auto-director: picks shapes/colors/intensity by audio character
function godDirect() {
    const f = audioEngine ? audioEngine.getFrame() : { level: 0, bass: 0, treble: 0 };
    const now = performance.now();

    // Intensity follows the track energy
    if (audioEngine) {
        const target = Math.max(0.5, Math.min(2, 0.7 + f.level * 1.4));
        audioIntensity += (target - audioIntensity) * 0.02;
        document.getElementById('audio-intensity').value = audioIntensity;
        document.getElementById('audio-intensity-value').textContent = audioIntensity.toFixed(2);
    }

    // Mood switches
    if (now - lastGodDecision > 7000) {
        lastGodDecision = now;
        let mood;
        if (f.bass > 0.3) mood = 'vortex';
        else if (f.treble > 0.3) mood = 'helix';
        else if (f.level > 0.45) mood = 'torus';
        else mood = SHAPES[Math.floor(Math.random() * SHAPES.length)];
        if (mood !== currentShape && !isMorphing) {
            morphToShape(mood, 2.5);
            updateHudFormName();
        }
        if (f.beat) formChaos = Math.floor(Math.random() * 30);
    }

    // Color mood shifts slower
    if (now - lastGodColorSwitch > 14000) {
        lastGodColorSwitch = now;
        const modes = ['rainbow', 'plasma', 'ocean', 'fire', 'ice', 'neon', 'gold'];
        colorMode = modes[Math.floor(Math.random() * modes.length)];
        colorsDirty = true;
    }
}

// Called every frame from animate()
function applyAudioFrame() {
    if (!audioEngine || !audioEngine.active) return;
    const f = audioEngine.update(dtLast);
    if (!f) return;

    const k = audioIntensity;
    // bass → scale swell, mid → rotation, treble → hue drift
    setFormScaleMod(1 + f.bass * k * 0.9);
    setFormRotationSpeedMod(1 + f.mid * k * 1.2);
    setHueOffsetMod(f.treble * k * 60);

    // beat → bloom flash
    const target = bloomIntensity * (1 + (f.beat ? 0.7 : 0) + f.bass * k * 0.4);
    if (bloomPass) {
        bloomPass.strength += (target - bloomPass.strength) * 0.2;
    }
    updateParticleMaterial(material, { intensity: 0.85 + f.level * k * 0.6, time });

    // HUD meter
    const meter = document.getElementById('audio-level');
    if (meter) meter.style.width = Math.min(100, f.level * 140) + '%';

    // Track progress scrubber
    if (audioEngine.mode === 'file') updatePlaybackUI();
}

let dtLast = 0;

// ============================================
// CAMERA / ASPECT
// ============================================
function updatePointerWorld(e) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointerRaycaster.setFromCamera(
        new THREE.Vector2(
            ((e.clientX - rect.left) / rect.width) * 2 - 1,
            -((e.clientY - rect.top) / rect.height) * 2 + 1
        ),
        camera
    );
    pointerRaycaster.ray.intersectPlane(pointerPlane, pointerWorld);
}

function resetCamera() {
    if (!controls) return;
    controls.target.set(0, 0, 0);
    camera.position.set(0, 100, 400);
    targetZoomDistance = camera.position.length();
    camTarget = null;
    controls.update();
    showNotification('CAMERA RESET');
}

function setAspectRatio(ratio) {
    if (ratio === 'custom') {
        activeAspect = null;
        applyAspect();
        showNotification('FULL WINDOW');
        return;
    }
    const [w, h] = ratio.split(':').map(Number);
    activeAspect = w / h;
    applyAspect();
    showNotification(`ASPECT RATIO: ${ratio}`);
}

function applyAspect() {
    const cw = window.innerWidth;
    const ch = window.innerHeight;
    let w = cw;
    let h = ch;
    if (activeAspect) {
        if (cw / ch > activeAspect) {
            w = Math.floor(ch * activeAspect);
        } else {
            h = Math.floor(cw / activeAspect);
        }
    }
    if (!renderer) return;
    renderer.setSize(w, h);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.domElement.style.marginLeft = Math.max(0, Math.floor((cw - w) / 2)) + 'px';
    renderer.domElement.style.marginTop = Math.max(0, Math.floor((ch - h) / 2)) + 'px';
}

// ============================================
// UI HELPERS
// ============================================
function updateHudFormName() {
    const select = document.getElementById('shape-select');
    const name = document.getElementById('form-name');
    if (select && name) {
        const opt = select.options[select.selectedIndex];
        name.textContent = opt ? opt.text : currentShape;
    }
}

function updateUIFromState() {
    document.getElementById('particle-count-slider').value = particleCount;
    document.getElementById('particle-count-value').textContent = (particleCount / 1000).toFixed(0) + 'K';
    document.getElementById('particle-count').textContent = particleCount.toLocaleString();
    document.getElementById('particle-size').value = particleSize;
    document.getElementById('particle-size-value').textContent = particleSize.toFixed(1);
    document.getElementById('sim-speed').value = simSpeed;
    document.getElementById('sim-speed-value').textContent = simSpeed.toFixed(2);
    document.getElementById('shape-select').value = currentShape;
    document.getElementById('form-scale').value = formScale;
    document.getElementById('form-scale-value').textContent = formScale.toFixed(0);
    document.getElementById('form-rotation').value = formRotationSpeed;
    document.getElementById('form-rotation-value').textContent = formRotationSpeed.toFixed(2);
    document.getElementById('form-chaos').value = formChaos;
    document.getElementById('form-chaos-value').textContent = formChaos;
    document.getElementById('color-mode').value = colorMode;
    document.getElementById('hue-offset').value = hueOffset;
    document.getElementById('hue-offset-value').textContent = hueOffset + '°';
    document.getElementById('anim-select').value = colorAnimation;
    document.getElementById('bloom-toggle').checked = bloomEnabled;
    document.getElementById('bloom-intensity').value = bloomIntensity;
    document.getElementById('bloom-intensity-value').textContent = bloomIntensity.toFixed(1);
    document.getElementById('trail-toggle').checked = trailEnabled;
    document.getElementById('rotate-speed').value = rotateSpeed;
    document.getElementById('rotate-speed-value').textContent = rotateSpeed.toFixed(1);
    document.getElementById('auto-rotate').checked = autoRotate;
    document.getElementById('twinkle-toggle').checked = twinkleEnabled;
    document.getElementById('orb-toggle').checked = orbEnabled;
    document.getElementById('starfield-toggle').checked = starfieldEnabled;
    document.getElementById('aberration-toggle').checked = aberrationEnabled;
    updateHudFormName();
}

// ============================================
// CONFIG (presets, URL, cloud)
// ============================================
const DEFAULT_CONFIG = {
    particleCount: 40000,
    shape: 'sphere',
    formScale: 150,
    formRotationSpeed: 0.3,
    formChaos: 0,
    colorMode: 'ice',
    hueOffset: 0,
    colorAnimation: 'static',
    bloomEnabled: true,
    bloomIntensity: 3.0,
    trailEnabled: false,
    particleSize: 0.5,
    simSpeed: 0.5,
    autoRotate: true,
    rotateSpeed: 0.5,
    twinkleEnabled: true,
    orbEnabled: true,
    starfieldEnabled: true,
    aberrationEnabled: false
};

function collectConfig() {
    return {
        particleCount,
        shape: currentShape,
        formScale,
        formRotationSpeed,
        formChaos,
        colorMode,
        hueOffset,
        colorAnimation,
        bloomEnabled,
        bloomIntensity,
        trailEnabled,
        particleSize,
        simSpeed,
        autoRotate,
        rotateSpeed,
        twinkleEnabled,
        orbEnabled,
        starfieldEnabled,
        aberrationEnabled
    };
}

function applyConfig(cfg) {
    if (!cfg) return;
    let countChanged = false;
    if (typeof cfg.particleCount === 'number' && cfg.particleCount !== particleCount) {
        particleCount = Math.min(MAX_PARTICLES, Math.max(1000, cfg.particleCount));
        countChanged = true;
    }
    if (cfg.shape) currentShape = cfg.shape;
    if (typeof cfg.formScale === 'number') formScale = cfg.formScale;
    if (typeof cfg.formRotationSpeed === 'number') formRotationSpeed = cfg.formRotationSpeed;
    if (typeof cfg.formChaos === 'number') formChaos = cfg.formChaos;
    if (cfg.colorMode) colorMode = cfg.colorMode;
    if (typeof cfg.hueOffset === 'number') hueOffset = cfg.hueOffset;
    if (cfg.colorAnimation) colorAnimation = cfg.colorAnimation;
    if (typeof cfg.bloomEnabled === 'boolean') bloomEnabled = cfg.bloomEnabled;
    if (typeof cfg.bloomIntensity === 'number') bloomIntensity = cfg.bloomIntensity;
    if (typeof cfg.trailEnabled === 'boolean') trailEnabled = cfg.trailEnabled;
    if (typeof cfg.particleSize === 'number') particleSize = cfg.particleSize;
    if (typeof cfg.simSpeed === 'number') simSpeed = cfg.simSpeed;
    if (typeof cfg.autoRotate === 'boolean') autoRotate = cfg.autoRotate;
    if (typeof cfg.rotateSpeed === 'number') rotateSpeed = cfg.rotateSpeed;
    if (typeof cfg.twinkleEnabled === 'boolean') twinkleEnabled = cfg.twinkleEnabled;
    if (typeof cfg.orbEnabled === 'boolean') orbEnabled = cfg.orbEnabled;
    if (typeof cfg.starfieldEnabled === 'boolean') starfieldEnabled = cfg.starfieldEnabled;
    if (typeof cfg.aberrationEnabled === 'boolean') aberrationEnabled = cfg.aberrationEnabled;

    updateParticleMaterial(material, { size: particleSize, twinkle: twinkleEnabled });
    if (bloomPass) bloomPass.strength = bloomIntensity;
    if (rgbShiftPass) rgbShiftPass.enabled = aberrationEnabled;
    if (orbMesh) orbMesh.visible = orbEnabled;
    if (starfield) starfield.visible = starfieldEnabled;
    if (controls) {
        controls.autoRotate = autoRotate;
        controls.autoRotateSpeed = rotateSpeed;
    }

    if (countChanged) {
        rebuildParticles();
    } else {
        isMorphing = false;
        morphStart = null;
        morphTarget = null;
        colorsDirty = true;
        updateParticles();
    }
    updateUIFromState();
}

// ============================================
// PRESETS
// ============================================
function savePreset(slot = 1, btn = null) {
    const preset = collectConfig();
    preset.savedAt = new Date().toISOString();
    localStorage.setItem('ether-preset-' + slot, JSON.stringify(preset));

    if (btn) {
        const original = btn.textContent;
        btn.textContent = '✅ Saved!';
        btn.style.background = 'rgba(0, 255, 100, 0.4)';
        setTimeout(() => {
            btn.textContent = original;
            btn.style.background = '';
        }, 1000);
    }
    showNotification(`PRESET ${slot} SAVED`);
}

function loadPreset(slot = 1) {
    const saved = localStorage.getItem('ether-preset-' + slot);
    if (!saved) {
        showNotification(`NO PRESET IN SLOT ${slot}`);
        return;
    }
    try {
        const preset = JSON.parse(saved);
        applyConfig(preset);
        showNotification(`PRESET ${slot} LOADED`);
    } catch (e) {
        showNotification('PRESET CORRUPTED');
    }
}

function publishPreset() {
    const b64 = btoa(encodeURIComponent(JSON.stringify(collectConfig())));
    const url = location.origin + location.pathname + '#preset=' + b64;
    navigator.clipboard.writeText(url).then(() => {
        showNotification('SHARE LINK COPIED!');
    }).catch(() => {
        showNotification('COPY FAILED — URL: ' + url);
    });
}

const CLOUD_SHAPES = [
    { shape: 'sphere', colorMode: 'neon', formScale: 170, simSpeed: 0.8, bloomIntensity: 2.5 },
    { shape: 'vortex', colorMode: 'fire', formScale: 140, formRotationSpeed: 0.7, simSpeed: 0.9, bloomIntensity: 3 },
    { shape: 'ribbon', colorMode: 'ocean', formScale: 180, formRotationSpeed: 0.5, simSpeed: 0.6 },
    { shape: 'helix', colorMode: 'gold', formScale: 150, formRotationSpeed: 0.4, simSpeed: 0.7, hueOffset: 40 },
    { shape: 'torus', colorMode: 'rainbow', formScale: 160, formRotationSpeed: 0.6, simSpeed: 0.8 },
    { shape: 'plane', colorMode: 'plasma', formScale: 130, formChaos: 15, simSpeed: 0.9 },
    { shape: 'spiral', colorMode: 'cyan', formScale: 165, formRotationSpeed: 0.55, simSpeed: 0.75 },
    { shape: 'chaos', colorMode: 'white', formScale: 200, formChaos: 100, simSpeed: 0.5 }
];

function loadCloudShape() {
    const preset = CLOUD_SHAPES[Math.floor(Math.random() * CLOUD_SHAPES.length)];
    const cfg = Object.assign({}, collectConfig(), preset);
    if (cfg.shape !== currentShape) {
        morphToShape(cfg.shape, 1.2);
    }
    applyConfig(cfg);
    showNotification('CLOUD SHAPE: ' + cfg.shape.toUpperCase());
}

// ============================================
// RANDOMIZE / RESET
// ============================================
function randomize() {
    const newShape = SHAPES[Math.floor(Math.random() * SHAPES.length)];
    if (newShape !== currentShape) {
        morphToShape(newShape, 1.0);
    }
    formScale = 100 + Math.random() * 150;
    formChaos = Math.floor(Math.random() * 50);
    hueOffset = Math.floor(Math.random() * 360);
    colorMode = ['rainbow', 'hue', 'plasma', 'ocean', 'fire', 'ice', 'cyan', 'gold', 'neon', 'white'][Math.floor(Math.random() * 10)];
    colorAnimation = ['static', 'scroll', 'wave', 'pulse'][Math.floor(Math.random() * 4)];
    colorsDirty = true;
    updateParticles();
    updateUIFromState();
    showNotification('RANDOMIZED');
}

function reset() {
    applyConfig(DEFAULT_CONFIG);
    showNotification('RESET TO DEFAULTS');
}

// ============================================
// EXPORT: CODE
// ============================================
const SHAPE_FN_SRC = writeShapePosition.toString();
const COLOR_FN_SRC = writeParticleColor.toString();

function exportCode(type) {
    const code = generateExportCode(type, {
        shapeFnSrc: SHAPE_FN_SRC,
        colorFnSrc: COLOR_FN_SRC,
        config: collectConfig()
    });
    const ext = type === 'react' ? 'jsx' : type === 'vanilla' ? 'html' : 'js';
    const name = type === 'vanilla' ? 'ether-resonance.html' : 'ether-resonance-' + type + '.' + ext;
    downloadBlob(new Blob([code], { type: 'text/plain;charset=utf-8' }), name);
    showNotification('EXPORTED: ' + name);
}

function copyCode() {
    const platform = document.getElementById('export-platform').value;
    const code = generateExportCode(platform, {
        shapeFnSrc: SHAPE_FN_SRC,
        colorFnSrc: COLOR_FN_SRC,
        config: collectConfig()
    });
    navigator.clipboard.writeText(code).then(() => {
        showNotification('CODE COPIED!');
        const btn = document.getElementById('btn-copy');
        const original = btn.textContent;
        btn.textContent = '✅ Copied!';
        setTimeout(() => { btn.textContent = original; }, 2000);
    }).catch(err => {
        showNotification('COPY FAILED');
    });
}

// ============================================
// EXPORT: POINT CLOUDS
// ============================================
function currentPositions(count) {
    const arr = geometry.attributes.position.array;
    const out = new Float32Array(count * 3);
    const n = Math.min(count, particleCount);
    for (let i = 0; i < n; i++) {
        out[i * 3] = arr[i * 3];
        out[i * 3 + 1] = arr[i * 3 + 1];
        out[i * 3 + 2] = arr[i * 3 + 2];
    }
    return out;
}

function exportPly() {
    if (!geometry) return;
    const count = particleCount;
    const pos = currentPositions(count);
    downloadBlob(new Blob([buildPlyText(pos, count)], { type: 'text/plain' }), 'ether-resonance.ply');
    showNotification('PLY EXPORTED (' + count + ' VERTICES)');
}

function exportObj() {
    if (!geometry) return;
    const count = particleCount;
    const pos = currentPositions(count);
    downloadBlob(new Blob([buildObjText(pos, count)], { type: 'text/plain' }), 'ether-resonance.obj');
    showNotification('OBJ EXPORTED (' + count + ' VERTICES)');
}

function exportGlb() {
    if (!geometry) return;
    const count = particleCount;
    const pos = currentPositions(count);
    downloadBlob(new Blob([buildGlbBuffer(pos, count)], { type: 'model/gltf-binary' }), 'ether-resonance.glb');
    showNotification('GLB EXPORTED (' + count + ' VERTICES)');
}

// ============================================
// UPLOADS
// ============================================
function uploadFile(type) {
    if (type === 'video') {
        showNotification('VIDEO UPLOAD: USE AUDIO TRACK INSTEAD');
        return;
    }
    const accept = type === '3d' ? '.obj,.glb,.gltf,.ply' : type === 'audio' ? 'audio/*' : 'image/*';
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = e => {
        const file = e.target.files[0];
        if (file) handleUpload(type, file);
    };
    input.click();
}

function loadImageFile(file) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => { resolve(img); URL.revokeObjectURL(url); };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad image')); };
        img.src = url;
    });
}

async function handleUpload(type, file) {
    if (type === 'audio') {
        try {
            audioEngine = new AudioEngine();
            await audioEngine.loadFile(file);
            setAudioStatus('TRACK: ' + file.name, 'on');
            document.getElementById('playback-row')?.classList.add('visible');
            updatePlaybackUI();
            showNotification('AUDIO TRACK LOADED');
        } catch (err) {
            audioEngine = null;
            setAudioStatus('TRACK ERROR');
            showNotification('AUDIO LOAD FAILED');
        }
        return;
    }
    if (type === 'image' || type === 'blueprint') {
        try {
            const img = await loadImageFile(file);
            const w = 320;
            const h = Math.max(1, Math.ceil(particleCount / w));
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(img, 0, 0, w, h);
            const data = ctx.getImageData(0, 0, w, h).data;
            setOffsetSource({ type: 'image', data: data, w: w, h: h });
            regenerateOffsets(particleCount);
            colorsDirty = true;
            updateParticles();
            showNotification('IMAGE APPLIED: ' + file.name);
        } catch (err) {
            showNotification('IMAGE LOAD FAILED');
        }
    } else if (type === '3d') {
        const url = URL.createObjectURL(file);
        const loader = new GLTFLoader();
        loader.load(url, gltf => {
            URL.revokeObjectURL(url);
            let src = null;
            gltf.scene.traverse(m => {
                if (m.isMesh && !src && m.geometry && m.geometry.attributes.position) {
                    src = new Float32Array(m.geometry.attributes.position.array);
                }
            });
            if (!src) {
                showNotification('NO GEOMETRY IN MODEL');
                return;
            }
            const n = src.length / 3;
            let minx = Infinity, miny = Infinity, minz = Infinity;
            let maxx = -Infinity, maxy = -Infinity, maxz = -Infinity;
            for (let i = 0; i < n; i++) {
                const x = src[i * 3], y = src[i * 3 + 1], z = src[i * 3 + 2];
                if (x < minx) minx = x; if (x > maxx) maxx = x;
                if (y < miny) miny = y; if (y > maxy) maxy = y;
                if (z < minz) minz = z; if (z > maxz) maxz = z;
            }
            const size = Math.max(maxx - minx, maxy - miny, maxz - minz) || 1;
            const scale = (formScale * 2) / size;
            setOffsetSource({
                type: 'model',
                data: src,
                scale: scale,
                cx: (minx + maxx) / 2 * scale,
                cy: (miny + maxy) / 2 * scale,
                cz: (minz + maxz) / 2 * scale
            });
            regenerateOffsets(particleCount);
            colorsDirty = true;
            updateParticles();
            showNotification('MODEL APPLIED: ' + file.name);
        }, undefined, err => {
            URL.revokeObjectURL(url);
            showNotification('MODEL LOAD FAILED');
        });
    }
}

// ============================================
// UI FUNCTIONS
// ============================================
function toggleHUD() {
    document.getElementById('hud').classList.toggle('hidden');
}

function toggleControls() {
    document.getElementById('controls').classList.toggle('hidden');
}

function initializeNeuralLink() {
    const calibScreen = document.getElementById('calibration');
    const linkStatus = document.getElementById('link-status');
    const calibStatus = document.getElementById('calibration-status');

    calibScreen.classList.add('active');
    let progress = 0;
    const interval = setInterval(() => {
        progress += 10;
        if (progress >= 100) {
            clearInterval(interval);
            calibScreen.classList.remove('active');
            linkStatus.textContent = 'ONLINE';
            linkStatus.style.color = '#0f8';
            calibStatus.style.display = 'block';
            showNotification('NEURAL LINK CALIBRATED!');
        }
    }, 300);
}

function toggleLiveUpdate() {
    liveUpdateEnabled = !liveUpdateEnabled;
    const btn = document.getElementById('btn-live-update');
    if (btn) {
        btn.textContent = liveUpdateEnabled ? '⚡ LIVE: ON' : '⚡ LIVE UPDATE';
        btn.style.background = liveUpdateEnabled ? 'rgba(0, 255, 100, 0.3)' : '';
    }
    showNotification(liveUpdateEnabled ? 'LIVE UPDATE ENABLED' : 'LIVE UPDATE DISABLED');
}

function togglePlayPause() {
    isPaused = !isPaused;
    const btn = document.getElementById('btn-play-pause');
    if (btn) btn.textContent = isPaused ? '▶️ Play' : '⏸️ Pause';
    showNotification(isPaused ? 'PAUSED' : 'RESUMED');
}

function copyPrompt() {
    const prompt = 'Ether Resonance: ' + currentShape + ', ' + particleCount + ' particles, ' + colorMode + ' mode, animation ' + colorAnimation;
    navigator.clipboard.writeText(prompt).then(() => {
        showNotification('PROMPT COPIED!');
    });
}

function toggleGuide() {
    document.getElementById('guide').classList.toggle('hidden');
}

// ============================================
// FORM BUTTONS
// ============================================
function setForm(shape) {
    if (shape !== currentShape) {
        morphToShape(shape, 1.0);
    }
    document.getElementById('shape-select').value = shape;
    updateHudFormName();
}

// ============================================
// DRAWING PAD
// ============================================
function toggleDrawingPad() {
    const pad = document.getElementById('drawing-pad');
    const toggle = document.getElementById('drawing-pad-toggle');
    pad.classList.toggle('hidden');
    if (pad.classList.contains('hidden')) {
        drawingPad.setEnabled(false);
        toggle.textContent = '🎨';
        toggle.title = 'Show Drawing Pad';
    } else {
        drawingPad.setEnabled(true);
        toggle.textContent = '✖️';
        toggle.title = 'Hide Drawing Pad';
    }
}

function selectTool(tool) {
    drawingPad.setTool(tool);
    const penBtn = document.getElementById('btn-pen');
    const eraserBtn = document.getElementById('btn-eraser');
    if (tool === 'eraser') {
        penBtn.classList.remove('active');
        eraserBtn.classList.add('active');
    } else {
        eraserBtn.classList.remove('active');
        penBtn.classList.add('active');
    }
}

// ============================================
// NOTIFICATIONS
// ============================================
function showNotification(message) {
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => {
        notification.remove();
    }, 2200);
}

// ============================================
// ANIMATION LOOP
// ============================================
const trailClearColor = new THREE.Color(0x000005);

function animate() {
    requestAnimationFrame(animate);

    const now = performance.now();
    const dt = Math.min((now - lastFrameTime) / 1000, 0.05);
    dtLast = dt;
    lastFrameTime = now;

    // FPS + adaptive bloom
    frameCount++;
    if (now - lastFpsTime >= 1000) {
        fps = frameCount;
        frameCount = 0;
        lastFpsTime = now;
        const fpsEl = document.getElementById('fps-display');
        if (fpsEl) fpsEl.textContent = fps;
        if (now - lastQualityAdjustTime >= 3000 && typeof window.adjustBloomQuality === 'function') {
            window.adjustBloomQuality(fps);
            lastQualityAdjustTime = now;
        }
    }

    if (!isPaused) {
        time += simSpeed * 0.01;
    }

    // Audio reactivity (always sample; modulates shader + shapes)
    applyAudioFrame();

    // God Mode auto-director
    if (godModeActive) godDirect();

    // Pulsar: breathing displacement on the live drawing mask
    if (drawingPad && drawingPad.pulsar && getOffsetSource()) {
        const breathe = 0.6 + 0.4 * Math.sin(time * 2.2);
        regenerateOffsets(particleCount, breathe);
    }

    // Particle field
    if (geometry && geometry.attributes && geometry.attributes.position) {
        if (isMorphing) {
            advanceMorph(dt);
        } else if (!isPaused) {
            updateParticles();
        }
    }

    // Shader time
    updateParticleMaterial(material, { time });

    // Orb: living core, pulses with the beat
    if (orbMesh && orbMaterial) {
        const level = audioEngine && audioEngine.active ? audioEngine.getFrame().level : 0;
        const beatPulse = audioEngine && audioEngine.active && audioEngine.getFrame().beat ? 1 : 0;
        updateOrbMaterial(orbMaterial, { time, pulse: beatPulse + level * 0.5 });
        orbMesh.rotation.y = time * 0.2;
    }

    // Starfield slow drift
    if (starfield) {
        starfield.rotation.y = time * 0.005;
        starfield.rotation.x = Math.sin(time * 0.003) * 0.05;
    }

    // Chromatic aberration breathes with music
    if (rgbShiftPass && rgbShiftPass.enabled) {
        const lvl = audioEngine && audioEngine.active ? audioEngine.getFrame().level : 0;
        rgbShiftPass.uniforms.uAmount.value = 0.0015 + lvl * 0.004;
    }

    // Smooth glide to camera preset
    if (camera && camTarget) {
        camera.position.lerp(camTarget, 0.04);
        if (camera.position.distanceTo(camTarget) < 2) camTarget = null;
    }

    // Smooth zoom toward target distance
    if (camera) {
        const dist = camera.position.length();
        if (Math.abs(dist - targetZoomDistance) > 0.1) {
            camera.position.setLength(THREE.MathUtils.lerp(dist, targetZoomDistance, 0.08));
        }
    }

    // Controls
    if (controls) {
        controls.update();
        const camEl = document.getElementById('camera-info');
        if (camEl) camEl.textContent = controls.autoRotate ? 'AUTO' : 'MANUAL';
    }

    // Render (trail via semi-transparent clear)
    if (trailEnabled) {
        renderer.autoClear = false;
        renderer.setClearColor(trailClearColor, 0.2);
        renderer.clear();
        composer.render();
    } else {
        renderer.autoClear = true;
        composer.render();
    }
}

// ============================================
// LOADING HELPER
// ============================================
function updateLoading(percent, status) {
    const bar = document.getElementById('load-progress');
    const text = document.getElementById('load-status');
    if (bar) bar.style.width = percent + '%';
    if (text) text.textContent = status;
}

// ============================================
// GLOBAL EXPORTS (inline onclick handlers)
// ============================================
window.savePreset = savePreset;
window.loadPreset = loadPreset;
window.randomize = randomize;
window.reset = reset;
window.toggleFullscreen = toggleFullscreen;
window.toggleHUD = toggleHUD;
window.toggleControls = toggleControls;
window.togglePlayPause = togglePlayPause;
window.toggleDrawingPad = toggleDrawingPad;
window.showNotification = showNotification;
window.exportCode = exportCode;
window.uploadFile = uploadFile;

// ============================================
// FULLSCREEN
// ============================================
function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => showNotification('FULLSCREEN DENIED'));
    } else {
        document.exitFullscreen();
    }
}

// ============================================
// START
// ============================================
init();