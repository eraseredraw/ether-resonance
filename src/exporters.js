// ============================================
// ETHER RESONANCE — EXPORTERS
// Code / image / PLY / OBJ / GLB / WebM video.
// Pure builders are exported separately for tests.
// ============================================

export function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        URL.revokeObjectURL(url);
        a.remove();
    }, 1000);
}

// --- PLY (pure) ------------------------------------------------------
export function buildPlyText(pos, count) {
    let head = 'ply\nformat ascii 1.0\ncomment ETHER RESONANCE export\n';
    head += 'element vertex ' + count + '\n';
    head += 'property float x\nproperty float y\nproperty float z\n';
    head += 'end_header\n';
    let body = '';
    const chunk = 20000;
    for (let s = 0; s < count; s += chunk) {
        const end = Math.min(s + chunk, count);
        for (let i = s; i < end; i++) {
            body += pos[i * 3].toFixed(4) + ' ' + pos[i * 3 + 1].toFixed(4) + ' ' + pos[i * 3 + 2].toFixed(4) + '\n';
        }
    }
    return head + body;
}

// --- OBJ (pure) ------------------------------------------------------
export function buildObjText(pos, count) {
    let body = '# ETHER RESONANCE export\n';
    const chunk = 20000;
    for (let s = 0; s < count; s += chunk) {
        const end = Math.min(s + chunk, count);
        for (let i = s; i < end; i++) {
            body += 'v ' + pos[i * 3].toFixed(4) + ' ' + pos[i * 3 + 1].toFixed(4) + ' ' + pos[i * 3 + 2].toFixed(4) + '\n';
        }
    }
    return body;
}

// --- GLB (pure) ------------------------------------------------------
export function buildGlbBuffer(pos, count) {
    let min = [Infinity, Infinity, Infinity];
    let max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < count; i++) {
        for (let k = 0; k < 3; k++) {
            const v = pos[i * 3 + k];
            if (v < min[k]) min[k] = v;
            if (v > max[k]) max[k] = v;
        }
    }

    const bin = pos.buffer;
    const json = {
        asset: { version: '2.0', generator: 'ether-resonance' },
        scene: 0,
        scenes: [{ nodes: [0] }],
        nodes: [{ mesh: 0 }],
        meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
        accessors: [{
            bufferView: 0,
            componentType: 5126,
            count: count,
            type: 'VEC3',
            min: min,
            max: max
        }],
        bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: bin.byteLength, target: 34962 }],
        buffers: [{ byteLength: bin.byteLength }]
    };

    const jsonStr = JSON.stringify(json);
    const jsonBuf = new TextEncoder().encode(jsonStr);
    const jsonPadded = new Uint8Array(Math.ceil(jsonBuf.length / 4) * 4);
    jsonPadded.set(jsonBuf);
    for (let i = jsonBuf.length; i < jsonPadded.length; i++) jsonPadded[i] = 0x20;

    const binArr = new Uint8Array(bin);
    const total = 12 + 8 + jsonPadded.length + 8 + binArr.length;
    const out = new Uint8Array(total);
    const dv = new DataView(out.buffer);

    dv.setUint32(0, 0x46546C67, true);
    dv.setUint32(4, 2, true);
    dv.setUint32(8, total, true);
    dv.setUint32(12, jsonPadded.length, true);
    dv.setUint32(16, 0x4E4F534A, true);
    out.set(jsonPadded, 20);
    const binOffset = 20 + jsonPadded.length;
    dv.setUint32(binOffset, binArr.length, true);
    dv.setUint32(binOffset + 4, 0x004E4942, true);
    out.set(binArr, binOffset + 8);
    return out.buffer;
}

// --- Code export (pure, depends on injected fn sources) --------------
export function generateExportCode(type, { shapeFnSrc, colorFnSrc, config }) {
    const cfgJson = JSON.stringify(config, null, 4);

    const commonPrelude = `
const PI2 = Math.PI * 2;
const SQRT_PI = Math.sqrt(Math.PI);

const config = ${cfgJson};

// State (fed by config)
let currentShape = config.shape;
let formScale = config.formScale;
let formRotationSpeed = config.formRotationSpeed;
let formChaos = config.formChaos;
let formScaleMod = 1;
let formRotationSpeedMod = 1;
let colorMode = config.colorMode;
let hueOffset = config.hueOffset;
let hueOffsetMod = 0;
let colorSaturation = 0.8;
let colorAnimation = config.colorAnimation;
let customOffsets = null;
let time = 0;
let simSpeed = config.simSpeed;
let particleSize = config.particleSize;
let mouseX = -9999;
let mouseY = -9999;
let mouseStrength = 0;
let waveX = 0;
let waveY = 0;
let waveStart = -999999;

const tempColor = new (typeof THREE !== 'undefined' ? THREE.Color : class { setHSL(){} });

${shapeFnSrc}

${colorFnSrc}

function buildPoints(scene) {
    const positions = new Float32Array(config.particleCount * 3);
    const colors = new Float32Array(config.particleCount * 3);
    for (let i = 0; i < config.particleCount; i++) {
        writeShapePosition(i, config.particleCount, 0, positions, i * 3);
        writeParticleColor(i, config.particleCount, colors, i * 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const material = new THREE.PointsMaterial({
        size: particleSize,
        vertexColors: true,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true
    });
    const points = new THREE.Points(geometry, material);
    scene.add(points);
    return points;
}

function animate(points, camera) {
    requestAnimationFrame(() => animate(points, camera));
    time += simSpeed * 0.01;
    const posArr = points.geometry.attributes.position.array;
    for (let i = 0; i < config.particleCount; i++) {
        writeShapePosition(i, config.particleCount, time, posArr, i * 3);
    }
    points.geometry.attributes.position.needsUpdate = true;
    camera.position.x = Math.sin(time * 0.2) * 300;
    camera.position.z = Math.cos(time * 0.2) * 300;
    camera.lookAt(0, 0, 0);
}
`;

    if (type === 'vanilla') {
        return `// ETHER RESONANCE — Vanilla JS export (runs standalone)
// Uses Three.js r160 from unpkg via importmap.

<!-- EtherResonance.html -->
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Ether Resonance</title>
<style>html,body{margin:0;height:100%;overflow:hidden;background:#000005}canvas{display:block}</style>
<script type="importmap">{
  "imports": {
    "three": "https://unpkg.com/three@0.160.0/build/three.module.js"
  }
}</script>
</head>
<body>
<script type="module">
import * as THREE from 'three';
${commonPrelude}
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000005);
const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 2000);
camera.position.set(0, 100, 400);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
document.body.appendChild(renderer.domElement);
const points = buildPoints(scene);
animate(points, camera);
renderer.render(scene, camera);
</script>
</body>
</html>`;
    }

    if (type === 'react') {
        return `// ETHER RESONANCE — React export
// npm install three, then drop this component in.

import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
${commonPrelude}
export default function EtherResonance() {
    const mountRef = useRef(null);
    useEffect(() => {
        const mount = mountRef.current;
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x000005);
        const camera = new THREE.PerspectiveCamera(75, mount.clientWidth / mount.clientHeight, 0.1, 2000);
        camera.position.set(0, 100, 400);
        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(mount.clientWidth, mount.clientHeight);
        renderer.setPixelRatio(Math.min(2, devicePixelRatio));
        mount.appendChild(renderer.domElement);
        const points = buildPoints(scene);
        animate(points, camera);
        renderer.render(scene, camera);
        return () => {
            mount.removeChild(renderer.domElement);
            points.geometry.dispose();
            points.material.dispose();
            renderer.dispose();
        };
    }, []);
    return <div ref={mountRef} style={{ width: '100%', height: '100vh' }} />;
}`;
    }

    // three
    return `// ETHER RESONANCE — Three.js module export
// import { createParticleScene } from './ether-resonance.js';

import * as THREE from 'three';
${commonPrelude}
export function createParticleScene() {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000005);
    const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 2000);
    camera.position.set(0, 100, 400);
    const points = buildPoints(scene);
    return { scene, camera, points, animate: () => animate(points, camera) };
}`;
}

// --- Image export ----------------------------------------------------
export function exportImage(renderer, composer, camera, { resolution, format, notify }) {
    if (!renderer || !composer) return;
    const resMap = { '1080p': [1920, 1080], '2k': [2560, 1440], '4k': [3840, 2160] };
    const [w, h] = resMap[resolution] || resMap['1080p'];
    const mime = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' }[format];

    const prevPR = renderer.getPixelRatio();
    const prevW = window.innerWidth;
    const prevH = window.innerHeight;
    const prevAspect = camera.aspect;

    renderer.setPixelRatio(1);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    composer.setSize(w, h);
    composer.render();

    const url = renderer.domElement.toDataURL(mime, 0.95);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ether-resonance-' + resolution + '.' + format;
    a.click();

    renderer.setPixelRatio(prevPR);
    renderer.setSize(prevW, prevH, false);
    camera.aspect = prevAspect;
    camera.updateProjectionMatrix();
    composer.setSize(prevW, prevH);
    notify('IMAGE EXPORTED: ' + resolution);
}

// --- WebM video export ----------------------------------------------
export function exportVideo(renderer, { duration = 8, notify }) {
    if (!renderer || !renderer.domElement.captureStream) {
        notify('VIDEO EXPORT UNSUPPORTED IN THIS BROWSER');
        return;
    }
    const stream = renderer.domElement.captureStream(30);
    const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm';
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 12_000_000 });
    const chunks = [];
    rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunks, { type: 'video/webm' });
        downloadBlob(blob, 'ether-resonance.webm');
        notify('VIDEO EXPORTED (' + duration + 's)');
    };
    rec.start(250);
    notify('RECORDING ' + duration + 's...');
    setTimeout(() => rec.stop(), duration * 1000);
}