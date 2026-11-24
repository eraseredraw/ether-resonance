// ============================================
// ETHER RESONANCE — ui.js
// DOM side: notifications, loading, HUD helpers and the uiHooks bag that
// render.js consumes through setUiHooks() (installed by main.js at the top
// of init()).
// ============================================
// S3 STATE — main.js no longer owns the UI leaf functions; they live here.
// render.js is imported for the drawing-pad instance bridge
// (toggleDrawingPad / selectTool read render.getDrawingPad()).
// ============================================
import { S } from './state.js';
import * as render from './render.js';

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
// LOADING HELPER
// ============================================
function updateLoading(percent, status) {
    const bar = document.getElementById('load-progress');
    const text = document.getElementById('load-status');
    if (bar) bar.style.width = percent + '%';
    if (text) text.textContent = status;
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

function setAudioStatus(text, cls) {
    const el = document.getElementById('audio-status');
    if (!el) return;
    el.textContent = text;
    el.className = 'audio-status' + (cls ? ' ' + cls : '');
}

// ============================================
// UI LEAF FUNCTIONS (moved verbatim from main.js, S3)
// ============================================
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

function toggleDrawingPad() {
    const pad = document.getElementById('drawing-pad');
    const toggle = document.getElementById('drawing-pad-toggle');
    pad.classList.toggle('hidden');
    const drawingPad = render.getDrawingPad();
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
    const drawingPad = render.getDrawingPad();
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

function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => showNotification('FULLSCREEN DENIED'));
    } else {
        document.exitFullscreen();
    }
}

// Playback hook: DOM only. render.js reads the audio engine itself and hands
// over the two computed values (Appendix A4) — this module never touches the
// engine instance.
function updatePlaybackUI(playing, progress) {
    const btn = document.getElementById('btn-play-pause-track');
    if (btn) btn.textContent = playing ? '⏸️' : '▶️';
    const seek = document.getElementById('audio-seek');
    if (seek) seek.value = Math.round(progress * 100);
}

// ============================================
// UI HOOKS — 8 methods consumed by render.js
// Exact DOM bodies per Part 1 of the refactor spec; render.js never touches
// the DOM directly.
// ============================================
export const uiHooks = {
    webglError() {
        const el = document.getElementById('webgl-error');
        if (el) el.classList.add('visible');
        document.getElementById('loading')?.classList.add('hidden');
    },
    setFps(n) {
        const el = document.getElementById('fps-display');
        if (el) el.textContent = n;
    },
    setCameraInfo(s) {
        const el = document.getElementById('camera-info');
        if (el) el.textContent = s;
    },
    setAudioMeter(pct) {
        const meter = document.getElementById('audio-level');
        if (meter) meter.style.width = pct + '%';
    },
    setAudioIntensity(v) {
        document.getElementById('audio-intensity').value = v;
        document.getElementById('audio-intensity-value').textContent = v.toFixed(2);
    },
    updatePlaybackUI(playing, progress) {
        updatePlaybackUI(playing, progress);
    },
    updateHudFormName() {
        updateHudFormName();
    },
    notify(msg) {
        showNotification(msg);
    }
};

export { showNotification, updateLoading, setAudioStatus, updateHudFormName, updatePlaybackUI,
    updateUIFromState, toggleHUD, toggleControls, initializeNeuralLink, toggleLiveUpdate,
    togglePlayPause, copyPrompt, toggleGuide, toggleDrawingPad, selectTool, toggleFullscreen };
