// ============================================
// ETHER RESONANCE — PARTICLE SHADER
// Soft round particles with radial glow, per-particle
// twinkle and audio intensity, replacing PointsMaterial.
// ============================================
import * as THREE from 'three';

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