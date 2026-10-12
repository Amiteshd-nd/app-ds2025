import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { validateCityMap } from '../../scripts/validate-content';
import { gameEvents } from '../core/events';
import { CITY_MAP, DISTRICTS } from '../data';
import { useGameStore } from '../store';
import { FLAG, MapManager } from '../systems/MapManager';
import { ReputationManager } from '../systems/ReputationManager';
import type { PixelCtx } from '../ui/kit/pixel';
import { hex } from '../ui/tokens';
import { stroke } from '../ui/map/paint';
import { cellsInside, MAP_GRID, orthogonal, project, walk } from '../ui/map/projection';
import { cardFor, clampPan, nodeAt, toMap, zoomAbout } from '../ui/map/view';
import type { CityMapData, DistrictDef } from '../utils/types';

beforeEach(() => {
  (globalThis as Record<string, unknown>).localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  gameEvents.clear();
  MapManager.resetInstance();
  ReputationManager.resetInstance();
  useGameStore.getState().reset();
});

const toasts = () => { const t: string[] = []; gameEvents.on('ui:toast', ({ text }) => t.push(text)); return t; };

describe('projection (8px grid, orthogonal paths)', () => {
  const proj = project(CITY_MAP);

  it('snaps every point to the grid and keeps the city inside the drawn map', () => {
    for (const line of CITY_MAP.metro) for (const s of line.stations) {
      const [x, y] = proj.at(s.at);
      expect(x % MAP_GRID).toBe(0);
      expect(y % MAP_GRID).toBe(0);
      expect(x).toBeGreaterThan(0); expect(x).toBeLessThan(proj.w);
      expect(y).toBeGreaterThan(0); expect(y).toBeLessThan(proj.h);
    }
  });

  it('is north-up and roughly true to scale (16 px per km)', () => {
    const [ax, ay] = proj.raw([13.0, 77.6]), [, by] = proj.raw([12.9, 77.6]);
    expect(by).toBeGreaterThan(ay); // south is down
    expect(by - ay).toBeCloseTo(11.06 * 16, 0);
    const [lat, lng] = proj.toLatLng([ax, ay]);
    expect(lat).toBeCloseTo(13.0, 6); expect(lng).toBeCloseTo(77.6, 6);
  });

  it('turns any polyline into axis-aligned runs, corners only where it turns', () => {
    const run = orthogonal([[0, 0], [40, 16], [40, 16], [40, 48], [80, 48]]);
    for (let i = 1; i < run.length; i++) expect(run[i][0] === run[i - 1][0] || run[i][1] === run[i - 1][1]).toBe(true);
    expect(run).toEqual([[0, 0], [40, 0], [40, 48], [80, 48]]);
    const pts = walk(run);
    expect(pts.length).toBe(1 + 40 + 48 + 40);
  });

  it('fills a region with the cells whose centre is inside', () => {
    expect(cellsInside([[0, 0], [32, 0], [32, 16], [0, 16]])).toHaveLength(8);
  });
});

describe('path strokes', () => {
  const canvas = () => {
    const px = new Map<string, string>();
    const g: PixelCtx = { fillStyle: '', globalAlpha: 1, fillRect(x, y, w, h) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px.set(`${x + i},${y + j}`, String(this.fillStyle)); } };
    return { g, px };
  };

  it('solid paths are 2px with a rounded (knocked-back) outer corner', () => {
    const { g, px } = canvas();
    stroke(g, [[0, 0], [10, 0], [10, 10]], 'W', 'solid', 'B');
    expect(px.get('5,-1')).toBe('W');
    expect(px.get('5,0')).toBe('W');
    expect(px.get('10,-1')).toBe('B'); // outer corner pixel
  });

  it('undiscovered paths are dotted: one 2×2 dot every 6px', () => {
    const { g, px } = canvas();
    stroke(g, [[0, 0], [24, 0]], 'W', 'dotted');
    const dots = [...px.keys()].filter((k) => k.endsWith(',0')).map((k) => Number(k.split(',')[0])).sort((a, b) => a - b);
    expect(dots).toEqual([-1, 0, 5, 6, 11, 12, 17, 18, 23, 24]);
  });
});

describe('MapManager on the real city', () => {
  const mm = () => MapManager.getInstance();

  it('makes nodes from districts (interiors folded), stations (interchanges once) and teaser places', () => {
    const nodes = mm().nodes();
    expect(nodes.find((n) => n.id === 'whitefield_hotel')).toBeUndefined(); // interior
    expect(nodes.find((n) => n.id === 'airport')?.kind).toBe('district');
    const majestic = nodes.filter((n) => n.id === 'stn_majestic');
    expect(majestic).toHaveLength(1);
    expect(majestic[0].lines).toEqual(['purple', 'green']);
    expect(nodes.find((n) => n.id === 'place_office')?.state).toBe('locked');
  });

  it('journeys come from district exits and carry their drawn path', () => {
    const e = mm().edges();
    expect(e.find((x) => x.from === 'airport' && x.to === 'whitefield_street')).toMatchObject({ transit: 'bus', path: 'vayu_vajra' });
    expect(e.find((x) => x.from === 'whitefield_street' && x.to === 'prashanth_layout')?.path).toBe('walk_prashanth');
  });

  it('routes along journeys, and has none where no journey exists', () => {
    expect(mm().route('airport', 'prashanth_layout')?.nodes).toEqual(['airport', 'whitefield_street', 'prashanth_layout']);
    expect(mm().route('prashanth_layout', 'airport')).toBeNull(); // the Vayu Vajra only runs one way in-game
  });

  it('arriving marks the place visited and the path travelled; the first look reveals it once', () => {
    mm();
    useGameStore.getState().setActiveDistrict('whitefield_street');
    gameEvents.emit('district:entered', { districtId: 'whitefield_street', fromDistrict: 'airport' });
    const { flags } = useGameStore.getState();
    expect(flags[FLAG.visited('whitefield_street')]).toBe(true);
    expect(mm().pathState('vayu_vajra')).toBe('reveal');
    mm().markRevealed(['vayu_vajra']);
    expect(mm().pathState('vayu_vajra')).toBe('travelled');
    expect(mm().pathState('orr')).toBe('undiscovered');
    expect(mm().nodes().find((n) => n.id === 'whitefield_street')?.state).toBe('visited');
    expect(mm().heading()).not.toBeNull();
  });

  it('only open districts can be a destination; reaching a chosen one clears it', () => {
    const t = toasts();
    mm();
    useGameStore.getState().setActiveDistrict('whitefield_street');
    expect(mm().setDestination('prashanth_layout')).toBe(false); // locked until the arrival quest is done
    useGameStore.getState().setQuests({ active: {}, completed: ['q_act0_arrival'] });
    expect(mm().setDestination('place_office')).toBe(false);
    expect(mm().setDestination('stn_mg_road')).toBe(false);
    expect(mm().setDestination('prashanth_layout')).toBe(true);
    expect(mm().destination()).toMatchObject({ districtId: 'prashanth_layout', chosen: true });
    useGameStore.getState().setActiveDistrict('prashanth_layout');
    gameEvents.emit('district:entered', { districtId: 'prashanth_layout', fromDistrict: 'whitefield_street' });
    expect(useGameStore.getState().mapDestination).toBeNull();
    expect(t).toContain('ARRIVED: PRASHANTH LAYOUT');
  });

  it('familiarity lights a star per standing threshold; danger stays hidden before Act 4', () => {
    expect(mm().familiarity('prashanth_layout')).toBe(0);
    ReputationManager.getInstance().add(6, 'prashanth_layout');
    expect(mm().familiarity('prashanth_layout')).toBe(2);
    expect(mm().danger('prashanth_layout')).toBeNull();
  });

  it('icons follow their flags: the hotel is home until the PG is signed', () => {
    useGameStore.getState().setFlag('hotel_checked_in', true);
    expect(mm().pois().filter((p) => p.kind === 'home').map((p) => p.node)).toEqual(['whitefield_street']);
    useGameStore.getState().setFlag('pg_signed', true);
    expect(mm().pois().filter((p) => p.kind === 'home').map((p) => p.node)).toEqual(['prashanth_layout']);
  });

  it('no fast travel until pockets sit on metro stations', () => {
    useGameStore.getState().setActiveDistrict('whitefield_street');
    expect(mm().fastTravel('prashanth_layout')).toBeNull();
  });
});

describe('MapManager on a small test city', () => {
  // A → B → D (bus, short) and A → C → D (walk, long): the route is via B.
  const d = (id: string, lat: number, lng: number, exits: Array<[string, 'bus' | 'walk']>, extra: Partial<DistrictDef> = {}): DistrictDef =>
    ({ id, name: id, map: id, defaultSpawn: 's', realworld: { lat, lng }, exits: exits.map(([to, transit]) => ({ zone: `to_${to}`, to, spawn: 's', transit })), ...extra }) as DistrictDef;
  const districts: Record<string, DistrictDef> = {
    a: d('a', 12.9, 77.6, [['b', 'bus'], ['c', 'walk']], { metroStation: 'stn_x' }),
    b: d('b', 12.95, 77.6, [['d', 'bus']]),
    c: d('c', 12.9, 77.7, [['d', 'walk']]),
    d: d('d', 12.95, 77.7, [], { metroStation: 'stn_y' }),
  };
  const city: CityMapData = { ...CITY_MAP, paths: [], places: [], pois: [] };

  it('reroutes when you stray off the route — fail-forward, to the same destination', () => {
    const t = toasts();
    const mm = new MapManager(city, districts);
    useGameStore.getState().setActiveDistrict('a');
    expect(mm.setDestination('d')).toBe(true);
    expect(mm.currentRoute()?.nodes).toEqual(['a', 'b', 'd']);
    useGameStore.getState().setActiveDistrict('c');
    gameEvents.emit('district:entered', { districtId: 'c', fromDistrict: 'a' });
    expect(t).toContain('REROUTING…');
    expect(mm.currentRoute()?.nodes).toEqual(['c', 'd']);
    expect(mm.destination()?.districtId).toBe('d');
    mm.dispose();
  });

  it('fast travel: both pockets on stations, the target visited; Namma Metro-like fare', () => {
    const mm = new MapManager(city, districts);
    useGameStore.getState().setActiveDistrict('a');
    expect(mm.fastTravel('d')).toBeNull(); // not visited yet
    useGameStore.getState().setFlag(FLAG.visited('d'), true);
    const ft = mm.fastTravel('d')!;
    expect(ft.station).toBe('stn_y');
    expect(ft.fare % 5).toBe(0);
    expect(ft.fare).toBeGreaterThanOrEqual(10);
    expect(ft.fare).toBeLessThanOrEqual(60);
    expect(mm.fastTravel('b')).toBeNull(); // b has no station
    mm.dispose();
  });
});

describe('map view maths', () => {
  const map = { w: 600, h: 760 }, screen = { w: 640, h: 360 };

  it('zooms about a point without moving it, and clamps panning', () => {
    const pan = zoomAbout([-100, -200], 1, 2, [320, 180]);
    expect(toMap([320, 180], pan, 2)).toEqual(toMap([320, 180], [-100, -200], 1));
    expect(clampPan([5000, 5000], 1, map, screen)).toEqual([320, 180]);
    expect(clampPan([-5000, -5000], 2, map, screen)).toEqual([320 - 1200, 180 - 1520]);
  });

  it('a tap picks the nearest node within reach, or nothing', () => {
    const nodes = [{ id: 'a', screen: [100, 100] as [number, number] }, { id: 'b', screen: [110, 100] as [number, number] }];
    expect(nodeAt(nodes, [108, 101])).toBe('b');
    expect(nodeAt(nodes, [200, 200])).toBeNull();
  });

  it('label cards: districts carry ★ (and ☠ in Act 4); stations name their lines', () => {
    const district = { id: 'x', kind: 'district' as const, label: 'Prashanth Layout', at: [0, 0] as [number, number], state: 'visited' as const };
    expect(cardFor(district, { familiarity: 3, danger: null, lines: {}, isHere: true })).toEqual({ title: 'PRASHANTH LAYOUT', stars: 3, danger: null, sub: 'YOU ARE HERE' });
    const station = { id: 's', kind: 'station' as const, label: 'Majestic', at: [0, 0] as [number, number], state: 'known' as const, lines: ['purple', 'green'] };
    expect(cardFor(station, { familiarity: 0, danger: null, lines: { purple: 'Purple Line', green: 'Green Line' }, isHere: false }).sub).toBe('PURPLE LINE · GREEN LINE');
  });
});

describe('city map validation', () => {
  const districts = Object.values(DISTRICTS) as unknown as Array<Record<string, unknown>>;
  const tokens = new Set(Object.keys(JSON.parse(readFileSync(resolve(__dirname, '../assets/_meta/tokens.json'), 'utf8')).tokens));
  const city = () => structuredClone(CITY_MAP) as unknown as Record<string, any>;

  it('passes on the real data', () => {
    expect(validateCityMap(city(), districts, tokens)).toEqual([]);
  });

  it('catches a stray point, a bad colour, an undrawn journey and an orphan icon', () => {
    const c = city();
    c.regions[0].outline[0] = [14.5, 77.6];
    c.metro[0].colour = 'map.nope';
    c.paths = c.paths.filter((p: { id: string }) => p.id !== 'vayu_vajra');
    c.pois.push({ kind: 'chai', node: 'nowhere' });
    const p = validateCityMap(c, districts, tokens);
    expect(p.some((x) => x.includes('leaves the map bounds'))).toBe(true);
    expect(p.some((x) => x.includes('not a colour token'))).toBe(true);
    expect(p.some((x) => x.includes('airport → whitefield_street'))).toBe(true);
    expect(p.some((x) => x.includes('unknown node "nowhere"'))).toBe(true);
  });

  it('uses no raw hex: every map colour is a token', () => {
    expect(hex('map.park')).toMatch(/^#[0-9a-f]{6}$/);
    expect(hex('map.metro.purple')).toMatch(/^#[0-9a-f]{6}$/);
  });
});
