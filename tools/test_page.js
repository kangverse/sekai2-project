// Load the LIVE published page in jsdom, run its real script.js against the real
// data files, and assert the sections actually populate. Catches exactly the class of
// failure that shipped: an exception aborting everything below the Explore grid.
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const path = require('path');

const ROOT = '/mnt/workspace/hk/Acamedic/Sekai2/sekai2_website';
const BASE = process.argv[2] || 'local';

async function readSource(rel) {
  if (BASE === 'local') return fs.readFileSync(path.join(ROOT, rel.split('?')[0]), 'utf8');
  const res = await fetch(`${BASE}/${rel}`);
  if (!res.ok) throw new Error(`${rel} -> HTTP ${res.status}`);
  return res.text();
}

(async () => {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errors.push('jsdomError: ' + (e.message || e)));
  vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));

  const html = await readSource('index.html');
  const dom = new JSDOM(html, { runScripts: 'outside-only', virtualConsole: vc,
                                url: 'https://kangverse.github.io/sekai2-project/' });
  const { window } = dom;

  // Minimal shims: jsdom has no WebGL/canvas/IO, and we are testing DOM wiring.
  window.IntersectionObserver = class { constructor(cb){this.cb=cb;} observe(){} unobserve(){} disconnect(){} };
  window.HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
  window.HTMLMediaElement.prototype.pause = function () {};
  window.HTMLMediaElement.prototype.load = function () {};
  window.PoseViewer = class {                       // stand-in for the three.js viewer
    constructor(el){ this.el = el; }
    init(){} loadTrajectory(){} setShowFrustums(){} setFollowMode(){}
    setProgressHighlight(){} setShowDirection(){} setCurrentFrame(){} _onResize(){}
    resetCamera(){}
  };
  window.HTMLDialogElement && (window.HTMLDialogElement.prototype.showModal = function(){});

  // Serve the page's own fetches from disk / the live host.
  const fetched = [];
  window.fetch = async (u) => {
    const rel = String(u).replace('https://kangverse.github.io/sekai2-project/', '');
    fetched.push(rel);
    const body = await readSource(rel);
    return { ok: true, status: 200, text: async () => body, json: async () => JSON.parse(body) };
  };

  const script = await readSource('script.js');
  try { window.eval(script); } catch (e) { errors.push('THROWN by script.js: ' + e.message); }
  await new Promise(r => setTimeout(r, 900));       // let the fetch chains settle

  const q = s => window.document.querySelector(s);
  const n = s => window.document.querySelectorAll(s).length;
  const checks = [
    ['Explore filter buttons',        n('#filters .filter') === 4, n('#filters .filter')],
    ['Explore cards rendered',        n('#dataset-grid .data-card') === 8, n('#dataset-grid .data-card')],
    ['Explore rows all full',         (() => {
        const spans = [...window.document.querySelectorAll('#dataset-grid .data-card')]
          .map(c => +c.dataset.span);
        let row = 0, rows = [];
        for (const s of spans) { row += s; if (row >= 12) { rows.push(row); row = 0; } }
        return row === 0 && rows.every(r => r === 12);
      })(), [...window.document.querySelectorAll('#dataset-grid .data-card')].map(c=>c.dataset.span).join('+')],
    ['Map SVG injected',              n('#geo-svg-host svg') === 1, n('#geo-svg-host svg')],
    ['Interactive countries',         n('#geo-svg-host path.on') === 99, n('#geo-svg-host path.on')],
    ['Annotation fields populated',   n('#field-list .field') === 5, n('#field-list .field')],
    ['Annotation segment strip',      n('#segment-strip .segment') === 6, n('#segment-strip .segment')],
    ['Annotation video src set',      !!q('#annotation-video')?.getAttribute('src'), q('#annotation-video')?.getAttribute('src')],
    ['Trajectory tabs',               n('#trajectory-tabs .trajectory-tab') === 5, n('#trajectory-tabs .trajectory-tab')],
    ['Caption case tabs',             n('#caption-case-tabs button') === 20, n('#caption-case-tabs button')],
    ['Caption explorer filled',       (q('#caption-case-explorer')?.innerHTML.length || 0) > 500, (q('#caption-case-explorer')?.innerHTML.length||0)],
    ['Panoramic tabs',                n('#pano-case-tabs button') === 3, n('#pano-case-tabs button')],
    ['Panoramic video src set',       !!q('#pano-case-video')?.getAttribute('src'), q('#pano-case-video')?.getAttribute('src')],
    ['Reconstruction cards',          n('#reconstruction-grid .reconstruction-card') === 12, n('#reconstruction-grid .reconstruction-card')],
    ['Motion pills',                  n('#motion-pills .pill') === 19, n('#motion-pills .pill')],
    ['Hero wall videos',              n('.wall-card video') > 30, n('.wall-card video')],
    ['No long-horizon leftovers',     n('#long-horizon, #long-video, #timeline') === 0, n('#long-horizon, #long-video, #timeline')],
    ['Attribute tabs',                n('#attr-tabs .attr-tab') === 5, n('#attr-tabs .attr-tab')],
    ['Attribute bars drawn',          n('#attr-chart .attr-row') >= 8, n('#attr-chart .attr-row')],
    ['Attribute totals labelled',     /distinct values/.test(q('#attr-total')?.textContent || ''), q('#attr-total')?.textContent],
    ['No report figures',             n('.figure-card') === 0, n('.figure-card')],
    ['Validation cards',              n('#validation .source-cards article') === 4, n('#validation .source-cards article')],
    ['Validation table rows',         n('#validation .val-table tbody tr') === 9, n('#validation .val-table tbody tr')],
    ['No placeholder copy',           !/can later be connected|coming soon here|Lorem/i.test(window.document.body.textContent), 'found placeholder text'],
  ];

  console.log(`\n=== ${BASE === 'local' ? 'LOCAL WORKING TREE' : 'LIVE: ' + BASE} ===`);
  let failed = 0;
  for (const [name, ok, got] of checks) {
    console.log(`${ok ? ' PASS' : ' FAIL'}  ${name.padEnd(32)} ${ok ? '' : '(got: ' + got + ')'}`);
    if (!ok) failed++;
  }
  console.log('\nfetched by page:', fetched.join(', '));
  if (errors.length) { console.log('\nERRORS:'); errors.slice(0, 8).forEach(e => console.log('  ' + e)); }
  console.log(`\n${failed === 0 && errors.length === 0 ? 'ALL CHECKS PASSED' : failed + ' failed, ' + errors.length + ' errors'}`);
  process.exit(failed === 0 && errors.length === 0 ? 0 : 1);
})();
