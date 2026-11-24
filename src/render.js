// ============================================
// ETHER RESONANCE — render.js
// Three.js side: scene, particles, post-processing, frame loop.
// ============================================
// S1 SCAFFOLD — no logic has moved here yet. This file only declares the
// module-level globals, the live handle getters and the uiHooks/frameHook
// bridge. main.js still owns every function and still declares its own
// copies of the globals below; the duplication is intentional and is
// removed in S2, which moves the whole render side here.
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

// ============================================
// GLOBAL STATE (mirrors main.js until S2 deletes main.js's copies)
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
    updatePlaybackUI() {},
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

export {
    getHandles,
    setUiHooks,
    setFrameHook
};
