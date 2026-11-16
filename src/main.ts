import './style.css';
import { DEFAULTS, FIELDS, Params, FieldMeta, derive } from './params';
import { Viewer, ViewName } from './viewer';
import { build3MF } from './export/threemf';
import type { WorkerRequest, WorkerResponse, LogoSource } from './worker';
import type { BuildResult } from './geometry/pipeline';
import { encodeShare, decodeShare, paramDiff } from './share';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const STORE = 'badger.params.v1';

// ---------- state ----------
let params: Params = loadParams();
let source: LogoSource | null = null;
let rasterImage: ImageData | null = null;
let last: BuildResult | null = null;
let buildId = 0;
let shownId = 0;
let lastThreshold: number | null = null;

function loadParams(): Params {
  try {
    const s = localStorage.getItem(STORE);
    if (s) return { ...DEFAULTS, ...JSON.parse(s) };
  } catch { /* ignore */ }
  return { ...DEFAULTS };
}
function saveParams() {
  try { localStorage.setItem(STORE, JSON.stringify(params)); } catch { /* ignore */ }
}

// ---------- worker ----------
const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
const send = (m: WorkerRequest) => worker.postMessage(m);
type LogoMsg = Extract<WorkerResponse, { type: 'logo' }>;
const logoWaiters = new Map<number, (m: LogoMsg) => void>();
let logoReq = 0;
const exportLogo = () => new Promise<LogoMsg>((res) => {
  const id = ++logoReq;
  logoWaiters.set(id, res);
  send({ type: 'exportLogo', id, params });
});
worker.onmessage = (ev: MessageEvent<WorkerResponse>) => {
  const m = ev.data;
  if (m.type === 'ready') return;
  if (m.type === 'logo') { logoWaiters.get(m.id)?.(m); logoWaiters.delete(m.id); return; }
  if (m.id !== buildId) return; // stale
  $('busy').hidden = true;
  if (m.type === 'error') {
    renderWarnings([], m.message);
    return;
  }
  shownId = m.id;
  last = m.result;
  lastThreshold = m.threshold;
  viewer.setColors(params.case_color, params.logo_color);
  viewer.update(m.result);
  renderWarnings([...m.sourceWarnings, ...m.result.warnings]);
  renderStats(m.result);
  updateThresholdUI();
  ($('download') as HTMLButtonElement).disabled = false;
};
worker.onerror = (e) => renderWarnings([], `Worker error: ${e.message}`);

let timer = 0;
function rebuild(delay = 150) {
  clearTimeout(timer);
  timer = window.setTimeout(() => {
    buildId++;
    $('busy').hidden = false;
    ($('download') as HTMLButtonElement).disabled = true;
    send({ type: 'build', id: buildId, params });
  }, delay);
}

// ---------- viewer ----------
const viewer = new Viewer($('viewer'));
const syncViewerBg = () => viewer.setBackground(getComputedStyle(document.documentElement).getPropertyValue('--view-bg').trim() || '#e9e9e6');
syncViewerBg();
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', syncViewerBg);
document.querySelectorAll<HTMLButtonElement>('.toolbar button[data-view]').forEach(b => {
  b.addEventListener('click', () => {
    document.querySelectorAll('.toolbar button[data-view]').forEach(x => x.classList.remove('on'));
    b.classList.add('on');
    viewer.setView(b.dataset.view as ViewName);
  });
});
$<HTMLInputElement>('overlay').addEventListener('change', (e) => {
  viewer.showOverlay = (e.target as HTMLInputElement).checked;
  if (last) viewer.update(last);
});

// ---------- form ----------
function fieldEl(f: FieldMeta): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'field';
  const id = `f-${f.key}`;
  wrap.innerHTML = `<label for="${id}">${f.label}${f.help ? `<span class="help">${f.help}</span>` : ''}</label>
    <span class="num"><input type="number" id="${id}" step="${f.step ?? 0.1}" ${f.min !== undefined ? `min="${f.min}"` : ''} ${f.max !== undefined ? `max="${f.max}"` : ''}/><span class="unit">${f.unit ?? ''}</span></span>`;
  const input = wrap.querySelector('input')!;
  input.value = String(params[f.key]);
  input.addEventListener('input', () => {
    const v = parseFloat(input.value);
    if (!Number.isFinite(v)) return;
    (params as unknown as Record<string, number>)[f.key] = v;
    saveParams();
    rebuild();
  });
  return wrap;
}

function renderForm() {
  const logo = $('fields-logo'), cs = $('fields-case'), adv = $('fields-advanced');
  logo.innerHTML = cs.innerHTML = adv.innerHTML = '';
  for (const f of FIELDS) {
    if (f.mode && f.mode !== params.card_mode) continue;
    const el = fieldEl(f);
    if (f.group === 'logo') (f.star ? logo : adv).appendChild(el);
    else (f.star ? cs : adv).appendChild(el);
  }
  $<HTMLSelectElement>('card_mode').value = params.card_mode;
  $<HTMLInputElement>('ridge_auto').checked = params.ridge_auto;
  $<HTMLInputElement>('invert').checked = params.invert;
  $<HTMLSelectElement>('thin_mode').value = params.thin_mode;
  $<HTMLInputElement>('case_color').value = params.case_color;
  $<HTMLInputElement>('logo_color').value = params.logo_color;
  $<HTMLInputElement>('threshold-auto').checked = params.threshold === null;
  if (params.threshold !== null) $<HTMLInputElement>('threshold').value = String(params.threshold);
}
renderForm();

$<HTMLInputElement>('invert').addEventListener('change', (e) => {
  params.invert = (e.target as HTMLInputElement).checked;
  saveParams(); updateRasterPreview(); rebuild();
});
$<HTMLSelectElement>('card_mode').addEventListener('change', (e) => {
  const mode = (e.target as HTMLSelectElement).value as Params['card_mode'];
  // carry the current stack over so switching modes doesn't jump
  const d = derive(params);
  if (mode === 'count') params.card_count = Math.max(1, Math.round(d.card_t / params.card_unit));
  else params.card_t = Math.round(d.card_t * 100) / 100;
  params.card_mode = mode;
  saveParams(); renderForm(); rebuild();
});
$<HTMLInputElement>('ridge_auto').addEventListener('change', (e) => {
  params.ridge_auto = (e.target as HTMLInputElement).checked;
  saveParams(); rebuild();
});
$<HTMLSelectElement>('thin_mode').addEventListener('change', (e) => {
  params.thin_mode = (e.target as HTMLSelectElement).value as Params['thin_mode'];
  saveParams(); rebuild();
});
for (const k of ['case_color', 'logo_color'] as const) {
  $<HTMLInputElement>(k).addEventListener('input', (e) => {
    params[k] = (e.target as HTMLInputElement).value.toUpperCase();
    saveParams();
    viewer.setColors(params.case_color, params.logo_color);
  });
}
$<HTMLInputElement>('threshold').addEventListener('input', (e) => {
  params.threshold = parseInt((e.target as HTMLInputElement).value, 10);
  $<HTMLInputElement>('threshold-auto').checked = false;
  saveParams(); updateThresholdUI(); updateRasterPreview(); rebuild(250);
});
$<HTMLInputElement>('threshold-auto').addEventListener('change', (e) => {
  params.threshold = (e.target as HTMLInputElement).checked ? null : parseInt($<HTMLInputElement>('threshold').value, 10);
  saveParams(); updateRasterPreview(); rebuild();
});
$('reset').addEventListener('click', () => {
  params = { ...DEFAULTS };
  saveParams(); renderForm(); updateRasterPreview(); rebuild(0);
});

function updateThresholdUI() {
  const t = params.threshold ?? lastThreshold;
  $('threshold-val').textContent = t === null ? '' : `${t}${params.threshold === null ? ' (Otsu)' : ''}`;
  if (params.threshold === null && lastThreshold !== null) $<HTMLInputElement>('threshold').value = String(lastThreshold);
}

// ---------- file input ----------
const drop = $('drop');
const fileInput = $<HTMLInputElement>('file');
fileInput.addEventListener('change', () => { if (fileInput.files?.[0]) loadFile(fileInput.files[0]); });
drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', (e) => {
  e.preventDefault(); drop.classList.remove('over');
  const f = e.dataTransfer?.files?.[0];
  if (f) loadFile(f);
});
$('clear-logo').addEventListener('click', () => setSource(null));

async function loadFile(f: File) {
  try {
    const isSvg = f.type === 'image/svg+xml' || /\.svg$/i.test(f.name);
    if (isSvg) {
      setSource({ kind: 'svg', name: f.name, text: await f.text() });
    } else {
      const img = await decodeImage(f);
      rasterImage = img;
      setSource({ kind: 'image', name: f.name, image: { width: img.width, height: img.height, data: img.data } });
    }
  } catch (e) {
    renderWarnings([], `Could not read ${f.name}: ${e instanceof Error ? e.message : e}`);
  }
}

async function decodeImage(f: File): Promise<ImageData> {
  const bmp = await createImageBitmap(f);
  const MAX = 2048;
  const k = Math.min(1, MAX / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  g.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  return g.getImageData(0, 0, w, h);
}

function setSource(s: LogoSource | null) {
  source = s;
  if (!s) rasterImage = null;
  $('source-row').hidden = !s;
  $('source-name').textContent = s ? s.name : '';
  $('drop-text').textContent = s ? 'Drop another file to replace' : 'Drop an SVG or PNG here, or click to choose';
  $('raster-controls').hidden = s?.kind !== 'image';
  fileInput.value = '';
  // copy the pixels: the transfer would detach our preview copy
  const msg: WorkerRequest = s?.kind === 'image'
    ? { type: 'source', source: { ...s, image: { width: s.image.width, height: s.image.height, data: new Uint8ClampedArray(s.image.data) } } }
    : { type: 'source', source: s };
  send(msg);
  updateRasterPreview();
  rebuild(0);
}

/** Binarised preview of what will be traced (approximate: no smoothing). */
function updateRasterPreview() {
  const c = $<HTMLCanvasElement>('raster-preview');
  if (!rasterImage || source?.kind !== 'image') return;
  const { width: W, height: H, data } = rasterImage;
  c.width = W; c.height = H;
  const out = new ImageData(W, H);
  const t = (params.threshold ?? lastThreshold ?? 128) / 255;
  for (let i = 0; i < W * H; i++) {
    const r = data[i * 4] / 255, g = data[i * 4 + 1] / 255, b = data[i * 4 + 2] / 255, a = data[i * 4 + 3] / 255;
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const ink = a * (params.invert ? lum : 1 - lum) > t;
    const v = ink ? 0 : 255;
    out.data[i * 4] = out.data[i * 4 + 1] = out.data[i * 4 + 2] = v; out.data[i * 4 + 3] = 255;
  }
  c.getContext('2d')!.putImageData(out, 0, 0);
}

// ---------- output ----------
function renderWarnings(ws: string[], err?: string) {
  const ul = $('warnings');
  ul.innerHTML = '';
  if (err) { const li = document.createElement('li'); li.className = 'err'; li.textContent = err; ul.appendChild(li); }
  for (const w of ws) { const li = document.createElement('li'); li.textContent = w; ul.appendChild(li); }
}

function renderStats(r: BuildResult) {
  const d = derive(params);
  const rows: [string, string][] = [
    ['Body', `${(r.bbox.max[0] - r.bbox.min[0]).toFixed(2)} × ${(r.bbox.max[1] - r.bbox.min[1]).toFixed(2)} × ${(r.bbox.max[2] - r.bbox.min[2]).toFixed(2)} mm`],
    ['Card stack', `${d.card_t.toFixed(2)} mm${params.card_mode === 'count' ? ` (${params.card_count} × ${params.card_unit})` : ` (≈ ${(d.card_t / params.card_unit).toFixed(1)} cards)`}`],
    ['Card section', `${d.T_card.toFixed(2)} mm thick`],
    ['Ridge height', `${d.ridge_h.toFixed(2)} mm${params.ridge_auto ? ' (auto)' : ''}`],
    ['Case volume', `${r.caseMesh.volume.toFixed(1)} mm³`],
  ];
  if (r.logoMesh && r.logo) {
    const b = r.logo.bbox!;
    rows.push(
      ['Logo volume', `${r.logoMesh.volume.toFixed(1)} mm³`],
      ['Logo bbox', `${(b.max[0] - b.min[0]).toFixed(1)} × ${(b.max[1] - b.min[1]).toFixed(1)} mm`],
      ['Logo islands', String(r.logo.islands)],
    );
    if (r.logo.removedArea > 0.001) rows.push(['Removed (thin/small)', `${r.logo.removedArea.toFixed(2)} mm²`]);
    if (r.logo.clippedArea > 0.001) rows.push(['Clipped', `${r.logo.clippedArea.toFixed(2)} mm²`]);
    const gap = r.caseMesh.volume + r.logoMesh.volume - r.uninlaidVolume;
    rows.push(['Inlay check', Math.abs(gap) < 0.01 ? 'flush ✓' : `${gap.toFixed(3)} mm³ mismatch`]);
  }
  rows.push(['Build', `${r.ms.toFixed(0)} ms`]);
  $('stats').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
}

$('download').addEventListener('click', () => {
  if (!last || shownId !== buildId) return;
  const meshes = [{ name: 'Case', positions: last.caseMesh.positions, indices: last.caseMesh.indices, color: params.case_color, extruder: 1 }];
  if (last.logoMesh) meshes.push({ name: 'Logo', positions: last.logoMesh.positions, indices: last.logoMesh.indices, color: params.logo_color, extruder: 2 });
  const base = source ? source.name.replace(/\.[^.]+$/, '') : 'plain';
  const bytes = build3MF(meshes, { title: `Badge Holder - ${base}` });
  const blob = new Blob([bytes as BlobPart], { type: 'model/3mf' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `badge-holder-${base.replace(/[^\w.-]+/g, '_')}.3mf`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
});

// ---------- share links ----------
const SHARE_WARN = 8000;
$('share').addEventListener('click', async () => {
  const msg = $('share-msg');
  const logo = await exportLogo();
  const p = { ...params };
  // a traced PNG is shared as its outline: threshold/invert no longer apply
  if (source?.kind === 'image') { p.threshold = null; p.invert = false; }
  const enc = encodeShare({ params: paramDiff(p), logo: logo.svg ? { name: logo.name, svg: logo.svg } : undefined });
  const url = `${location.origin}${location.pathname}#s=${enc}`;
  let copied = false;
  try { await navigator.clipboard.writeText(url); copied = true; } catch { /* insecure context etc. */ }
  const kb = (url.length / 1024).toFixed(1);
  msg.hidden = false;
  msg.textContent = (copied ? `Link copied (${kb} KB)` : `Copy this link (${kb} KB):`) +
    (url.length > SHARE_WARN ? ' — long; some chat apps may truncate it' : '') +
    (source?.kind === 'image' ? ' · PNG shared as its traced outline' : '');
  const box = document.createElement('input');
  box.readOnly = true; box.value = url;
  box.addEventListener('focus', () => box.select());
  msg.appendChild(box);
});

function loadFromHash(): boolean {
  const m = location.hash.match(/^#s=([\w-]+)$/);
  if (!m) return false;
  const dec = decodeShare(m[1]);
  history.replaceState(null, '', location.pathname + location.search);
  if (!dec) { renderWarnings([], 'This share link is damaged or from an incompatible version'); return false; }
  params = { ...DEFAULTS, ...dec.params };
  saveParams();
  renderForm();
  if (dec.logo) setSource({ kind: 'svg', name: dec.logo.name, text: dec.logo.svg });
  return true;
}
window.addEventListener('hashchange', () => { if (loadFromHash()) rebuild(0); });

loadFromHash();
rebuild(0);
