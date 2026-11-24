// ============================================
// ETHER RESONANCE — ui.js
// DOM side: notifications, loading, HUD helpers and the uiHooks bag that
// render.js consumes through setUiHooks() (installed by main.js at the top
// of init()).
// ============================================
// S1 SCAFFOLD — main.js still owns every function and still declares its own
// copies of the helpers below; the duplication is intentional and is removed
// in S3, which moves the UI leaf functions here for good.
// ============================================
import { S } from './state.js';

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

// The playback hook reads the audio engine instance. Until the audio
// functions move out of main.js (S4) and render.js exposes its instance
// bridge (setAudioEngine/getAudioEngine), this stays null and the hook is a
// guarded no-op. Nothing calls it during S1: render.js has no frame loop yet.
let audioEngine = null;

function updatePlaybackUI() {
    if (!audioEngine) return;
    const btn = document.getElementById('btn-play-pause-track');
    if (btn) btn.textContent = audioEngine.isPlaying() ? '⏸️' : '▶️';
    const seek = document.getElementById('audio-seek');
    if (seek) seek.value = Math.round(audioEngine.getProgress() * 100);
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
    updatePlaybackUI() {
        updatePlaybackUI();
    },
    updateHudFormName() {
        updateHudFormName();
    },
    notify(msg) {
        showNotification(msg);
    }
};

export { showNotification, updateLoading, setAudioStatus, updateHudFormName };
