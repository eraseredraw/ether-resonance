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
    writePositionsToArray, writePhotoPositionsToArray, writeShapePosition,
    buildPhotoSource,
    setMouseState, setMouseMode, triggerWave
} from './shapes.js';
import {
    setColorState, setHueOffsetMod, setColorTime,
    writeColorsToArray, writeParticleColor
} from './colors.js';
import { AudioEngine } from './audio.js';
import {
    createParticleMaterial, updateParticleMaterial,
    createRGBShiftPass, createStarfield
} from './shaders.js';
import { DrawingPad } from './drawing.js';
import {
    downloadBlob, buildPlyText, buildObjText, buildGlbBuffer,
    generateExportCode, exportImage, exportVideo
} from './exporters.js';
import {
    S,
    MAX_PARTICLES,
    DEFAULT_CONFIG,
    CLOUD_SHAPES,
    easeInOutCubic,
    collectConfig
} from './state.js';

window.THREE = THREE;

// ============================================
// GLOBAL STATE
// ============================================
let scene, camera, renderer, controls;
let particleSystem, geometry, material;
let composer, bloomPass;
let positions, colors;

// Particle field state
let lastFrameTime = performance.now();

// FPS
let frameCount = 0;
let lastFpsTime = performance.now();
let fps = 0;
let lastQualityAdjustTime = 0;

// Audio
let audioEngine = null;

// Morph state
let morphStart = null;
let morphTarget = null;

// Photo mode: layout source built on upload, plus the offset source to
// restore when photo mode is switched back off.
let photoSource = null;
let prePhotoSource = null;

// Color recompute flag (colors only change on user input)

// Drawing pad
let drawingPad = null;

// Scene extras
let starfield = null;
let rgbShiftPass = null;

// Camera preset target (smooth glide)
let camTarget = null;

// Pointer interaction
const pointerWorld = new THREE.Vector3(0, 0, 0);
const pointerRaycaster = new THREE.Raycaster();
const pointerPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);


const boundSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 650);

// Sync state into modules (audio modulation lives there too)
function syncShapeState() {
    setShapeState({ currentShape: S.currentShape, formScale: S.formScale, formRotationSpeed: S.formRotationSpeed, formChaos: S.formChaos });
}

function syncColorState() {
    setColorState({ colorMode: S.colorMode, hueOffset: S.hueOffset, colorSaturation: S.colorSaturation, colorAnimation: S.colorAnimation });
}

// True only when photo mode is on AND the active offset source is a photo
// layout — the exact condition that switches the render path over.
function isPhotoActive() {
    const src = getOffsetSource();
    return !!(S.photoMode && src && src.type === 'photo');
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
            S.autoRotate = false;
            S.twinkleEnabled = false;
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
        controls.autoRotate = S.autoRotate;
        controls.autoRotateSpeed = S.rotateSpeed;
        controls.minDistance = 10;
        controls.maxDistance = 2000;
        controls.touches = {
            ONE: THREE.TOUCH.ROTATE,
            TWO: THREE.TOUCH.DOLLY_PAN
        };

        updateLoading(30, 'Creating particles...');
        rebuildParticles();

        updateLoading(60, 'Sowing the stars...');
        createStarfieldInScene();

        updateLoading(70, 'Setting up post-processing...');
        setupPostProcessing();

        updateLoading(90, 'Finalizing...');
        setupEventListeners();
        setupDragAndDrop();

        S.targetZoomDistance = camera.position.length();
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
        // Sync the slider/label to the budget actually chosen above — the
        // markup ships value="40000" and would otherwise lie on phones.
        const pcSlider = document.getElementById('particle-count-slider');
        if (pcSlider) {
            pcSlider.value = String(S.particleCount);
            const lbl = document.getElementById('particle-count-value');
            if (lbl) lbl.textContent = (S.particleCount / 1000) + 'K';
        }

        S.isInitialized = true;
        setLoopRunning(true);
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
    geometry.setDrawRange(0, S.particleCount);

    material = createParticleMaterial({ size: S.particleSize });
    updateParticleMaterial(material, { pixelRatio: renderer ? renderer.getPixelRatio() : 1 });

    particleSystem = new THREE.Points(geometry, material);
    scene.add(particleSystem);

    syncShapeState();
    syncColorState();
    regenerateOffsets(S.particleCount);
    if (isPhotoActive()) {
        // Photo mode: one pass writes positions and pixel colours.
        writePhotoPositionsToArray(positions, colors, S.particleCount, S.time);
    } else {
        writePositionsToArray(positions, S.particleCount, S.time);
        writeColorsToArray(colors, S.particleCount, S.time);
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
    boundSphere.radius = S.formScale * 4 + 50;
    geometry.boundingSphere = boundSphere;
    S.colorsDirty = false;
    S.isMorphing = false;
}

function updateParticles() {
    if (!S.isInitialized || !geometry || !geometry.attributes || !geometry.attributes.position) return;
    if (S.particleCount <= 0 || S.particleCount > MAX_PARTICLES) return;

    const posAttr = geometry.attributes.position;
    const colAttr = geometry.attributes.color;

    syncShapeState();
    setColorTime(S.time);
    if (isPhotoActive()) {
        // Photo mode: particles spell the image. Colours ride along only when
        // dirty (source swap / user tweak) — the layout is static, so pushing
        // count RGB triples every frame would be pure waste. Same buffer, same
        // needsUpdate dance as the palette path below.
        const colArr = S.colorsDirty ? colAttr.array : null;
        writePhotoPositionsToArray(posAttr.array, colArr, S.particleCount, S.time);
        posAttr.needsUpdate = true;
        if (colArr) {
            colAttr.needsUpdate = true;
            S.colorsDirty = false;
        }
    } else {
        writePositionsToArray(posAttr.array, S.particleCount, S.time);
        posAttr.needsUpdate = true;

        if (S.colorsDirty) {
            writeColorsToArray(colAttr.array, S.particleCount, S.time);
            colAttr.needsUpdate = true;
            S.colorsDirty = false;
        }
    }

    geometry.setDrawRange(0, S.particleCount);

    // Fixed bounding sphere (radius covers shape + offsets + chaos worst case)
    boundSphere.radius = S.formScale * 4 + 50;
    geometry.boundingSphere = boundSphere;
}

// ============================================
// MORPHING
// ============================================
function morphToShape(targetShape, duration = 1.0) {
    if (!geometry || !geometry.attributes.position) return;
    if (targetShape === S.currentShape) {
        S.isMorphing = false;
        morphStart = null;
        morphTarget = null;
        updateParticles();
        return;
    }
    const posArr = geometry.attributes.position.array;
    morphStart = new Float32Array(posArr.subarray(0, S.particleCount * 3));
    morphTarget = new Float32Array(S.particleCount * 3);
    S.morphTargetShape = targetShape;
    S.morphDuration = duration;
    S.morphProgress = 0;
    S.isMorphing = true;
}

function advanceMorph(dt) {
    const posArr = geometry.attributes.position.array;

    // Live target: recompute with current S.time so there is no jump on completion
    syncShapeState();
    if (isPhotoActive()) {
        // Morph lands on the photo layout instead of a parametric shape.
        writePhotoPositionsToArray(morphTarget, null, S.particleCount, S.time);
    } else {
        writePositionsToArray(morphTarget, S.particleCount, S.time);
    }

    S.morphProgress = Math.min(S.morphProgress + dt / S.morphDuration, 1);
    const eased = easeInOutCubic(S.morphProgress);

    // Chaotic reassembly: particles scatter with per-particle hash jitter
    // that shrinks to zero as the morph lands on the target shape.
    const jitter = S.formScale * 1.1 * Math.pow(1 - eased, 1.5);

    for (let i = 0; i < S.particleCount; i++) {
        const o = i * 3;
        const hx = Math.sin(i * 12.9898) * 43758.5453 % 1 - 0.5;
        const hy = Math.sin(i * 78.233 + 1) * 43758.5453 % 1 - 0.5;
        const hz = Math.sin(i * 45.164 + 2) * 43758.5453 % 1 - 0.5;
        posArr[o] = morphStart[o] + (morphTarget[o] - morphStart[o]) * eased + hx * jitter * 2;
        posArr[o + 1] = morphStart[o + 1] + (morphTarget[o + 1] - morphStart[o + 1]) * eased + hy * jitter * 2;
        posArr[o + 2] = morphStart[o + 2] + (morphTarget[o + 2] - morphStart[o + 2]) * eased + hz * jitter * 2;
    }
    geometry.attributes.position.needsUpdate = true;

    if (S.colorsDirty) {
        setColorTime(S.time);
        writeColorsToArray(geometry.attributes.color.array, S.particleCount, S.time);
        geometry.attributes.color.needsUpdate = true;
        S.colorsDirty = false;
    }

    if (S.morphProgress >= 1) {
        S.currentShape = S.morphTargetShape;
        S.isMorphing = false;
        morphStart = null;
        morphTarget = null;
    }
}

// ============================================
// SCENE EXTRAS (starfield, RGB shift)
// ============================================
function createStarfieldInScene() {
    starfield = createStarfield(1200, 1500);
    starfield.visible = S.starfieldEnabled;
    scene.add(starfield);
}

function setSceneToggle(name, enabled) {
    if (name === 'starfield') {
        S.starfieldEnabled = enabled;
        if (starfield) starfield.visible = enabled;
    } else if (name === 'aberration') {
        S.aberrationEnabled = enabled;
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
    S.targetZoomDistance = target.length();
    if (preset !== 'orbit' && controls) controls.autoRotate = false;
    else if (preset === 'orbit' && controls) controls.autoRotate = S.autoRotate;
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
        S.bloomIntensity,
        0.4,
        0.85
    );
    composer.addPass(bloomPass);

    rgbShiftPass = createRGBShiftPass(0.0025);
    rgbShiftPass.enabled = S.aberrationEnabled;
    composer.addPass(rgbShiftPass);

    window.adjustBloomQuality = function (fps) {
        if (fps < 30) {
            bloomPass.strength = Math.max(0.5, S.bloomIntensity * 0.5);
            bloomPass.resolution.set(
                Math.floor(window.innerWidth / 4),
                Math.floor(window.innerHeight / 4)
            );
        } else if (fps < 55) {
            bloomPass.strength = S.bloomIntensity;
            bloomPass.resolution.set(
                Math.floor(window.innerWidth / 2),
                Math.floor(window.innerHeight / 2)
            );
        } else {
            bloomPass.strength = S.bloomIntensity;
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
        if (newCount !== S.particleCount) {
            S.particleCount = newCount;
            rebuildParticles();
        }
        document.getElementById('particle-count-value').textContent =
            (S.particleCount / 1000).toFixed(0) + 'K';
        document.getElementById('particle-count').textContent = S.particleCount.toLocaleString();
    });

    document.getElementById('particle-size').addEventListener('input', e => {
        S.particleSize = parseFloat(e.target.value);
        updateParticleMaterial(material, { size: S.particleSize });
        document.getElementById('particle-size-value').textContent = e.target.value;
    });

    document.getElementById('sim-speed').addEventListener('input', e => {
        S.simSpeed = parseFloat(e.target.value);
        document.getElementById('sim-speed-value').textContent = e.target.value;
    });

    document.getElementById('bloom-toggle').addEventListener('change', e => {
        S.bloomEnabled = e.target.checked;
        if (bloomPass) bloomPass.enabled = S.bloomEnabled;
    });

    document.getElementById('bloom-intensity').addEventListener('input', e => {
        S.bloomIntensity = parseFloat(e.target.value);
        if (bloomPass) bloomPass.strength = S.bloomIntensity;
        document.getElementById('bloom-intensity-value').textContent = e.target.value;
    });

    document.getElementById('trail-toggle').addEventListener('change', e => {
        S.trailEnabled = e.target.checked;
    });

    // --- Form ---
    document.getElementById('shape-select').addEventListener('change', e => {
        morphToShape(e.target.value, 1.0);
        updateHudFormName();
    });

    document.getElementById('form-scale').addEventListener('input', e => {
        S.formScale = parseInt(e.target.value);
        document.getElementById('form-scale-value').textContent = e.target.value;
    });

    document.getElementById('form-rotation').addEventListener('input', e => {
        S.formRotationSpeed = parseFloat(e.target.value);
        document.getElementById('form-rotation-value').textContent = e.target.value;
    });

    document.getElementById('form-chaos').addEventListener('input', e => {
        S.formChaos = parseInt(e.target.value);
        document.getElementById('form-chaos-value').textContent = e.target.value;
    });

    // --- Color ---
    document.getElementById('color-mode').addEventListener('change', e => {
        S.colorMode = e.target.value;
        S.colorsDirty = true;
        updateParticles();
    });

    document.getElementById('hue-offset').addEventListener('input', e => {
        S.hueOffset = parseInt(e.target.value);
        document.getElementById('hue-offset-value').textContent = e.target.value + '°';
        S.colorsDirty = true;
        updateParticles();
    });

    document.getElementById('anim-select').addEventListener('change', e => {
        S.colorAnimation = e.target.value;
        S.colorsDirty = true;
        updateParticles();
    });

    // --- Audio ---
    document.getElementById('btn-audio-mic')?.addEventListener('click', startMic);
    document.getElementById('btn-audio-system')?.addEventListener('click', startSystemAudio);
    document.getElementById('btn-audio-file')?.addEventListener('click', loadAudioTrack);
    document.getElementById('btn-audio-stop')?.addEventListener('click', stopAudio);

    document.getElementById('audio-intensity')?.addEventListener('input', e => {
        S.audioIntensity = parseFloat(e.target.value);
        document.getElementById('audio-intensity-value').textContent = S.audioIntensity.toFixed(2);
    });

    document.getElementById('twinkle-toggle')?.addEventListener('change', e => {
        S.twinkleEnabled = e.target.checked;
        updateParticleMaterial(material, { twinkle: S.twinkleEnabled });
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
        S.rotateSpeed = parseFloat(e.target.value);
        document.getElementById('rotate-speed-value').textContent = e.target.value;
        if (controls) controls.autoRotateSpeed = S.rotateSpeed;
    });

    document.getElementById('auto-rotate').addEventListener('change', e => {
        S.autoRotate = e.target.checked;
        if (controls) controls.autoRotate = S.autoRotate;
    });

    // --- Camera presets ---
    document.getElementById('btn-cam-front')?.addEventListener('click', () => setCameraPreset('front'));
    document.getElementById('btn-cam-top')?.addEventListener('click', () => setCameraPreset('top'));
    document.getElementById('btn-cam-orbit')?.addEventListener('click', () => setCameraPreset('orbit'));

    // --- Scene toggles ---
    document.getElementById('starfield-toggle')?.addEventListener('change', e => setSceneToggle('starfield', e.target.checked));
    document.getElementById('aberration-toggle')?.addEventListener('change', e => setSceneToggle('aberration', e.target.checked));

    // --- Pointer FX (magnet/repulse/wave), off by default ---
    document.getElementById('pointerfx-toggle')?.addEventListener('change', e => {
        S.pointerFxEnabled = e.target.checked;
        if (!S.pointerFxEnabled) setMouseState(-9999, -9999, 0);
    });

    // --- Pointer magnet (attract vs repulse) ---
    document.getElementById('magnet-toggle')?.addEventListener('change', e => {
        S.pointerMagnet = e.target.checked;
        setMouseMode(S.pointerMagnet ? 'attract' : 'repulse');
    });

    // --- Pointer interaction (repulse + click shockwave) ---
    renderer.domElement.addEventListener('pointermove', (e) => {
        if (!S.pointerFxEnabled) return;
        S.pointerActive = true;
        updatePointerWorld(e);
        setMouseState(pointerWorld.x, pointerWorld.y, 26);
    });
    renderer.domElement.addEventListener('pointerleave', () => {
        S.pointerActive = false;
        if (S.pointerFxEnabled) setMouseState(-9999, -9999, 0);
    });
    renderer.domElement.addEventListener('pointerdown', (e) => {
        if (!S.pointerFxEnabled) return;
        updatePointerWorld(e);
        triggerWave(pointerWorld.x, pointerWorld.y, S.time);
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
    document.getElementById('btn-photo')?.addEventListener('click', togglePhotoMode);

    // --- Drawing pad ---
    drawingPad = new DrawingPad(() => {
        setOffsetSource(drawingPad.toOffsetSource(S.particleCount));
        regenerateOffsets(S.particleCount);
        S.colorsDirty = true;
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
        S.targetZoomDistance = Math.max(10, Math.min(S.targetZoomDistance * factor, 2000));
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
            S.targetZoomDistance = Math.max(10, Math.min(S.targetZoomDistance + zoomDelta, 2000));
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
    S.godModeActive = !S.godModeActive;
    const btn = document.getElementById('btn-god-mode');
    if (btn) {
        btn.textContent = S.godModeActive ? '🤖 GOD: ON' : '🤖 God Mode';
        btn.classList.toggle('active', S.godModeActive);
    }
    showNotification(S.godModeActive ? 'GOD MODE ENABLED' : 'GOD MODE DISABLED');
}

function togglePhotoMode() {
    if (!S.photoMode && !photoSource) {
        showNotification('PHOTO MODE: UPLOAD AN IMAGE FIRST');
        return;
    }
    S.photoMode = !S.photoMode;
    const btn = document.getElementById('btn-photo');
    if (btn) {
        btn.textContent = S.photoMode ? '📸 PHOTO: ON' : '📸 Photo Mode';
        btn.classList.toggle('active', S.photoMode);
    }
    if (S.photoMode) {
        prePhotoSource = getOffsetSource();
        setOffsetSource(photoSource);
    } else {
        setOffsetSource(prePhotoSource);
        prePhotoSource = null;
    }
    regenerateOffsets(S.particleCount);
    S.colorsDirty = true;
    updateParticles();
    showNotification(S.photoMode ? 'PHOTO MODE ENABLED' : 'PHOTO MODE OFF');
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
        S.audioIntensity += (target - S.audioIntensity) * 0.02;
        document.getElementById('audio-intensity').value = S.audioIntensity;
        document.getElementById('audio-intensity-value').textContent = S.audioIntensity.toFixed(2);
    }

    // Mood switches
    if (now - S.lastGodDecision > 7000) {
        S.lastGodDecision = now;
        let mood;
        if (f.bass > 0.3) mood = 'vortex';
        else if (f.treble > 0.3) mood = 'helix';
        else if (f.level > 0.45) mood = 'torus';
        else mood = SHAPES[Math.floor(Math.random() * SHAPES.length)];
        if (mood !== S.currentShape && !S.isMorphing) {
            morphToShape(mood, 2.5);
            updateHudFormName();
        }
        if (f.beat) S.formChaos = Math.floor(Math.random() * 30);
    }

    // Color mood shifts slower
    if (now - S.lastGodColorSwitch > 14000) {
        S.lastGodColorSwitch = now;
        const modes = ['rainbow', 'plasma', 'ocean', 'fire', 'ice', 'neon', 'gold'];
        S.colorMode = modes[Math.floor(Math.random() * modes.length)];
        S.colorsDirty = true;
    }
}

// Called every frame from animate()
function applyAudioFrame() {
    if (!audioEngine || !audioEngine.active) return;
    const f = audioEngine.update(dtLast);
    if (!f) return;

    const k = S.audioIntensity;
    // bass → scale swell, mid → rotation, treble → hue drift
    setFormScaleMod(1 + f.bass * k * 0.9);
    setFormRotationSpeedMod(1 + f.mid * k * 1.2);
    setHueOffsetMod(f.treble * k * 60);

    // beat → bloom flash
    const target = S.bloomIntensity * (1 + (f.beat ? 0.7 : 0) + f.bass * k * 0.4);
    if (bloomPass) {
        bloomPass.strength += (target - bloomPass.strength) * 0.2;
    }
    updateParticleMaterial(material, { intensity: 0.85 + f.level * k * 0.6, time: S.time });

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
    S.targetZoomDistance = camera.position.length();
    camTarget = null;
    controls.update();
    showNotification('CAMERA RESET');
}

function setAspectRatio(ratio) {
    if (ratio === 'custom') {
        S.activeAspect = null;
        applyAspect();
        showNotification('FULL WINDOW');
        return;
    }
    const [w, h] = ratio.split(':').map(Number);
    S.activeAspect = w / h;
    applyAspect();
    showNotification(`ASPECT RATIO: ${ratio}`);
}

function applyAspect() {
    const cw = window.innerWidth;
    const ch = window.innerHeight;
    let w = cw;
    let h = ch;
    if (S.activeAspect) {
        if (cw / ch > S.activeAspect) {
            w = Math.floor(ch * S.activeAspect);
        } else {
            h = Math.floor(cw / S.activeAspect);
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
        name.textContent = opt ? opt.text : S.currentShape;
    }
}

function updateUIFromState() {
    document.getElementById('particle-count-slider').value = S.particleCount;
    document.getElementById('particle-count-value').textContent = (S.particleCount / 1000).toFixed(0) + 'K';
    document.getElementById('particle-count').textContent = S.particleCount.toLocaleString();
    document.getElementById('particle-size').value = S.particleSize;
    document.getElementById('particle-size-value').textContent = S.particleSize.toFixed(1);
    document.getElementById('sim-speed').value = S.simSpeed;
    document.getElementById('sim-speed-value').textContent = S.simSpeed.toFixed(2);
    document.getElementById('shape-select').value = S.currentShape;
    document.getElementById('form-scale').value = S.formScale;
    document.getElementById('form-scale-value').textContent = S.formScale.toFixed(0);
    document.getElementById('form-rotation').value = S.formRotationSpeed;
    document.getElementById('form-rotation-value').textContent = S.formRotationSpeed.toFixed(2);
    document.getElementById('form-chaos').value = S.formChaos;
    document.getElementById('form-chaos-value').textContent = S.formChaos;
    document.getElementById('color-mode').value = S.colorMode;
    document.getElementById('hue-offset').value = S.hueOffset;
    document.getElementById('hue-offset-value').textContent = S.hueOffset + '°';
    document.getElementById('anim-select').value = S.colorAnimation;
    document.getElementById('bloom-toggle').checked = S.bloomEnabled;
    document.getElementById('bloom-intensity').value = S.bloomIntensity;
    document.getElementById('bloom-intensity-value').textContent = S.bloomIntensity.toFixed(1);
    document.getElementById('trail-toggle').checked = S.trailEnabled;
    document.getElementById('rotate-speed').value = S.rotateSpeed;
    document.getElementById('rotate-speed-value').textContent = S.rotateSpeed.toFixed(1);
    document.getElementById('auto-rotate').checked = S.autoRotate;
    document.getElementById('twinkle-toggle').checked = S.twinkleEnabled;
    document.getElementById('starfield-toggle').checked = S.starfieldEnabled;
    document.getElementById('aberration-toggle').checked = S.aberrationEnabled;
    document.getElementById('pointerfx-toggle').checked = S.pointerFxEnabled;
    updateHudFormName();
}

// ============================================
// CONFIG (presets, URL, cloud)
// ============================================
function applyConfig(cfg) {
    if (!cfg) return;
    let countChanged = false;
    if (typeof cfg.particleCount === 'number' && cfg.particleCount !== S.particleCount) {
        S.particleCount = Math.min(MAX_PARTICLES, Math.max(1000, cfg.particleCount));
        countChanged = true;
    }
    if (cfg.shape) S.currentShape = cfg.shape;
    if (typeof cfg.formScale === 'number') S.formScale = cfg.formScale;
    if (typeof cfg.formRotationSpeed === 'number') S.formRotationSpeed = cfg.formRotationSpeed;
    if (typeof cfg.formChaos === 'number') S.formChaos = cfg.formChaos;
    if (cfg.colorMode) S.colorMode = cfg.colorMode;
    if (typeof cfg.hueOffset === 'number') S.hueOffset = cfg.hueOffset;
    if (cfg.colorAnimation) S.colorAnimation = cfg.colorAnimation;
    if (typeof cfg.bloomEnabled === 'boolean') S.bloomEnabled = cfg.bloomEnabled;
    if (typeof cfg.bloomIntensity === 'number') S.bloomIntensity = cfg.bloomIntensity;
    if (typeof cfg.trailEnabled === 'boolean') S.trailEnabled = cfg.trailEnabled;
    if (typeof cfg.particleSize === 'number') S.particleSize = cfg.particleSize;
    if (typeof cfg.simSpeed === 'number') S.simSpeed = cfg.simSpeed;
    if (typeof cfg.autoRotate === 'boolean') S.autoRotate = cfg.autoRotate;
    if (typeof cfg.rotateSpeed === 'number') S.rotateSpeed = cfg.rotateSpeed;
    if (typeof cfg.twinkleEnabled === 'boolean') S.twinkleEnabled = cfg.twinkleEnabled;
    if (typeof cfg.starfieldEnabled === 'boolean') S.starfieldEnabled = cfg.starfieldEnabled;
    if (typeof cfg.aberrationEnabled === 'boolean') S.aberrationEnabled = cfg.aberrationEnabled;
    if (typeof cfg.pointerFxEnabled === 'boolean') S.pointerFxEnabled = cfg.pointerFxEnabled;

    updateParticleMaterial(material, { size: S.particleSize, twinkle: S.twinkleEnabled });
    if (bloomPass) bloomPass.strength = S.bloomIntensity;
    if (rgbShiftPass) rgbShiftPass.enabled = S.aberrationEnabled;
    if (starfield) starfield.visible = S.starfieldEnabled;
    if (!S.pointerFxEnabled) setMouseState(-9999, -9999, 0);
    if (controls) {
        controls.autoRotate = S.autoRotate;
        controls.autoRotateSpeed = S.rotateSpeed;
    }

    if (countChanged) {
        rebuildParticles();
    } else {
        S.isMorphing = false;
        morphStart = null;
        morphTarget = null;
        S.colorsDirty = true;
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

function loadCloudShape() {
    const preset = CLOUD_SHAPES[Math.floor(Math.random() * CLOUD_SHAPES.length)];
    const cfg = Object.assign({}, collectConfig(), preset);
    if (cfg.shape !== S.currentShape) {
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
    if (newShape !== S.currentShape) {
        morphToShape(newShape, 1.0);
    }
    S.formScale = 100 + Math.random() * 150;
    S.formChaos = Math.floor(Math.random() * 50);
    S.hueOffset = Math.floor(Math.random() * 360);
    S.colorMode = ['rainbow', 'hue', 'plasma', 'ocean', 'fire', 'ice', 'cyan', 'gold', 'neon', 'white'][Math.floor(Math.random() * 10)];
    S.colorAnimation = ['static', 'scroll', 'wave', 'pulse'][Math.floor(Math.random() * 4)];
    S.colorsDirty = true;
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
    const n = Math.min(count, S.particleCount);
    for (let i = 0; i < n; i++) {
        out[i * 3] = arr[i * 3];
        out[i * 3 + 1] = arr[i * 3 + 1];
        out[i * 3 + 2] = arr[i * 3 + 2];
    }
    return out;
}

function exportPly() {
    if (!geometry) return;
    const count = S.particleCount;
    const pos = currentPositions(count);
    downloadBlob(new Blob([buildPlyText(pos, count)], { type: 'text/plain' }), 'ether-resonance.ply');
    showNotification('PLY EXPORTED (' + count + ' VERTICES)');
}

function exportObj() {
    if (!geometry) return;
    const count = S.particleCount;
    const pos = currentPositions(count);
    downloadBlob(new Blob([buildObjText(pos, count)], { type: 'text/plain' }), 'ether-resonance.obj');
    showNotification('OBJ EXPORTED (' + count + ' VERTICES)');
}

function exportGlb() {
    if (!geometry) return;
    const count = S.particleCount;
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

// ============================================
// PHOTO SOURCE SAMPLING
// ============================================
// Grid that fits the particle budget while keeping the image aspect:
//   w = floor(sqrt(count * aspect)),  h = floor(count / w)  →  w * h <= count
// (one shrink step guards float rounding). All DOM/canvas work lives here in
// main.js; the pure buildPhotoSource seam in shapes.js stays frame-source
// agnostic so a live camera path can feed it a canvas grab every frame.
function buildPhotoSourceFromImage(img, count) {
    const iw = img.naturalWidth || img.width || 1;
    const ih = img.naturalHeight || img.height || 1;
    const aspect = iw / ih;
    let w = Math.max(1, Math.floor(Math.sqrt(count * aspect)));
    let h = Math.max(1, Math.floor(count / w));
    while (w > 1 && w * h > count) {
        w--;
        h = Math.max(1, Math.floor(count / w));
    }
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    return buildPhotoSource(ctx.getImageData(0, 0, w, h), w, h);
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
            const h = Math.max(1, Math.ceil(S.particleCount / w));
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(img, 0, 0, w, h);
            const data = ctx.getImageData(0, 0, w, h).data;
            setOffsetSource({ type: 'image', data: data, w: w, h: h });
            // Photo-mode source from the SAME decoded image: resampled onto a
            // grid derived from the particle budget (w * h <= particleCount).
            photoSource = buildPhotoSourceFromImage(img, S.particleCount);
            if (S.photoMode && photoSource) {
                prePhotoSource = getOffsetSource();
                setOffsetSource(photoSource);
            }
            regenerateOffsets(S.particleCount);
            S.colorsDirty = true;
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
            const scale = (S.formScale * 2) / size;
            setOffsetSource({
                type: 'model',
                data: src,
                scale: scale,
                cx: (minx + maxx) / 2 * scale,
                cy: (miny + maxy) / 2 * scale,
                cz: (minz + maxz) / 2 * scale
            });
            regenerateOffsets(S.particleCount);
            S.colorsDirty = true;
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
    S.liveUpdateEnabled = !S.liveUpdateEnabled;
    const btn = document.getElementById('btn-live-update');
    if (btn) {
        btn.textContent = S.liveUpdateEnabled ? '⚡ LIVE: ON' : '⚡ LIVE UPDATE';
        btn.style.background = S.liveUpdateEnabled ? 'rgba(0, 255, 100, 0.3)' : '';
    }
    showNotification(S.liveUpdateEnabled ? 'LIVE UPDATE ENABLED' : 'LIVE UPDATE DISABLED');
}

function togglePlayPause() {
    S.isPaused = !S.isPaused;
    const btn = document.getElementById('btn-play-pause');
    if (btn) btn.textContent = S.isPaused ? '▶️ Play' : '⏸️ Pause';
    showNotification(S.isPaused ? 'PAUSED' : 'RESUMED');
}

function copyPrompt() {
    const prompt = 'Ether Resonance: ' + S.currentShape + ', ' + S.particleCount + ' particles, ' + S.colorMode + ' mode, animation ' + S.colorAnimation;
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
    if (shape !== S.currentShape) {
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

let rafId = 0;

function animate() {
    rafId = requestAnimationFrame(animate);

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

    if (!S.isPaused) {
        S.time += S.simSpeed * 0.01;
    }

    // Audio reactivity (always sample; modulates shader + shapes)
    applyAudioFrame();

    // God Mode auto-director
    if (S.godModeActive) godDirect();

    // Pulsar: breathing displacement on the live drawing mask
    if (drawingPad && drawingPad.pulsar && getOffsetSource()) {
        const breathe = 0.6 + 0.4 * Math.sin(S.time * 2.2);
        regenerateOffsets(S.particleCount, breathe);
    }

    // Particle field
    if (geometry && geometry.attributes && geometry.attributes.position) {
        if (S.isMorphing) {
            advanceMorph(dt);
        } else if (!S.isPaused) {
            updateParticles();
        }
    }

    // Shader S.time + beat pulse on particle size
    let beatPulse = 0;
    if (audioEngine && audioEngine.active) {
        const f = audioEngine.getFrame();
        beatPulse = Math.max(0, f.beat ? 1 : f.level * 0.5);
    }
    updateParticleMaterial(material, { time: S.time, beatPulse });

    // Starfield slow drift
    if (starfield) {
        starfield.rotation.y = S.time * 0.005;
        starfield.rotation.x = Math.sin(S.time * 0.003) * 0.05;
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
        if (Math.abs(dist - S.targetZoomDistance) > 0.1) {
            camera.position.setLength(THREE.MathUtils.lerp(dist, S.targetZoomDistance, 0.08));
        }
    }

    // Controls
    if (controls) {
        controls.update();
        const camEl = document.getElementById('camera-info');
        if (camEl) camEl.textContent = controls.autoRotate ? 'AUTO' : 'MANUAL';
    }

    // Render (trail via semi-transparent clear)
    if (S.trailEnabled) {
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
// VISIBILITY: stop burning GPU and battery in a hidden tab
// ============================================
// requestAnimationFrame is throttled in background tabs but it does not stop,
// so on a phone the WebGL context keeps the GPU awake and the audio analyser
// keeps sampling. Cancel the loop outright when the tab is hidden.
function setLoopRunning(run) {
    if (run && !rafId) {
        // Reset the clock: otherwise the first frame after a long sleep sees a
        // huge dt and jumps the simulation (it is clamped, but it still jumps).
        lastFrameTime = performance.now();
        rafId = requestAnimationFrame(animate);
    } else if (!run && rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
    }
}

document.addEventListener('visibilitychange', () => {
    const hidden = document.hidden;
    setLoopRunning(!hidden);
    // The render loop is the big cost, but an FFT at 60 Hz is not free either.
    // suspend() keeps the microphone grant; resume() is guarded by active, so a
    // hidden tab does not bring back audio the user had stopped.
    if (audioEngine) hidden ? audioEngine.suspend() : audioEngine.resume();
});
// pagehide fires on mobile when the app is swiped away or bfcached — the one
// place visibilitychange is unreliable.
window.addEventListener('pagehide', () => setLoopRunning(false));

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
window.togglePhotoMode = togglePhotoMode;
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