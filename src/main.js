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

import { S } from './state.js';
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
        render.loadWordSets().then(() => {
            ui.rebuildAsciiSetOptions(); // renumber if private sets arrived
        }); // private sets (async, may arrive late)
        render.setupPostProcessing();

        ui.updateLoading(90, 'Finalizing...');
        ui.setupEventListeners();
        render.attachCanvasListeners();
        ui.setupDragAndDrop();

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
window.randomize = ui.randomize;
window.reset = ui.reset;
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
