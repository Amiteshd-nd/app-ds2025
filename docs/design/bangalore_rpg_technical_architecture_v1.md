# NAMMA OUTBREAK — Technical Architecture v1.0
> Stack (confirmed from repo): Phaser 3.90 · TypeScript 5.9 (strict, `tsc --noEmit` before Vite) · Zustand 5 for game state · React 19 wraps the canvas only · vite-plugin-pwa · Tiled JSON maps · 117 passing tests · map-validator enforces 32×32 tiles / 32×48 chars.
> Companions: `story_script_v1.md`, `game_components_v1.md`, `design_decisions_v1.md`, `art_pipeline_v1.md`.

## 0. The One Principle
**Places become data.** Content (quests, dialogue, NPCs, items, objects) is already JSON discovered by glob. Scenes are not: five hand-written classes, two of which (`AirportScene`, `WhitefieldScene`) are diverged copies of the same `create()`. Adding a district costs ~240 lines of TS. `PGScene` being referenced-but-absent is that cost showing up.
Fix: **one `WorldScene` class** that takes a `districtId` and reads everything else from `districts.json` + `maps.manifest.json`. Airport, Whitefield, PG, Hotel, Ambedkar Nagar, Cubbon Park… are all entries, not files.

## 1. Scene Inventory After Refactor
| Scene | Kind | Notes |
|---|---|---|
| `BootScene` | keep | Asset loading. Switch to loading per-district atlases lazily (PWA size). |
| `TitleScene` | keep | |
| `CharacterSelectScene` | keep → trim | Becomes M/F base + attire pick (see §4). |
| **`WorldScene`** | **new** | Replaces `AirportScene` + `WhitefieldScene`. Started with `this.scene.start('WorldScene', { districtId, spawnId })`. |
| `PhoneScene` | new | Overlay (`scene.launch`, pauses World). Apps = JSON panels. |
| `TransitScene` | new | Fade-to-black transitions, bus/metro ride card, hotel-night timer, office stairs + skyline time-lapse. Pure presentation, data-driven. |
| `CutsceneScene` | new | Plays a `cutscenes/*.json` script (camera pan, dialogue, sprite swap). Used for Ravi flashback, Cordyceps ant, plate-banging. |
| ~~`AirportScene`~~ ~~`WhitefieldScene`~~ | delete | After migration (§7). |

## 2. `WorldScene` Spec
```ts
// src/scenes/WorldScene.ts
interface WorldSceneData { districtId: string; spawnId?: string; fromDistrict?: string }

create(data: WorldSceneData) {
  const d = Districts.get(data.districtId);            // districts.json entry
  const m = MapManifest.get(d.map);                     // maps.manifest.json entry
  setActiveScene(this); setRoundPixels(); fadeIn(d.fadeMs ?? 400);
  const map = this.make.tilemap({ key: m.key });
  for (const ts of map.tilesets) registerTileset(map, ts, TILESET_URLS);   // one error path, logs both image-miss and addTilesetImage failure
  for (const name of m.layerOrder) createLayer(map, name, DEPTH[name]);    // NO hardcoded layer strings
  collisionLayer.setVisible(false).setCollisionByExclusion([-1, 0]);
  const spawn = findSpawn(map, data.spawnId ?? d.defaultSpawn);
  this.player = new Player(this, spawn, Store.getState().player.appearance);
  cameraFollow(this.player, m.deadzone, map.widthInPixels, map.heightInPixels);
  this.physics.add.collider(this.player, collisionLayer);
  Populate.npcs(this, d.npcs);                 // optional section
  Populate.objects(this, d.objects);           // optional section (placeObjects)
  Populate.wander(this, d.ambient);            // optional section (40 bots → { base, count, area })
  Exits.bind(this, d.exits);                   // optional: zones → TransitScene → WorldScene(target)
  Triggers.bind(this, d.triggers);             // optional: quest/flag-gated zones
  SaveManager.restore(this);
  this.events.once(SHUTDOWN, persist); this.events.once(DESTROY, persist);
  if (d.act4) applyRuinedTint(this);           // swaps atlas to `_ruined`, spawns infected from d.act4.spawns
}
```
Rules: no district-specific `if` statements inside `WorldScene`. If a district needs something unique, it goes in a **behaviour** (`src/world/behaviours/*.ts`, registered by name, listed in the district JSON under `behaviours: []`). Example behaviours: `hotelNightTimer`, `signalStrengthMeter`, `fuelGauge`, `plateBanging`.

## 3. `districts.json` Entry Schema
```jsonc
{
  "id": "pg_murugesh",
  "name": "Sunshine PG for Gents",
  "map": "pg_murugesh_interior",          // key in maps.manifest.json
  "defaultSpawn": "door",
  "fadeMs": 400,
  "unlock": { "flags": ["hotel_nights_done"] },           // gating (ReputationManager/QuestSystem flags)
  "npcs": [ { "id": "npc_owner_aunty", "spawn": "counter", "tier": 2, "schedule": "pg_owner" } ],
  "objects": [ { "id": "table_slot", "at": "corner", "requires": "item_table" } ],
  "ambient": { "base": ["young_man", "young_man"], "count": 4, "area": "corridor" },
  "exits": [ { "zone": "exit_street", "to": "whitefield_street", "spawn": "pg_gate", "transit": "walk" } ],
  "triggers": [ { "zone": "bed", "quest": "act1_pg_life", "step": "sleep" } ],
  "behaviours": [],
  "act4": null
}
```
`maps.manifest.json` keeps `key`, `file`, `layerOrder`, `deadzone`, `atlas`. The validator (extend `map-validator`) checks: every `spawn`/`zone` exists in the Tiled object layer, every `npc.id` exists in `npcs/*.json`, every `to` is a district id, every `atlas` exists, and every district is reachable from `airport` via `exits` (kills the dead-end class of bug permanently).

## 4. Characters
- **Sprite = base body × attire layers × skin tone**, composited once at load into a RenderTexture, cached by hash. Bases and layers come from the art pipeline (§3.4 there). 4-dir walk + idle, 32×48.
- `npcs/*.json` (already exists) gains: `appearance: { base, skin, attire: [...], carry }`, `schedule` (name → `schedules/*.json`: time-of-day → spawn point), `dialogue` (tree id), `tier`.
- Player appearance stored in Zustand `player.appearance`, chosen in `CharacterSelectScene`.
- **Infected** = any NPC definition with `infected: true` → runtime tint + torn overlay + head-tilt frame set. No new sheets.

## 5. Phone Overlay
`PhoneScene` launched over World; World pauses. Each app is a JSON panel in `phone/apps/*.json` with a tiny renderer per panel type (`list`, `feed`, `map`, `pay`, `call`). State comes from Zustand selectors. Act 4 degradation (`server busy`, no signal) is a single `network` field in the store that every panel reads. UPI pay = the only place `canAfford()` + `spend()` are called for purchases → this closes the economy-sink gap.

## 6. Systems Touch-List (existing → change)
| System | Change |
|---|---|
| `QuestSystem` | add `step` triggers from district zones; add `onFlag` → unlock districts |
| `ReputationManager` | unchanged; expose `relationship(npcId)` for Ananya/Ravi states |
| `stats.money` | add `spend()` with event; wire to PhoneScene UPI; `barter.json` swap when `network === 'dead'` |
| `SaveManager` | persist `districtId + spawnId` instead of scene class name |
| `map-validator` | extend per §3 |
| new `TimeSystem` | day/night, BMTC 90 s interval, hotel night counter, office time-lapse |
| new `VehicleSystem` | scooter speed ×1.8, fuel gauge, metro graph (`metro.json` nodes + lock state) |
| new `CraftSystem` (Act 4) | 4 recipes in `recipes.json` |

## 7. Migration Order (do in this sequence, test after each)
1. Create `WorldScene` by copying **Whitefield's** `create()` (the generalisable form), replace layer literals with `layerOrder`, keep Airport's two-branch error handling, parametrise fade.
2. Move Airport's NPC + exit-zone code into `Populate.npcs` / `Exits.bind`; move Whitefield's `placeObjects` + wander bots into `Populate.objects` / `Populate.wander`.
3. Write `districts.json` entries for `airport`, `whitefield_street`. Point `arrival.json` at `whitefield_street` via a `TransitScene` card ("Vayu Vajra → Whitefield"). **Dead-end gone; Whitefield reachable.**
4. Delete `AirportScene.ts`, `WhitefieldScene.ts`. Tests: all 117 still pass + new validator reachability test.
5. Add `hotel`, `pg_*` ×3, `ambedkar_nagar`, `cubbon_park` as data + Tiled maps (art pipeline batch 1).
6. `PhoneScene` + UPI → economy sink. 7. `TimeSystem` (bus, hotel nights). 8. `VehicleSystem`. 9. `CutsceneScene`. 10. Act 4 tint + barter + craft.

## 8. Borrowable Open Source (permissive licences only — MIT/Apache/CC0/BSD)
| Need | Repo / tool | Licence |
|---|---|---|
| Tiled map editor | mapeditor/tiled | GPL (tool only — outputs are yours) |
| Phaser + TS + Vite starter patterns | phaserjs/template-vite-ts | MIT |
| Tiled → Phaser helpers, object layers | Phaser built-in `Tilemaps` | MIT |
| Dialogue trees | YarnSpinner-Tool/YarnSpinner-JS or bondage.js | MIT |
| Day/night & lighting | Phaser `Lights2D` pipeline (built-in) | MIT |
| Pathfinding for NPC schedules | prettymuchbryce/easystarjs | MIT |
| Sprite composition / atlas packing | free-tex-packer-core, spritesmith | MIT |
| State | pmndrs/zustand (already in) | MIT |
| Save compression | pieroxy/lz-string | MIT |
| Virtual joystick (mobile PWA) | rexrainbow/phaser3-rex-notes (virtualjoystick plugin) | MIT |
| Pixel-perfect camera / letterbox | Phaser `Scale.FIT` + `roundPixels` (built-in) | MIT |
Avoid: anything GPL **as a runtime dependency**, Unity/Godot asset-store packs (licence tied to engine), CC-BY-NC art.

## 9. Folder Layout (target)
```
src/scenes/{Boot,Title,CharacterSelect,World,Phone,Transit,Cutscene}Scene.ts
src/world/{Populate,Exits,Triggers,behaviours/}
src/systems/{Quest,Reputation,Time,Vehicle,Craft,Save}*
data/districts.json  data/maps.manifest.json  data/metro.json  data/prices.json  data/barter.json  data/recipes.json
data/npcs/*.json  data/quests/*.json  data/dialogue/*.yarn  data/schedules/*.json  data/phone/apps/*.json  data/cutscenes/*.json
maps/*.json (Tiled)   assets/{atlases,characters,ui}/   assets/_raw/  assets/_meta/
tools/asset_pipe.py  tools/map-validator.ts
```

## 10. Definition of Done for Vertical Slice
Player boots → Title → Character select → `airport` → Vayu Vajra transit → `whitefield_street` → hotel (3 nights via TimeSystem) → 3 PGs → PG → UPI purchase of table (money sink) → "Not enough space" → `ambedkar_nagar` → office stairs time-lapse → Ravi dialogue → bus → `cubbon_park` → Ananya → home → Reels fever clips + Amma call. Zero scene classes added. Validator green. 117+ tests green.
