// ============================================
// ETHER RESONANCE — v5.0.0
// Three.js + WebGL particle visualization
// Modular: shapes / colors / audio / shaders / drawing / exporters
// ============================================
// main.js is the composition root: it installs the uiHooks bridge, runs the
// init() sequence in order and keeps the window.* globals that inline
// onclick handlers need. The render half lives in render.js, the DOM half in
// ui.js.
// ============================================
import * as THREE from 'three';

import { SHAPES, setOffsetSource, regenerateOffsets, setMouseState, setMouseMode } from './shapes.js';
import { DrawingPad } from './drawing.js';
import { exportImage, exportVideo } from './exporters.js';
import {
    S,
    DEFAULT_CONFIG
} from './state.js';
import * as render from './render.js';
import * as ui from './ui.js';

window.THREE = THREE;

// ============================================
// INITIALIZATION
// ============================================
function init() {
    // Wire the render→UI bridge before anything can consume a hook.
    render.setUiHooks(ui.uiHooks);

    try {
        // Respect OS "reduce motion" — no auto-orbit, no twinkle
        if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            S.autoRotate = false;
            S.twinkleEnabled = false;
        }

        ui.updateLoading(10, 'Creating scene...');
        render.initScene();

        ui.updateLoading(30, 'Creating particles...');
        render.rebuildParticles();

        ui.updateLoading(60, 'Sowing the stars...');
        render.createStarfieldInScene();

        ui.updateLoading(70, 'Setting up post-processing...');
        render.setupPostProcessing();

        ui.updateLoading(90, 'Finalizing...');
        setupEventListeners();
        render.attachCanvasListeners();
        setupDragAndDrop();

        S.targetZoomDistance = render.getHandles().camera.position.length();
        ui.updateHudFormName();

        // Restore preset from URL hash (#preset=...)
        try {
            const m = location.hash.match(/#preset=([A-Za-z0-9+/=]+)/);
            if (m) {
                const cfg = JSON.parse(decodeURIComponent(atob(m[1])));
                ui.applyConfig(cfg);
                console.log('Preset restored from URL');
            }
        } catch (e) {
            console.warn('Invalid preset hash:', e);
        }

        ui.updateLoading(100, 'Ready!');
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
        render.setLoopRunning(true);
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
// EVENT LISTENERS
// ============================================
function setupEventListeners() {
    const H = render.getHandles();

    // --- Simulation ---
    const slider = document.getElementById('particle-count-slider');
    slider.addEventListener('input', e => {
        const newCount = parseInt(e.target.value);
        if (newCount !== S.particleCount) {
            S.particleCount = newCount;
            render.rebuildParticles();
        }
        document.getElementById('particle-count-value').textContent =
            (S.particleCount / 1000).toFixed(0) + 'K';
        document.getElementById('particle-count').textContent = S.particleCount.toLocaleString();
    });

    document.getElementById('particle-size').addEventListener('input', e => {
        render.setParticleSize(parseFloat(e.target.value));
        document.getElementById('particle-size-value').textContent = e.target.value;
    });

    document.getElementById('sim-speed').addEventListener('input', e => {
        S.simSpeed = parseFloat(e.target.value);
        document.getElementById('sim-speed-value').textContent = e.target.value;
    });

    document.getElementById('bloom-toggle').addEventListener('change', e => {
        render.setBloomEnabled(e.target.checked);
    });

    document.getElementById('bloom-intensity').addEventListener('input', e => {
        render.setBloomIntensity(parseFloat(e.target.value));
        document.getElementById('bloom-intensity-value').textContent = e.target.value;
    });

    document.getElementById('trail-toggle').addEventListener('change', e => {
        S.trailEnabled = e.target.checked;
    });

    // --- Form ---
    document.getElementById('shape-select').addEventListener('change', e => {
        render.morphToShape(e.target.value, 1.0);
        ui.updateHudFormName();
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
        render.updateParticles();
    });

    document.getElementById('hue-offset').addEventListener('input', e => {
        S.hueOffset = parseInt(e.target.value);
        document.getElementById('hue-offset-value').textContent = e.target.value + '°';
        S.colorsDirty = true;
        render.updateParticles();
    });

    document.getElementById('anim-select').addEventListener('change', e => {
        S.colorAnimation = e.target.value;
        S.colorsDirty = true;
        render.updateParticles();
    });

    // --- Audio ---
    document.getElementById('btn-audio-mic')?.addEventListener('click', ui.startMic);
    document.getElementById('btn-audio-system')?.addEventListener('click', ui.startSystemAudio);
    document.getElementById('btn-audio-file')?.addEventListener('click', ui.loadAudioTrack);
    document.getElementById('btn-audio-stop')?.addEventListener('click', ui.stopAudio);

    document.getElementById('audio-intensity')?.addEventListener('input', e => {
        S.audioIntensity = parseFloat(e.target.value);
        document.getElementById('audio-intensity-value').textContent = S.audioIntensity.toFixed(2);
    });

    document.getElementById('twinkle-toggle')?.addEventListener('change', e => {
        render.setTwinkle(e.target.checked);
    });

    document.getElementById('btn-god-mode')?.addEventListener('click', ui.toggleGodMode);

    // Playback controls (file mode)
    document.getElementById('btn-play-pause-track')?.addEventListener('click', () => {
        const eng = render.getAudioEngine();
        if (eng) {
            eng.togglePlay();
            render.updatePlaybackUI();
        }
    });
    document.getElementById('audio-seek')?.addEventListener('input', e => {
        const eng = H.audioEngine;
        if (eng) eng.setSeek(parseFloat(e.target.value) / 100);
    });
    document.getElementById('audio-volume')?.addEventListener('input', e => {
        const eng = H.audioEngine;
        if (eng) eng.setVolume(parseFloat(e.target.value) / 100);
    });

    // --- Camera ---
    document.getElementById('rotate-speed').addEventListener('input', e => {
        render.setRotateSpeed(parseFloat(e.target.value));
        document.getElementById('rotate-speed-value').textContent = e.target.value;
    });

    document.getElementById('auto-rotate').addEventListener('change', e => {
        render.setAutoRotate(e.target.checked);
    });

    // --- Camera presets ---
    document.getElementById('btn-cam-front')?.addEventListener('click', () => render.setCameraPreset('front'));
    document.getElementById('btn-cam-top')?.addEventListener('click', () => render.setCameraPreset('top'));
    document.getElementById('btn-cam-orbit')?.addEventListener('click', () => render.setCameraPreset('orbit'));

    // --- Scene toggles ---
    document.getElementById('starfield-toggle')?.addEventListener('change', e => render.setSceneToggle('starfield', e.target.checked));
    document.getElementById('aberration-toggle')?.addEventListener('change', e => render.setSceneToggle('aberration', e.target.checked));

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

    // --- Export ---
    document.getElementById('btn-platform-vanilla')?.addEventListener('click', () => ui.exportCode('vanilla'));
    document.getElementById('btn-platform-react')?.addEventListener('click', () => ui.exportCode('react'));
    document.getElementById('btn-platform-three')?.addEventListener('click', () => ui.exportCode('three'));
    document.getElementById('btn-platform-image')?.addEventListener('click', () => {
        const { renderer, composer, camera } = render.getRenderContext();
        exportImage(renderer, composer, camera, {
            resolution: document.getElementById('export-resolution').value,
            format: document.getElementById('export-format').value,
            notify: ui.showNotification
        });
    });
    document.getElementById('btn-platform-ply')?.addEventListener('click', () => ui.exportPly());
    document.getElementById('btn-platform-glb')?.addEventListener('click', () => ui.exportGlb());
    document.getElementById('btn-platform-obj')?.addEventListener('click', () => ui.exportObj());
    document.getElementById('btn-download-code')?.addEventListener('click', () => ui.exportCode(document.getElementById('export-platform').value));
    document.getElementById('btn-copy')?.addEventListener('click', ui.copyCode);
    document.getElementById('btn-record-video')?.addEventListener('click', () => {
        const { renderer } = render.getRenderContext();
        exportVideo(renderer, {
            duration: parseInt(document.getElementById('video-duration').value || '8'),
            notify: ui.showNotification
        });
    });

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
    document.getElementById('btn-initialize')?.addEventListener('click', ui.initializeNeuralLink);
    document.getElementById('btn-live-update')?.addEventListener('click', ui.toggleLiveUpdate);
    document.getElementById('btn-build-3d')?.addEventListener('click', ui.toggleLiveUpdate);
    document.getElementById('btn-play-pause')?.addEventListener('click', ui.togglePlayPause);
    document.getElementById('btn-copy-prompt')?.addEventListener('click', ui.copyPrompt);
    document.getElementById('btn-save-local')?.addEventListener('click', () => ui.savePreset(4, document.getElementById('btn-save-local')));
    document.getElementById('btn-publish')?.addEventListener('click', ui.publishPreset);
    document.getElementById('btn-ai-guide')?.addEventListener('click', ui.toggleGuide);
    document.getElementById('btn-guide-close')?.addEventListener('click', () => { document.getElementById('guide').classList.add('hidden'); });

    // --- Upload ---
    document.getElementById('btn-upload-image')?.addEventListener('click', () => ui.uploadFile('image'));
    document.getElementById('btn-upload-video')?.addEventListener('click', () => ui.uploadFile('video'));
    document.getElementById('btn-upload-3d')?.addEventListener('click', () => ui.uploadFile('3d'));
    document.getElementById('btn-upload-blueprint')?.addEventListener('click', () => ui.uploadFile('blueprint'));
    document.getElementById('btn-load-cloud')?.addEventListener('click', ui.loadCloudShape);
    document.getElementById('btn-photo')?.addEventListener('click', ui.togglePhotoMode);

    // --- Drawing pad ---
    const drawingPadInstance = new DrawingPad(() => {
        const pad = render.getDrawingPad();
        setOffsetSource(pad.toOffsetSource(S.particleCount));
        regenerateOffsets(S.particleCount);
        S.colorsDirty = true;
        render.updateParticles();
        ui.showNotification('DRAWING APPLIED');
    });
    render.setDrawingPad(drawingPadInstance);

    document.getElementById('drawing-pad-toggle')?.addEventListener('click', ui.toggleDrawingPad);
    document.getElementById('btn-open-drawing')?.addEventListener('click', () => { H.drawingPad.clear(); });
    document.getElementById('btn-pen')?.addEventListener('click', () => ui.selectTool('pen'));
    document.getElementById('btn-eraser')?.addEventListener('click', () => ui.selectTool('eraser'));
    document.getElementById('btn-undo')?.addEventListener('click', () => H.drawingPad.undo());
    document.getElementById('btn-redo')?.addEventListener('click', () => H.drawingPad.redo());
    document.getElementById('btn-sym')?.addEventListener('click', () => H.drawingPad.setSymmetry(!H.drawingPad.symmetry));
    document.getElementById('btn-pulsar')?.addEventListener('click', () => H.drawingPad.setPulsar(!H.drawingPad.pulsar));
    document.getElementById('btn-live-update')?.addEventListener('click', () => {
        H.drawingPad.setLiveApply(!H.drawingPad.liveApply);
        const btn = document.getElementById('btn-live-update');
        btn.textContent = H.drawingPad.liveApply ? '⚡ LIVE: ON' : '⚡ LIVE: OFF';
    });
    document.getElementById('draw-brush-size')?.addEventListener('input', e => {
        H.drawingPad.setBrushSize(e.target.value);
        document.getElementById('draw-brush-size-value').textContent = e.target.value;
    });

    // --- Panel toggles ---
    document.getElementById('hud-toggle')?.addEventListener('click', ui.toggleHUD);
    document.getElementById('controls-toggle')?.addEventListener('click', ui.toggleControls);

    // --- Keyboard ---
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') {
            e.preventDefault();
            ui.toggleHUD();
            ui.toggleControls();
        } else if (e.key === ' ' && !e.repeat) {
            e.preventDefault();
            ui.togglePlayPause();
        } else if ((e.key === 'r' || e.key === 'R') && !e.repeat) {
            randomize();
        } else if ((e.key === 'c' || e.key === 'C') && !e.repeat) {
            render.resetCamera();
        }
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
            ui.handleUpload('image', f);
        } else if (['obj', 'glb', 'gltf', 'ply'].includes(ext)) {
            ui.handleUpload('3d', f);
        } else if (f.type.startsWith('audio/')) {
            ui.handleUpload('audio', f);
        } else {
            ui.showNotification('UNSUPPORTED FILE TYPE');
        }
    });
}

// ============================================
// RANDOMIZE / RESET
// ============================================
function randomize() {
    const newShape = SHAPES[Math.floor(Math.random() * SHAPES.length)];
    if (newShape !== S.currentShape) {
        render.morphToShape(newShape, 1.0);
    }
    S.formScale = 100 + Math.random() * 150;
    S.formChaos = Math.floor(Math.random() * 50);
    S.hueOffset = Math.floor(Math.random() * 360);
    S.colorMode = ['rainbow', 'hue', 'plasma', 'ocean', 'fire', 'ice', 'cyan', 'gold', 'neon', 'white'][Math.floor(Math.random() * 10)];
    S.colorAnimation = ['static', 'scroll', 'wave', 'pulse'][Math.floor(Math.random() * 4)];
    S.colorsDirty = true;
    render.updateParticles();
    ui.updateUIFromState();
    ui.showNotification('RANDOMIZED');
}

function reset() {
    ui.applyConfig(DEFAULT_CONFIG);
    ui.showNotification('RESET TO DEFAULTS');
}

// ============================================
// FORM BUTTONS
// ============================================
function setForm(shape) {
    if (shape !== S.currentShape) {
        render.morphToShape(shape, 1.0);
    }
    document.getElementById('shape-select').value = shape;
    ui.updateHudFormName();
}

// ============================================
// ASPECT RATIO
// ============================================
function setAspectRatio(ratio) {
    if (ratio === 'custom') {
        S.activeAspect = null;
        render.applyAspect();
        ui.showNotification('FULL WINDOW');
        return;
    }
    const [w, h] = ratio.split(':').map(Number);
    S.activeAspect = w / h;
    render.applyAspect();
    ui.showNotification(`ASPECT RATIO: ${ratio}`);
}

// ============================================
// VISIBILITY: stop burning GPU and battery in a hidden tab
// ============================================
// requestAnimationFrame is throttled in background tabs but it does not stop,
// so on a phone the WebGL context keeps the GPU awake and the audio analyser
// keeps sampling. Cancel the loop outright when the tab is hidden.
document.addEventListener('visibilitychange', () => {
    const hidden = document.hidden;
    render.setLoopRunning(!hidden);
    // The render loop is the big cost, but an FFT at 60 Hz is not free either.
    // suspend() keeps the microphone grant; resume() is guarded by active, so a
    // hidden tab does not bring back audio the user had stopped.
    const audioEngine = render.getAudioEngine();
    if (audioEngine) hidden ? audioEngine.suspend() : audioEngine.resume();
});
// pagehide fires on mobile when the app is swiped away or bfcached — the one
// place visibilitychange is unreliable.
window.addEventListener('pagehide', () => render.setLoopRunning(false));

// ============================================
// GLOBAL EXPORTS (inline onclick handlers)
// ============================================
window.savePreset = ui.savePreset;
window.loadPreset = ui.loadPreset;
window.randomize = randomize;
window.reset = reset;
window.toggleFullscreen = ui.toggleFullscreen;
window.toggleHUD = ui.toggleHUD;
window.toggleControls = ui.toggleControls;
window.togglePlayPause = ui.togglePlayPause;
window.toggleDrawingPad = ui.toggleDrawingPad;
window.togglePhotoMode = ui.togglePhotoMode;
window.showNotification = ui.showNotification;
window.exportCode = ui.exportCode;
window.uploadFile = ui.uploadFile;

// ============================================
// START
// ============================================
init();
