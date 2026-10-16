/**
 * Generates a street block as a Tiled .tmj from the street tileset.
 *
 * Hand-authoring in Tiled is the normal path; this exists to prove the tileset
 * composes into a real location and to give the sandbox scene something built
 * from tiles rather than from procedural graphics. Layer names and order match
 * the taxonomy in maps.manifest.json, so the map validator accepts it.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const assets = resolve(here, '../src/assets');
const meta = JSON.parse(readFileSync(join(assets, 'tilesets/street.tiles.json'), 'utf8'));

const W = 30;
const H = 20;
const T = meta.tileSize;
const id = (name) => {
  if (!(name in meta.ids)) throw new Error(`Unknown tile "${name}"`);
  return meta.ids[name] + 1; // .tmj gids are 1-based against firstgid
};

const blank = () => new Array(W * H).fill(0);
const put = (layer, x, y, name) => {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  layer[y * W + x] = id(name);
};

const ground = blank();
const walls = blank();
const objects = blank();
const collision = blank();
const above = blank();

// Deterministic variation, so a rerun produces the same street.
const rnd = (x, y, s = 0) => {
  let n = (x * 374761393 + y * 668265263 + s * 1442695040) >>> 0;
  n = ((n ^ (n >>> 13)) * 1274126177) >>> 0;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
};

// ── Vertical section, top to bottom ────────────────────────────────────────
// 0-4  top building   5-7  pavement   8 kerb   9-12 road
// 13 kerb   14-16 pavement   17-19 bottom building
const TOP_BUILDING = [0, 4];
const TOP_WALK = [5, 7];
const KERB_TOP = 8;
const ROAD = [9, 12];
const KERB_BOTTOM = 13;
const BOTTOM_WALK = [14, 16];
const BOTTOM_BUILDING = [17, 19];

for (let x = 0; x < W; x++) {
  // Top building facade: plain wall, then openings at the storefront line.
  for (let y = TOP_BUILDING[0]; y <= TOP_BUILDING[1] - 1; y++) {
    put(ground, x, y, rnd(x, y, 1) > 0.55 ? 'wall_concrete' : 'wall_plaster');
    if (rnd(x, y, 2) > 0.93) put(walls, x, y, 'wall_plaster_stain');
    collision[y * W + x] = 1;
  }
  // Storefront row: shutters, doors and windows in runs, not alternating noise.
  const yStore = TOP_BUILDING[1];
  const bay = Math.floor(x / 3);
  const kind = rnd(bay, 0, 3);
  put(ground, x, yStore, 'wall_base');
  if (kind > 0.72) put(walls, x, yStore, 'shutter_closed');
  else if (kind > 0.52) put(walls, x, yStore, x % 3 === 1 ? 'door_wood' : 'window');
  else if (kind > 0.3) put(walls, x, yStore, x % 3 === 1 ? 'door_dark' : 'window_barred');
  else put(walls, x, yStore, 'window');
  collision[yStore * W + x] = 1;

  // Pavements
  for (let y = TOP_WALK[0]; y <= TOP_WALK[1]; y++) {
    put(ground, x, y, rnd(x, y, 4) > 0.94 ? 'paver_crack' : 'paver');
  }
  for (let y = BOTTOM_WALK[0]; y <= BOTTOM_WALK[1]; y++) {
    put(ground, x, y, rnd(x, y, 5) > 0.94 ? 'paver_crack' : 'paver');
  }

  put(ground, x, KERB_TOP, 'kerb_top');
  put(ground, x, KERB_BOTTOM, 'kerb_bottom');

  // Road, with a dashed centre line and occasional wear.
  for (let y = ROAD[0]; y <= ROAD[1]; y++) {
    const mid = y === 10 || y === 11;
    let tile = 'road';
    if (mid && x % 3 !== 2) tile = 'road_dash_h';
    else if (rnd(x, y, 6) > 0.95) tile = 'road_manhole';
    else if (rnd(x, y, 7) > 0.9) tile = 'road_patch';
    else if (rnd(x, y, 8) > 0.97) tile = 'puddle';
    put(ground, x, y, tile);
  }

  // Bottom building
  put(ground, x, BOTTOM_BUILDING[0], 'wall_base');
  collision[BOTTOM_BUILDING[0] * W + x] = 1;
  for (let y = BOTTOM_BUILDING[0] + 1; y <= BOTTOM_BUILDING[1]; y++) {
    put(ground, x, y, rnd(x, y, 9) > 0.5 ? 'wall_concrete' : 'wall_plaster');
    collision[y * W + x] = 1;
  }
}

// ── Street furniture as placed objects ─────────────────────────────────────
// Props are objects, not painted tiles. A tile layer draws at one fixed depth,
// so a bench on it can never occlude the player however far above it they
// stand; a placed object carries its own depth from the bottom of its
// footprint and sorts against characters every frame.
const placed = [];
let objectId = 10;
const place = (type, tx, ty, extra = {}) => {
  placed.push({
    id: objectId++,
    name: type,
    type,
    x: tx * T,
    y: ty * T,
    width: 0,
    height: 0,
    point: true,
    rotation: 0,
    visible: true,
    ...(Object.keys(extra).length
      ? { properties: Object.entries(extra).map(([name, value]) => ({ name, type: typeof value === 'number' ? 'int' : 'string', value })) }
      : {}),
  });
};

// Awnings over the storefronts.
for (let x = 2; x < W - 4; x += 7) place('SHOP_AWNING', x, TOP_BUILDING[1] + 1);

// Trees: a 1x2 object whose canopy is the background row and whose trunk is
// the footprint, so it blocks at the trunk only.
for (let x = 3; x < W - 2; x += 6) place('STREET_TREE', x, TOP_WALK[1] - 1);
for (let x = 6; x < W - 2; x += 7) place('STREET_TREE', x, BOTTOM_WALK[0]);

place('BENCH', 5, BOTTOM_WALK[1]);
place('BIN', 13, BOTTOM_WALK[1], { hueShift: 40 });
place('BENCH', 21, BOTTOM_WALK[1], { hueShift: 200 });
place('BIN', 27, BOTTOM_WALK[1]);
place('PLANTER', 9, TOP_WALK[1]);
place('PLANTER', 18, TOP_WALK[1]);

for (let x = 8; x < W - 2; x += 11) place('STREETLIGHT', x, TOP_WALK[0]);
for (let x = 15; x < 20; x++) place('FENCE', x, BOTTOM_WALK[1] - 1);

// Shop signs stay painted — they are flat against the wall, never occluded.
for (let x = 4; x < W - 4; x += 9) put(walls, x, TOP_BUILDING[1] - 1, 'sign_shop');

// ── Assemble ───────────────────────────────────────────────────────────────
const tileLayer = (name, data, visible = true, order) => ({
  data,
  height: H,
  id: order,
  name,
  opacity: 1,
  type: 'tilelayer',
  visible,
  width: W,
  x: 0,
  y: 0,
});

const map = {
  compressionlevel: -1,
  height: H,
  infinite: false,
  layers: [
    tileLayer('Ground', ground, true, 1),
    tileLayer('Walls', walls, true, 2),
    tileLayer('Objects', objects, true, 3),
    tileLayer('Collision', collision, false, 4),
    tileLayer('Above Player', above, true, 5),
    {
      draworder: 'topdown',
      id: 6,
      name: 'Objects Layer',
      objects: placed,
      opacity: 1,
      type: 'objectgroup',
      visible: true,
      x: 0,
      y: 0,
    },
    {
      draworder: 'topdown',
      id: 7,
      name: 'Spawns',
      objects: [
        { id: 1, name: 'player_spawn', point: true, rotation: 0, type: '', visible: true, x: 15 * T, y: 10.5 * T, width: 0, height: 0 },
        { id: 2, name: 'vendor', point: true, rotation: 0, type: '', visible: true, x: 7 * T + 16, y: TOP_WALK[1] * T + 24, width: 0, height: 0 },
        { id: 3, name: 'auto_driver', point: true, rotation: 0, type: '', visible: true, x: 20 * T + 16, y: BOTTOM_WALK[0] * T + 24, width: 0, height: 0 },
        // Where the airport bus drops you: left end of the top pavement.
        { id: 4, name: 'bus_stop', point: true, rotation: 0, type: '', visible: true, x: 2 * T + 16, y: TOP_WALK[1] * T + 8, width: 0, height: 0 },
        // The hotel: a storefront bay on the top row. Walking into the doorway
        // zone enters whitefield_hotel; leaving it drops you at hotel_door.
        { id: 6, name: 'hotel_door', point: true, rotation: 0, type: '', visible: true, x: 10 * T + 16, y: TOP_WALK[0] * T + 24, width: 0, height: 0 },
        { id: 7, name: 'hotel_zone', rotation: 0, type: 'door', visible: true, x: 10 * T, y: TOP_BUILDING[1] * T + 8, width: T, height: T + 16 },
        // East end of the top pavement turns into Prashanth Layout, the PG lane
        // (story 0.3). Walking off the edge enters it; coming back lands at lane_return.
        { id: 8, name: 'lane_return', point: true, rotation: 0, type: '', visible: true, x: 27 * T + 16, y: TOP_WALK[0] * T + 40, width: 0, height: 0 },
        { id: 9, name: 'lane_zone', rotation: 0, type: '', visible: true, x: (W - 1) * T, y: TOP_WALK[0] * T, width: T, height: (TOP_WALK[1] - TOP_WALK[0] + 1) * T },
        // West end of the top pavement: the long walk to the ITPL gate (story 1.1, ADR-121) — free, forty minutes.
        { id: 10, name: 'office_walk', rotation: 0, type: '', visible: true, x: 0, y: TOP_WALK[0] * T, width: T, height: (TOP_WALK[1] - TOP_WALK[0] + 1) * T },
        // The BMTC stop beside where the airport bus dropped you: 335-E to Ambedkar Nagar (story 1.4, ADR-122).
        { id: 11, name: 'hill_bus', rotation: 0, type: '', visible: true, x: 1 * T, y: TOP_WALK[0] * T - 8, width: T + 16, height: 16 },
        // BMTC 500-D to Cubbon Park (story 1.5, ADR-123): the kerb stop mid-way along the top pavement; the bus
        // runs the top (westbound) lane, pulling in from the east edge, standing at bus_halt and leaving west.
        { id: 12, name: 'bus_500d', rotation: 0, type: '', visible: true, x: 5 * T, y: KERB_TOP * T - 10, width: 3 * T, height: 20 },
        { id: 13, name: 'bus_in', point: true, rotation: 0, type: '', visible: true, x: W * T + 80, y: (ROAD[0] + 2) * T - 6, width: 0, height: 0 },
        { id: 14, name: 'bus_halt', point: true, rotation: 0, type: '', visible: true, x: 6.5 * T, y: (ROAD[0] + 2) * T - 6, width: 0, height: 0 },
        { id: 15, name: 'bus_out', point: true, rotation: 0, type: '', visible: true, x: -120, y: (ROAD[0] + 2) * T - 6, width: 0, height: 0 },
        // The metro station being built across the road (story 1.5 F1): barricade sheets on the bottom pavement's
        // east end, the sign read from the pavement in front of them.
        { id: 16, name: 'barricade_spot', point: true, rotation: 0, type: '', visible: true, x: 23 * T, y: (BOTTOM_WALK[0] + 1) * T, width: 0, height: 0 },
        { id: 17, name: 'pillar_spot', point: true, rotation: 0, type: '', visible: true, x: 26 * T, y: BOTTOM_WALK[0] * T, width: 0, height: 0 },
        { id: 18, name: 'metro_sign', rotation: 0, type: '', visible: true, x: 23 * T, y: (BOTTOM_WALK[0] + 2) * T, width: 3 * T, height: 24 },
        // Where the 500-D home drops you: the kerb by the stop.
        { id: 19, name: 'cubbon_return', point: true, rotation: 0, type: '', visible: true, x: 6 * T + 16, y: TOP_WALK[1] * T + 8, width: 0, height: 0 },
        // The walkable band (pavement, kerb, road) that ambient citizens stay inside.
        { id: 5, name: 'ambient_area', rotation: 0, type: '', visible: true, x: T, y: TOP_WALK[0] * T, width: (W - 2) * T, height: (BOTTOM_WALK[1] - TOP_WALK[0] + 1) * T },
      ],
      opacity: 1,
      type: 'objectgroup',
      visible: true,
      x: 0,
      y: 0,
    },
  ],
  nextlayerid: 8,
  nextobjectid: 100,
  orientation: 'orthogonal',
  renderorder: 'right-down',
  tiledversion: '1.11.0',
  tileheight: T,
  tilesets: [
    {
      columns: meta.columns,
      firstgid: 1,
      image: '../tilesets/street.png',
      imageheight: Math.ceil(meta.tileCount / meta.columns) * T,
      imagewidth: meta.columns * T,
      margin: 0,
      name: 'street',
      spacing: 0,
      tilecount: meta.tileCount,
      tileheight: T,
      tilewidth: T,
    },
  ],
  tilewidth: T,
  type: 'map',
  version: '1.10',
  width: W,
};

writeFileSync(join(assets, 'tilemaps/whitefield_street.tmj'), `${JSON.stringify(map, null, 1)}\n`);
const solid = collision.filter(Boolean).length;
console.log(
  `✓ whitefield_street.tmj — ${W}x${H} tiles, ${solid} solid tiles, ` +
    `${placed.length} placed objects, 19 spawn objects`,
);
