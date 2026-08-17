# ETHER RESONANCE

**Interactive 3D particle visualization of trigonometric organisms — Three.js + WebGL.**

[![CI](https://github.com/eraseredraw/ether-resonance/actions/workflows/ci.yml/badge.svg)](https://github.com/eraseredraw/ether-resonance/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

## Live Demo

- **GitHub Pages:** https://eraseredraw.github.io/ether-resonance/
- **Local:** `docker compose up` → http://localhost:8080

## Features

- 40,000 particles at 60 FPS (up to 100K)
- 10 parametric 3D shapes (sphere, torus, helix, ribbon, vortex, chaos...)
- 10 color modes + hue offset + animation modes
- Zero-GC rendering loop (0-2 collections per second)
- Adaptive quality — auto-tunes bloom under FPS drops
- Full control panel: particles, shapes, colors, camera, export
- Keyboard shortcuts: drag to rotate, wheel to zoom, Tab panels, Space pause, R random, C reset camera

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

## Project Structure

```
├── index.html            # Entry point
├── src/
│   ├── main.js           # Application logic (Three.js scene, particles, UI)
│   └── styles.css        # Styles
├── Dockerfile            # nginx:alpine image
├── nginx.conf            # gzip, caching, /health endpoint
├── docker-compose.yml
└── .github/workflows/
    ├── ci.yml            # Lint checks + Docker build on push/PR
    └── pages.yml         # Deploy to GitHub Pages
```

## Architecture

- **Rendering:** Three.js r160 + WebGL, BufferGeometry instanced particles
- **Post-processing:** EffectComposer + UnrealBloomPass
- **Shaders:** GLSL vertex + fragment for particle effects
- **Serving:** nginx (gzip, cache headers, health check) in Docker
- **CI/CD:** GitHub Actions — syntax validation, HTML structure check, Docker build, Pages deploy

## Development

```bash
node --check src/main.js        # JS syntax check
docker compose up --build       # run with rebuilt image
```

Run the same checks as CI locally, or open a PR — the pipeline validates on push.

## License

MIT — see [LICENSE](LICENSE)