# Badge Holder Inlay

Static, client-side web tool that rebuilds the **gen1 badge holder** (ID card + YubiKey) from parameters, inlays an uploaded logo (SVG or PNG) flush into the **bed-side face**, and exports a single **3MF** with two parts (Case + Logo) for a multi-material printer (Bambu AMS).

Spec: [`docs/SPEC.md`](docs/SPEC.md).

## Develop

```bash
npm install
```

```bash
npm run dev
```

```bash
npm test
```

```bash
npm run build
```

Pushing to the default branch runs `.github/workflows/pages.yml`, which tests, builds and deploys `dist/` to GitHub Pages. Pages must be set to **Source: GitHub Actions** under repository Settings → Pages.

## How it works

| Step | Code |
|---|---|
| Case CSG (port of `reference/build_reference.py`) | `src/geometry/case.ts` |
| SVG → filled shapes (paint order: dark fills add, light fills knock out) | `src/geometry/svg.ts` |
| PNG → contours (Otsu threshold, marching squares, sub-pixel) | `src/geometry/raster.ts` |
| Place (scale to long axis, rotate, mirror X), clean, keep-out, inlay | `src/geometry/logo.ts` |
| Build orchestration (runs in a Web Worker) | `src/geometry/pipeline.ts`, `src/worker.ts` |
| 3MF writer (assembly of 2 components + Bambu `model_settings.config`) | `src/export/threemf.ts` |
| UI / three.js preview | `src/main.ts`, `src/viewer.ts` |

Geometry is [manifold-3d](https://github.com/elalish/manifold) (WASM), so both meshes are guaranteed manifold.

### Thin-feature handling

`min_feature` runs a morphological opening (erode then dilate by `min_feature/2`). Two modes:

- **Keep sharp tips** (default): each original island is kept whole if the opened core inside it is at least `min_island_area`, else dropped. This keeps needle tips such as the lightning-bolt points at full length (matches the Fusion reference: 33.5 × 75 mm), while still removing things like ®.
- **Strict opening**: the opened shape itself is used, so everything narrower than `min_feature` goes, tips included.

## Tests (`test/`)

Run against the Fusion exports in `reference/`:

1. Plain case at `card_t = 2.00`: bbox 61.213 × 120.6 × 5.8 mm, XOR vs Fusion ≈ 1.25 mm³.
2. Milwaukee SVG at `card_t = 2.76`: case ∪ logo XOR ≈ 1.25 mm³, logo XOR vs the Fusion logo ≈ 4.1 mm³ (of 261), logo bbox 33.5 × 75, ® removed, counters kept.
3. Case + logo volume = un-inlaid volume.
4. All meshes manifold; 3MF has one build item made of two components.
5. `card_t` only changes the card section.

The Milwaukee logo in `fixtures/` is only used by the tests and is not bundled into the site.
