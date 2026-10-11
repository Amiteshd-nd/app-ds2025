# Architecture (current state)
Updated: 2026-10-11 — state at the START of P0.2. Rewritten when the WorldScene refactor lands.

## Scenes (`src/scenes/`)
| Scene | Role | Lines | Status |
|---|---|---|---|
| `BootScene` | loads every sprite sheet / tileset / tilemap by glob, registers `<sheet>-walk/idle-<dir>` anims, placeholder textures, starts `registry.startScene` | 231 | keep |
| `TitleScene` | New Game / Continue / Settings menu | 202 | keep |
| `CharacterSelectScene` | name entry + 4 educational-background cards → `AirportScene` | 333 | keep → trim in P2 |
| `AirportScene` | hand-wired airport: NPCs from `npcs/airport.json`, dialogue, `zone_exit` (dead end) | 221 | **rebuild into data (P0.2)** |
| `WhitefieldScene` | hand-wired street: placed objects, 40 wander bots, no NPCs/exits | 253 | **rebuild into data (P0.2)** |

## Data flow
`src/data/index.ts` globs `dialogue/ quests/ items/ npcs/ objects/` + `districts.json` → managers in `src/systems/` (Stats, Inventory, Quest, Dialogue, Reputation, Save — singletons, rules only) → `src/store.ts` (Zustand, single source of truth, same shape as `SaveData`) → Phaser scenes + React HUD (`BangaloreTimes.tsx`).
Scenes emit facts on `src/core/events.ts` (`dialogue:ended`, `item:added`, `zone:reached`, `entity:interacted`); `QuestManager` draws conclusions. No scene calls a quest method.

## Folder map
```
src/
├── assets/        maps.manifest.json (layerOrder contract), maps.ts, index.ts (glob → URLs)
│   ├── tilemaps/  airport_interior.tmj (hand), whitefield_street.tmj (generated)
│   ├── tilesets/  airport*.png (reference, placeholder), street.png (+ street.tiles.json)
│   └── sprites/   player.png (reference), citizen*.png (generated rig × 8 palettes)
├── core/          events.ts (typed bus), depth.ts (zY → depth, computed never authored)
├── data/          districts.json · dialogue/ quests/ items/ npcs/ objects/
├── entities/      Player.ts (WASD/arrows, SHIFT run, E interact), PlacedObject.ts
├── scenes/        Boot · Title · CharacterSelect · Airport · Whitefield
├── systems/       Stats · Inventory · Quest · Dialogue · Reputation · Save
├── ui/            DialogueBox.ts
├── utils/         constants.ts, types.ts, placeholders.ts, hue.ts
├── store.ts · PhaserGame.tsx · BangaloreTimes.tsx (HUD) · main.tsx · index.ts (library entry)
scripts/           validate-maps.mjs · validate-content.ts · generate-art.mjs · generate-street-map.mjs · art/
```

## Rendering
640×360 native, `Scale.FIT`, `pixelArt` + `roundPixels`, integer upscale. Tiles 32, characters 32×48 (feet body 20×12 at offset 6,35). Depth bands: `DEPTH.{GROUND,WALLS,OBJECTS,ENTITIES,ABOVE_PLAYER,UI,DIALOGUE}`; entities sort inside the ENTITIES band by bottom edge.

## Known debt (what P0.2 removes)
- `AirportScene` / `WhitefieldScene` duplicate `create()`; layer names hard-coded in both.
- `districts.json` is the old 5-entry schema (`scene`, `unlocked_by_quest`, `reputation_required`); `PGScene` referenced but absent → airport `zone_exit` is a dead end.
- `SaveData.player.position.scene` persists a scene class name.
- `SCENE_KEYS` declares `PG`, `NEIGHBORHOOD`, `INTERVIEW` with no scenes.
- Stat model is the old port (energy/stress/money ₹5,000); the profile doc's model (ADR-17 ₹35,000) lands in P2 (T-007).
