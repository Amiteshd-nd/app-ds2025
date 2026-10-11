# NAMMA OUTBREAK — Art & Asset Pipeline v1.0
> Goal: a Bangalore that Bangaloreans recognise. Generic where nobody looks (roads, asphalt, pavements), Indian everywhere else.
> Companion: `game_components_v1.md` §3–§5 for what each asset must do in-game.

## 0. Constraints (from engine)
- Tiles **32×32**, characters **32×48**, enforced by map-validator.
- Maps = Tiled JSON, layers: `ground`, `ground_detail`, `props_below`, `collision`, `props_above`, `npc_spawn`.
- Palette target: Zelter-like — muted, slightly desaturated, warm shadows. Lock a 48-colour master palette early.
- Platform: PWA → keep total atlas < 8 MB; use 1–2 texture atlases per district.

## 1. Three-Layer Sourcing Strategy

| Layer | What | Source | Licence check |
|---|---|---|---|
| **A. Borrow** | Asphalt, lane markings, kerbs, pavement slabs, drains, generic grass/soil, water | CC0 packs (RGS_Dev top-down template, OpenGameArt CC0 roads, MinZinn vehicles for base shapes) | CC0 or MIT only. **No CC-BY-NC, no "credit required" in core art** (keep a `CREDITS.md` anyway) |
| **B. Generate** | Everything with Indian identity: buildings, shops, vehicles, people, signage, props, food | PixelLab (characters, animation, rotation) + Retro Diffusion (tilesets, environments, API/MCP) | Both allow commercial use of outputs; PixelLab forbids training on outputs only |
| **C. Hand-fix** | Palette conformance, seams, hero props (HIVR sign, bandstand, metro pillar) | Aseprite / Pixelorama (open source) | n/a |

## 2. Style Lock Procedure (do once, before any batch)
1. Pick **9 reference images**: 3 Zelter screenshots (mood), 3 real Bangalore photos (a BMTC bus, a Darshini, a Whitefield PG lane), 3 of our own approved tiles once we have them.
2. Generate **one 256×256 "style sheet"**: a Bangalore lane with a Darshini, an auto, a PG gate, two people. Iterate until it feels right. **This image becomes reference #1 for every future generation.**
3. Extract its palette → `palette.gpl` (48 colours). All later outputs are quantised to it in step 5.
4. Save prompt + seed + model version in `assets/_meta/style.json`. Never change the model mid-project without regenerating the style sheet.

## 3. Asset Taxonomy & Prompt Templates
All prompts prefix with the **STYLE BLOCK**:
> `32-bit top-down pixel art, 3/4 perspective, muted desaturated palette, soft warm shadows, clean 1px outlines, no anti-aliasing, grid-aligned, Bangalore India, [TIME: morning haze | evening | night sodium-lamp]`

### 3.1 Ground & Roads (Layer A, borrow; patch with B)
- Indian specifics to *generate* as overlays: **interlocking paver blocks** (grey/red), **broken footpath slab**, **open drain cover**, **speed breaker with white stripes**, **rangoli tile** (doorstep), **tar road with patch repairs**, **gulmohar/rain-tree leaf litter**.

### 3.2 Buildings (Layer B)
Generate as **modular façades**: 1 door tile, 2 wall tiles, 1 window tile, 1 roof edge, 1 roof fill, 1 parapet, 1 water-tank (Sintex black) — so any size building assembles from ~8 tiles.
| Type | Prompt tail | Notes |
|---|---|---|
| PG / independent house | `3-storey Bangalore independent house, exposed red brick + cream plaster, grille balconies, black Sintex tank on roof, "PG for Gents/Ladies" board, Sunboard letters` | 2 colour variants |
| Hill flat (Ambedkar Nagar) | `narrow 2-storey house on slope, painted pastel blue/green, stone compound wall, clothes line, DTH dish` | |
| Darshini / tiffin room | `small standing-eatery, steel counter, "Hotel ___ Darshini" board red/yellow, menu painted on wall, steel tumblers` | Hero prop: idli steamer |
| Provision store | `kirana shop, sachets hanging in strips, Nandini milk crate, blue plastic drum, weighing scale` | |
| Chai / tea stall | `pushcart tea stall, blue tarpaulin, kettle on kerosene stove, glass jar of biscuits` | Airport + hill variants |
| Office (Whitefield) | `glass-and-ACP IT park façade, grey-blue tint, security cabin, boom barrier, "Visitors" board` | Interior never shown in Act 1 |
| Hotel (budget) | `4-storey budget hotel, "Lodging & Boarding", lit signboard, reception glass door` | |
| Hospital (govt) | `government hospital block, cream + green band paint, red cross, ambulance bay, "Casualty" board in Kannada+English` | Act 3 hub |
| HIVR lab | `research institute gate, grey concrete, blue "HIVR" letters, biohazard pictogram small, guard cabin` | Hero prop: cold-chain styrofoam box |
| Metro station (Whitefield) | `elevated Namma Metro station, PURPLE accents, construction barricades blue tin sheets, "Opening Soon" banner` → later variant without barricades | Pillars below |
| Bangalore Palace | `Tudor-style red palace with turrets, lawn, stone arch` | 1 large composite |
| Cubbon Park set | `bandstand white iron, red State Central Library façade, bamboo grove, rain-tree canopy` | Collectible spots |
| Lalbagh set | `glass house iron+glass, lake edge, rock outcrop with watch tower` | Act 4 last base |
| Guitar shop (Church St.) | `narrow music shop, guitars in window, graffiti wall adjacent` | |
| IKEA (Nagasandra) | `big-box blue+yellow warehouse corner, car park` | Logo-free |

### 3.3 Vehicles (Layer B, 4 directions each; use MinZinn CC0 as silhouette reference)
| Vehicle | Prompt tail |
|---|---|
| BMTC ordinary bus | `city bus, BLUE-GREY body with white band, route board "500-D" on front, open windows` |
| BMTC Vajra / airport | `low-floor Volvo bus, LIGHT BLUE / white, "Vayu Vajra" board` |
| Namma Metro train | `3-coach metro, white with PURPLE stripe (Purple Line) / GREEN stripe (Green Line)` |
| Metro pillar | `elevated viaduct pillar, concrete painted PURPLE lower band, pier number plate` (Green Line variant) |
| Auto rickshaw | `black-and-yellow auto, Bangalore meter box, rexine seat, "Namma Bengaluru" sticker` |
| Scooter | `Honda-Activa-like scooter, grey/white/red variants, number plate KA` |
| Cab | `white hatchback with yellow plate, cab-aggregator sticker` |
| Ambulance | `white van, red stripe, "108" style, no siren light on in Act 3` |
| HIVR shuttle | `Tempo-Traveller van, white, blue HIVR decal` |
| Police | `white+blue Bolero / Hoysala patrol` |

### 3.4 Characters (Layer B, PixelLab skeleton → 4-dir walk + idle)
Build **8 body bases × attire layers**, not hundreds of individuals. Skin tones: 5-step Indian range (wheatish → deep brown), never a single default.
| Base | Attire layer options |
|---|---|
| Young man (player M, Ravi, Sameer) | shirt+trousers, t-shirt+jeans, kurta, hoodie, office lanyard variant |
| Young woman (player F, Ananya) | kurti+leggings, jeans+top, salwar, saree (office) |
| Older woman (Shanthamma, owner aunty) | cotton saree, nightie-with-dupatta (PG mornings) |
| Older man (Uncle, guard) | lungi+shirt, safari suit, khaki guard uniform |
| Auto driver | khaki shirt, lungi/trousers |
| Labour / delivery | hi-vis, delivery-app t-shirt, helmet |
| Nurse / doctor | white coat / green scrubs, dupatta |
| Kid | school uniform, shorts |
| Act 4 infected | same bases + torn layer + grey-green skin shift + head tilt (**reuse, do not regenerate**) |
Props carried as separate layer: backpack, tiffin bag, cricket bat, guitar, umbrella.

### 3.5 Props & Signage
Hoardings (generic film/jewellery), **Kannada+English dual-language boards** (generate text as texture, keep readable), banana-leaf meals, steel tumbler, Nandini packets, jasmine string, auto meter, BBMP dustbin, cow (T1 ambient), stray dog, crow, pigeon, water tanker, flex banners, festival rangoli, plastic chairs, cycle rental rack, cricket stumps.

### 3.6 UI (Layer B via Retro Diffusion UI mode)
Pixel phone frame, 8 app icons (Maps, Chats, Call, UPI, Reels, News, Gallery, Dating), QR-scan animation, "₹ credited" toast, fuel gauge, food meter, metro map with locked-station padlock.

## 4. Generation Workflow
```
for each asset in asset_manifest.yaml:
  1. prompt = STYLE_BLOCK + type_template + asset.specific
  2. refs = [style_sheet] + asset.photo_refs (real Bangalore photos)
  3. call Retro Diffusion API (tiles/buildings/vehicles/UI) or PixelLab API (characters)
  4. save raw → assets/_raw/<category>/<id>_<seed>.png
  5. post-process (script, §5)
  6. human review in a contact sheet; approve or reroll (max 3)
  7. approved → assets/<category>/<id>.png + entry in atlas
```
Retro Diffusion exposes an **MCP server**, so steps 1–4 can be driven from the AI assistant directly; PixelLab has an API + Aseprite plugin.

## 5. Post-Processing Script (Python, `tools/asset_pipe.py`)
1. **Background removal** → `rembg` or chroma-key (generate on magenta #FF00FF for hard edges).
2. **Grid snap** → downsample to nearest 32 multiple with nearest-neighbour; reject if off-grid (Retro Diffusion's free "Pixel Art Fixer" as fallback).
3. **Palette quantise** → to `palette.gpl` (48 colours) with no dithering.
4. **Outline normalise** → ensure 1px dark outline on sprites, none on ground tiles.
5. **Seam test** for tiles → tile 3×3, auto-flag visible seams.
6. **Sprite sheet pack** → characters 4 rows × N frames at 32×48; export JSON for Phaser/our loader.
7. **Tiled export** → tileset `.tsx/.json` with collision property per tile from `asset_manifest.yaml`.
8. **Act 4 tint pass** (graded by stability per `art_audio_direction_v1.md` §1: 0/20/50%; infected recipe §2) → auto-generate `_ruined` variant: desaturate, add grime overlay, swap 2–3 props (shutters down, overturned bin). Zero new art for Act 4 environments.

## 6. Act 4 Variants (cheap)
Every district atlas gets a `_ruined` sibling via §5.8. Hand-fix only: HIVR gate (tape), Lalbagh glass house (barricaded), metro entrance (shuttered).

## 7. Asset Manifest Shape (`assets/asset_manifest.yaml`)
```yaml
- id: bmtc_bus_500d
  category: vehicle
  size: [96, 48]          # 3×1.5 tiles
  directions: 4
  layer: B
  template: vehicle.bmtc_ordinary
  photo_refs: [refs/bmtc_1.jpg, refs/bmtc_2.jpg]
  collision: true
  act4_variant: true
  scenes: [act0_arrivals, act1_bus_cubbon]
```

## 8. First Batch (vertical slice: Scenes 0.1 → 1.6)
Ground set (borrow + 7 Indian overlays) · PG façade kit · Darshini · provision store · chai cart · office façade · budget hotel · hill house kit · metro station (under construction) · BMTC 500-D · Vayu Vajra · auto · 2 player bases × 2 attires · Shanthamma · Ravi · Divya · Sameer · Ananya · 6 ambient bases · phone UI set · Cubbon bandstand + library.
≈ **70 generated assets + 1 CC0 ground pack.** Budget at Retro Diffusion Pro rates with 3 rerolls each: well under $100.

## 9. Licence Hygiene
`CREDITS.md` lists every Layer A source + licence URL. Layer B outputs: record tool, model, date in `_meta`. Avoid real brand names/logos in generated art (BMTC/Namma Metro colours yes, logos no; "IKEA-like" not IKEA). Real-place names in dialogue are fine.


## 10. Landmark backlog (2026-10-11)
Vidhana Soudha, Brigade Road signage strip, Commercial Street lane, Nandi Hills parallax outline, BMTC green bus shelter, auto stand + cab pickup, parody café fronts. See `bangalore_rpg_landmarks_and_retention_v1.md` §1. Brands parodied, never real logos.
