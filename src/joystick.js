// Virtual camera joystick.
//
// Why this exists: the only pointer control on a touchscreen is a drag on the
// canvas, which is imprecise (your thumb hides what you aim at), fights the
// drawing pad and the wave trigger, and cannot be held down to keep rotating.
// A stick gives continuous, thumb-independent orbit and a holdable zoom
// trigger. It is additive: OrbitControls keeps working, the stick just writes
// camera.position the same way a drag would.
//
// The math is exported pure (orbitStep / zoomStep / applyDeadzone) so tests
// can pin it without a browser; the DOM half below is only glue that reads
// pointer geometry and feeds those functions.

import * as THREE from 'three';

export const POLAR_MIN = 0.05;              // radians from the +Y pole
export const POLAR_MAX = Math.PI - 0.05;
export const DIST_MIN = 10;
export const DIST_MAX = 2000;
export const DEADZONE = 0.12;               // fraction of stick radius
export const ORBIT_RATE = 1.6;              // rad/s at full deflection, sens 1.0
export const ZOOM_RATE = 1.1;               // ln(units/s) at full trigger

// Radial deflection with a deadzone. x/y are already normalised (-1..1);
// magnitude is returned post-clamp so the caller can scale speed by how far
// the stick is actually pushed.
export function applyDeadzone(x, y, dz = DEADZONE) {
    const mag = Math.hypot(x, y);
    if (mag <= dz) return { x: 0, y: 0, mag: 0 };
    // rescale the live annulus to 0..1, so speed ramps from the edge of the
    // deadzone instead of jumping straight to full
    const live = Math.min(1, (mag - dz) / (1 - dz));
    const k = live / mag;
    return { x: x * k, y: y * k, mag: live };
}

// One frame of orbit. dx right / dy down on the stick = azimuth / polar.
// theta and phi are the camera's spherical angles around the target; phi is
// measured from +Y, so pushing the stick DOWN must INCREASE it (the camera
// travels toward the lower pole and looks up at the form).
export function orbitStep(theta, phi, dx, dy, sens = 1, dt = 1 / 60) {
    const step = ORBIT_RATE * sens * dt;
    const t = theta - dx * step;            // push right = orbit right
    let p = phi + dy * step;                // push down = camera drops below
    // clamp polar without wrapping: hitting the pole stops, it does not flip
    p = p < POLAR_MIN ? POLAR_MIN : (p > POLAR_MAX ? POLAR_MAX : p);
    return { theta: t, phi: p };
}

// One frame of zoom. dir > 0 pulls the camera closer.
export function zoomStep(dist, dir, sens = 1, dt = 1 / 60) {
    if (dir === 0) return dist;
    const d = dist * Math.exp(-dir * ZOOM_RATE * sens * dt);
    return d < DIST_MIN ? DIST_MIN : (d > DIST_MAX ? DIST_MAX : d);
}

// ---------------------------------------------------------------- DOM glue

let el = null;
let knob = null;
let state = null;
let hooks = null;
let visible = false;

function norm(event, rect) {
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const r = rect.width / 2;
    return { x: (event.clientX - cx) / r, y: (event.clientY - cy) / r };
}

function onPointerDown(e) {
    e.preventDefault();
    e.stopPropagation();
    // setPointerCapture throws if the pointer is not an active pointer, which
    // happens for synthetically dispatched events (tests) and for a release
    // that races the capture. Neither should break the stick: tracking is by
    // pointerId anyway, the capture only buys us moves outside the element.
    try { el.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
    state.pointerId = e.pointerId;
    state.rect = el.getBoundingClientRect();
    moveKnob(e);
    hooks.onInteract?.();
}

function moveKnob(e) {
    const raw = norm(e, state.rect);
    const dz = applyDeadzone(raw.x, raw.y);
    // the knob travels the full radius, the deadzone only gates the camera:
    // visually the stick follows the thumb exactly
    const mag = Math.min(1, Math.hypot(raw.x, raw.y));
    const k = mag > 0 ? Math.min(1, mag) / mag : 0;
    const ox = raw.x * k * (state.rect.width * 0.30);
    const oy = raw.y * k * (state.rect.height * 0.30);
    knob.style.transform = `translate(${ox}px, ${oy}px)`;
    state.dx = dz.x;
    state.dy = dz.y;
}

function onPointerMove(e) {
    if (state.pointerId === null || e.pointerId !== state.pointerId) return;
    e.preventDefault();
    e.stopPropagation();
    moveKnob(e);
}

function onPointerUp(e) {
    if (state.pointerId !== null && e.pointerId !== state.pointerId) return;
    state.pointerId = null;
    state.dx = 0;
    state.dy = 0;
    knob.style.transform = 'translate(0px, 0px)';   // spring back to centre
}

function bindTrigger(node, dir) {
    const start = (e) => {
        e.preventDefault();
        e.stopPropagation();
        try { node.setPointerCapture(e.pointerId); } catch { /* see above */ }
        node.classList.add('armed');
        state.zoom = dir;
        hooks.onInteract?.();
    };
    const stop = () => {
        if (state.zoom !== dir) return;
        node.classList.remove('armed');
        state.zoom = 0;
    };
    node.addEventListener('pointerdown', start);
    node.addEventListener('pointerup', stop);
    node.addEventListener('pointercancel', stop);
    node.addEventListener('lostpointercapture', stop);
}

// Lift the stick clear of the control panel when that panel is a bottom sheet
// (mobile), otherwise the sheet simply covers it. Height is measured, not
// guessed, because the panel's height depends on which sections are expanded.
function place() {
    if (!el) return;
    const panel = document.getElementById('controls');
    const sheet = panel && !panel.classList.contains('hidden')
        && getComputedStyle(panel).position === 'fixed'
        && getComputedStyle(panel).bottom === '0px';
    if (sheet) {
        el.style.setProperty('--joy-bottom', Math.round(panel.offsetHeight + 12) + 'px');
    } else {
        el.style.removeProperty('--joy-bottom');
    }
}

export function createJoystick(h) {
    if (el) return el;
    hooks = h;
    state = { pointerId: null, dx: 0, dy: 0, zoom: 0, rect: null };

    el = document.createElement('div');
    el.id = 'joystick';
    el.innerHTML = `
        <div class="joy-base">
            <div class="joy-knob"></div>
        </div>
        <div class="joy-triggers">
            <button class="joy-trigger" data-dir="1" title="Hold to zoom in">+</button>
            <button class="joy-trigger" data-dir="-1" title="Hold to zoom out">−</button>
        </div>`;
    document.body.appendChild(el);
    knob = el.querySelector('.joy-knob');
    el.querySelectorAll('.joy-trigger').forEach(btn => {
        bindTrigger(btn, parseInt(btn.dataset.dir, 10));
    });

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointercancel', onPointerUp);
    // never let a stick drag become a page scroll or a canvas gesture
    el.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
    el.addEventListener('touchmove', e => e.preventDefault(), { passive: false });

    place();
    window.addEventListener('resize', place);
    return el;
}

export function setJoystickVisible(v) {
    visible = !!v;
    if (el) el.classList.toggle('on', visible);
    if (visible) place();
    if (!visible && state) { state.dx = 0; state.dy = 0; state.zoom = 0; }
}

export function isJoystickVisible() {
    return visible && el !== null;
}

// Called once per frame from the render loop. Returns the orbit angles and the
// new target distance, or null when the stick is doing nothing (so the caller
// skips touching the camera at all — an idle stick must not cost an update).
//
// Zoom is returned as a TARGET distance rather than applied to camera.position
// directly: the render loop already glides the camera toward
// S.targetZoomDistance every frame, and writing the length here would fight
// that smoothing (two lersps on the same axis = rubber-banding).
export function update(camera, controls, sens, dt, zoomDist) {
    if (!isJoystickVisible() || !camera || !controls) return null;
    const { dx, dy, zoom } = state;
    if (dx === 0 && dy === 0 && zoom === 0) return null;

    const target = controls.target;
    const offset = new THREE.Vector3().copy(camera.position).sub(target);
    const sph = new THREE.Spherical().setFromVector3(offset);
    const next = orbitStep(sph.theta, sph.phi, dx, dy, sens, dt);
    sph.theta = next.theta;
    sph.phi = next.phi;
    sph.makeSafe();                       // guards the poles inside THREE too
    offset.setFromSpherical(sph);
    camera.position.copy(target).add(offset);

    return {
        theta: next.theta,
        phi: next.phi,
        zoom: zoom !== 0 ? zoomStep(zoomDist, zoom, sens, dt) : null,
    };
}

export function disposeJoystick() {
    if (!el) return;
    window.removeEventListener('resize', place);
    el.remove();
    el = null;
    knob = null;
    state = null;
    visible = false;
}
