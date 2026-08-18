import { describe, it, expect } from 'vitest';
import { bandEnergy, detectBeat, BANDS } from '../src/audio.js';

describe('bandEnergy', () => {
    it('computes average of bin range', () => {
        const bins = new Uint8Array(64);
        bins.fill(0);
        for (let i = 10; i < 20; i++) bins[i] = 100;
        expect(bandEnergy(bins, 10, 20)).toBe(100);
        expect(bandEnergy(bins, 0, 64)).toBe((10 * 100) / 64);
    });

    it('handles empty and edge ranges', () => {
        expect(bandEnergy(new Uint8Array(0), 0, 10)).toBe(0);
        const bins = new Uint8Array(16);
        bins[15] = 128;
        expect(bandEnergy(bins, 0, 0)).toBe(0);
        expect(bandEnergy(bins, 15, 16)).toBe(128);
    });

    it('bass band sits inside the spectrum', () => {
        expect(BANDS.bass[0]).toBeGreaterThanOrEqual(0);
        expect(BANDS.bass[1]).toBeGreaterThan(BANDS.bass[0]);
        expect(BANDS.mid[1]).toBeGreaterThan(BANDS.mid[0]);
        expect(BANDS.treble[1]).toBeGreaterThan(BANDS.treble[0]);
    });
});

describe('detectBeat', () => {
    it('flags a sharp spike above the running mean', () => {
        const history = [];
        for (let i = 0; i < 40; i++) {
            const [beat] = detectBeat(0.1, history);
            expect(beat).toBe(false);
        }
        const [beat] = detectBeat(0.9, history);
        expect(beat).toBe(true);
    });

    it('does not flag quiet signal', () => {
        const history = [];
        const [beat] = detectBeat(0.01, history);
        expect(beat).toBe(false);
    });

    it('does not flag on empty history (mean 0)', () => {
        const history = [];
        const [beat] = detectBeat(0.5, history);
        expect(beat).toBe(false);
        expect(history).toHaveLength(1);
    });

    it('keeps history bounded', () => {
        const history = [];
        for (let i = 0; i < 200; i++) detectBeat(0.2, history);
        expect(history.length).toBeLessThanOrEqual(43);
    });

    it('steady loud signal is not a beat (mean catches up)', () => {
        const history = [];
        let beats = 0;
        for (let i = 0; i < 60; i++) {
            const [beat] = detectBeat(0.8, history);
            if (beat) beats++;
        }
        expect(beats).toBe(0);
    });
});