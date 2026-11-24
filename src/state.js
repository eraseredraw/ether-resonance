// ============================================
// ETHER RESONANCE — shared pure state
// Plain values only: no THREE, no DOM, zero imports.
// Everything below is read and written through the single
// mutable object S (one source of truth for all modules).
// ============================================

// ============================================
// CACHED MATH CONSTANTS (Zero GC)
// ============================================
export const PI2 = Math.PI * 2;
export const SQRT_PI = Math.sqrt(Math.PI);

export const MAX_PARTICLES = 100000;

// Mobile particle budget. A mid-range phone GPU with UnrealBloom chokes on
// 40K sprites; the old fixed default made the first load on a phone look
// broken rather than heavy. Coarse pointer + small screen is a cheap proxy
// for "handset"; a desktop with a touch monitor keeps the full count. The
// slider still lets anyone go back up to MAX_PARTICLES by hand.
export function defaultParticleBudget() {
    const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    const small = Math.min(screen.width || 9999, screen.height || 9999) < 820;
    return coarse && small ? 15000 : 40000;
}

// ============================================
// GLOBAL STATE (single mutable object)
// ============================================
export const S = {
    isInitialized: false,
    isPaused: false,
    liveUpdateEnabled: false,
    particleCount: defaultParticleBudget(),

    // Particle field state
    time: 0,
    simSpeed: 0.5,

    currentShape: 'sphere',
    formScale: 150,
    formRotationSpeed: 0.3,
    formChaos: 0,

    colorMode: 'ice',
    hueOffset: 0,
    colorSaturation: 0.8,
    colorAnimation: 'static',

    bloomEnabled: true,
    bloomIntensity: 3.5,
    trailEnabled: false,
    particleSize: 0.75,
    twinkleEnabled: true,

    autoRotate: true,
    rotateSpeed: 0.5,

    targetZoomDistance: 412,
    activeAspect: null,

    // Audio
    audioIntensity: 1.0,
    godModeActive: false,
    lastGodDecision: 0,
    lastGodColorSwitch: 0,

    // Morph state
    isMorphing: false,
    morphProgress: 0,
    morphDuration: 1.0,
    morphTargetShape: null,

    // Color recompute flag (colors only change on user input)
    colorsDirty: true,

    // Scene extras
    starfieldEnabled: true,
    aberrationEnabled: false,
    pointerMagnet: false,
    pointerFxEnabled: false,

    // Pointer interaction
    pointerActive: false
};

// ============================================
// CONFIG (presets, URL, cloud)
// ============================================
export const DEFAULT_CONFIG = {
    particleCount: 40000,
    shape: 'sphere',
    formScale: 150,
    formRotationSpeed: 0.3,
    formChaos: 0,
    colorMode: 'ice',
    hueOffset: 0,
    colorAnimation: 'static',
    bloomEnabled: true,
    bloomIntensity: 3.5,
    trailEnabled: false,
    particleSize: 0.75,
    simSpeed: 0.5,
    autoRotate: true,
    rotateSpeed: 0.5,
    twinkleEnabled: true,
    starfieldEnabled: true,
    aberrationEnabled: false,
    pointerFxEnabled: false
};

export function collectConfig() {
    return {
        particleCount: S.particleCount,
        shape: S.currentShape,
        formScale: S.formScale,
        formRotationSpeed: S.formRotationSpeed,
        formChaos: S.formChaos,
        colorMode: S.colorMode,
        hueOffset: S.hueOffset,
        colorAnimation: S.colorAnimation,
        bloomEnabled: S.bloomEnabled,
        bloomIntensity: S.bloomIntensity,
        trailEnabled: S.trailEnabled,
        particleSize: S.particleSize,
        simSpeed: S.simSpeed,
        autoRotate: S.autoRotate,
        rotateSpeed: S.rotateSpeed,
        twinkleEnabled: S.twinkleEnabled,
        starfieldEnabled: S.starfieldEnabled,
        aberrationEnabled: S.aberrationEnabled,
        pointerFxEnabled: S.pointerFxEnabled
    };
}

export function easeInOutCubic(p) {
    return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

export const CLOUD_SHAPES = [
    { shape: 'sphere', colorMode: 'neon', formScale: 170, simSpeed: 0.8, bloomIntensity: 2.5 },
    { shape: 'vortex', colorMode: 'fire', formScale: 140, formRotationSpeed: 0.7, simSpeed: 0.9, bloomIntensity: 3 },
    { shape: 'ribbon', colorMode: 'ocean', formScale: 180, formRotationSpeed: 0.5, simSpeed: 0.6 },
    { shape: 'helix', colorMode: 'gold', formScale: 150, formRotationSpeed: 0.4, simSpeed: 0.7, hueOffset: 40 },
    { shape: 'torus', colorMode: 'rainbow', formScale: 160, formRotationSpeed: 0.6, simSpeed: 0.8 },
    { shape: 'plane', colorMode: 'plasma', formScale: 130, formChaos: 15, simSpeed: 0.9 },
    { shape: 'spiral', colorMode: 'cyan', formScale: 165, formRotationSpeed: 0.55, simSpeed: 0.75 },
    { shape: 'chaos', colorMode: 'white', formScale: 200, formChaos: 100, simSpeed: 0.5 }
];
