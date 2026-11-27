import { describe, it, expect, beforeEach } from 'vitest';
import {
    SHAPES, setShapeState, setFormScaleMod, setFormRotationSpeedMod,
    setOffsetSource, regenerateOffsets, writeShapePosition, clearOffsets, getOffsets,
    setMouseState, setMouseMode, triggerWave
} from '../src/shapes.js';

function gen(shape, count = 10000, t = 0) {
    const out = new Float32Array(count * 3);
    setShapeState({ currentShape: shape, formScale: 150, formRotationSpeed: 0.3, formChaos: 0 });
    clearOffsets();
    for (let i = 0; i < count; i++) writeShapePosition(i, count, t, out, i * 3);
    return out;
}

describe('shape functions', () => {
    beforeEach(() => {
        setFormScaleMod(1);
        setFormRotationSpeedMod(1);
    });

    it('SHAPES covers all 13 forms', () => {
        expect(SHAPES).toHaveLength(13);
        expect(SHAPES).toContain('sphere');
        expect(SHAPES).toContain('chaos');
        expect(SHAPES).toContain('moire');
        expect(SHAPES).toContain('tesseract');
        expect(SHAPES).toContain('ruled');
    });

    it.each(SHAPES)('produces finite positions for %s', shape => {
        const out = gen(shape);
        for (let i = 0; i < out.length; i++) {
            expect(Number.isFinite(out[i])).toBe(true);
        }
    });

    it.each(SHAPES)('keeps %s within scale bounds', shape => {
        const out = gen(shape, 20000);
        const maxAbs = 150 * 4; // formScale 150 + margin
        for (let i = 0; i < out.length; i++) {
            expect(Math.abs(out[i])).toBeLessThanOrEqual(maxAbs);
        }
    }, 30000);

    it('sphere is roughly a sphere (avg radius ≈ formScale * 0.75)', () => {
        const count = 50000;
        const out = gen('sphere', count);
        let sum = 0;
        for (let i = 0; i < count; i++) {
            sum += Math.sqrt(
                out[i * 3] ** 2 + out[i * 3 + 1] ** 2 + out[i * 3 + 2] ** 2
            );
        }
        const avg = sum / count;
        expect(avg).toBeGreaterThan(90);
        expect(avg).toBeLessThan(130);
    });

    it('formScaleMod scales the field', () => {
        setFormScaleMod(2);
        const out = gen('sphere', 5000);
        let max = 0;
        for (let i = 0; i < out.length; i++) max = Math.max(max, Math.abs(out[i]));
        expect(max).toBeGreaterThan(200);
    });

    it('writes exactly at the requested offset', () => {
        const out = new Float32Array(9);
        setShapeState({ currentShape: 'sphere', formScale: 10, formRotationSpeed: 0, formChaos: 0 });
        writeShapePosition(0, 100, 0, out, 6);
        expect(out[0]).toBe(0);
        expect(out[6]).not.toBe(0);
    });

    it('applies displacement offsets', () => {
        const count = 1000;
        const out = new Float32Array(count * 3);
        setShapeState({ currentShape: 'chaos', formScale: 10, formChaos: 0 });
        const mask = new Uint8ClampedArray(count * 4).fill(255);
        setOffsetSource({ type: 'drawing', data: mask, w: 100, h: 10 });
        regenerateOffsets(count);
        for (let i = 0; i < count; i++) writeShapePosition(i, count, 0, out, i * 3);
        // bright mask → strong displacement
        expect(Math.abs(out[0])).toBeGreaterThan(0);
    });

    it('regenerateOffsets respects brightness factor (pulsar)', () => {
        const count = 1000;
        setShapeState({ currentShape: 'sphere', formScale: 100, formChaos: 0 });
        const mask = new Uint8ClampedArray(count * 4).fill(255);
        setOffsetSource({ type: 'drawing', data: mask, w: 100, h: 10 });
        regenerateOffsets(count, 1);
        const full = getOffsets();
        regenerateOffsets(count, 0.5);
        const half = getOffsets();
        const m = (a) => Math.abs(a[0]) + Math.abs(a[1]) + Math.abs(a[2]);
        expect(m(full)).toBeGreaterThan(0);
        expect(m(half)).toBeLessThan(m(full));
    });
});

describe('pointer interaction', () => {
    beforeEach(() => {
        setShapeState({ currentShape: 'sphere', formScale: 200, formRotationSpeed: 0, formChaos: 0 });
        setMouseState(-9999, -9999, 0);
        triggerWave(0, 0, -10); // wave expired
    });

    function centerDist(out, i) {
        const o = i * 3;
        return Math.sqrt(out[o] ** 2 + out[o + 1] ** 2 + out[o + 2] ** 2);
    }

    it('cursor repulsion pushes particles away from the pointer', () => {
        // tiny field around origin; pointer at origin repels inward points outward
        setShapeState({ currentShape: 'sphere', formScale: 8, formRotationSpeed: 0, formChaos: 0 });
        const out = new Float32Array(2000 * 3);
        for (let i = 0; i < 2000; i++) writeShapePosition(i, 2000, 0, out, i * 3);
        const before = centerDist(out, 0);

        setMouseState(0, 0, 1000);
        for (let i = 0; i < 2000; i++) writeShapePosition(i, 2000, 0, out, i * 3);
        const after = centerDist(out, 0);
        expect(after).toBeGreaterThan(before);
    });

    it('no repulsion when mouseStrength is 0', () => {
        setShapeState({ currentShape: 'sphere', formScale: 50, formRotationSpeed: 0, formChaos: 0 });
        const a = new Float32Array(100 * 3);
        const b = new Float32Array(100 * 3);
        for (let i = 0; i < 100; i++) writeShapePosition(i, 100, 0, a, i * 3);
        setMouseState(0, 0, 0);
        for (let i = 0; i < 100; i++) writeShapePosition(i, 100, 0, b, i * 3);
        expect(Array.from(b)).toEqual(Array.from(a));
    });

    it('attract mode pulls particles toward the pointer', () => {
        setShapeState({ currentShape: 'sphere', formScale: 8, formRotationSpeed: 0, formChaos: 0 });
        setMouseMode('attract');
        const before = new Float32Array(2000 * 3);
        for (let i = 0; i < 2000; i++) writeShapePosition(i, 2000, 0, before, i * 3);

        setMouseState(0, 0, 1000);
        const after = new Float32Array(2000 * 3);
        for (let i = 0; i < 2000; i++) writeShapePosition(i, 2000, 0, after, i * 3);

        const o = 0;
        const dx = after[o] - before[o];
        const dy = after[o + 1] - before[o + 1];
        const dz = after[o + 2] - before[o + 2];
        const dist = Math.sqrt(before[o] ** 2 + before[o + 1] ** 2 + before[o + 2] ** 2);
        // motion must point toward the cursor (origin)
        const inward = (dx * -before[o] + dy * -before[o + 1] + dz * -before[o + 2]) / dist;
        expect(inward).toBeGreaterThan(0);
    });

    it('sphere stays a filled volume (multi-shell keeps max radius in bounds)', () => {
        const count = 20000;
        const out = gen('sphere', count);
        let max = 0;
        for (let i = 0; i < count; i++) {
            max = Math.max(max, Math.sqrt(out[i * 3] ** 2 + out[i * 3 + 1] ** 2 + out[i * 3 + 2] ** 2));
        }
        expect(max).toBeLessThan(150 * 1.3);
        expect(max).toBeGreaterThan(120);
    });

    it('click shockwave displaces particles during its lifetime', () => {
        setShapeState({ currentShape: 'sphere', formScale: 40, formRotationSpeed: 0, formChaos: 0 });
        const a = new Float32Array(200 * 3);
        const b = new Float32Array(200 * 3);
        for (let i = 0; i < 200; i++) writeShapePosition(i, 200, 0.1, a, i * 3);
        triggerWave(0, 0, 0.1); // wave just fired
        for (let i = 0; i < 200; i++) writeShapePosition(i, 200, 0.35, b, i * 3);
        // ring now at r=65 world units, near sphere surface → moved
        let moved = 0;
        for (let i = 0; i < 200; i++) {
            const o = i * 3;
            const dx = a[o] - b[o];
            if (Math.abs(dx) > 0.01) moved++;
        }
        expect(moved).toBeGreaterThan(5);
    });

    it('expired wave does not displace', () => {
        setShapeState({ currentShape: 'sphere', formScale: 40, formRotationSpeed: 0, formChaos: 0 });
        const a = new Float32Array(200 * 3);
        const b = new Float32Array(200 * 3);
        triggerWave(0, 0, -5);
        for (let i = 0; i < 200; i++) writeShapePosition(i, 200, 0, a, i * 3);
        for (let i = 0; i < 200; i++) writeShapePosition(i, 200, 0, b, i * 3);
        expect(Array.from(b)).toEqual(Array.from(a));
    });

    // --- moiré bench: the interference IS the feature, so pin it down ---
    // Shared module vars (pointer state, audio multipliers) survive across
    // tests, so reset them here and assert pure geometry.

    it('moire stacks the configured number of parallel layers', () => {
        const count = 10000;
        setMouseState(-9999, -9999, 0);
        setFormScaleMod(1);
        setFormRotationSpeedMod(1);
        setShapeState({ currentShape: 'moire', formScale: 150, formRotationSpeed: 0,
            formChaos: 0, moireLayers: 4, moireTwist: 0.14, moireGap: 0.5 });
        const out = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) writeShapePosition(i, count, 0, out, i * 3);
        const zs = new Set();
        for (let i = 0; i < count; i++) zs.add(out[i * 3 + 2].toFixed(3));
        expect(zs.size).toBe(4);
    });

    it('moire twists adjacent layers by the configured angle', () => {
        const count = 10000;
        const twist = 0.14;
        setMouseState(-9999, -9999, 0);
        setShapeState({ currentShape: 'moire', formScale: 150, formRotationSpeed: 0,
            formChaos: 0, moireLayers: 4, moireTwist: twist, moireGap: 0.5 });
        const out = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) writeShapePosition(i, count, 0, out, i * 3);
        const side = Math.round(Math.sqrt(count / 4)); // 50
        const cell = side * side;
        // same grid cell in layer 0 and layer 1: layer 1's XY must equal
        // layer 0's rotated by exactly the twist (wrap-free comparison).
        // Positions live at slot i*3, so index the slot, not the particle.
        const j = 12 * side + 7;
        const s0 = j * 3, s1 = (cell + j) * 3;
        const x0 = out[s0], y0 = out[s0 + 1];
        const x1 = out[s1], y1 = out[s1 + 1];
        const cs = Math.cos(twist), sn = Math.sin(twist);
        expect(x1).toBeCloseTo(x0 * cs - y0 * sn, 4);
        expect(y1).toBeCloseTo(x0 * sn + y0 * cs, 4);
        // layers are parallel screens: same cell, different depth
        expect(out[s0 + 2]).not.toBe(out[s1 + 2]);
    });

    it('tesseract breathes under 4D rotation (projection radius shifts over time)', () => {
        const count = 10000;
        setMouseState(-9999, -9999, 0);
        const at = t => {
            setShapeState({ currentShape: 'tesseract', formScale: 150,
                formRotationSpeed: 0.3, formChaos: 0 });
            const out = new Float32Array(count * 3);
            for (let i = 0; i < count; i++) writeShapePosition(i, count, t, out, i * 3);
            let sum = 0;
            for (let i = 0; i < count; i++) {
                const o = i * 3;
                sum += Math.hypot(out[o], out[o + 1], out[o + 2]);
            }
            return sum / count;
        };
        const r0 = at(0);
        const r1 = at(2.5);
        expect(Math.abs(r0 - r1)).toBeGreaterThan(1); // w-perspective really moved points
        expect(r0).toBeGreaterThan(40);
        expect(r1).toBeLessThan(600);
    });

    it('ruled threads are strictly straight (curvature is only the envelope)', () => {
        const count = 10000;
        setMouseState(-9999, -9999, 0);
        setShapeState({ currentShape: 'ruled', formScale: 150, formRotationSpeed: 0, formChaos: 0 });
        const out = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) writeShapePosition(i, count, 0, out, i * 3);
        const threads = 96;
        const perThread = Math.round(count / (threads * 2));
        const base = 10 * perThread;             // thread #10 of family 0
        const p0 = [out[base * 3], out[base * 3 + 1], out[base * 3 + 2]];
        const p1 = [out[(base + 1) * 3], out[(base + 1) * 3 + 1], out[(base + 1) * 3 + 2]];
        const d = p1.map((v, k) => v - p0[k]);
        let worst = 0;
        for (let s = 2; s < perThread; s++) {
            const o = (base + s) * 3;
            // expected point = p0 + s * d (linear in the thread parameter)
            for (let k = 0; k < 3; k++) {
                worst = Math.max(worst, Math.abs(out[o + k] - (p0[k] + s * d[k])));
            }
        }
        expect(worst).toBeLessThan(1e-3);
    });
});