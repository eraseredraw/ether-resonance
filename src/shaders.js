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
    float size = uSize * uPixelRatio * (0.6 + vSeed * 0.8) * tw;
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
    float glow = exp(-d * 5.0) * 0.9;
    float a = core + glow;
    vec3 c = vColor * (core * 1.0 + glow * 0.6) * uIntensity;
    gl_FragColor = vec4(c, min(1.0, a * 0.95));
}
`;

export function createParticleMaterial({ size = 0.5, intensity = 1.0 } = {}) {
    const mat = new THREE.ShaderMaterial({
        uniforms: {
            uSize: { value: size },
            uPixelRatio: { value: 1 },
            uTime: { value: 0 },
            uTwinkle: { value: 1 },
            uIntensity: { value: intensity }
        },
        vertexShader: VERTEX_SHADER,
        fragmentShader: FRAGMENT_SHADER,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
    });
    return mat;
}

export function updateParticleMaterial(mat, { size, intensity, twinkle, time, pixelRatio }) {
    if (!mat) return;
    if (size !== undefined) mat.uniforms.uSize.value = size;
    if (intensity !== undefined) mat.uniforms.uIntensity.value = intensity;
    if (twinkle !== undefined) mat.uniforms.uTwinkle.value = twinkle ? 1 : 0;
    if (time !== undefined) mat.uniforms.uTime.value = time;
    if (pixelRatio !== undefined) mat.uniforms.uPixelRatio.value = pixelRatio;
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