// ============================================
// ETHER RESONANCE — SHAPES
// Parametric shape generator, zero allocation.
// Module-level state is intentionally plain
// variables so `.toString()` output stays
// self-contained for code export.
// ============================================

export const SHAPES = ['sphere', 'torus', 'spiral', 'cube', 'plane', 'helix', 'donut', 'ribbon', 'vortex', 'chaos'];

const PI2 = Math.PI * 2;
const SQRT_PI = Math.sqrt(Math.PI);

let currentShape = 'sphere';
let formScale = 150;
let formRotationSpeed = 0.3;
let formChaos = 0;
let customOffsets = null;

// Audio-driven modulation (multipliers live here so the shape
// function stays dependency-free for exported code).
let formScaleMod = 1;
let formRotationSpeedMod = 1;

let offsetSource = null;

export function setShapeState(s) {
    if (typeof s.currentShape === 'string') currentShape = s.currentShape;
    if (typeof s.formScale === 'number') formScale = s.formScale;
    if (typeof s.formRotationSpeed === 'number') formRotationSpeed = s.formRotationSpeed;
    if (typeof s.formChaos === 'number') formChaos = s.formChaos;
}

export function getShapeState() {
    return { currentShape, formScale, formRotationSpeed, formChaos };
}

export function setFormScaleMod(m) { formScaleMod = m; }
export function setFormRotationSpeedMod(m) { formRotationSpeedMod = m; }

export function setOffsetSource(src) { offsetSource = src; }
export function getOffsetSource() { return offsetSource; }
export function getOffsets() { return customOffsets; }

export function writeShapePosition(i, t, time, out, o) {
    // Uniform sphere mapping: cos distribution, argument always in [-1, 1]
    const phi = Math.acos(1 - 2 * (i + 0.5) / t);
    const theta = SQRT_PI * phi;

    const scale = formScale * formScaleMod;
    const rotSpeed = formRotationSpeed * formRotationSpeedMod;

    let x = 0, y = 0, z = 0;

    switch (currentShape) {
        case 'sphere': {
            const r = scale * Math.cbrt((i + 0.5) / t);
            const a = theta + time * rotSpeed;
            x = r * Math.sin(phi) * Math.cos(a);
            y = r * Math.sin(phi) * Math.sin(a);
            z = r * Math.cos(phi);
            break;
        }
        case 'torus': {
            const torusR = scale * 0.6;
            const torusr = scale * 0.25;
            const u = (i / t) * PI2 * 20 + time * rotSpeed;
            const v = (i % 100) / 100 * PI2;
            x = (torusR + torusr * Math.cos(v)) * Math.cos(u);
            y = (torusR + torusr * Math.cos(v)) * Math.sin(u);
            z = torusr * Math.sin(v);
            break;
        }
        case 'spiral': {
            const spiralCount = 5;
            const spiralIdx = i % spiralCount;
            const spiralOff = (spiralIdx / spiralCount) * PI2;
            const spiralH = scale * 2;
            const spiralRad = scale * 0.5;
            const h = ((i / t) - 0.5) * spiralH;
            const angle = (i / t) * PI2 * spiralCount + spiralOff + time * rotSpeed;
            x = spiralRad * Math.cos(angle) * (1 + (i / t) * 0.5);
            y = h;
            z = spiralRad * Math.sin(angle) * (1 + (i / t) * 0.5);
            break;
        }
        case 'cube': {
            const cubeSize = scale * 2;
            const cubeSide = Math.round(Math.cbrt(t));
            const ix = i % cubeSide;
            const iy = Math.floor(i / cubeSide) % cubeSide;
            const iz = Math.floor(i / (cubeSide * cubeSide));
            const nx = ((ix + 0.5) / cubeSide) * 2 - 1;
            const ny = ((iy + 0.5) / cubeSide) * 2 - 1;
            const nz = ((iz + 0.5) / cubeSide) * 2 - 1;
            let cx = nx * cubeSize * 0.5;
            const cy = ny * cubeSize * 0.5;
            let cz = nz * cubeSize * 0.5;
            const rot = time * rotSpeed;
            const cosRot = Math.cos(rot);
            const sinRot = Math.sin(rot);
            const rx = cx * cosRot - cz * sinRot;
            cz = cx * sinRot + cz * cosRot;
            cx = rx;
            x = cx; y = cy; z = cz;
            break;
        }
        case 'plane': {
            const planeCols = Math.sqrt(t);
            const planeSize = scale * 2;
            const px = i % planeCols;
            const py = Math.floor(i / planeCols);
            x = ((px / planeCols) - 0.5) * planeSize;
            y = ((py / planeCols) - 0.5) * planeSize;
            z = Math.sin((px / planeCols) * Math.PI * 4 + time) * 20 + Math.cos((py / planeCols) * Math.PI * 4 + time) * 20;
            break;
        }
        case 'helix': {
            const helixTurns = 8;
            const helixRad = scale * 0.4;
            const helixH = scale * 2.5;
            const progress = i / t;
            const helixAngle = progress * PI2 * helixTurns + time * rotSpeed;
            const helixSpread = (i % 3) * (PI2 / 3);
            x = helixRad * Math.cos(helixAngle + helixSpread);
            y = (progress - 0.5) * helixH;
            z = helixRad * Math.sin(helixAngle + helixSpread);
            break;
        }
        case 'donut': {
            const donutR = scale * 0.5;
            const donutr = scale * 0.2;
            const donutu = (i / t) * PI2 * 50;
            const donutv = (i * 0.1) % PI2;
            x = (donutR + donutr * Math.cos(donutv)) * Math.cos(donutu + time * rotSpeed);
            y = (donutR + donutr * Math.cos(donutv)) * Math.sin(donutu + time * rotSpeed);
            z = donutr * Math.sin(donutv);
            break;
        }
        case 'ribbon': {
            const ribbonU = (i / t) * PI2;
            const ribbonV = ((i % 50) / 50 - 0.5) * 2;
            const ribbonRadius = scale * 0.6;
            const ribbonTwist = time * rotSpeed * 0.5;
            const ribbonWidth = scale * 0.15;
            const inner = ribbonRadius + ribbonV * ribbonWidth * Math.cos(ribbonU / 2 + ribbonTwist);
            x = inner * Math.cos(ribbonU + ribbonTwist);
            y = inner * Math.sin(ribbonU + ribbonTwist);
            z = ribbonV * ribbonWidth * Math.sin(ribbonU / 2 + ribbonTwist);
            break;
        }
        case 'vortex': {
            const vortexTurns = 12;
            const vortexRad = scale * 0.5;
            const vortexH = scale * 3;
            const vortexProgress = i / t;
            const vortexAngle = vortexProgress * PI2 * vortexTurns + time * rotSpeed;
            const vortexY = (vortexProgress - 0.5) * vortexH;
            const vortexRadius = vortexRad * (1 - Math.abs(vortexProgress - 0.5) * 2);
            x = vortexRadius * Math.cos(vortexAngle);
            y = vortexY;
            z = vortexRadius * Math.sin(vortexAngle);
            break;
        }
        case 'chaos':
        default:
            x = (Math.random() - 0.5) * scale * 2;
            y = (Math.random() - 0.5) * scale * 2;
            z = (Math.random() - 0.5) * scale * 2;
            break;
    }

    // Custom displacement (image / model / drawing)
    if (customOffsets) {
        x += customOffsets[o];
        y += customOffsets[o + 1];
        z += customOffsets[o + 2];
    }

    // Chaos jitter
    if (formChaos > 0) {
        const chaosFactor = formChaos / 100;
        x += (Math.random() - 0.5) * scale * chaosFactor;
        y += (Math.random() - 0.5) * scale * chaosFactor;
        z += (Math.random() - 0.5) * scale * chaosFactor;
    }

    out[o] = x;
    out[o + 1] = y;
    out[o + 2] = z;
}

export function writePositionsToArray(arr, count, t) {
    for (let i = 0; i < count; i++) {
        writeShapePosition(i, count, t, arr, i * 3);
    }
}

// ============================================
// OFFSET GENERATION (image / model / drawing)
// ============================================
export function regenerateOffsets(count, brightnessFactor = 1) {
    if (!offsetSource) {
        customOffsets = null;
        return;
    }
    customOffsets = new Float32Array(count * 3);
    if (offsetSource.type === 'image' || offsetSource.type === 'drawing') {
        const data = offsetSource.data;
        const w = offsetSource.w;
        const h = offsetSource.h;
        for (let i = 0; i < count; i++) {
            const px = i % w;
            const py = ((i / w) | 0) % h;
            const idx = (py * w + px) * 4;
            const b = (data[idx] + data[idx + 1] + data[idx + 2]) / 765 * brightnessFactor;
            const o = i * 3;
            customOffsets[o] = (b - 0.5) * formScale * 1.5;
            customOffsets[o + 1] = (b - 0.5) * formScale * 1.5;
            customOffsets[o + 2] = (b - 0.5) * formScale * 1.2;
        }
    } else if (offsetSource.type === 'model') {
        const src = offsetSource.data;
        const n = src.length / 3;
        for (let i = 0; i < count; i++) {
            const s = (i % n) * 3;
            const o = i * 3;
            customOffsets[o] = src[s] * offsetSource.scale - offsetSource.cx;
            customOffsets[o + 1] = src[s + 1] * offsetSource.scale - offsetSource.cy;
            customOffsets[o + 2] = src[s + 2] * offsetSource.scale - offsetSource.cz;
        }
    }
}

export function clearOffsets() {
    offsetSource = null;
    customOffsets = null;
}
