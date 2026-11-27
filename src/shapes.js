// ============================================
// ETHER RESONANCE — SHAPES
// Parametric shape generator, zero allocation.
// Module-level state is intentionally plain
// variables so `.toString()` output stays
// self-contained for code export.
// ============================================

export const SHAPES = ['sphere', 'torus', 'spiral', 'cube', 'tesseract', 'moire', 'ruled', 'plane', 'helix', 'donut', 'ribbon', 'vortex', 'chaos'];

const PI2 = Math.PI * 2;
const SQRT_PI = Math.sqrt(Math.PI);

let currentShape = 'sphere';
let formScale = 150;
let formRotationSpeed = 0.3;
let formChaos = 0;
let customOffsets = null;

// Moiré bench parameters (only the 'moire' shape reads them): how many
// parallel lattices, the static twist between neighbours, the gap
// along the view axis, and the lattice pitch (distance between points).
let moireLayers = 4;
let moireTwist = 0.14;   // radians between adjacent layers
let moireGap = 0.5;      // layer spacing as a fraction of formScale

// Lattice pitch multiplier: the distance between neighbouring points.
// Point count stays put, the grid spreads or tightens under it. Read by the
// grid forms (cube, plane, moire, tesseract, ruled); organic forms ignore it.
let formPitch = 1;

// Per-frame trig caches. The lattice angle depends on the LAYER (or the
// thread), never on the particle, so recomputing it per particle costs
// ~4M cos/sin calls per frame at 500K particles. Each cache is keyed on
// the inputs that produced it: one hit reuses the whole frame's work.
let moireKeyTime = NaN, moireKeyRot = NaN, moireKeyTwist = NaN;
let moireKeyLayers = -1, moireKeyGap = NaN, moireKeyScale = NaN;
const moireCa = new Float32Array(8);
const moireSa = new Float32Array(8);
const moireZ = new Float32Array(8);

let tessKeyTime = NaN, tessKeyRot = NaN;
const tessTrig = new Float32Array(4);   // cos a, sin a, cos b, sin b

let ruledKeyTime = NaN, ruledKeyRot = NaN;
const RULED_THREADS = 96;
const ruledCb = new Float32Array(RULED_THREADS * 2);  // cos of bottom angle
const ruledSb = new Float32Array(RULED_THREADS * 2);
const ruledCt = new Float32Array(RULED_THREADS * 2);  // cos of top angle
const ruledSt = new Float32Array(RULED_THREADS * 2);

// Audio-driven modulation (multipliers live here so the shape
// function stays dependency-free for exported code).
let formScaleMod = 1;
let formRotationSpeedMod = 1;

// Pointer interaction (plain vars so exported code stays valid)
let mouseX = -9999;
let mouseY = -9999;
let mouseStrength = 0;
let mouseMode = 'repulse'; // 'repulse' | 'attract'
let waveX = 0;
let waveY = 0;
let waveStart = -999999;

export function setMouseState(x, y, strength) {
    mouseX = x;
    mouseY = y;
    mouseStrength = strength;
}

export function setMouseMode(mode) {
    mouseMode = mode === 'attract' ? 'attract' : 'repulse';
}

export function triggerWave(x, y, nowSec) {
    waveX = x;
    waveY = y;
    waveStart = nowSec;
}

export function getPointerState() {
    return { mouseX, mouseY, mouseStrength, waveStart, waveX, waveY };
}

let offsetSource = null;

export function setShapeState(s) {
    if (typeof s.currentShape === 'string') currentShape = s.currentShape;
    if (typeof s.formScale === 'number') formScale = s.formScale;
    if (typeof s.formRotationSpeed === 'number') formRotationSpeed = s.formRotationSpeed;
    if (typeof s.formChaos === 'number') formChaos = s.formChaos;
    if (typeof s.moireLayers === 'number') moireLayers = Math.max(2, Math.min(8, s.moireLayers | 0));
    if (typeof s.moireTwist === 'number') moireTwist = s.moireTwist;
    if (typeof s.moireGap === 'number') moireGap = Math.max(0.1, Math.min(1.2, s.moireGap));
    if (typeof s.formPitch === 'number') formPitch = Math.max(0.4, Math.min(2, s.formPitch));
}

export function getShapeState() {
    return { currentShape, formScale, formRotationSpeed, formChaos, moireLayers, moireTwist, moireGap, formPitch };
}

export function setMoireState(layers, twist, gap) {
    moireLayers = Math.max(2, Math.min(8, layers | 0));
    moireTwist = twist;
    moireGap = Math.max(0.1, Math.min(1.2, gap));
}

export function setFormPitch(p) {
    formPitch = Math.max(0.4, Math.min(2, p));
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
            // Multi-shell living sphere: 4 nested shells, each rotating
            // at its own speed, breathing radius, per-particle wobble.
            const shells = 4;
            const shell = i % shells;
            const wob = Math.sin(i * 127.1) * 43758.5453 % 1;
            const rShell = scale * (0.35 + 0.65 * (shell / (shells - 1)));
            const r = rShell * (0.85 + 0.3 * Math.abs(wob)) * (1 + 0.05 * Math.sin(time * 2 + shell * 1.7));
            const a = theta + time * rotSpeed * (0.6 + shell * 0.45);
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
            const cubeSize = scale * 2 * formPitch;
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
        case 'moire': {
            // Moiré bench: `moireLayers` parallel square lattices stacked
            // along Z. Adjacent layers carry the same grid pitch but are
            // twisted by `moireTwist` and counter-rotate, so their
            // superposition keeps growing and dissolving beat fringes.
            // Nothing curved here: the illusion is pure interference.
            const layers = moireLayers;
            const side = Math.max(6, Math.round(Math.sqrt(t / layers)));
            const cell = side * side;
            let li = Math.floor(i / cell);
            if (li >= layers) li = layers - 1;          // tail packs the last layer
            const j = i - li * cell;
            const ux = (((j % side) + 0.5) / side) * 2 - 1;
            const uy = (((j / side | 0) + 0.5) / side) * 2 - 1;
            // Layer geometry is per-layer, not per-particle: rebuild the
            // table only when something it depends on actually moved.
            if (time !== moireKeyTime || rotSpeed !== moireKeyRot ||
                moireTwist !== moireKeyTwist || layers !== moireKeyLayers ||
                moireGap !== moireKeyGap || scale !== moireKeyScale) {
                moireKeyTime = time; moireKeyRot = rotSpeed; moireKeyTwist = moireTwist;
                moireKeyLayers = layers; moireKeyGap = moireGap; moireKeyScale = scale;
                for (let l = 0; l < layers; l++) {
                    const ang = l * moireTwist + time * rotSpeed * (l % 2 === 0 ? 0.5 : -0.5);
                    moireCa[l] = Math.cos(ang);
                    moireSa[l] = Math.sin(ang);
                    moireZ[l] = (l - (layers - 1) / 2) * scale * moireGap;
                }
            }
            // Pitch scales the neighbour distance: the point count stays
            // put, the lattice spreads or tightens under it.
            const ext = scale * 1.3 * formPitch;
            const ca = moireCa[li], sa = moireSa[li];
            x = (ux * ca - uy * sa) * ext;
            y = (ux * sa + uy * ca) * ext;
            z = moireZ[li];
            break;
        }
        case 'tesseract': {
            // Hypercube SHELL: its boundary is 8 cubical faces, so each
            // particle lands on one face and gets 3 free lattice axes.
            // Rotation happens in the XW and YW planes (real 4D motion),
            // then a perspective divide on w folds it into 3D. The
            // opposite faces are parallel screens — the same moiré the
            // cube gives, but the inner shell breathes through the outer.
            const side = Math.max(4, Math.round(Math.cbrt(t / 8)));
            const cell = side * side * side;
            let f = Math.floor(i / cell);
            if (f >= 8) f = 7;                          // tail packs the last face
            const j = i - f * cell;
            const u = (((j % side) + 0.5) / side) * 2 - 1;
            const v = ((((j / side | 0) % side) + 0.5) / side) * 2 - 1;
            const w = ((Math.floor(j / (side * side)) + 0.5) / side) * 2 - 1;
            const axis = f & 3;                         // 0=x 1=y 2=z 3=w
            const sign = f < 4 ? -1 : 1;
            let x4, y4, z4, w4;
            if (axis === 0) { x4 = sign; y4 = u; z4 = v; w4 = w; }
            else if (axis === 1) { x4 = u; y4 = sign; z4 = v; w4 = w; }
            else if (axis === 2) { x4 = u; y4 = v; z4 = sign; w4 = w; }
            else { x4 = u; y4 = v; z4 = w; w4 = sign; }
            // Both 4D rotations depend on time only: four trig calls per
            // frame instead of four per particle.
            if (time !== tessKeyTime || rotSpeed !== tessKeyRot) {
                tessKeyTime = time; tessKeyRot = rotSpeed;
                const a = time * rotSpeed * 0.8;
                const b = time * rotSpeed * 0.5;
                tessTrig[0] = Math.cos(a); tessTrig[1] = Math.sin(a);
                tessTrig[2] = Math.cos(b); tessTrig[3] = Math.sin(b);
            }
            const ca = tessTrig[0], sa = tessTrig[1];
            const rx4 = x4 * ca - w4 * sa;
            w4 = x4 * sa + w4 * ca;
            x4 = rx4;
            const cb = tessTrig[2], sb = tessTrig[3];
            const ry4 = y4 * cb - w4 * sb;
            w4 = y4 * sb + w4 * cb;
            y4 = ry4;
            const k = scale * 1.35 * formPitch / (2.8 - w4);        // 4D→3D perspective
            x = x4 * k;
            y = y4 * k;
            z = z4 * k;
            break;
        }
        case 'ruled': {
            // Ruled hyperboloid: every particle sits on a perfectly
            // STRAIGHT thread stretched between two rings, the top ring
            // twisted ~120° from the bottom. The envelope the eye reads
            // as a curved waist is not drawn — it is the caustic of the
            // threads. Two counter-rotating families then interfere,
            // and the surface appears to shimmer with grids that exist
            // nowhere in the data.
            const threads = RULED_THREADS;
            const perThread = Math.max(4, Math.round(t / (threads * 2)));
            const seg = threads * perThread;
            const fam = Math.floor(i / seg) & 1;        // two opposing families
            const j = i % seg;
            const th = Math.floor(j / perThread);
            const s = ((j % perThread) + 0.5) / perThread;
            // Ring angles depend on time and the family twist only:
            // 384 trig calls per frame, reused by every particle.
            if (time !== ruledKeyTime || rotSpeed !== ruledKeyRot) {
                ruledKeyTime = time; ruledKeyRot = rotSpeed;
                for (let f = 0; f < 2; f++) {
                    const tw = 2.1 + time * rotSpeed * (f ? -0.4 : 0.4);
                    for (let n = 0; n < threads; n++) {
                        const ba = (n / threads) * PI2 + (f ? Math.PI / threads : 0);
                        const k = f * threads + n;
                        ruledCb[k] = Math.cos(ba); ruledSb[k] = Math.sin(ba);
                        ruledCt[k] = Math.cos(ba + tw); ruledSt[k] = Math.sin(ba + tw);
                    }
                }
            }
            const k = fam * threads + th;
            const r = scale * 0.62 * formPitch;
            const h = scale * 0.9;
            const bx = ruledCb[k] * r, bz = ruledSb[k] * r;
            const tx = ruledCt[k] * r, tz = ruledSt[k] * r;
            x = bx + (tx - bx) * s;                     // strict linear interp
            y = (s - 0.5) * 2 * h;
            z = bz + (tz - bz) * s;
            break;
        }
        case 'plane': {
            const planeCols = Math.sqrt(t);
            const planeSize = scale * 2 * formPitch;
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

    // Cursor repulsion / attraction
    if (mouseStrength > 0) {
        const mdx = x - mouseX;
        const mdy = y - mouseY;
        const mdz = z;
        const md2 = mdx * mdx + mdy * mdy + mdz * mdz;
        const pushR = 150;
        if (md2 < pushR * pushR && md2 > 1e-6) {
            const md = Math.sqrt(md2);
            const push = mouseStrength * (1 - md / pushR);
            const sign = mouseMode === 'attract' ? -1 : 1;
            x += (mdx / md) * push * sign;
            y += (mdy / md) * push * sign;
            z += (mdz / md) * push * sign;
        }
    }

    // Click shockwave (radial ring, expands and fades)
    if (time > waveStart) {
        const elapsed = time - waveStart;
        const waveLife = 0.9;
        if (elapsed < waveLife) {
            const waveR = elapsed * 260;
            const wdx = x - waveX;
            const wdy = y - waveY;
            const wdz = z * 0.4;
            const wd = Math.sqrt(wdx * wdx + wdy * wdy + wdz * wdz);
            const ring = Math.abs(wd - waveR);
            const ringW = 70;
            if (ring < ringW && wd > 1e-6) {
                const fade = 1 - elapsed / waveLife;
                const push = 90 * fade * (1 - ring / ringW);
                x += (wdx / wd) * push;
                y += (wdy / wd) * push;
                z += (wdz / wd) * push;
            }
        }
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
    if (offsetSource.type === 'photo') {
        // Photo mode builds absolute layouts (see writePhotoPositionsToArray);
        // there is no displacement to bake into customOffsets.
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

// ============================================
// PHOTO MODE (particles spell an uploaded image)
// Pure layout math, no DOM. The envelope is resolved
// once per call into module scratch, so the per-particle
// pass stays allocation-free.
// ============================================

// Prepared photo layout (Zero GC — module scratch, mirrors the cached
// math constants at the top of the file)
let photoW = 0;
let photoH = 0;
let photoData = null;
let photoWidth = 0;
let photoHeight = 0;
let photoDepth = 0;

// Resolve the photo envelope for the active source. The rectangle keeps the
// image aspect ratio and fits the same half-extent (formScale * formScaleMod)
// the cube/plane forms use; depth is a fraction of it. Returns false when the
// active source is not a photo, so callers keep the shape path untouched.
function preparePhotoLayout() {
    if (!offsetSource || offsetSource.type !== 'photo' || !offsetSource.data) return false;
    const scale = formScale * formScaleMod;
    const aspect = offsetSource.aspect > 0 ? offsetSource.aspect : offsetSource.w / offsetSource.h;
    if (aspect >= 1) {
        photoWidth = scale * 2;
        photoHeight = photoWidth / aspect;
    } else {
        photoHeight = scale * 2;
        photoWidth = photoHeight * aspect;
    }
    photoDepth = scale * 0.6;
    photoW = offsetSource.w;
    photoH = offsetSource.h;
    photoData = offsetSource.data;
    return true;
}

// Pure per-particle photo layout. Particle i maps onto pixel (px, py) of the
// sampled grid WITHOUT row wrapping: the tail beyond w * h clamps to the last
// row (the `% h` wrap of the displacement path above is what band-smeared it —
// photo mode must not repeat it). Luminance becomes depth, the pixel's own RGB
// becomes the particle colour so the photo stays recognisable instead of
// collapsing into the palette. `w === 1 || h === 1` centres that axis rather
// than dividing by a zero step. `colOut` may be null for positions-only passes.
export function writePhotoLayout(i, w, h, data, width, height, depth, out, o, colOut, c) {
    const px = i % w;
    let py = (i / w) | 0;
    if (py >= h) py = h - 1;
    const idx = (py * w + px) * 4;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    const lum = (r + g + b) / 765;
    const nx = w > 1 ? px / (w - 1) - 0.5 : 0;
    const ny = h > 1 ? 0.5 - py / (h - 1) : 0;
    out[o] = nx * width;
    out[o + 1] = ny * height;
    out[o + 2] = (lum - 0.5) * depth;
    if (colOut) {
        colOut[c] = r / 255;
        colOut[c + 1] = g / 255;
        colOut[c + 2] = b / 255;
    }
}

// Fill positions AND colours from the photo source. Allocation-free per call.
// `t` is accepted for parity with writePositionsToArray; the photo layout is
// deliberately static in time (motion comes from the camera and the material).
export function writePhotoPositionsToArray(arr, colors, count, t) {
    if (!preparePhotoLayout()) return;
    for (let i = 0; i < count; i++) {
        const o = i * 3;
        writePhotoLayout(i, photoW, photoH, photoData, photoWidth, photoHeight, photoDepth, arr, o, colors, o);
    }
}

// Build a 'photo' offset source from an already-decoded frame. Pure seam for
// any frame provider (upload today, live camera later): no DOM, no canvases,
// no file access — the caller hands over an ImageData-shaped buffer
// ({ data: Uint8ClampedArray, width, height }) plus explicit dimensions and
// gets the source object back (null when the buffer is missing or short).
// Cheap enough to call every frame: the only allocation is the source object
// itself, writePhotoPositionsToArray reuses module scratch, and
// regenerateOffsets keeps customOffsets null for photo sources (nothing is
// re-allocated per call, dimensions or not).
export function buildPhotoSource(imageData, width, height) {
    const data = imageData && imageData.data;
    const w = Math.max(1, width | 0);
    const h = Math.max(1, height | 0);
    if (!data || data.length < w * h * 4) return null;
    return { type: 'photo', data: data, w: w, h: h, aspect: w / h };
}
