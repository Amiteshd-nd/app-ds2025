# NAMMA OUTBREAK — Atomic Architecture (nested component system) v1.0
> Principal-engineer rule: **every unit is the smallest reusable piece; bigger units are compositions of smaller ones; each atom is defined ONCE and referenced by id.** Change once → propagates everywhere. Three parallel trees (Data, Art, Systems) share the same 5 levels.

## 0. The five levels (Atomic Design, applied)
Atom → Molecule → Organism → Template → Page. Nothing at a higher level redefines a lower one; it only references by id.

## 1. DATA tree
| Level | Is | Lives in | Referenced by |
|---|---|---|---|
| Atom | one tile, one dialogue line, one item, one stat key, one flag | `data/atoms/` (items.json, flags.json, stats.tuning.json, tiles via tileset) | by id everywhere |
| Molecule | building kit (8 tiles), NPC definition, quest step, phone panel, recipe | `data/molecules/` (npcs/, kits/, recipes.json, phone/apps/) | organisms |
| Organism | a district, a metro line, a survivor group, a full quest | `data/organisms/` (districts.json, metro.json, quests/) | templates |
| Template | SCENE_TEMPLATE, conditions schema, City Pulse slot schema | `*_TEMPLATE.md` + schema | pages |
| Page | a filled scene (`data/scenes/<id>.json`) | `data/scenes/` | WorldScene |
Rule: a district references NPC ids; an NPC references item ids; a scene references a district id + quest ids. **No inline copies.**

## 2. ART tree
| Level | Is | Lives in |
|---|---|---|
| Atom | a palette colour (token), a single 32×32 tile, a sprite frame | `assets/_meta/palette.gpl`, `assets/atoms/` |
| Molecule | a sprite sheet (4-dir walk), a building-kit tileset, a UI widget | `assets/molecules/` |
| Organism | a district atlas, the character atlas, the UI atlas | `assets/atlases/` |
| Template | the style sheet + style.json (the locked look) | `assets/_meta/` |
| Page | the rendered scene (tiles + sprites composited at runtime) | — |
Rule: every art atom quantised to palette tokens; **infected + `_ruined` are derived variants** of existing molecules, never new atoms (asset_pipe.py).

## 3. SYSTEMS tree (code)
| Level | Is | Example |
|---|---|---|
| Atom | pure function | `canAfford()`, `spend()`, `lerpTint()`, `rollEncounter()` |
| Molecule | a behaviour (registered by name) | `fuelGauge`, `signalMeter`, `hotelNightTimer`, `negotiation`, `crouchStealth` |
| Organism | a system | QuestSystem, SurvivalSystem, VehicleSystem, InfectedAI, CityPulseSystem, AudioSystem |
| Template | WorldScene (consumes organisms via data) | one class, no per-place code |
| Page | a running scene instance | WorldScene('pg_murugesh') |
Rule: behaviours are **plugins** listed in a district's `behaviours:[]`. Adding mechanics = add a molecule + name it in data. No WorldScene edits.

## 4. Mapping & traceability
- Every id is globally unique and prefixed: `npc_`, `item_`, `q_`, `dlg_`, `tile_`, `kit_`, `beh_`, `scene_`, `act#_`.
- `data/_index.json` (generated) maps id → file → referenced-by, so any edit shows blast radius.
- Validator fails on: duplicate id, dangling reference, inline value that should be an atom (e.g. a hardcoded price not in `prices.json`).

## 5. Why this scales
- Change a price → edit one atom, every scene updates.
- New district → one organism (JSON) + its atlas; zero code.
- New mechanic → one behaviour molecule + a name in data.
- New city later (Mumbai) → swap organism/atom layer, keep templates/systems.
- Act 4 → derived variants, not new content.
Single source of truth + reference-by-id = safe, cheap editing at any scale.

## 6. Folder (authoritative)
data/{atoms,molecules,organisms,scenes}/ · assets/{_meta,atoms,molecules,atlases}/ · src/systems/ (organisms) · src/world/behaviours/ (molecules) · src/lib/ (atoms) · *_TEMPLATE.md (templates)
