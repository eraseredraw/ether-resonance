// Live behaviour check: do form knobs apply while the field is paused,
// and does the Retrigger button fire without disturbing a settled frame?
//
// Four canvas shots, all with the field paused and auto-rotate off:
//   A baseline → B after turning form-pitch → C after clicking Retrigger
//   → D after an idle wait of the same length
// Assertions:
//   diff(A,B) > 0.5%      a knob moved a PAUSED field (the reported bug)
//   diff(B,C) < max(1%, 4×diff(C,D))   Retrigger is idempotent, not a reset
//   no page errors, notification reads FIELD RETRIGGERED
// diff(C,D) is the noise floor: camera lerp/damping and twinkle keep moving
// pixels even on a paused field, so idempotence is judged against measurement
// rather than against zero.
//
// A placement pass then checks the button is discoverable: painted, in the
// upper-right quadrant, topmost at its own centre (nothing overlapping), both
// with the HUD panel closed and open — and that opening the HUD steps it down
// instead of leaving it underneath. It runs last so it cannot perturb pixels.
//
// An ASCII pass then enables the glyph renderer and shoots the cell-size
// extremes (E at 1.0, F at the slider floor): the density must visibly change
// and the frame must not come out empty. That is what guards the 0.6 → 0.3
// floor drop and the mipmapped atlas that makes it survivable.
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
const W = 960, H = 540;   // same as golden.mjs: the desktop panel is unfolded here

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

// Rec.709 luminance stats of one shot. Used as a sanity floor for the ASCII
// pass: a texture that fails to upload renders black, and a black frame can
// still differ from the baseline by a large percentage, so pixel-diff alone
// would happily pass it.
const pngLuminance = (img) => {
  const d = img.data;
  let sum = 0, black = 0;
  const n = d.length / 4;
  for (let i = 0; i < d.length; i += 4) {
    const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    sum += l;
    if (l < 4) black++;
  }
  return { mean: sum / n, blackPct: (100 * black) / n };
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
  // The adaptive bloom sampler steps intensity every 3 s of wall clock based
  // on measured FPS; headless SwiftShader FPS varies frame to frame, so it
  // would move pixels between shots for reasons that have nothing to do with
  // the button. Neutralise it before the first 3 s tick.
  await page.evaluate(() => { window.adjustBloomQuality = () => {}; });
  await new Promise(r => setTimeout(r, 4000));       // let the scene settle

  // Deterministic clicks that do not depend on the panel being unfolded:
  // Element.click() runs the same listener a tap would. What is under test is
  // the handler chain (knob → S → dirty flag → buffer), not hit-testing.
  const click = (id) => page.evaluate(sel => {
    const el = document.getElementById(sel);
    if (!el) throw new Error('missing element #' + sel);
    el.click();
    return true;
  }, id);

  // auto-rotate would move the camera and pollute every comparison
  await page.evaluate(() => {
    const el = document.getElementById('auto-rotate');
    if (el.checked) el.click();
  });
  // freeze the field
  await click('btn-play-pause');
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
  await click('btn-retrigger');
  // Read the acknowledgement before anything else: showNotification removes
  // itself after 2200 ms, and two SwiftShader screenshots eat that budget.
  const notif = await page.evaluate(() =>
    [...document.querySelectorAll('.notification')].map(n => n.textContent).join('|'));
  await new Promise(r => setTimeout(r, 800));
  const C = await shot(page, 'rt-c');

  // Noise floor: same wait, no intervention. Camera lerp/damping and shader
  // twinkle keep moving a few pixels even while paused, so "did the button
  // change nothing?" can only be judged against this, not against zero.
  await new Promise(r => setTimeout(r, 800));
  const D = await shot(page, 'rt-d');

  const knobApplied = diffPct(A, B);
  const noise = diffPct(C, D);
  const retriggerDrift = diffPct(B, C);

  // Discoverability, measured after every pixel comparison so it cannot
  // perturb them. The button used to live inside the control panel — a bottom
  // sheet on mobile — and the user could not find it twice. So assert it is
  // painted, in the upper-right quadrant, and is the TOPMOST element at its own
  // centre (nothing overlapping it), with the HUD closed and again with it open.
  const place = () => page.evaluate(() => {
    const b = document.getElementById('btn-retrigger');
    const r = b.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    const st = getComputedStyle(b);
    return {
      top: Math.round(r.top),
      fromRight: Math.round(window.innerWidth - r.right),
      w: Math.round(r.width),
      h: Math.round(r.height),
      painted: st.display !== 'none' && st.visibility !== 'hidden' && r.width > 0 && r.height > 0,
      topmost: hit === b || b.contains(hit),
      vh: window.innerHeight,
      vw: window.innerWidth,
    };
  });

  const closed = await place();
  await click('hud-toggle');                       // open the HUD panel
  await new Promise(r => setTimeout(r, 700));      // let its transition settle
  const open = await place();
  await click('hud-toggle');                       // restore for the next run
  await new Promise(r => setTimeout(r, 400));

  const fmt = p => `top=${p.top} fromRight=${p.fromRight} ${p.w}x${p.h} ` +
    `painted=${p.painted} topmost=${p.topmost}`;
  console.log('placement (HUD closed):', fmt(closed));
  console.log('placement (HUD open):  ', fmt(open));

  // Two different bars, because the two states genuinely differ. Closed HUD is
  // the normal case: the button must sit in the hard top-right corner. Open
  // HUD means the panel occupies that corner legitimately, so the requirement
  // becomes the same right-hand column, still above the fold, and not
  // underneath the panel — which stepsDown asserts independently.
  const cornerOk = (p, maxTopFrac) => p.painted && p.topmost
    && p.top < p.vh * maxTopFrac && p.fromRight < p.vw * 0.35
    && p.top < p.vh - 54;
  const closedOk = cornerOk(closed, 0.4);
  const openOk = cornerOk(open, 0.75);
  // Opening the HUD must push the button down, not leave it underneath
  const stepsDown = open.top > closed.top;
  console.log(`corner checks: closed=${closedOk} open=${openOk} stepsDown=${stepsDown}`);

  // --- ASCII cell: the slider now reaches 0.3, so prove it renders ---
  // The atlas was doubled to 40px slots with mipmaps precisely so that a ~5px
  // cell stays a glyph instead of noise. Assert the observable consequences:
  // the floor is where we think it is, the label reports it back, shrinking the
  // cell visibly re-densifies the grid, and the pass is still lit (a texture
  // that fails to upload renders the frame black, which no pixel-diff alone
  // would catch).
  const asciiBounds = await page.evaluate(() => {
    const el = document.getElementById('ascii-scale');
    return { min: parseFloat(el.min), max: parseFloat(el.max), step: parseFloat(el.step) };
  });
  // First measurement said nothing: diff 0.46%, mean luminance 1.0. Cause is
  // the shader itself — gi = floor(lum * 10), so on a dark field almost every
  // cell maps to slot 0, the emptiest glyph, and an ASCII pass over a dim scene
  // is indistinguishable from no pass at all: the check would have been
  // measuring black background. So the field is driven bright before comparing.
  await page.evaluate(() => {
    const knob = (id, value, evt) => {
      const el = document.getElementById(id);
      el.value = String(value);
      el.dispatchEvent(new Event(evt, { bubbles: true }));
    };
    knob('particle-size', 5, 'input');      // max: fat particles, more lit px per cell
    knob('form-scale', 300, 'input');       // biggest form, fills the frame
    knob('bloom-intensity', 5, 'input');
    knob('color-mode', 'white', 'change');  // achromatic, brightest set
  });
  await new Promise(r => setTimeout(r, 1500));   // let the dirty field rewrite

  await click('ascii-toggle');                      // ASCII on
  await new Promise(r => setTimeout(r, 900));
  const E = await shot(page, 'rt-e-ascii-100');

  await page.evaluate(() => {
    const el = document.getElementById('ascii-scale');
    el.value = el.min;                              // whatever the floor now is
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await new Promise(r => setTimeout(r, 900));
  const F = await shot(page, 'rt-f-ascii-min');
  const asciiLabel = await page.evaluate(() =>
    document.getElementById('ascii-scale-value').textContent.trim());

  const cellChange = diffPct(E, F);
  const litE = pngLuminance(E), litF = pngLuminance(F);
  console.log('ascii bounds:', JSON.stringify(asciiBounds), '| label:', asciiLabel);
  console.log('ascii cell 1.0 -> floor re-densified grid:', cellChange.toFixed(2) + '%',
    '| mean lum E:', litE.mean.toFixed(1), 'F:', litF.mean.toFixed(1),
    '| black px F:', litF.blackPct.toFixed(1) + '%');

  // E must genuinely be lit or the comparison measures nothing (that is what
  // the first run discovered). Beyond that the bars stay loose: they only have
  // to rule out an empty pass, not grade contrast.
  const asciiOk = asciiBounds.min <= 0.3 && asciiBounds.min > 0
    && asciiBounds.step <= 0.05
    && Math.abs(parseFloat(asciiLabel) - asciiBounds.min) < 0.001
    && litE.mean > 12 && cellChange > 5 && litF.blackPct < 97;

  console.log('knob-while-paused changed canvas: ', knobApplied.toFixed(2) + '%');
  console.log('noise floor (idle C→D):           ', noise.toFixed(2) + '%');
  console.log('retrigger drift (B→C, want ≈ noise):', retriggerDrift.toFixed(2) + '%');
  console.log('notification:', notif || '<none>');
  console.log('page errors:', errors.length ? errors.join(' | ') : 'none');

  // Idempotence is judged against the measured noise floor, not zero: a real
  // reset (buffer rebuild, default count) moves double digits, settling
  // camera and twinkle move fractions.
  const driftBudget = Math.max(1.0, noise * 4);
  const ok = knobApplied > 0.5 && retriggerDrift < driftBudget
    && errors.length === 0 && /RETRIGGERED/i.test(notif)
    && closedOk && openOk && stepsDown && asciiOk;
  console.log('checks: knob=' + (knobApplied > 0.5) + ' idempotent=' + (retriggerDrift < driftBudget)
    + ' notif=' + /RETRIGGERED/i.test(notif) + ' corner=' + (closedOk && openOk && stepsDown)
    + ' ascii=' + asciiOk + ' errors=' + (errors.length === 0));
  console.log(`drift budget: ${driftBudget.toFixed(2)}%  →  ${ok ? 'RESULT: PASS' : 'RESULT: FAIL'}`);
  process.exitCode = ok ? 0 : 1;
} finally {
  await browser.close();
  srv.close();
}
