import { gameEvents } from '../core/events';
import { CITY_MAP, DISTRICTS, QUESTS } from '../data';
import { useGameStore } from '../store';
import type { CityMapData, DistrictDef, LatLng, MapPoiKind, TransitKind } from '../utils/types';
import { ReputationManager } from './ReputationManager';
import { FUEL_COUNTER } from './StatsManager';
import { FUEL_PER_KM, SCOOTER_MINUTES_PER_KM } from '../utils/constants';

/**
 * MapManager — the fullscreen map's rules, no pixels (P6b, ADR-113/115).
 *
 * One source of truth (map_navigation §2): districts with real coordinates
 * are nodes, their exits are the journeys between them, city.json adds the
 * roads, metro lines, teaser places and icons. It remembers where you have
 * been and which paths you have travelled (as saved flags, so no new save
 * field), routes you to a destination, and reroutes — "REROUTING…" — when
 * you stray (fail-forward: the new route starts where you are, so it costs
 * more). MapScene only renders what this returns.
 */

export type NodeKind = 'district' | 'station' | 'place';
export type NodeState = 'visited' | 'known' | 'locked';

export interface MapNode {
  id: string;
  kind: NodeKind;
  label: string;
  at: LatLng;
  state: NodeState;
  /** Metro lines through a station. */
  lines?: string[];
}

export interface MapEdge {
  from: string;
  to: string;
  transit: TransitKind;
  fare: number;
  /** city.json path drawn for this journey, when one is authored. */
  path?: string;
  km: number;
}

export interface Route {
  nodes: string[];
  edges: MapEdge[];
  cost: number;
}

export type PathState = 'travelled' | 'reveal' | 'undiscovered';

/** Flags the map keeps in the save. */
export const FLAG = {
  visited: (id: string) => `visited:${id}`,
  travelled: (pathId: string) => `travelled:${pathId}`,
  seen: (pathId: string) => `map_seen:${pathId}`,
} as const;

/** Relative cost of a km by each way of travelling (bus beats walking a long way). */
const COST_PER_KM: Record<TransitKind, number> = { walk: 1, bus: 0.4, metro: 0.3, scooter: 0.5, cab: 0.5, auto: 0.5 };
/** Familiarity ★: district standing at which each star lights (Hosa → Gothu → Namma, ADR-26). */
export const FAMILIARITY_STARS = [1, 5, 15, 30, 60] as const;

export const kmBetween = ([lat1, lng1]: LatLng, [lat2, lng2]: LatLng): number => {
  const r = 6371, rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad, dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(a));
};

const polylineKm = (points: LatLng[]): number => points.slice(1).reduce((km, p, i) => km + kmBetween(points[i], p), 0);

/** Interiors fold into their outdoor parent; returns the district that has coordinates. */
export function anchorOf(districtId: string | null | undefined, districts: Record<string, DistrictDef> = DISTRICTS): DistrictDef | undefined {
  let d = districtId ? districts[districtId] : undefined;
  for (let i = 0; d?.realworld && 'parent' in d.realworld && i < 5; i++) d = districts[d.realworld.parent];
  return d?.realworld && 'lat' in d.realworld ? d : undefined;
}

export class MapManager {
  private static instance: MapManager | null = null;

  static getInstance(): MapManager {
    if (!MapManager.instance) MapManager.instance = new MapManager();
    return MapManager.instance;
  }

  static resetInstance(): void {
    MapManager.instance?.dispose();
    MapManager.instance = null;
  }

  private off: Array<() => void> = [];
  private lastRoute: string[] = [];
  /** Where the last journey started — the heading arrow points away from it. Session only. */
  private lastFrom: string | null = null;

  constructor(
    private city: CityMapData = CITY_MAP,
    private districts: Record<string, DistrictDef> = DISTRICTS,
  ) {
    this.off.push(gameEvents.on('district:entered', ({ districtId, fromDistrict }) => this.arrive(districtId, fromDistrict)));
  }

  dispose(): void {
    this.off.forEach((f) => f());
    this.off = [];
  }

  // ── Graph ────────────────────────────────────────────────────────────────

  nodes(): MapNode[] {
    const { flags } = useGameStore.getState();
    const rep = ReputationManager.getInstance();
    const out: MapNode[] = [];
    const districtIds = new Set<string>();
    for (const d of Object.values(this.districts)) {
      if (!d.realworld || !('lat' in d.realworld)) continue;
      districtIds.add(d.id);
      out.push({
        id: d.id,
        kind: 'district',
        label: d.realworld.label ?? d.name,
        at: [d.realworld.lat, d.realworld.lng],
        // No unlock rule = open (the same rule ReputationManager applies to real districts).
        state: flags[FLAG.visited(d.id)] ? 'visited' : !d.unlock || rep.canEnter(d.id) ? 'known' : 'locked',
      });
    }
    const stations = new Map<string, MapNode>();
    for (const line of this.city.metro) {
      for (const s of line.stations) {
        const node = stations.get(s.id) ?? { id: s.id, kind: 'station' as const, label: s.label, at: s.at, state: 'known' as NodeState, lines: [] };
        node.lines!.push(line.id);
        stations.set(s.id, node);
      }
    }
    out.push(...stations.values());
    for (const p of this.city.places) {
      if (p.districtId && districtIds.has(p.districtId)) continue; // the district is the node now
      out.push({ id: p.id, kind: 'place', label: p.label, at: p.at, state: 'locked' });
    }
    return out;
  }

  /** Journeys the player can actually make: district exits between outdoor anchors. */
  edges(): MapEdge[] {
    const seen = new Set<string>();
    const out: MapEdge[] = [];
    for (const d of Object.values(this.districts)) {
      const from = anchorOf(d.id, this.districts);
      for (const exit of d.exits ?? []) {
        const to = anchorOf(exit.to, this.districts);
        if (!from || !to || from.id === to.id) continue;
        const key = `${from.id}>${to.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const path = this.city.paths.find((p) => p.connects && p.connects.includes(from.id) && p.connects.includes(to.id));
        const a = this.at(from), b = this.at(to);
        out.push({ from: from.id, to: to.id, transit: exit.transit, fare: exit.fare ?? 0, path: path?.id, km: path ? polylineKm(path.points) : kmBetween(a, b) });
      }
    }
    return out;
  }

  private at(d: DistrictDef): LatLng {
    const rw = d.realworld as { lat: number; lng: number };
    return [rw.lat, rw.lng];
  }

  /** Cheapest journey (Dijkstra over exits). Null when there is no way yet. */
  route(from: string, to: string): Route | null {
    if (from === to) return { nodes: [from], edges: [], cost: 0 };
    const edges = this.edges();
    const dist = new Map<string, number>([[from, 0]]);
    const prev = new Map<string, MapEdge>();
    const open = new Set<string>([from]);
    while (open.size) {
      let cur = '', best = Infinity;
      for (const n of open) if ((dist.get(n) ?? Infinity) < best) { best = dist.get(n)!; cur = n; }
      open.delete(cur);
      if (cur === to) break;
      for (const e of edges.filter((x) => x.from === cur)) {
        const c = best + e.km * COST_PER_KM[e.transit] + e.fare / 100;
        if (c < (dist.get(e.to) ?? Infinity)) { dist.set(e.to, c); prev.set(e.to, e); open.add(e.to); }
      }
    }
    if (!prev.has(to)) return null;
    const path: MapEdge[] = [];
    for (let n = to; n !== from;) { const e = prev.get(n)!; path.unshift(e); n = e.from; }
    return { nodes: [from, ...path.map((e) => e.to)], edges: path, cost: dist.get(to)! };
  }

  // ── Where you are, where you are going ───────────────────────────────────

  here(): string | null {
    return anchorOf(useGameStore.getState().activeDistrict, this.districts)?.id ?? null;
  }

  /** The player's own destination, else the active objective's (first one that names a place). */
  destination(): { districtId: string; label: string; objective?: string; chosen: boolean } | null {
    const { mapDestination, quests } = useGameStore.getState();
    if (mapDestination) {
      const d = anchorOf(mapDestination, this.districts);
      if (d) return { districtId: d.id, label: (d.realworld as { label?: string }).label ?? d.name, chosen: true };
    }
    for (const [questId, done] of Object.entries(quests.active)) {
      const objective = QUESTS[questId]?.objectives.find((o) => !done.includes(o.id) && !o.optional && o.destination);
      if (!objective) continue;
      const d = anchorOf(objective.destination, this.districts);
      if (d) return { districtId: d.id, label: (d.realworld as { label?: string }).label ?? d.name, objective: objective.text, chosen: false };
    }
    return null;
  }

  /** Route from here to the destination, or null. */
  currentRoute(): Route | null {
    const here = this.here(), dest = this.destination();
    if (!here || !dest) return null;
    return this.route(here, dest.districtId);
  }

  /** Set (or clear) the player's destination. Only open districts can be chosen. */
  setDestination(districtId: string | null): boolean {
    const store = useGameStore.getState();
    if (districtId === null) { store.setMapDestination(null); this.lastRoute = []; return true; }
    const node = this.nodes().find((n) => n.id === districtId);
    if (!node || node.kind !== 'district' || node.state === 'locked') return false;
    store.setMapDestination(districtId);
    this.lastRoute = this.currentRoute()?.nodes ?? [];
    return true;
  }

  private arrive(districtId: string, fromDistrict?: string): void {
    const store = useGameStore.getState();
    const to = anchorOf(districtId, this.districts);
    if (!to) return;
    if (!store.flags[FLAG.visited(to.id)]) store.setFlag(FLAG.visited(to.id), true);
    const from = anchorOf(fromDistrict, this.districts);
    if (from && from.id !== to.id) {
      const edge = this.edges().find((e) => e.from === from.id && e.to === to.id);
      if (edge?.path && !store.flags[FLAG.travelled(edge.path)]) store.setFlag(FLAG.travelled(edge.path), true);
      this.lastFrom = from.id;
    }
    // Fail-forward: strayed off the planned route → recalculate from here.
    const dest = this.destination();
    if (dest && to.id === dest.districtId) {
      if (dest.chosen) { store.setMapDestination(null); gameEvents.emit('ui:toast', { text: `ARRIVED: ${dest.label.toUpperCase()}` }); }
      this.lastRoute = [];
    } else if (dest && this.lastRoute.length && !this.lastRoute.includes(to.id)) {
      gameEvents.emit('ui:toast', { text: 'REROUTING…' });
      this.lastRoute = this.currentRoute()?.nodes ?? [];
    } else if (dest) {
      this.lastRoute = this.currentRoute()?.nodes ?? this.lastRoute;
    }
  }

  /** Remember the route the map is currently showing (so a stray can be detected). */
  noteRouteShown(): void {
    this.lastRoute = this.currentRoute()?.nodes ?? [];
  }

  /** Last journey's direction, for the player's heading arrow: [from, to] or null. */
  heading(): [LatLng, LatLng] | null {
    const from = anchorOf(this.lastFrom, this.districts), to = anchorOf(this.here(), this.districts);
    return from && to ? [this.at(from), this.at(to)] : null;
  }

  // ── Paths, stars, icons ──────────────────────────────────────────────────

  /** travelled = solid; reveal = travelled but not yet animated on the map; undiscovered = dotted. */
  pathState(pathId: string): PathState {
    const { flags } = useGameStore.getState();
    if (!flags[FLAG.travelled(pathId)]) return 'undiscovered';
    return flags[FLAG.seen(pathId)] ? 'travelled' : 'reveal';
  }

  /** The dotted→solid animation has played for these paths. */
  markRevealed(pathIds: string[]): void {
    const store = useGameStore.getState();
    for (const id of pathIds) if (!store.flags[FLAG.seen(id)]) store.setFlag(FLAG.seen(id), true);
  }

  /** Metro lines ridden: a line is travelled once its path id is. None until a pocket sits on a station. */
  lineState(lineId: string): PathState {
    return this.pathState(lineId);
  }

  /** ★ familiarity 0–5 from the district standing. */
  familiarity(districtId: string): number {
    const standing = ReputationManager.getInstance().standingIn(districtId);
    return FAMILIARITY_STARS.filter((t) => standing >= t).length;
  }

  /** ☠ danger 0–5 (inverse stability) — hidden (null) before Act 4 and until districts carry stability. */
  danger(districtId: string): number | null {
    const { flags } = useGameStore.getState();
    const stability = (this.districts[districtId] as DistrictDef & { stability?: number } | undefined)?.stability;
    if (!flags.act4_started || stability === undefined) return null;
    return Math.max(0, Math.min(5, Math.round((100 - stability) / 20)));
  }

  /** Icons shown beside nodes (★ is the destination, drawn by the scene). */
  pois(): Array<{ kind: MapPoiKind; node: string }> {
    const { flags } = useGameStore.getState();
    return this.city.pois
      .filter((p) => (!p.showIf || flags[p.showIf]) && (!p.hideIf || !flags[p.hideIf]))
      .filter((p) => (p.kind !== 'uv' && p.kind !== 'skull') || flags.act4_started)
      .map((p) => ({ kind: p.kind, node: p.node }));
  }

  /**
   * The scooter (story 2.1, ADR-126): once owned, ride to any visited outdoor
   * pocket from here; the cost is fuel (FUEL_PER_KM of the tank per km, at
   * least 1 point) and game minutes. Null when there is no scooter, no
   * route distance, or the tank is too low.
   */
  scooterRide(toDistrictId: string): { fuel: number; minutes: number; km: number; enough: boolean } | null {
    const store = useGameStore.getState();
    if (!store.flags.scooter_owned) return null;
    const here = this.here();
    const from = here ? this.districts[here] : undefined, to = this.districts[toDistrictId];
    if (!from || !to || from.id === to.id || !to.realworld || !('lat' in to.realworld)) return null;
    if (!store.flags[FLAG.visited(to.id)]) return null;
    const km = kmBetween(this.at(from), this.at(to));
    const fuel = Math.max(1, Math.ceil(km * FUEL_PER_KM));
    const tank = store.counters[FUEL_COUNTER] ?? 0;
    return { fuel, minutes: Math.max(2, Math.round(km * SCOOTER_MINUTES_PER_KM)), km, enough: tank >= fuel };
  }

  /** Spend the fuel for a ride (the map's RIDE button); false when the tank is short. */
  rideScooter(toDistrictId: string): boolean {
    const ride = this.scooterRide(toDistrictId);
    if (!ride || !ride.enough) return false;
    const store = useGameStore.getState();
    store.setCounter(FUEL_COUNTER, Math.max(0, (store.counters[FUEL_COUNTER] ?? 0) - ride.fuel));
    if (!store.flags.scooter_ridden) store.setFlag('scooter_ridden', true);
    return true;
  }

  /**
   * Fast travel (ADR-115): only between pockets that sit on metro stations,
   * both visited. Fare like Namma Metro's: ₹10 + ₹2/km, in ₹5 steps, ₹60 cap.
   */
  fastTravel(toDistrictId: string): { fare: number; station: string } | null {
    const here = this.here();
    const from = here ? this.districts[here] : undefined, to = this.districts[toDistrictId];
    if (!from?.metroStation || !to?.metroStation || from.id === to.id) return null;
    if (!useGameStore.getState().flags[FLAG.visited(to.id)]) return null;
    const km = kmBetween(this.at(from), this.at(to));
    return { fare: Math.min(60, Math.ceil((10 + 2 * km) / 5) * 5), station: to.metroStation };
  }
}
