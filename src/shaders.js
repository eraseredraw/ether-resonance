// ============================================
// ETHER RESONANCE — PARTICLE SHADER
// Soft round particles with radial glow, per-particle
// twinkle and audio intensity, replacing PointsMaterial.
// ============================================
import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const VERTEX_SHADER = `
uniform float uSize;
uniform float uPixelRatio;
uniform float uTwinkle;
uniform float uTime;
uniform float uBeatPulse;
attribute vec3 color;
varying vec3 vColor;
varying float vSeed;

float hash(vec3 p) {
    return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453);
}

void main() {
    vColor = color;
    vSeed = hash(position + 0.37);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float tw = uTwinkle > 0.5 ? 0.7 + 0.5 * sin(uTime * (1.0 + vSeed * 4.0) + vSeed * 90.0) : 1.0;
    float size = uSize * uPixelRatio * (0.6 + vSeed * 0.8) * tw * (1.0 + uBeatPulse * 0.35);
    gl_PointSize = size * (420.0 / max(0.1, -mv.z));
    gl_Position = projectionMatrix * mv;
}
`;

const FRAGMENT_SHADER = `
precision highp float;
uniform float uIntensity;
varying vec3 vColor;
varying float vSeed;

void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv) * 2.0;
    float core = 1.0 - smoothstep(0.15, 0.5, d);
    float glow = exp(-d * 4.2) * 1.2;
    float a = core + glow;
    vec3 c = vColor * (core * 1.3 + glow * 0.8) * uIntensity * 1.2;
    gl_FragColor = vec4(c, min(1.0, a * 0.98));
}
`;

export function createParticleMaterial({ size = 0.75, intensity = 1.0 } = {}) {
    const mat = new THREE.ShaderMaterial({
        uniforms: {
            uSize: { value: size },
            uPixelRatio: { value: 1 },
            uTime: { value: 0 },
            uTwinkle: { value: 1 },
            uIntensity: { value: intensity },
            uBeatPulse: { value: 0 }
        },
        vertexShader: VERTEX_SHADER,
        fragmentShader: FRAGMENT_SHADER,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
    });
    return mat;
}

export function updateParticleMaterial(mat, { size, intensity, twinkle, time, pixelRatio, beatPulse }) {
    if (!mat) return;
    if (size !== undefined) mat.uniforms.uSize.value = size;
    if (intensity !== undefined) mat.uniforms.uIntensity.value = intensity;
    if (twinkle !== undefined) mat.uniforms.uTwinkle.value = twinkle ? 1 : 0;
    if (time !== undefined) mat.uniforms.uTime.value = time;
    if (pixelRatio !== undefined) mat.uniforms.uPixelRatio.value = pixelRatio;
    if (beatPulse !== undefined) mat.uniforms.uBeatPulse.value = beatPulse;
}

// ============================================
// CHROMATIC ABERRATION (RGB shift) pass
// ============================================
export const RGB_SHIFT_FRAGMENT = `
uniform sampler2D tDiffuse;
uniform float uAmount;
varying vec2 vUv;

void main() {
    vec2 dir = vUv - 0.5;
    vec2 ruv = vUv + dir * uAmount;
    vec2 buv = vUv - dir * uAmount;
    float r = texture2D(tDiffuse, ruv).r;
    float g = texture2D(tDiffuse, vUv).g;
    float b = texture2D(tDiffuse, buv).b;
    gl_FragColor = vec4(r, g, b, 1.0);
}
`;

export function createRGBShiftPass(amount = 0.003) {
    return new ShaderPass({
        uniforms: {
            tDiffuse: { value: null },
            uAmount: { value: amount }
        },
        vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
        fragmentShader: RGB_SHIFT_FRAGMENT
    });
}

// ============================================
// ASCII POST-PROCESSING pass
// ============================================
// Terminal-style render: the frame is divided into character cells, each
// cell's luminance picks a luminance slot, and within the slot one VARIANT
// is picked per cell by hashing (cell, time bucket) — so characters FLICKER
// at uFlipRate Hz and short word fragments (RU + EN) slip through among
// glyphs. Ten named sets; the atlas is a 10x4 grid rebuilt on set switch.
// Disabled by default (pass.enabled); zero cost while off.
export const ASCII_SLOT_COUNT = 10;
export const ASCII_VARIANTS = 4;

// Each set: 10 slots dark→bright, each slot up to 4 variants (padded).
// Multi-char tokens are squeezed into the cell to fit.
// Each set: 10 slots dark->bright, each slot up to 4 variants (padded).
// Multi-char tokens are squeezed into the cell to fit. Mood sets also carry
// `phrases` -- whole caption lines rendered into a phrase atlas: occasionally
// a cell ROW is replaced by one of them, so detached RU/EN sentence
// fragments slip through the glyph field.
export const ASCII_PHRASE_CELLS = 32;

export const ASCII_SETS = [
    { name: 'Classic', phrases: [], slots: [
        [' ', ' ', '·', ' '], ['.', "'", '·', '.'], [':', '-', ':', '.'],
        ['=', '+', '-', ':'], ['+', '*', '=', '+'], ['*', '#', '*', '='],
        ['#', '%', '#', '*'], ['%', '@', '&', '#'], ['@', '#', '@', '%'],
        ['@', '@', '▓', '@']
    ] },
    { name: 'Eternal', phrases: [
        'eternal return', 'ничего не вечно', 'the loop again', 'time is flat',
        'всё повторится', 'forever is a lie', 'снова и снова', 'no beginning',
        'конец это старт', 'life loops', 'nothing lasts', 'вне времени'
    ], slots: [
        [' ', ' ', '· ', ' '], ['·', 'et', '∞', 'er'], ['et', 'er', 'nt', 'al'],
        ['ern', 'al', 'no', 're'], ['ET', 'RN', 'AL', '∞'], ['ERN', 'AL', 'ET', 'NE'],
        ['ETRN', 'ALW', '∞N', 'LOOP'], ['ETERN', 'AL', '∞∞∞', 'LOOP'],
        ['eternal', 'always', '∞∞∞∞', 'NEVER'], ['ETERNAL', '∞∞∞∞∞', 'AGAIN@', 'ΞTERNAL']
    ] },
    { name: 'Ethereal', phrases: [
        'невесомость', 'floating away', 'сквозь сон', 'soft static',
        'туман и свет', 'dream logic', 'мимо нас', 'drift forever',
        'тихий свет', 'почти сон', 'weightless', 'где-то далеко'
    ], slots: [
        [' ', '  ', ' ', '  '], ['·', '˙', 'dr', 'ft'], ['dr', 'ft', 'so', 'st'],
        ['soft', 'drift', 'fog', 'air'], ['SOFT', 'DR', 'FL', 'миг'],
        ['FLOAT', 'DRIFT', 'миг', 'СОН'], ['DREAM', 'FOG', 'СОН', 'FLY'],
        ['FLOAT', 'СОН', 'dream', 'drift'], ['floating', 'dreams', 'сквозь', 'сон'],
        ['FLOATING', 'СКВОЗЬ СОН', 'dream∞', 'SOFT LIGHT']
    ] },
    { name: 'Deathcore', phrases: [
        'deathcore', 'burn it down', 'смерть и мрак', 'no god no hope',
        'кровь на стенах', 'rot away', 'doom forever', 'зло',
        'break the sky', 'финал близко', 'hate feeds', 'nothing holy'
    ], slots: [
        [' ', '  ', ' ', '  '], ['.', '·x', '`x', "''"], ['rot', 'vx', 'xv', '/\\'],
        ['xX', 'vV', 'gore', 'rot'], ['ROTX', 'gore', 'xXx', 'dead'],
        ['DEAD', 'ROTX', 'gore', 'xX'], ['DEATH', 'BLOOD', 'rot', 'xXx'],
        ['DEATH', 'CORE', 'hate', 'void'], ['DEATHCORE', 'no god', 'void', 'hate'],
        ['DEATHCORE@', '☠ VOID', 'ROT∞', 'HATE']
    ] },
    { name: 'Emoviolence', phrases: [
        'emoviolence', 'nobody cares', 'больно и пусто', "don't call me",
        'я никому не нужен', 'hurts to breathe', 'тише', 'конец',
        'everything ends', 'слёзы сохнут', 'lie to me again', 'оставь'
    ], slots: [
        [' ', '  ', ' ', '  '], ['.', '·x', '._', "''"], ['low', 'sad', '._.', 'x_'],
        ['cry', 'x_x', 'sad', '._.'], ['alone', 'hurt', ';_;', ':('],
        ['HURT', 'alone', 'cry', 'xX'], ['ALONE', 'HURT', 'CRIED', 'scars'],
        ['nobody', 'no one', 'hurts', ' scars'], ['emoviolence', 'alone again', 'nobody', 'hurt me'],
        ['EMOVIOLENCE', 'ALONE@∞', 'nothing', 'left']
    ] },
    { name: 'Smiles', phrases: [], slots: [
        [' ', '  ', ' ', '  '], ['.', ',', '·', '.'], [':|', ':]', ':I', '.o'],
        [':o', ':P', ':]', ':p'], [':D', ':O', 'xD', ':P'], ['xD', 'XD', ':D', 'xD'],
        ['XD', 'xD', '8)', 'xD'], [':D', '8)', 'B)', 'xD'], ['8)', 'B)', ':D', '8D'],
        ['8D', 'B)', '8)', 'XD']
    ] },
    { name: 'Blocks', phrases: [], slots: [
        [' ', ' ', ' ', ' '], ['░', '.', '░', '·'], ['▒', '░', ':', '▒'],
        ['▒▒', '░▒', '▒', '░'], ['▓', '▒', '▓', '▒'], ['▓▒', '▓', '▒▓', '▓'],
        ['█', '▓', '█', '▓'], ['█▓', '▓█', '█', '▓'], ['██', '█▓', '██', '█'],
        ['██', '██', '▓█', '██']
    ] },
    { name: 'Matrix', phrases: [], slots: [
        [' ', ' ', ' ', ' '], ['·0', '.', '·1', '0'], [':0', ';1', '.01', '10'],
        ['01', '10', '0|', '1|'], ['0', '1', '|0', '|1'], ['01', '10', '11', '00'],
        ['1丨', '0丨', '|1', '01'], ['10', '01', '1', '0'], ['01', '10', '11', '01'],
        ['@1', '1@', '01', '10']
    ] },
    { name: 'Русский', phrases: [
        'мы и не жили', 'свет погас раньше нас', 'никто не заметил', 'тише, чем пыль',
        'я из не-здесь', 'пустота смотрит в ответ', 'сны без сновидцев', 'дверь в никуда приоткрыта',
        'всё уже случилось', 'между нами пыль', 'не оборачивайся', 'слов нет — есть эхо',
        'тени помнят всё', 'мы только эхо', 'сквозь нас дышит ночь', 'этого никогда не было',
        'имя стёрлось', 'часы стоят', 'город живёт без нас', 'останься тенью',
        'где кончается я', 'дом нас не ждал', 'шёпот из стены', 'остаточный свет'
    ], slots: [
        [' ', '  ', '   ', '  '], ['·', 'мгл', '.', 'мгла'], ['тьма', 'мгла', 'тьм', '·мг'],
        ['мне', 'нет', 'ни', 'тиш'], ['вслепую', 'затемно', 'мне', 'тише'],
        ['шёпот', 'пыль', 'эхо', 'стыл'], ['непрочно', 'зрачки', 'вслепую', 'тонко'],
        ['растворюсь', 'никому', 'не снилось', 'наизусть'],
        ['пустота', 'смотрит', 'сквозь', 'остаточный'],
        ['РАСТВОРЮСЬ', 'ПУСТОТА@', 'НИКОМУ∞', 'ЭХО ЭХО']
    ] },
    { name: 'English', phrases: [
        'signal lost', 'who is there', 'waking up', 'no signal',
        'static hum', 'hello?', 'output empty', 'again again',
        'the void stares', 'cold boot', 'nobody home', 'last frame',
        'signal decay', 'a door opened', 'no one left', 'we were never here',
        'listen to the hum', 'the room forgot us', 'off by one life', 'mute the world',
        'echo chamber', 'ghost in the feed', 'sleep is a door', 'last bus gone'
    ], slots: [
        [' ', ' ', '  ', ' '], ['·t', '.', '·i', ',l'], [':t', ';i', '.ls', ',th'],
        ['ti', 'ls', 'on', 'an'], ['T', 'I', 'L', 'S'], ['TI', 'ON', 'TH', 'AN'],
        ['THE', 'AND', 'IT', 'AS'], ['TER', 'ION', 'ENT', 'ATH'], ['ETE', 'THO', 'RNI', 'STA'],
        ['@N', 'ET', 'TH', 'AL']
    ] }
];

// Caption atlas: each phrase is one row of 32 character cells, per-character
// drawn so the shader can sample exactly one cell. Horizontal repeat wraps
// the phrase across wide screens; empty sets get a 1-row blank atlas and
// chance 0, so symbol sets never trigger the caption branch.
export function buildPhraseAtlas(setIdx = 0, cellsW = ASCII_PHRASE_CELLS, cellW = 20, cellH = 20) {
    const set = ASCII_SETS[((setIdx % ASCII_SETS.length) + ASCII_SETS.length) % ASCII_SETS.length];
    const phrases = set.phrases || [];
    const rows = Math.max(1, phrases.length);
    const c = document.createElement('canvas');
    c.width = cellsW * cellW;
    c.height = rows * cellH;
    const g = c.getContext('2d');
    g.fillStyle = '#000';
    g.fillRect(0, 0, c.width, c.height);
    if (phrases.length) {
        g.fillStyle = '#fff';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.font = 'bold ' + Math.floor(cellH * 0.72) + 'px monospace';
        for (let r = 0; r < phrases.length; r++) {
            const text = phrases[r].slice(0, cellsW);
            const off = Math.floor((cellsW - text.length) / 2);
            for (let x = 0; x < text.length; x++) {
                g.fillText(text[x], (off + x) * cellW + cellW / 2, r * cellH + cellH / 2 + 1);
            }
        }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    return { tex: tex, rows: rows, chance: phrases.length ? 0.22 : 0 };
}

export function buildAsciiAtlas(setIdx = 0, cellW = 20, cellH = 20) {
    const set = ASCII_SETS[((setIdx % ASCII_SETS.length) + ASCII_SETS.length) % ASCII_SETS.length];
    const c = document.createElement('canvas');
    c.width = cellW * ASCII_SLOT_COUNT;
    c.height = cellH * ASCII_VARIANTS;
    const g = c.getContext('2d');
    g.fillStyle = '#000';
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#fff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const baseFont = Math.floor(cellH * 0.8);
    for (let s = 0; s < ASCII_SLOT_COUNT; s++) {
        const variants = set.slots[s];
        for (let v = 0; v < ASCII_VARIANTS; v++) {
            const token = variants[v] !== undefined ? variants[v] : variants[variants.length - 1] || ' ';
            // squeeze longer tokens into the cell: shrink font by token length
            const fs = token.length > 1
                ? Math.max(6, Math.floor(baseFont / (token.length * 0.62)))
                : baseFont;
            g.font = 'bold ' + fs + 'px monospace';
            g.fillText(token, s * cellW + cellW / 2, v * cellH + cellH / 2 + 1);
        }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
}

export const ASCII_FRAGMENT = `
uniform sampler2D tDiffuse;
uniform sampler2D uAtlas;
uniform sampler2D uPhrase;
uniform vec2 uResolution;
uniform vec2 uCell;
uniform float uTime;
uniform float uFlipRate;
uniform float uPhraseChance;
uniform float uPhraseRows;
varying vec2 vUv;

float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

void main() {
    vec2 cells = max(floor(uResolution / uCell), vec2(1.0));
    vec2 idx = floor(vUv * cells);
    vec2 center = (idx + 0.5) / cells;
    vec3 scene = texture2D(tDiffuse, center).rgb;
    float l = lum(scene);
    float n = ${ASCII_SLOT_COUNT}.0;
    float gi = clamp(floor(l * n), 0.0, n - 1.0);
    // per-cell variant: hash of (cell, time bucket) -> one of 4 variants,
    // so glyphs flicker at uFlipRate Hz and word fragments slip through
    float bucket = floor(uTime * uFlipRate);
    float rnd = fract(sin(dot(idx, vec2(127.1, 311.7)) + bucket * 91.7) * 43758.5453);
    vec2 local = fract(vUv * cells);
    // occasionally a whole ROW becomes a caption line from the phrase atlas
    float rowRnd = fract(sin(dot(vec2(idx.y * 0.618 + 7.31, bucket * 0.717), vec2(127.1, 311.7))) * 43758.5453);
    float glyph;
    float glow = 0.0;
    if (rowRnd < uPhraseChance) {
        float phraseRow = floor(fract(sin(dot(vec2(idx.y * 0.373, bucket * 0.113), vec2(12.9898, 78.233))) * 43758.5453) * uPhraseRows);
        float px = mod(idx.x, ${ASCII_PHRASE_CELLS}.0);
        vec2 puv = vec2((px + local.x) / ${ASCII_PHRASE_CELLS}.0, (phraseRow + local.y) / uPhraseRows);
        glyph = texture2D(uPhrase, puv).r;
        glow = 0.22;
    } else {
        float row = floor(rnd * ${ASCII_VARIANTS}.0);
        vec2 auv = vec2((gi + local.x) / n, (row + local.y) / ${ASCII_VARIANTS}.0);
        glyph = texture2D(uAtlas, auv).r;
    }
    gl_FragColor = vec4(scene * glyph + glyph * glow, 1.0);
}
`;

export function createAsciiPass(atlas, cellW = 18, cellH = 22) {
    return new ShaderPass({
        uniforms: {
            tDiffuse: { value: null },
            uAtlas: { value: atlas },
            uResolution: { value: new THREE.Vector2(1, 1) },
            uCell: { value: new THREE.Vector2(cellW, cellH) },
            uTime: { value: 0 },
            uFlipRate: { value: 2 },
            uPhrase: { value: null },
            uPhraseRows: { value: 1 },
            uPhraseChance: { value: 0 }
        },
        vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
        fragmentShader: ASCII_FRAGMENT
    });
}

// ============================================
// STARFIELD background
// ============================================
export function createStarfield(count = 1200, radius = 1400) {
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
        const r = radius * (0.65 + Math.random() * 0.35);
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
        positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
        positions[i * 3 + 2] = r * Math.cos(phi);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
        size: 1.4,
        color: new THREE.Color(0.55, 0.65, 0.8),
        transparent: true,
        opacity: 0.85,
        sizeAttenuation: true,
        depthWrite: false
    });
    const points = new THREE.Points(geo, mat);
    points.name = 'starfield';
    return points;
}