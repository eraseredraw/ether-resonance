# ETHER RESONANCE

**Interactive 3D particle visualization of trigonometric organisms — Three.js + WebGL.**

[![CI](https://github.com/eraseredraw/ether-resonance/actions/workflows/ci.yml/badge.svg)](https://github.com/eraseredraw/ether-resonance/actions/workflows/ci.yml)
[![Tests](https://img.shields.io/badge/tests-60%20passed-brightgreen.svg)](tests)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Three.js](https://img.shields.io/badge/three.js-r160-blueviolet.svg)](https://threejs.org)

> 40 000 particles morphing between 10 trigonometric organisms, driven by your voice, music, drawings and uploaded 3D models — in real time.

<!-- TODO: add screenshots/demo.gif — record via 🎬 Record Video and drop frames here -->

## Live Demo

- **GitHub Pages:** https://eraseredraw.github.io/ether-resonance/
- **Local:** `docker compose up` → http://localhost:8080

## Features

### Rendering
- 40 000 particles at 60 FPS (up to 100 000)
- Custom GLSL shader — soft round particles, radial glow, per-particle twinkle (no more square points)
- 10 parametric shapes (sphere, torus, helix, ribbon, vortex, chaos...) with smooth ease-in-out morphing
- 10 color modes + hue offset + 5 animation modes (static, scroll, wave, pulse, matrix)
- Adaptive quality — auto-tunes bloom resolution under FPS drops
- Zero-GC rendering loop (0–2 collections per second)

### Audio reactivity (new in v5)
- Live mic input or audio track upload (`🎙️ Mic` / `🎵 Track`)
- FFT analysis: bass swells the form, mids drive rotation, treble drifts the hue
- Energy-based beat detection → bloom flash on every kick
- Audio level meter in the control panel

### Create
- **Drawing pad** — paint a mask on screen, particles morph into your strokes; brush size, eraser, undo/redo, mirror symmetry, breathing "pulsar" mode, live apply
- Upload image / blueprint to displace the particle field
- Upload 3D model (GLB/GLTF/OBJ/PLY) — the field takes its silhouette
- Drag & drop files anywhere on the page

### Export
- Standalone code: Vanilla HTML / React component / Three.js module
- Wallpapers: PNG / JPEG / WEBP in 1080p / 2K / 4K
- Point clouds: PLY / OBJ / GLB
- **Video: record the live canvas to WebM** (5/8/15/30 s)

### Share
- 3 local preset slots (localStorage)
- Shareable URL links (`#preset=...`)
- Cloud shape gallery (one click random preset)
- Guide modal + keyboard shortcuts: drag rotate, wheel/pinch zoom, Tab panels, Space pause, R randomize, C reset camera

## Quick Start

### Docker (recommended)

```bash
docker compose up -d
# open http://localhost:8080
```

### Static (any HTTP server)

```bash
python -m http.server 8080
# or: npx serve .
# open http://localhost:8080
```

No build step — vanilla ES modules. Three.js r160 is loaded via importmap from unpkg.

## Development

```bash
npm install          # three + vitest
npm run check        # node --check on every module
npm test             # 60 unit tests (vitest)
docker compose up --build
```

## Project Structure

```
├── index.html            # Entry point
├── src/
│   ├── main.js           # App wiring: scene, loop, UI, presets, uploads
│   ├── shapes.js         # Parametric shape generators + displacement offsets
│   ├── colors.js         # HSL→RGB color writers (10 modes, 5 animations)
│   ├── audio.js          # Web Audio engine: mic/track, FFT bands, beat detect
│   ├── shaders.js        # Custom GLSL particle shader (glow, twinkle)
│   ├── drawing.js        # Ink canvas → displacement mask (undo/redo/symmetry)
│   ├── exporters.js      # Code / image / PLY / OBJ / GLB / WebM export
│   └── styles.css        # Styles
├── tests/                # Vitest unit tests (60 cases)
├── Dockerfile            # nginx:alpine image
├── nginx.conf            # gzip, caching, /health endpoint
├── docker-compose.yml
└── .github/workflows/
    ├── ci.yml            # Syntax checks + unit tests + Docker build
    └── pages.yml         # Deploy to GitHub Pages
```

## Architecture

- **Rendering:** Three.js r160 + WebGL, instanced BufferGeometry particles
- **Shaders:** GLSL vertex/fragment — round soft particles with radial falloff, per-particle seed-based twinkle, audio intensity uniform
- **Audio:** Web Audio API → AnalyserNode (FFT 2048) → band energies (bass/mid/treble) + RMS level + energy-based beat detector; modules keep pure logic testable without a browser
- **Displacement:** any source (image / model / drawing) is baked into a grayscale mask → per-particle offsets, regenerated on change (pulsar = per-frame breathing factor)
- **Post-processing:** EffectComposer + UnrealBloomPass (beat-reactive strength)
- **Serving:** nginx (gzip, cache headers, health check) in Docker
- **CI/CD:** GitHub Actions — JS syntax validation, HTML structure check, 60 unit tests, Docker build, Pages deploy

## Testing

Pure math lives in isolated modules, so it is fully unit-testable in Node:

| Suite | Covers |
|---|---|
| `tests/shapes.test.js` | finiteness/bounds for all 10 shapes, scale modulation, offset displacement, pulsar factor |
| `tests/colors.test.js` | RGB range for all modes, hue offset + audio hue drift, achromatic white |
| `tests/exporters.test.js` | PLY/OBJ formats, GLB binary header + JSON chunk, generated code embeds valid sources |
| `tests/audio.test.js` | FFT band energy, beat detection against rolling history |

## License

MIT — see [LICENSE](LICENSE)