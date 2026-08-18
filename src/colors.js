// ============================================
// ETHER RESONANCE — COLORS
// Zero-allocation HSL→RGB writer.
// ============================================
import * as THREE from 'three';

export const COLOR_MODES = ['rainbow', 'hue', 'plasma', 'ocean', 'fire', 'ice', 'cyan', 'gold', 'neon', 'white'];
export const COLOR_ANIMATIONS = ['static', 'scroll', 'wave', 'pulse', 'matrix'];

let colorMode = 'ice';
let hueOffset = 0;
let colorSaturation = 0.8;
let colorAnimation = 'static';

// Audio-driven hue drift (kept plain for toString-based export).
let hueOffsetMod = 0;

// Global sim time — kept plain so generated export code stays
// self-contained (the export prelude declares its own `time`).
let time = 0;

export function setColorTime(t) { time = t; }

export function setColorState(s) {
    if (typeof s.colorMode === 'string') colorMode = s.colorMode;
    if (typeof s.hueOffset === 'number') hueOffset = s.hueOffset;
    if (typeof s.colorSaturation === 'number') colorSaturation = s.colorSaturation;
    if (typeof s.colorAnimation === 'string') colorAnimation = s.colorAnimation;
}

export function getColorState() {
    return { colorMode, hueOffset, colorSaturation, colorAnimation };
}

export function setHueOffsetMod(m) { hueOffsetMod = m; }

const tempColor = new THREE.Color();

export function writeParticleColor(i, t, out, o) {
    let h, s, l;

    switch (colorMode) {
        case 'rainbow':
            h = (hueOffset + hueOffsetMod + (i / t) * 360) % 360;
            s = colorSaturation;
            l = 60;
            break;
        case 'hue':
            h = (hueOffset + hueOffsetMod + i * 0.1) % 360;
            s = colorSaturation;
            l = 65;
            break;
        case 'plasma': {
            const pIntensity = i / t;
            h = (hueOffset + hueOffsetMod + pIntensity * 60) % 360;
            s = 90;
            l = 50 + pIntensity * 20;
            break;
        }
        case 'ocean':
            h = (hueOffset + hueOffsetMod + 180 + (i / t) * 60) % 360;
            s = colorSaturation;
            l = 50 + (i / t) * 20;
            break;
        case 'fire':
            h = (hueOffset + hueOffsetMod + (i / t) * 40) % 360;
            s = 90;
            l = 50 + (i / t) * 30;
            break;
        case 'ice':
            h = (hueOffset + hueOffsetMod + 180 + (i / t) * 60) % 360;
            s = 70 + (i / t) * 30;
            l = 60 + (i / t) * 30;
            break;
        case 'cyan':
            h = (hueOffset + hueOffsetMod + 180) % 360;
            s = 100;
            l = 50 + (i / t) * 30;
            break;
        case 'gold':
            h = (hueOffset + hueOffsetMod + 40 + Math.sin(i / t * Math.PI) * 20) % 360;
            s = 80 + (i / t) * 20;
            l = 45 + (i / t) * 25;
            break;
        case 'neon':
            h = (hueOffset + hueOffsetMod + (i / t) * 360) % 360;
            s = 100;
            l = 55 + (i / t) * 15;
            break;
        case 'white':
        default:
            h = 0;
            s = 0;
            l = 70 + (i / t) * 30;
            break;
    }

    // Animation modes
    if (colorAnimation !== 'static') {
        switch (colorAnimation) {
            case 'scroll':
                h = (h + time * 30) % 360;
                break;
            case 'wave':
                l += Math.sin(i * 0.05 + time * 3) * 12;
                break;
            case 'pulse': {
                const p = Math.sin(time * 3) * 0.5 + 0.5;
                s = s * (0.7 + 0.3 * p);
                l += (p - 0.5) * 24;
                break;
            }
            case 'matrix':
                h = 120;
                s = 100;
                l = 20 + Math.abs(Math.sin(i * 0.13 + time * 4)) * 70;
                break;
        }
    }

    h = ((h % 360) + 360) % 360;
    s = Math.min(100, Math.max(0, s));
    l = Math.min(100, Math.max(0, l));
    tempColor.setHSL(h / 360, s / 100, l / 100);
    out[o] = tempColor.r;
    out[o + 1] = tempColor.g;
    out[o + 2] = tempColor.b;
}

export function writeColorsToArray(arr, count, t) {
    for (let i = 0; i < count; i++) {
        writeParticleColor(i, count, arr, i * 3);
    }
}
