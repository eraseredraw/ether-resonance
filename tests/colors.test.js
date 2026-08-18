import { describe, it, expect, beforeEach } from 'vitest';
import {
    COLOR_MODES, COLOR_ANIMATIONS,
    setColorState, setHueOffsetMod, setColorTime, writeParticleColor
} from '../src/colors.js';

function gen(mode, count = 10000) {
    const out = new Float32Array(count * 3);
    setColorState({ colorMode: mode, hueOffset: 0, colorSaturation: 0.8, colorAnimation: 'static' });
    setColorTime(0);
    for (let i = 0; i < count; i++) writeParticleColor(i, count, out, i * 3);
    return out;
}

describe('color functions', () => {
    beforeEach(() => {
        setHueOffsetMod(0);
        setColorTime(0);
    });

    it('exposes all 10 modes and 5 animations', () => {
        expect(COLOR_MODES).toHaveLength(10);
        expect(COLOR_ANIMATIONS).toHaveLength(5);
    });

    it.each(COLOR_MODES)('keeps %s RGB in [0,1]', mode => {
        const out = gen(mode);
        for (let i = 0; i < out.length; i++) {
            expect(out[i]).toBeGreaterThanOrEqual(0);
            expect(out[i]).toBeLessThanOrEqual(1);
        }
    });

    it('hue offset shifts colors', () => {
        const a = gen('rainbow');
        setColorState({ colorMode: 'rainbow', hueOffset: 180, colorSaturation: 0.8, colorAnimation: 'static' });
        const b = new Float32Array(10000 * 3);
        for (let i = 0; i < 10000; i++) writeParticleColor(i, 10000, b, i * 3);
        expect(a[0]).not.toBeCloseTo(b[0], 3);
    });

    it('hueOffsetMod (audio) shifts hue without touching base', () => {
        const base = gen('hue');
        setHueOffsetMod(90);
        const shifted = gen('hue');
        expect(base[0]).not.toBeCloseTo(shifted[0], 3);
    });

    it('white mode is achromatic', () => {
        const out = gen('white');
        for (let i = 0; i < out.length; i += 3) {
            expect(out[i]).toBeCloseTo(out[i + 1], 5);
            expect(out[i + 1]).toBeCloseTo(out[i + 2], 5);
        }
    });

    it('writes exactly at the requested offset', () => {
        const out = new Float32Array(9);
        setColorState({ colorMode: 'ice', hueOffset: 0, colorSaturation: 0.8, colorAnimation: 'static' });
        writeParticleColor(0, 100, out, 6);
        expect(out[0]).toBe(0);
        expect(out[6]).not.toBe(0);
    });
});