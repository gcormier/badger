# Badge Holder Logo Inlay — Web Tool Spec (handoff for Claude Code)

## Goal
A static, client-side-only web page that rebuilds the "Badge Holder gen1" (ID card + YubiKey holder, originally modelled in Fusion 360) from parameters, lets the user upload a logo (PNG or SVG), inlays it flush into the **bottom (bed-side) face**, and exports a **single 3MF** with two colored parts (case + logo) ready for a Bambu printer with AMS. No backend, no Fusion.

## Decisions (confirmed with user)
| Topic | Decision |
|---|---|
| Scope | This badge holder only (gen1 geometry, parameters as form inputs) |
| Logo colors | One logo color + case color |
| Export | 3MF only (no STEP, no STL required) |
| Logo face | Bottom face only, auto-mirrored, flush inlay |

## Stack
- **Vite + TypeScript**, deploy as static site (GitHub Pages / Cloudflare Pages).
- **manifold-3d** (WASM) for geometry: 2D `CrossSection` → `extrude` → boolean ops. Guaranteed manifold output. No OpenCascade needed since STEP is out of scope.
- **potrace** (WASM/JS port, e.g. `esm-potrace-wasm`) to trace PNG → paths. SVG uploads skip tracing.
- An SVG path parser + bezier flattener (tolerance ~0.02 mm at final scale).
- **three.js** for preview (bottom view default, plus orbit).
- **fflate** to write the 3MF zip.
- Run geometry in a Web Worker so the UI stays responsive.

## Coordinate conventions (match the Fusion model)
- Units mm. Bed face is **z = 0**, body extends to +z.
- Outline origin at (0,0); body spans x 0 → `body_w` (61.213), y 0 → `body_h` (120.6).
- Key section is y 0 → `key_sec` (24.8); card section above it; lanyard band at the top.
- Logo is authored as seen **from below**, so mirror it in X before placing it on z = 0.

## Pipeline
1. **Case:** build from parameters (see below), output one manifold.
2. **Logo input:** PNG → grayscale → threshold (user slider, default auto/Otsu) → potrace → paths. Or SVG → paths. Flatten to polygons and keep holes (letter counters such as a/e must stay case-colored).
3. **Place:** scale to target length (default **75 mm** along its long axis), rotate (default **90°**, text running up the long axis), center on the logo region (default center x 30.6, y 69.3), mirror X.
4. **Clean small features:** morphological opening (offset −w/2 then +w/2) with `min_feature` (default **0.4 mm**), then drop islands below `min_island_area` (default **1.5 mm²**). This removes things like a ® symbol that can't print. Show the user what was dropped.
5. **Keep-out:** intersect the logo with the allowed region (flat bottom face minus openings minus `logo_margin`, default 2 mm). Warn if anything got clipped.
6. **Inlay:** `logo3d = extrude(logo2d, inlay_depth)` at z 0 → `inlay_depth` (default **0.4 mm**). `case = case − logo3d`. Both are outputs.
7. **Warnings:** inlay depth not a multiple of layer height (default 0.2 mm), and logo touching keep-outs.
8. **Export 3MF.**

## Parameters (from the Fusion model, current values)
Expose the ★ ones in the UI; the rest go under "Advanced".

| Name | Expression / value | Note |
|---|---|---|
| ★ card_t | 2.76 mm | card stack thickness (was 2.00; +1 ID-1 card at 0.76) |
| card_w | 53.98 mm | ID-1 short side |
| card_h | 85.6 mm | ID-1 long side |
| card_clr | 0.2 mm | total planar clearance on card |
| card_tclr | 0.3 mm | thickness clearance on card |
| ★ key_t | 3.3 mm | key body thickness |
| key_w | 18 mm | key width |
| key_l | 45.5 mm | key overall length |
| key_clr | 0.4 mm | planar clearance on key |
| key_tclr | 0.1 mm | thickness clearance on key |
| ring_off | 5 mm | keyring hole centre from key back end |
| skin | 1.2 mm | front/back skin thickness |
| side | 3.2 mm | frame wall width |
| lip | 3 mm | window lip over card |
| top_band | 10 mm | solid band holding lanyard slot |
| slot_w | 14 mm | lanyard slot length |
| slot_h | 3.5 mm | lanyard slot height |
| flex_len | 14 mm | flexure arm length |
| flex_w | 6 mm | flexure arm width |
| flex_gap | 0.6 mm | slot around flexure |
| bump_d | 3.8 mm | detent bump base dia (key hole is 4) |
| ★ bump_h | 1.2 mm | detent bump height |
| ★ ridge_h | 1.4 mm | card detent ridge height |
| ridge_len | 13 mm | detent ridge segment length |
| notch_r | 7 mm | thumb notch radius at card entry |
| ★ key_win | 12 mm | key end exposed on top face |
| ★ grip_l | 10 mm | key pinch window length |
| grip_off | 28 mm | pinch window centre from key ring end |
| card_gap | card_t + card_tclr | card pocket depth |
| key_gap | key_t + key_tclr | key pocket depth |
| T_card | 2·skin + card_gap | card section thickness |
| T_key | 2·skin + key_gap | key section thickness (5.8) |
| ridge_lead | ridge_h / tan 30° | insertion ramp run |
| ridge_catch | ridge_h · tan 30° | retention face run |
| entry | ridge_lead + ridge_catch + 0.6 | open-edge margin left of seated card |
| body_w | entry + card_w + card_clr + side | 61.213 |
| key_ph | key_w + key_clr | 18.4 |
| key_sec | 2·side + key_ph | 24.8 |
| card_ph | card_h + card_clr | 85.8 |
| body_h | key_sec + card_ph + top_band | 120.6 |
| key_pl | key_l + key_clr | 45.9 |
| ring_x | body_w − key_clr − ring_off | 55.813 |
| key_cy | side + key_ph/2 | 12.4 |

New UI parameters: `logo_length` 75, `logo_rotation` 90°, `logo_offset_x/y` 0, `inlay_depth` 0.4, `min_feature` 0.4, `min_island_area` 1.5, `logo_margin` 2, `threshold`, `invert`, `case_color` #C92A28, `logo_color` #FFFFFF.

## Case geometry — verified CSG recipe
`reference/build_reference.py` is a working implementation of this recipe in **Python manifold3d**, which has the same API as the JS `manifold-3d` package, so port it directly. I checked it against the Fusion exports: the XOR volume is about 1.2 mm³ out of 14,880 mm³ (circle tessellation only), at both card_t = 2.00 and 2.76.

Derived values used below: `card_cy = key_sec + card_ph/2` (67.7), `corner_r = 2`, `E = 0.01` (boolean overlap).

**How the part works:** the bottom has a 1.2 mm skin over the full outline. The **card section** is an open-topped tray. The card slides in from the **x = 0 edge** under 45° dovetail lips on the other three sides, and is held by two triangular detent ridges near the entry. A thumb notch is cut at the entry edge. The **key section** (y 0 → key_sec) is a closed tube with a pocket open at the **x = body_w end**. A flexure arm with a conical bump snaps into the key's ring hole. There are pinch windows in both skins, and a key-end window in the top skin.

1. **Outline:** rounded rect 0,0 → body_w × body_h, corner radius 2 (all 4 vertical edges). Extrude 0 → `T_card`.
2. **Key block:** (outline ∩ rect y 0 → key_sec), extrude 0 → `T_key`, union.
3. **Card window with dovetail:** subtract the hull of two rectangles:
   - at z = skin: x −5 → `body_w − side + card_t`, y `key_sec − card_t` → `key_sec + card_ph + card_t`.
   - at z = T_card (+E): the same rectangle shrunk by `(T_card − skin)` on the +x, −y and +y sides, giving a 45° undercut. In general, at height z each edge moves inward by `(z − skin)`.
   - This also undercuts the inner top edge of the key block, which is intended.
4. **Key pocket:** box x `body_w − key_pl` → body_w + 1, y side → side + key_ph, z skin → skin + key_gap.
5. **Key-end window (top skin):** box x `body_w − key_win` → body_w + 1, same y, z from skin + key_gap − E to top.
6. **Pinch windows (both skins, through):** centre x `body_w − key_clr − grip_off`, length grip_l, same y, through all z.
7. **Flexure slot (bottom skin, z −E → skin + E):** outer rect x `ring_x − flex_len` → `ring_x + bump_d/2 + 1 + flex_gap`, y `key_cy ± (flex_w/2 + flex_gap)`, **minus** the arm rect x `ring_x − flex_len − 2` → `ring_x + bump_d/2 + 1`, y `key_cy ± flex_w/2`. This leaves a U-slot, with the arm attached on its −x side.
8. **Detent bump:** frustum at (ring_x, key_cy), base r = bump_d/2 at z = skin, height bump_h, top r = `bump_d/2 − bump_h·tan30°` (1.207). Union.
9. **Card detent ridges (×2):** triangular prism. Profile in XZ: (x0, skin), (x0 + ridge_lead, skin + ridge_h), (x0 + ridge_lead + ridge_catch, skin), with `x0 = entry − ridge_lead − ridge_catch + 0.1` (0.7). Each is ridge_len long in y, centred at `card_cy ± (notch_r + 1 + ridge_len/2)` (53.2 and 82.2). Union. Gotcha: give the CrossSection counter-clockwise winding, or the union silently goes empty.
10. **Thumb notch:** cylinder r = notch_r at (0, card_cy), through all.
11. **Lanyard slot:** box centred (body_w/2, body_h − top_band/2), slot_w × slot_h, through all.

**Logo region on the bottom face:** keep out the notch, the lanyard slot, the pinch window, the flexure slot, and the key section in general (y < key_sec). The default Milwaukee placement sits at x 13.8 → 47.4, y 31.8 → 106.8.

## 3MF output
- Core 3MF (2015/02) with `m:basematerials` carrying the case and logo display colors.
- Preferred structure: **one build item** = an assembly object whose `components` reference the case mesh and the logo mesh, so Bambu Studio loads it as **one object with two parts**. Optionally add Bambu's `Metadata/model_settings.config` to pre-assign extruder 1 (case) and 2 (logo). Verify by opening in Bambu Studio.
- Name parts "Case" and "Logo". The logo may be multiple disjoint islands; one mesh with several shells is fine.
## Files in this handoff
- `reference/build_reference.py`: the verified Python manifold3d build of the case, plus the comparison against the Fusion mesh. Run it with `pip install manifold3d trimesh`, then `python3 build_reference.py`.
- `reference/load3mf.py`: a minimal 3MF mesh reader.
- `reference/gen1_fusion_cardt2.00.3mf`: Fusion export of gen1 at card_t = 2.00. Object 3 is the case. Object 1 is a dummy YubiKey body; ignore it.
- `reference/milwaukee_fusion_cardt2.76.3mf`: Fusion export of the Milwaukee build at card_t = 2.76: the case plus 5 logo pieces, ® already removed. This is the known-good output.
- `fixtures/Milwaukee_Logo.svg`: the test logo.

## Acceptance tests
1. With default parameters and no logo: bbox 61.213 × 120.6 × 5.8 mm. XOR volume against the case in `gen1_fusion_cardt2.00.3mf` (with card_t = 2.00) is < 3 mm³.
2. With card_t = 2.76 and the Milwaukee SVG at the defaults: case ∪ logo XOR the union of `milwaukee_fusion_cardt2.76.3mf` is < 3 mm³. The logo bbox is ≈ 33.5 × 75 mm at z 0 → 0.4, the ® is removed by the min-feature filter, and letter counters stay case-colored.
3. case volume + logo volume = volume of the un-inlaid case (flush inlay, no gaps or overlap).
4. Both meshes are manifold (manifold-3d status OK); the 3MF opens in Bambu Studio as one object with two parts.
5. Changing `card_t` changes only the card section thickness and the card pocket depth.
6. Everything runs offline after first load; no network requests apart from static assets.

## Non-goals
STEP export, multi-color logos, top-face logos, other parts, user accounts or storage.
