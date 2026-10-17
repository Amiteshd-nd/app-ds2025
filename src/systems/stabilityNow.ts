import { getDistrict, DISTRICTS } from '../data';
import { useGameStore } from '../store';
import { act4DayOf, stabilityFor, stabilityOverride } from './stability';

const resolve = (id: string) => DISTRICTS[id];

/** This place's stability right now (ADR-144): the Playground's dial, else the store's flags and Act 4 day. */
export function stabilityNow(districtId: string | null = useGameStore.getState().activeDistrict): number {
  const o = stabilityOverride();
  if (o !== null) return o;
  if (!districtId) return 100;
  const s = useGameStore.getState();
  return stabilityFor(getDistrict(districtId), s.flags, act4DayOf(s), resolve);
}
