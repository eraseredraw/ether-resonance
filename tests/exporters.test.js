import { describe, it, expect } from 'vitest';
import {
    buildPlyText, buildObjText, buildGlbBuffer, generateExportCode
} from '../src/exporters.js';
import { writeShapePosition } from '../src/shapes.js';
import { writeParticleColor } from '../src/colors.js';

const SHAPE_FN_SRC = writeShapePosition.toString();
const COLOR_FN_SRC = writeParticleColor.toString();

const CONFIG = {
    particleCount: 100,
    shape: 'sphere',
    formScale: 150,
    formRotationSpeed: 0.3,
    formChaos: 0,
    colorMode: 'ice',
    hueOffset: 0,
    colorAnimation: 'static',
    bloomEnabled: true,
    bloomIntensity: 3.0,
    trailEnabled: false,
    particleSize: 0.5,
    simSpeed: 0.5,
    autoRotate: true,
    rotateSpeed: 0.5,
    twinkleEnabled: true
};

function samplePositions(count) {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
        pos[i * 3] = i;
        pos[i * 3 + 1] = i * 2;
        pos[i * 3 + 2] = -i;
    }
    return pos;
}

describe('PLY exporter', () => {
    it('emits valid header with vertex count', () => {
        const text = buildPlyText(samplePositions(3), 3);
        expect(text.startsWith('ply\nformat ascii 1.0')).toBe(true);
        expect(text).toContain('element vertex 3');
        expect(text).toContain('end_header');
    });

    it('emits one vertex per line after header', () => {
        const count = 5;
        const text = buildPlyText(samplePositions(count), count);
        const body = text.split('end_header\n')[1];
        const lines = body.trim().split('\n');
        expect(lines).toHaveLength(count);
        expect(lines[0]).toMatch(/^[\d.-]+ [\d.-]+ [\d.-]+$/);
    });
});

describe('OBJ exporter', () => {
    it('emits v lines with coordinates', () => {
        const text = buildObjText(samplePositions(2), 2);
        const lines = text.trim().split('\n');
        expect(lines[0]).toMatch(/^# ETHER RESONANCE/);
        expect(lines[1]).toMatch(/^v 0\.0000 0\.0000 -?0\.0000$/);
        expect(lines[2]).toMatch(/^v 1\.0000 2\.0000 -1\.0000$/);
    });
});

describe('GLB exporter', () => {
    it('starts with glTF magic', () => {
        const buf = buildGlbBuffer(samplePositions(4), 4);
        const dv = new DataView(buf);
        expect(dv.getUint32(0, true)).toBe(0x46546C67); // 'glTF'
        expect(dv.getUint32(4, true)).toBe(2); // version
    });

    it('total length matches header', () => {
        const buf = buildGlbBuffer(samplePositions(1000), 1000);
        const dv = new DataView(buf);
        expect(dv.getUint32(8, true)).toBe(buf.byteLength);
    });

    it('JSON chunk is parseable and counts vertices', () => {
        const count = 500;
        const buf = buildGlbBuffer(samplePositions(count), count);
        const dv = new DataView(buf);
        const jsonLen = dv.getUint32(12, true);
        const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jsonLen).filter(b => b !== 0x20 && b !== 0)));
        expect(json.accessors[0].count).toBe(count);
        expect(json.asset.version).toBe('2.0');
        expect(json.buffers[0].byteLength).toBe(count * 12);
    });
});

describe('code export', () => {
    it.each(['vanilla', 'react', 'three'])('embeds shape/color sources for %s', type => {
        const code = generateExportCode(type, { shapeFnSrc: SHAPE_FN_SRC, colorFnSrc: COLOR_FN_SRC, config: CONFIG });
        expect(code).toContain('function writeShapePosition');
        expect(code).toContain('function writeParticleColor');
        expect(code).toContain('formScaleMod');
        expect(code).toContain('hueOffsetMod');
    });

    it('embeds current config JSON', () => {
        const code = generateExportCode('vanilla', { shapeFnSrc: SHAPE_FN_SRC, colorFnSrc: COLOR_FN_SRC, config: CONFIG });
        expect(code).toContain('"particleCount": 100');
        expect(code).toContain('"colorMode": "ice"');
    });

    it('generated source compiles as standalone JS (vanilla html)', () => {
        const code = generateExportCode('vanilla', { shapeFnSrc: SHAPE_FN_SRC, colorFnSrc: COLOR_FN_SRC, config: CONFIG });
        expect(code).toContain('<!DOCTYPE html>');
        expect(code).toContain('<script type="module">');
        expect(code).toContain('</html>');
    });
});