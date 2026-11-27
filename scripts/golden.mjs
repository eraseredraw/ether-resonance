// Golden-frame visual regression.
//
// Renders one deterministic frame in software WebGL (SwiftShader) and compares
// it against tests/golden.png. Determinism is engineered, not hoped for:
//
//   * Math.random is replaced with a seeded PRNG before any page script runs —
//     starfield positions and shape jitter come from it.
//   * requestAnimationFrame is wrapped so the loop advances a fake clock by a
//     fixed 16.667 ms per frame and STOPS at exactly FRAME_LIMIT frames.
//     animate(), OrbitControls and the FPS/bloom sampler all read
//     performance.now(), so after the limit nothing on screen can change:
//     the screenshot cannot race the render loop.
//   * Only the <canvas> is screenshotted, not the page: HUD text would drag
//     web-font rendering (and its flakes) into the comparison.
//
// Usage:
//   node scripts/golden.mjs            # render + compare, exit 1 on diff
//   node scripts/golden.mjs --update   # render + overwrite tests/golden.png
//
// Deviations are expected between Chrome/SwiftShader versions, so the check is
// a percentage budget (MAX_DIFF_PCT), not pixel equality.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GOLDEN = path.join(ROOT, 'tests', 'golden.png');
const OUT = process.env.GOLDEN_OUT || path.join(ROOT, 'tests', 'actual.png');
const DIFF = path.join(ROOT, 'tests', 'diff.png');

const PORT = 8123;
const WIDTH = 960;
const HEIGHT = 540;
const FRAME_LIMIT = 200;   // > 180 so the 3 s bloom-quality step has fired
const MAX_DIFF_PCT = 1.0;   // percent of pixels allowed to differ
const SEED = 1337;

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.woff2': 'font/woff2', '.json': 'application/json',
};

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const url = decodeURIComponent(req.url.split('?')[0]);
      const file = path.join(ROOT, url === '/' ? 'index.html' : url);
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404); res.end('nope'); return;
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    srv.listen(PORT, '127.0.0.1', () => resolve(srv));
  });
}

// Runs in the page before any script. Must be fully self-contained.
function seedTheWorld(seed, frameLimit, width, height) {
  // mulberry32: small, fast, good enough to be a fixed universe.
  let a = seed >>> 0;
  Math.random = function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  // Fake clock + frame budget. After the budget the loop dies for good, which
  // is what makes the screenshot race-free.
  let t = 0;
  window.__frames = 0;
  performance.now = () => t;
  Date.now = () => 1700000000000; // OrbitControls falls back to Date.now()
  const realRAF = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => {
    if (window.__frames >= frameLimit) return 0;
    window.__frames++;
    t += 16.667;
    return realRAF(() => cb(t));
  };

  // Fixed viewport so resize handlers never fire mid-frame-budget.
  Object.defineProperty(window, 'innerWidth', { value: width });
  Object.defineProperty(window, 'innerHeight', { value: height });

  // Headless can report the page as hidden, which would trip the
  // visibilitychange handler and cancel the loop before any frame renders.
  // Pinning it also makes the run independent of runner focus state.
  Object.defineProperty(document, 'hidden', { get: () => false });
  Object.defineProperty(document, 'visibilityState', { get: () => 'visible' });
}

async function render() {
  const srv = await serve();
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-gpu-sandbox',
      '--enable-unsafe-swiftshader',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--disable-dev-shm-usage',
    ],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });
    await page.evaluateOnNewDocument(seedTheWorld, SEED, FRAME_LIMIT, WIDTH, HEIGHT);
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded' });
    // The predicate is an IIFE string: a bare arrow-function expression would
    // be truthy the moment it evaluated, and the wait would pass instantly.
    await page.waitForFunction(
      `(() => window.__frames >= ${FRAME_LIMIT})()`,
      { timeout: 180000 }
    );
    if (pageErrors.length) {
      throw new Error('page errors: ' + pageErrors.join(' | '));
    }
    const canvas = await page.$('canvas');
    if (!canvas) throw new Error('no canvas: WebGL init failed');

    // The canvas sits behind the HUD, and element.screenshot() captures the
    // painted rectangle — overlays included. An FPS counter in the baseline is
    // a guaranteed flake, so strip everything that is not the canvas.
    // Invariant this relies on: any floating chrome (toggles, the Retrigger
    // button) must be a DIRECT child of <body>, or it survives this rule and
    // leaks web-font rendering into the comparison.
    await page.evaluate(() => {
      const s = document.createElement('style');
      s.textContent = 'body > *:not(canvas){display:none !important}';
      document.head.appendChild(s);
    });

    // Fail with a real message instead of a black-square diff if the context
    // was never created.
    const drew = await page.evaluate(() => {
      const c = document.querySelector('canvas');
      const gl = c.getContext('webgl2') || c.getContext('webgl');
      return !!gl;
    });
    if (!drew) throw new Error('canvas exists but has no live WebGL context');

    await canvas.screenshot({ path: OUT });
    return OUT;
  } finally {
    await browser.close();
    srv.close();
  }
}

function compare() {
  if (!fs.existsSync(GOLDEN)) {
    console.log('::notice::no tests/golden.png yet — this run produces the baseline artifact');
    console.log(`golden: ${OUT}`);
    return 0;
  }
  const golden = PNG.sync.read(fs.readFileSync(GOLDEN));
  const actual = PNG.sync.read(fs.readFileSync(OUT));
  if (golden.width !== actual.width || golden.height !== actual.height) {
    console.error(`size mismatch: golden ${golden.width}x${golden.height} vs actual ${actual.width}x${actual.height}`);
    return 1;
  }
  const diff = new PNG({ width: golden.width, height: golden.height });
  const bad = pixelmatch(golden.data, actual.data, diff.data, golden.width, golden.height,
    { threshold: 0.1 });
  fs.writeFileSync(DIFF, PNG.sync.write(diff));
  const pct = (100 * bad) / (golden.width * golden.height);
  console.log(`pixel diff: ${bad} px (${pct.toFixed(3)} %) — budget ${MAX_DIFF_PCT} %`);
  if (pct > MAX_DIFF_PCT) {
    console.error('FAIL: the frame changed. Open tests/diff.png; if the change is ' +
      'intended, re-run with --update and commit the new golden.');
    return 1;
  }
  console.log('OK: golden frame matches');
  return 0;
}

const update = process.argv.includes('--update');
await render();
if (update) {
  fs.copyFileSync(OUT, GOLDEN);
  console.log(`golden updated: ${GOLDEN}`);
} else {
  process.exit(compare());
}
