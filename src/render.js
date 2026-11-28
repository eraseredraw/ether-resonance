// ============================================
// ETHER RESONANCE — render.js
// Three.js side: scene, particles, post-processing, frame loop.
// ============================================
// Owns every THREE object, the audio/drawingPad instances and the frame loop.
// main.js is the composition root only: it installs uiHooks, calls the
// functions below in order, and keeps the window.* inline-handler globals.
// render.js touches no DOM element by id — everything user-facing goes
// through the uiHooks bag (see setUiHooks).
// ============================================
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
    createJoystick,
    update as updateJoystick,
    setJoystickVisible,
    disposeJoystick,
} from './joystick.js';

import {
    SHAPES,
    setShapeState,
    setFormScaleMod, setFormRotationSpeedMod,
    setOffsetSource, getOffsetSource, regenerateOffsets,
    writePositionsToArray, writePhotoPositionsToArray,
    setMouseState, triggerWave
} from './shapes.js';
import {
    setColorState, setHueOffsetMod, setColorTime,
    writeColorsToArray
} from './colors.js';
import {
    createParticleMaterial, updateParticleMaterial,
    createRGBShiftPass, createStarfield, createAsciiPass, buildAsciiAtlas, buildPhraseAtlas, ASCII_SETS, mergeWordSets
} from './shaders.js';
import {
    S,
    MAX_PARTICLES,
    easeInOutCubic
} from './state.js';

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

// Drawing pad
let drawingPad = null;

// Scene extras
let starfield = null;
let rgbShiftPass = null;
let asciiPass = null;
let asciiSetIdx = 0;
let asciiPhraseTex = null;

// Camera preset target (smooth glide)
let camTarget = null;

// Pointer interaction
const pointerWorld = new THREE.Vector3(0, 0, 0);
const pointerRaycaster = new THREE.Raycaster();
const pointerPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);


const boundSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 650);

// dt consumed by applyAudioFrame (set by animate() each frame)
let dtLast = 0;

// Trail clear color (one reused instance, never recreated per frame)
const trailClearColor = new THREE.Color(0x000005);

// Frame-loop bookkeeping
let rafId = 0;

// Per-frame hook (e.g. live camera capture), called by animate() before the
// particle block once registered.
let frameHook = null;

// ============================================
// LIVE HANDLES
// ============================================
// Getters, never snapshots: rebuildParticles() swaps material/geometry/
// particleSystem at runtime, so consumers must read through these on every
// access. Never capture the returned object at module scope of another
// module — the getters are live, a destructured copy is not.
function getHandles() {
    return {
        get renderer() { return renderer; },
        get camera() { return camera; },
        get composer() { return composer; },
        get controls() { return controls; },
        get bloomPass() { return bloomPass; },
        get rgbShiftPass() { return rgbShiftPass; },
        get material() { return material; },
        get geometry() { return geometry; },
        get particleSystem() { return particleSystem; },
        get starfield() { return starfield; },
        get canvas() { return renderer ? renderer.domElement : null; },
        get audioEngine() { return audioEngine; },
        get drawingPad() { return drawingPad; },
        get pointerWorld() { return pointerWorld; }
    };
}

// ============================================
// UI HOOKS BRIDGE
// ============================================
// render.js owns no DOM lookups of its own: everything user-facing goes
// through this bag, installed by main.js at the top of init() from ui.js.
// No-op defaults so calls before wiring are safe.
const uiHooks = {
    webglError() {},
    setFps(_n) {},
    setCameraInfo(_s) {},
    setAudioMeter(_pct) {},
    setAudioIntensity(_v) {},
    updatePlaybackUI(_playing, _progress) {},
    updateHudFormName() {},
    notify(_msg) {}
};

function setUiHooks(h) {
    if (!h) return;
    for (const key of Object.keys(uiHooks)) {
        if (typeof h[key] === 'function') uiHooks[key] = h[key];
    }
}

function setFrameHook(fn) {
    frameHook = typeof fn === 'function' ? fn : null;
}

// Sync state into modules (audio modulation lives there too)
function syncShapeState() {
    setShapeState({
        currentShape: S.currentShape,
        formScale: S.formScale,
        formRotationSpeed: S.formRotationSpeed,
        formChaos: S.formChaos,
        moireLayers: S.moireLayers,
        moireTwist: S.moireTwistDeg * Math.PI / 180,
        moireGap: S.moireGap,
        formPitch: S.formPitch
    });
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
        uiHooks.webglError();
        throw new Error('WebGL unavailable: ' + err.message);
    }
}

function initScene() {
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

    // Virtual stick. It writes camera.position the same way a drag does, so it
    // composes with OrbitControls instead of replacing it; touching it cancels
    // an in-flight camera-preset glide, exactly like grabbing the canvas would.
    createJoystick({
        onInteract: () => { camTarget = null; },
    });
    setJoystickVisible(S.joystickEnabled);
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

    // The field now reflects S: a paused frame that was waiting on a knob
    // has caught up.
    S.formDirty = false;
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
    } else if (name === 'ascii') {
        S.asciiEnabled = enabled;
        if (asciiPass) asciiPass.enabled = enabled;
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
    uiHooks.notify('CAMERA: ' + preset.toUpperCase());
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

    // ASCII pass LAST — it renders glyphs over the fully processed frame
    asciiPass = createAsciiPass(buildAsciiAtlas(S.asciiSet));
    asciiSetIdx = ((S.asciiSet || 0) % ASCII_SETS.length + ASCII_SETS.length) % ASCII_SETS.length;
    const ph = buildPhraseAtlas(asciiSetIdx);
    asciiPass.uniforms.uPhrase.value = ph.tex;
    asciiPass.uniforms.uPhraseRows.value = ph.rows;
    asciiPass.uniforms.uPhraseChance.value = ph.chance;
    asciiPhraseTex = ph.tex;
    asciiPass.enabled = S.asciiEnabled;
    setAsciiScale(S.asciiScale || 1);
    setAsciiRate(S.asciiRate || 2);
    composer.addPass(asciiPass);
    renderer.getDrawingBufferSize(asciiPass.uniforms.uResolution.value);

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
// CANVAS / WINDOW LISTENERS
// ============================================
function attachCanvasListeners() {
    // Resize
    window.addEventListener('resize', () => {
        applyAspect();
    }, { passive: true });

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
// AUDIO REACTIVITY
// ============================================
// Auto-director: picks shapes/colors/intensity by audio character
function godDirect() {
    const f = audioEngine ? audioEngine.getFrame() : { level: 0, bass: 0, treble: 0 };
    const now = performance.now();

    // Intensity follows the track energy
    if (audioEngine) {
        const target = Math.max(0.5, Math.min(2, 0.7 + f.level * 1.4));
        S.audioIntensity += (target - S.audioIntensity) * 0.02;
        uiHooks.setAudioIntensity(S.audioIntensity);
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
            uiHooks.updateHudFormName();
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
    uiHooks.setAudioMeter(Math.min(100, f.level * 140));

    // Track progress scrubber
    if (audioEngine.mode === 'file') updatePlaybackUI();
}

// Reads the engine, hands the computed values to the DOM hook.
function updatePlaybackUI() {
    if (!audioEngine) return;
    uiHooks.updatePlaybackUI(audioEngine.isPlaying(), audioEngine.getProgress());
}

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
    uiHooks.notify('CAMERA RESET');
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
    if (asciiPass) renderer.getDrawingBufferSize(asciiPass.uniforms.uResolution.value);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.domElement.style.marginLeft = Math.max(0, Math.floor((cw - w) / 2)) + 'px';
    renderer.domElement.style.marginTop = Math.max(0, Math.floor((ch - h) / 2)) + 'px';
}

// ============================================
// INSTANCE BRIDGES + ONE-LINE SETTERS
// ============================================
function setAudioEngine(eng) {
    audioEngine = eng;
}

function getAudioEngine() {
    return audioEngine;
}

function setDrawingPad(pad) {
    drawingPad = pad;
}

function getDrawingPad() {
    return drawingPad;
}

function setParticleSize(n) {
    S.particleSize = n;
    updateParticleMaterial(material, { size: S.particleSize });
}

// ASCII cell size in DEVICE pixels (the uResolution uniform is the drawing
// buffer, so DPR is already baked in). Base cell 18x22 keeps the monospace
// glyph aspect; the slider scales both axes together.
//
// Floor 0.3 = a 5.4x6.6 device-px cell. Below ~4px no amount of atlas
// resolution saves legibility — the glyph is fewer pixels than its own
// strokes — so the slider stops there and clamps presets/URL configs too,
// rather than letting a shared link render unreadable mush.
const ASCII_SCALE_MIN = 0.3;
const ASCII_SCALE_MAX = 3;

function setAsciiScale(v) {
    const s = Math.min(ASCII_SCALE_MAX, Math.max(ASCII_SCALE_MIN, v || 1));
    S.asciiScale = s;
    if (asciiPass) asciiPass.uniforms.uCell.value.set(18 * s, 22 * s);
}

// Switch the character set: rebuild the 10x4 atlas canvas (cheap, one-off)
// and swap the texture. Normalizes the index so presets from URL/cloud can
// carry any integer.
function setAsciiSet(i) {
    const idx = ((Math.round(i) % ASCII_SETS.length) + ASCII_SETS.length) % ASCII_SETS.length;
    S.asciiSet = idx;
    asciiSetIdx = idx;
    if (asciiPass) {
        const old = asciiPass.uniforms.uAtlas.value;
        asciiPass.uniforms.uAtlas.value = buildAsciiAtlas(idx);
        if (old && old.dispose) old.dispose();
        const oldPhrase = asciiPhraseTex;
        const ph = buildPhraseAtlas(idx);
        asciiPass.uniforms.uPhrase.value = ph.tex;
        asciiPass.uniforms.uPhraseRows.value = ph.rows;
        asciiPass.uniforms.uPhraseChance.value = ph.chance;
        asciiPhraseTex = ph.tex;
        if (oldPhrase && oldPhrase.dispose) oldPhrase.dispose();
    }
}

// Glyph flicker frequency in Hz (0 = frozen frame of characters).
function setAsciiRate(v) {
    S.asciiRate = v;
    if (asciiPass) asciiPass.uniforms.uFlipRate.value = v;
}

// Re-sync ASCII uniforms from S after a config load (presets, URL, cloud):
// rebuilds the atlas only when the set actually changed.
function syncAsciiFromState() {
    if (!asciiPass) return;
    setAsciiScale(S.asciiScale);
    if (asciiPass.uniforms.uFlipRate.value !== S.asciiRate) setAsciiRate(S.asciiRate);
    if (asciiSetIdx !== S.asciiSet) setAsciiSet(S.asciiSet);
}

function setTwinkle(b) {
    S.twinkleEnabled = b;
    updateParticleMaterial(material, { twinkle: S.twinkleEnabled });
}

function setBloomEnabled(b) {
    S.bloomEnabled = b;
    if (bloomPass) bloomPass.enabled = S.bloomEnabled;
}

function setBloomIntensity(n) {
    S.bloomIntensity = n;
    if (bloomPass) bloomPass.strength = S.bloomIntensity;
}

function setAutoRotate(b) {
    S.autoRotate = b;
    if (controls) controls.autoRotate = S.autoRotate;
}

function setRotateSpeed(n) {
    S.rotateSpeed = n;
    if (controls) controls.autoRotateSpeed = S.rotateSpeed;
}

function setJoystickEnabled(b) {
    S.joystickEnabled = !!b;
    setJoystickVisible(S.joystickEnabled);
}

function setJoystickSensitivity(n) {
    S.joystickSensitivity = Math.min(3, Math.max(0.2, n || 1));
}

function getRenderContext() {
    return { renderer, composer, camera };
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

// ============================================
// UPLOAD: 3D MODEL SOURCE
// ============================================
function loadModelOffsetSource(file, onApplied, onFailed) {
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
            onFailed('NO GEOMETRY IN MODEL');
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
        onApplied();
    }, undefined, err => {
        URL.revokeObjectURL(url);
        onFailed('MODEL LOAD FAILED');
    });
}

// ============================================
// CONFIG: RENDER PHASE (applyConfig phase 2)
// ============================================
function applyConfigRender(countChanged) {
    updateParticleMaterial(material, { size: S.particleSize, twinkle: S.twinkleEnabled });
    if (bloomPass) bloomPass.strength = S.bloomIntensity;
    if (rgbShiftPass) rgbShiftPass.enabled = S.aberrationEnabled;
    if (asciiPass) asciiPass.enabled = S.asciiEnabled;
    if (starfield) starfield.visible = S.starfieldEnabled;
    syncAsciiFromState();
    if (!S.pointerFxEnabled) setMouseState(-9999, -9999, 0);
    if (controls) {
        controls.autoRotate = S.autoRotate;
        controls.autoRotateSpeed = S.rotateSpeed;
    }
    setJoystickVisible(S.joystickEnabled);
    setJoystickSensitivity(S.joystickSensitivity);

    if (countChanged) {
        rebuildParticles();
    } else {
        S.isMorphing = false;
        morphStart = null;
        morphTarget = null;
        S.colorsDirty = true;
        updateParticles();
    }
}

// ============================================
// ANIMATION LOOP
// ============================================
function animate() {
    rafId = requestAnimationFrame(animate);

    const now = performance.now();
    const dt = Math.min((now - lastFrameTime) / 1000, 0.05);
    dtLast = dt;
    lastFrameTime = now;
    if (asciiPass) asciiPass.uniforms.uTime.value = now / 1000;

    // FPS + adaptive bloom
    frameCount++;
    if (now - lastFpsTime >= 1000) {
        fps = frameCount;
        frameCount = 0;
        lastFpsTime = now;
        uiHooks.setFps(fps);
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

    // Per-frame capture hook (live camera), before the particle block
    frameHook?.();

    // Particle field
    if (geometry && geometry.attributes && geometry.attributes.position) {
        if (S.isMorphing) {
            advanceMorph(dt);
        } else if (!S.isPaused || S.formDirty) {
            // Paused normally means "don't move", but a knob the user just
            // turned is an explicit request to re-evaluate the field once —
            // otherwise every form control looks dead on a frozen frame.
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

    // Virtual stick (writes the camera, then Controls reconciles below)
    if (controls) {
        const joy = updateJoystick(camera, controls, S.joystickSensitivity, dt,
            S.targetZoomDistance);
        if (joy && joy.zoom !== null) S.targetZoomDistance = joy.zoom;
    }

    // Controls
    if (controls) {
        controls.update();
        uiHooks.setCameraInfo(controls.autoRotate ? 'AUTO' : 'MANUAL');
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

export {
    getHandles,
    setUiHooks,
    setFrameHook,
    initScene,
    rebuildParticles,
    updateParticles,
    morphToShape,
    createStarfieldInScene,
    setSceneToggle,
    setCameraPreset,
    resetCamera,
    setupPostProcessing,
    applyAspect,
    updatePointerWorld,
    attachCanvasListeners,
    updatePlaybackUI,
    setLoopRunning,
    currentPositions,
    getRenderContext,
    setAudioEngine,
    getAudioEngine,
    setDrawingPad,
    getDrawingPad,
    setParticleSize,
    setAsciiScale,
    setAsciiSet,
    setAsciiRate,
    setTwinkle,
    setBloomEnabled,
    setBloomIntensity,
    setAutoRotate,
    setRotateSpeed,
    setJoystickEnabled,
    setJoystickSensitivity,
    loadModelOffsetSource,
    applyConfigRender
};

// ============================================
// PRIVATE WORD SETS (optional, not committed)
// ============================================
// src/ascii-words.js is git-ignored and never deployed. On the public site
// this import 404s and the catch keeps symbol-only sets; on a local/dev
// build it exists and the word mood sets are appended to ASCII_SETS.
let wordSetsLoaded = false;

export async function loadWordSets() {
    if (wordSetsLoaded) return ASCII_SETS.length;
    try {
        const mod = await import('./ascii-words.js');
        if (mod && mod.ASCII_WORD_SETS) {
            const n = mergeWordSets(mod.ASCII_WORD_SETS);
            wordSetsLoaded = true;
            return n;
        }
    } catch {
        // public deployment: no private module — nothing to do
    }
    return ASCII_SETS.length;
}

export function getAsciiSetNames() {
    return ASCII_SETS.map(s => s.name);
}
