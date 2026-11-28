// Pure-math tests for the virtual stick. The DOM half (pointer capture, knob
// transform, bottom-sheet placement) is exercised by scripts/live-retrigger-check.mjs
// in a real browser; what must not regress silently is the arithmetic that
// decides where the camera ends up.
import { describe, it, expect } from 'vitest';
import {
    applyDeadzone,
    orbitStep,
    zoomStep,
    POLAR_MIN,
    POLAR_MAX,
    DIST_MIN,
    DIST_MAX,
    DEADZONE,
    ORBIT_RATE,
} from '../src/joystick.js';

describe('joystick deadzone', () => {
    it('zeroes input inside the deadzone so a resting thumb does not drift', () => {
        for (const [x, y] of [[0, 0], [0.05, 0.02], [-0.09, 0.06], [DEADZONE * 0.9, 0]]) {
            const r = applyDeadzone(x, y);
            expect(r.x).toBe(0);
            expect(r.y).toBe(0);
            expect(r.mag).toBe(0);
        }
    });

    it('is exactly zero at the boundary and non-zero just past it', () => {
        expect(applyDeadzone(DEADZONE, 0).mag).toBe(0);
        expect(applyDeadzone(DEADZONE + 0.001, 0).mag).toBeGreaterThan(0);
    });

    it('ramps from the deadzone edge to 1 at full deflection (no jump)', () => {
        // a step just past the edge must be tiny, not full speed
        const justPast = applyDeadzone(DEADZONE + 0.01, 0);
        const full = applyDeadzone(1, 0);
        expect(justPast.mag).toBeLessThan(0.05);
        expect(full.mag).toBeCloseTo(1, 6);
        // monotonic in between
        let prev = 0;
        for (let i = 0; i <= 20; i++) {
            const m = applyDeadzone(DEADZONE + (1 - DEADZONE) * (i / 20), 0).mag;
            expect(m).toBeGreaterThanOrEqual(prev);
            prev = m;
        }
        expect(prev).toBeCloseTo(1, 6);
    });

    it('keeps direction and caps diagonal deflection at 1', () => {
        const d = applyDeadzone(0.6, 0.8);            // |v| = 1 exactly
        expect(d.x).toBeGreaterThan(0);
        expect(d.y).toBeGreaterThan(0);
        expect(Math.hypot(d.x, d.y)).toBeLessThanOrEqual(1 + 1e-9);
        // direction preserved: y/x ratio is the same as the input's
        expect(d.y / d.x).toBeCloseTo(0.8 / 0.6, 6);
        // beyond the rim it behaves as if clamped, not amplified
        const over = applyDeadzone(1.8, 2.4);
        expect(Math.hypot(over.x, over.y)).toBeLessThanOrEqual(1 + 1e-9);
    });
});

describe('joystick orbit step', () => {
    const base = { theta: 1.0, phi: 1.5 };

    it('pushing right orbits one way, left the other, symmetric in magnitude', () => {
        const right = orbitStep(base.theta, base.phi, 0.5, 0, 1, 1 / 60);
        const left = orbitStep(base.theta, base.phi, -0.5, 0, 1, 1 / 60);
        expect(right.theta).toBeLessThan(base.theta);
        expect(left.theta).toBeGreaterThan(base.theta);
        expect(Math.abs(right.theta - base.theta))
            .toBeCloseTo(Math.abs(left.theta - base.theta), 10);
    });

    it('pushing down tilts toward the lower pole, up toward the upper', () => {
        const down = orbitStep(base.theta, base.phi, 0, 0.5, 1, 1 / 60);
        const up = orbitStep(base.theta, base.phi, 0, -0.5, 1, 1 / 60);
        expect(down.phi).toBeGreaterThan(base.phi);
        expect(up.phi).toBeLessThan(base.phi);
    });

    it('neutral stick leaves the angles untouched', () => {
        const n = orbitStep(base.theta, base.phi, 0, 0, 1, 1 / 60);
        expect(n.theta).toBe(base.theta);
        expect(n.phi).toBe(base.phi);
    });

    it('clamps polar at both poles instead of flipping over them', () => {
        // many frames of full-down push must park at POLAR_MAX, not pass through
        let phi = base.phi;
        for (let i = 0; i < 4000; i++) phi = orbitStep(0, phi, 0, 1, 3, 1 / 30).phi;
        expect(phi).toBe(POLAR_MAX);
        phi = base.phi;
        for (let i = 0; i < 4000; i++) phi = orbitStep(0, phi, 0, -1, 3, 1 / 30).phi;
        expect(phi).toBe(POLAR_MIN);
        // and it never escapes the open interval, so the camera cannot invert
        expect(POLAR_MIN).toBeGreaterThan(0);
        expect(POLAR_MAX).toBeLessThan(Math.PI);
    });

    it('azimuth is unbounded (a full orbit keeps going round)', () => {
        let theta = 0;
        for (let i = 0; i < 600; i++) theta = orbitStep(theta, 1.5, 1, 0, 3, 1 / 60).theta;
        expect(Math.abs(theta)).toBeGreaterThan(2 * Math.PI);
    });

    it('speed scales with sensitivity and elapsed time', () => {
        const one = orbitStep(0, 1.5, 1, 0, 1, 1 / 60).theta;
        const double = orbitStep(0, 1.5, 1, 0, 2, 1 / 60).theta;
        expect(double).toBeCloseTo(one * 2, 10);
        expect(Math.abs(one)).toBeCloseTo(ORBIT_RATE / 60, 10);
        // same total rotation whether integrated in one big step or sixty small
        // ones — the stick must feel identical at any frame rate
        let acc = 0;
        for (let i = 0; i < 60; i++) acc = orbitStep(acc, 1.5, 1, 0, 1, 1 / 3600).theta;
        expect(Math.abs(acc)).toBeCloseTo(Math.abs(orbitStep(0, 1.5, 1, 0, 1, 1 / 60).theta), 6);
    });
});

describe('joystick zoom step', () => {
    it('trigger in pulls closer, trigger out pushes away, idle holds', () => {
        expect(zoomStep(100, 1)).toBeLessThan(100);
        expect(zoomStep(100, -1)).toBeGreaterThan(100);
        expect(zoomStep(100, 0)).toBe(100);
    });

    it('is exponential, so perceived speed is constant across distances', () => {
        const near = 100 / zoomStep(100, 1, 1, 1 / 60);
        const far = 1000 / zoomStep(1000, 1, 1, 1 / 60);
        expect(near).toBeCloseTo(far, 6);
    });

    it('is reversible: the same hold out then in returns to the start', () => {
        const d = zoomStep(zoomStep(250, 1, 1, 0.4), -1, 1, 0.4);
        expect(d).toBeCloseTo(250, 6);
    });

    it('clamps at both ends of the dolly range and stays there', () => {
        let d = 500;
        for (let i = 0; i < 5000; i++) d = zoomStep(d, 1, 3, 1 / 30);
        expect(d).toBe(DIST_MIN);
        d = 500;
        for (let i = 0; i < 5000; i++) d = zoomStep(d, -1, 3, 1 / 30);
        expect(d).toBe(DIST_MAX);
        // matches the OrbitControls limits set in render.js
        expect(DIST_MIN).toBe(10);
        expect(DIST_MAX).toBe(2000);
    });

    it('integrates to the same distance regardless of frame rate', () => {
        const one = zoomStep(300, 1, 1, 0.5);
        let acc = 300;
        for (let i = 0; i < 30; i++) acc = zoomStep(acc, 1, 1, 0.5 / 30);
        expect(acc).toBeCloseTo(one, 4);
    });
});
