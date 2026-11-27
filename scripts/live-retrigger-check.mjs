// Live behaviour check: do form knobs apply while the field is paused,
// and does the Retrigger button fire without breaking the frame?
//
// Runs headless Chrome against a throwaway static server on the repo tree,
// same toolchain as scripts/golden.mjs. Frames land in the runner temp dir
// (LIVE_OUT_DIR overrides) so CI can upload them on failure.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.env.LIVE_OUT_DIR || os.tmpdir();
const PORT = 8124;
const W = 640, H = 400;

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

// Deterministic universe: seeded PRNG, no rAF cap (the loop must stay alive
// so the pause gate is what we are actually testing).
function seed() {
  let a = 1337 >>> 0;
  Math.random = function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  Object.defineProperty(document, 'hidden', { get: () => false });
  Object.defineProperty(document, 'visibilityState', { get: () => 'visible' });
}

const shot = async (page, name) => {
  const buf = await page.screenshot({
    clip: await page.evaluate(() => {
      const c = document.querySelector('canvas');
      const r = c.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    }),
  });
  fs.writeFileSync(path.join(OUT, `${name}.png`), buf);
  return PNG.sync.read(buf);
};

const diffPct = (a, b) => {
  const n = pixelmatch(a.data, b.data, null, a.width, a.height, { threshold: 0.1 });
  return (100 * n) / (a.width * a.height);
};

const srv = await serve();
const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-gpu-sandbox', '--enable-unsafe-swiftshader',
    '--use-gl=angle', '--use-angle=swiftshader', '--disable-dev-shm-usage'],
});
const errors = [];
try {
  const page = await browser.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(seed);
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 4000));       // let the scene settle

  // auto-rotate would move the camera and pollute every comparison
  await page.evaluate(() => {
    const el = document.getElementById('auto-rotate');
    if (el.checked) el.click();
  });
  // freeze the field
  await page.click('#btn-play-pause');
  await new Promise(r => setTimeout(r, 600));

  const A = await shot(page, 'rt-a');

  // turn a form knob WHILE PAUSED — the exact reported failure mode
  await page.evaluate(() => {
    const el = document.getElementById('form-pitch');
    el.value = '1.8';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await new Promise(r => setTimeout(r, 800));
  const B = await shot(page, 'rt-b');

  // Retrigger on an already-consistent field must be idempotent, not a crash
  await page.click('#btn-retrigger');
  await new Promise(r => setTimeout(r, 800));
  const C = await shot(page, 'rt-c');

  const notif = await page.evaluate(() =>
    [...document.querySelectorAll('.notification')].map(n => n.textContent).join('|'));

  const knobApplied = diffPct(A, B);
  const retriggerDrift = diffPct(B, C);

  console.log('knob-while-paused changed canvas: ', knobApplied.toFixed(2) + '%');
  console.log('retrigger drift (want ~0):        ', retriggerDrift.toFixed(2) + '%');
  console.log('notification:', notif || '<none>');
  console.log('page errors:', errors.length ? errors.join(' | ') : 'none');

  const ok = knobApplied > 0.5 && retriggerDrift < 1.0 && errors.length === 0
    && /RETRIGGERED/i.test(notif);
  console.log(ok ? 'RESULT: PASS' : 'RESULT: FAIL');
  process.exitCode = ok ? 0 : 1;
} finally {
  await browser.close();
  srv.close();
}
