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

### Card retention

- **Stack**: thickness in mm, or *number of cards × average card* (default 0.80 mm).
- **Pocket**: vertical walls at card size + `card_clr`, so the back cards can't move. Above the front card there's a 45° dovetail lip `dove_h` tall (1.5 mm = `card_tclr` + `skin`). Its narrowest allowed point is the front card's top face. If `dove_h` reaches below that face, the walls move out to match, and at full height you get the original full dovetail.
- **Ridges**: height = stack − one card + `ridge_engage` (0.4 mm), so they catch the **front** card's trailing edge, not just the back ones. The lead-in is 45° (`ridge_ramp`) and the catch face is vertical (`ridge_catch_deg`) with a 0.1 mm gap (`ridge_gap`), so every card in the stack has the same hold.
- **Entry relief**: for `relief_len` mm past the seated card edge, the lips are removed so a whole stack can bow up over the ridges.
- `LEGACY_RETENTION` in `src/params.ts` reproduces the original Fusion design (full dovetail, fixed 1.4 mm ridges, 30°/60°, 0.1 mm preload). The Fusion-comparison tests use it.

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
