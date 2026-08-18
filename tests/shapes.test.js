import { describe, it, expect, beforeEach } from 'vitest';
import {
    SHAPES, setShapeState, setFormScaleMod, setFormRotationSpeedMod,
    setOffsetSource, regenerateOffsets, writeShapePosition, clearOffsets, getOffsets
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

    it('SHAPES covers all 10 forms', () => {
        expect(SHAPES).toHaveLength(10);
        expect(SHAPES).toContain('sphere');
        expect(SHAPES).toContain('chaos');
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