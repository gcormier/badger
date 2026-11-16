/// <reference lib="webworker" />
import Module from 'manifold-3d';
import wasmUrl from 'manifold-3d/manifold.wasm?url';
import type { ManifoldToplevel } from 'manifold-3d';
import { runBuild, BuildResult } from './geometry/pipeline';
import { parseSvg } from './geometry/svg';
import { traceImage, RGBAImage } from './geometry/raster';
import type { LogoInput } from './geometry/logo';
import type { Params } from './params';

export type LogoSource =
  | { kind: 'svg'; name: string; text: string }
  | { kind: 'image'; name: string; image: RGBAImage };

export type WorkerRequest =
  | { type: 'source'; source: LogoSource | null }
  | { type: 'build'; id: number; params: Params };

export type WorkerResponse =
  | { type: 'ready' }
  | { type: 'result'; id: number; result: BuildResult; sourceWarnings: string[]; threshold: number | null }
  | { type: 'error'; id: number; message: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;
let wasm: ManifoldToplevel | null = null;
const ready = (async () => {
  wasm = await Module({ locateFile: () => wasmUrl });
  wasm.setup();
  ctx.postMessage({ type: 'ready' } satisfies WorkerResponse);
})();

let source: LogoSource | null = null;
let svgCache: { input: LogoInput; warnings: string[] } | null = null;
let traceCache: { key: string; input: LogoInput; threshold: number } | null = null;

function logoInput(p: Params): { input: LogoInput | null; warnings: string[]; threshold: number | null } {
  if (!source) return { input: null, warnings: [], threshold: null };
  if (source.kind === 'svg') {
    if (!svgCache) {
      const r = parseSvg(source.text);
      svgCache = { input: { kind: 'svg', shapes: r.shapes }, warnings: r.warnings };
    }
    return { input: svgCache.input, warnings: svgCache.warnings, threshold: null };
  }
  const t = p.threshold === null ? null : p.threshold / 255;
  const key = `${t}|${p.invert}|${p.trace_smooth}`;
  if (!traceCache || traceCache.key !== key) {
    const img = source.image;
    const r = traceImage(img, { threshold: t, invert: p.invert, blur: p.trace_smooth, simplifyPx: 0.25 });
    traceCache = { key, input: { kind: 'raster', contours: r.contours, width: img.width, height: img.height }, threshold: r.threshold };
  }
  const warnings = traceCache.input.kind === 'raster' && traceCache.input.contours.length === 0
    ? ['Tracing found nothing — adjust the threshold or toggle invert'] : [];
  return { input: traceCache.input, warnings, threshold: Math.round(traceCache.threshold * 255) };
}

ctx.onmessage = async (ev: MessageEvent<WorkerRequest>) => {
  const msg = ev.data;
  await ready;
  if (msg.type === 'source') {
    source = msg.source;
    svgCache = null;
    traceCache = null;
    return;
  }
  if (msg.type === 'build') {
    try {
      const li = logoInput(msg.params);
      const result = runBuild(wasm!, msg.params, li.input);
      const transfer: Transferable[] = [result.caseMesh.positions.buffer, result.caseMesh.indices.buffer];
      if (result.logoMesh) transfer.push(result.logoMesh.positions.buffer, result.logoMesh.indices.buffer);
      ctx.postMessage({ type: 'result', id: msg.id, result, sourceWarnings: li.warnings, threshold: li.threshold } satisfies WorkerResponse, transfer);
    } catch (e) {
      ctx.postMessage({ type: 'error', id: msg.id, message: e instanceof Error ? e.message : String(e) } satisfies WorkerResponse);
    }
  }
};
