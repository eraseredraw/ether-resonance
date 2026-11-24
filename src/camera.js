// ============================================
// ETHER RESONANCE — camera.js
// LIVE CAMERA frame provider. Imports state.js + shapes.js ONLY (ownership
// table): it never touches render.js or the DOM beyond its own hidden video
// element. ui.js owns the button, the photo-mode entry/exit and the
// diagnostic overlay; camera.js only grabs frames and reports stats.
//
// Buffer discipline (carried defect, now fixed): the pixel buffer handed to
// buildPhotoSource is ONE Uint8ClampedArray reused across frames. getImageData
// allocates an engine-owned temp each read (short-lived, GC-friendly); the
// long-lived source object and its data array stay stable, so shapes.js
// module state (photoData) keeps the same reference and the render loop reads
// fresh pixels without any per-frame reallocation on our side.
// ============================================
import { S } from './state.js';
import { buildPhotoSource } from './shapes.js';

let stream = null;
let video = null;
let canvas = null;
let ctx = null;
let facing = 'user';
let persistentData = null;      // reused RGBA buffer (w * h * 4)
let persistentImage = null;     // stable ImageData-shaped wrapper { data, width, height }
let gridW = 0;
let gridH = 0;
let rafId = 0;
let lastFrameTime = 0;
let fpsEMA = 0;
let onFrameCb = null;
let onStatsCb = null;

const stats = { active: false, error: '', w: 0, h: 0, fps: 0, frames: 0 };

export function getCameraStats() {
    return stats;
}

export function isCameraActive() {
    return stats.active;
}

// Grid that fits the particle budget while keeping the frame aspect —
// same math as the upload path (w*h <= count, one shrink step guards
// float rounding).
function gridFromCount(count, aspect) {
    let w = Math.max(1, Math.floor(Math.sqrt(count * aspect)));
    let h = Math.max(1, Math.floor(count / w));
    while (w > 1 && w * h > count) {
        w--;
        h = Math.max(1, Math.floor(count / w));
    }
    return { w, h };
}

function ensureBuffers(vw, vh) {
    const g = gridFromCount(S.particleCount, vw / vh);
    if (canvas && gridW === g.w && gridH === g.h) return;
    gridW = g.w;
    gridH = g.h;
    if (!canvas) {
        canvas = document.createElement('canvas');
        ctx = canvas.getContext('2d', { willReadFrequently: true });
    }
    canvas.width = gridW;
    canvas.height = gridH;
    persistentData = new Uint8ClampedArray(gridW * gridH * 4);
    persistentImage = { data: persistentData, width: gridW, height: gridH };
    stats.w = gridW;
    stats.h = gridH;
}

function grabFrame() {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return null;
    ensureBuffers(vw, vh);
    ctx.save();
    if (facing === 'user') {
        // mirror the selfie cam so the particle image moves like a mirror
        ctx.translate(gridW, 0);
        ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, gridW, gridH);
    ctx.restore();
    const tmp = ctx.getImageData(0, 0, gridW, gridH);
    persistentData.set(tmp.data);
    return buildPhotoSource(persistentImage, gridW, gridH);
}

function loop(now) {
    if (!stats.active) return;
    rafId = requestAnimationFrame(loop);
    if (!video || video.readyState < 2) return;
    const dt = now - lastFrameTime;
    if (dt < 33) return; // ~30 fps cap — the particle grid re-samples the whole frame
    if (lastFrameTime) fpsEMA = fpsEMA ? fpsEMA * 0.9 + (1000 / dt) * 0.1 : 1000 / dt;
    lastFrameTime = now;
    const src = grabFrame();
    if (src) {
        stats.frames++;
        stats.fps = fpsEMA;
        if (onFrameCb) onFrameCb(src);
    }
    if (onStatsCb && stats.frames % 5 === 0) onStatsCb(stats);
}

// Start the camera. onFrame(source) fires ~30x/s with a 'photo' offset
// source; onStats(stats) fires throttled for the diagnostic overlay.
// Returns true on success, false with stats.error filled on failure.
export async function startCamera(onFrame, onStats, opts = {}) {
    onFrameCb = onFrame;
    onStatsCb = onStats;
    facing = opts.facingMode || 'user';
    stats.error = '';
    try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('getUserMedia unsupported');
        }
        stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
                facingMode: facing,
                width: { ideal: 640 },
                height: { ideal: 480 }
            }
        });
        video = document.createElement('video');
        video.muted = true;
        video.playsInline = true;
        video.autoplay = true;
        video.setAttribute('playsinline', ''); // iOS Safari
        video.style.position = 'fixed';
        video.style.width = '1px';
        video.style.height = '1px';
        video.style.opacity = '0';
        video.style.pointerEvents = 'none';
        document.body.appendChild(video);
        video.srcObject = stream;
        await video.play();
        stats.active = true;
        stats.frames = 0;
        stats.fps = 0;
        lastFrameTime = 0;
        fpsEMA = 0;
        rafId = requestAnimationFrame(loop);
        return true;
    } catch (err) {
        stats.active = false;
        stats.error = (err && err.name ? err.name : 'Error') + ': ' + (err && err.message ? err.message : 'unknown');
        if (stream) stream.getTracks().forEach(t => t.stop());
        stream = null;
        if (video && video.parentNode) video.parentNode.removeChild(video);
        video = null;
        if (onStatsCb) onStatsCb(stats);
        return false;
    }
}

// Stop the camera and release every resource. Buffers are dropped — the
// next start rebuilds them for whatever grid the particle count implies.
export function stopCamera() {
    stats.active = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    if (stream) stream.getTracks().forEach(t => t.stop());
    stream = null;
    if (video && video.parentNode) video.parentNode.removeChild(video);
    video = null;
    canvas = null;
    ctx = null;
    persistentData = null;
    persistentImage = null;
    gridW = 0;
    gridH = 0;
    stats.fps = 0;
}
