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
import { S, MAX_PARTICLES, CLOUD_SHAPES, collectConfig } from './state.js';
import { getOffsetSource, setOffsetSource, regenerateOffsets, buildPhotoSource, writeShapePosition } from './shapes.js';
import { writeParticleColor } from './colors.js';
import { AudioEngine } from './audio.js';
import { downloadBlob, buildPlyText, buildObjText, buildGlbBuffer, generateExportCode } from './exporters.js';
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

// Photo mode: layout source built on upload, plus the offset source to
// restore when photo mode is switched back off.
let photoSource = null;
let prePhotoSource = null;

// ============================================
// AUDIO REACTIVITY
// ============================================
async function startMic() {
    try {
        const audioEngine = new AudioEngine();
        await audioEngine.startMic();
        render.setAudioEngine(audioEngine);
        setAudioStatus('MIC: ONLINE', 'on');
        showNotification('MIC ENABLED');
    } catch (err) {
        render.setAudioEngine(null);
        setAudioStatus('MIC ERROR');
        showNotification('MIC ACCESS DENIED');
    }
}

async function startSystemAudio() {
    try {
        const audioEngine = new AudioEngine();
        await audioEngine.startSystem();
        render.setAudioEngine(audioEngine);
        setAudioStatus('SYSTEM AUDIO: ONLINE', 'on');
        showNotification('SYSTEM AUDIO CAPTURED');
    } catch (err) {
        render.setAudioEngine(null);
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
            const audioEngine = new AudioEngine();
            await audioEngine.loadFile(file);
            render.setAudioEngine(audioEngine);
            setAudioStatus('TRACK: ' + file.name, 'on');
            document.getElementById('playback-row')?.classList.add('visible');
            render.updatePlaybackUI();
            showNotification('AUDIO TRACK LOADED');
        } catch (err) {
            render.setAudioEngine(null);
            setAudioStatus('TRACK ERROR');
            showNotification('AUDIO LOAD FAILED');
        }
    };
    input.click();
}

function stopAudio() {
    const eng = render.getAudioEngine();
    if (eng) eng.stop();
    render.setAudioEngine(null);
    setAudioStatus('OFF');
    document.getElementById('playback-row')?.classList.remove('visible');
    showNotification('AUDIO DISABLED');
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
    render.updateParticles();
    showNotification(S.photoMode ? 'PHOTO MODE ENABLED' : 'PHOTO MODE OFF');
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

    render.applyConfigRender(countChanged);
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
        render.morphToShape(cfg.shape, 1.2);
    }
    applyConfig(cfg);
    showNotification('CLOUD SHAPE: ' + cfg.shape.toUpperCase());
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
function exportPly() {
    const H = render.getHandles();
    if (!H.geometry) return;
    const count = S.particleCount;
    const pos = render.currentPositions(count);
    downloadBlob(new Blob([buildPlyText(pos, count)], { type: 'text/plain' }), 'ether-resonance.ply');
    showNotification('PLY EXPORTED (' + count + ' VERTICES)');
}

function exportObj() {
    const H = render.getHandles();
    if (!H.geometry) return;
    const count = S.particleCount;
    const pos = render.currentPositions(count);
    downloadBlob(new Blob([buildObjText(pos, count)], { type: 'text/plain' }), 'ether-resonance.obj');
    showNotification('OBJ EXPORTED (' + count + ' VERTICES)');
}

function exportGlb() {
    const H = render.getHandles();
    if (!H.geometry) return;
    const count = S.particleCount;
    const pos = render.currentPositions(count);
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
            const audioEngine = new AudioEngine();
            await audioEngine.loadFile(file);
            render.setAudioEngine(audioEngine);
            setAudioStatus('TRACK: ' + file.name, 'on');
            document.getElementById('playback-row')?.classList.add('visible');
            render.updatePlaybackUI();
            showNotification('AUDIO TRACK LOADED');
        } catch (err) {
            render.setAudioEngine(null);
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
            render.updateParticles();
            showNotification('IMAGE APPLIED: ' + file.name);
        } catch (err) {
            showNotification('IMAGE LOAD FAILED');
        }
    } else if (type === '3d') {
        render.loadModelOffsetSource(file,
            () => showNotification('MODEL APPLIED: ' + file.name),
            message => showNotification(message));
    }
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
    togglePlayPause, copyPrompt, toggleGuide, toggleDrawingPad, selectTool, toggleFullscreen,
    startMic, startSystemAudio, loadAudioTrack, stopAudio, toggleGodMode, togglePhotoMode,
    applyConfig, savePreset, loadPreset, publishPreset, loadCloudShape, exportCode, copyCode,
    exportPly, exportObj, exportGlb, uploadFile, handleUpload, loadImageFile, buildPhotoSourceFromImage };
