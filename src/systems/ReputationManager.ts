import { gameEvents } from '../core/events';
import { DISTRICTS } from '../data';
import { useGameStore } from '../store';
import { REPUTATION_THRESHOLDS, REPUTATION_TIER_NAMES } from '../utils/constants';
import type { DistrictDef } from '../utils/types';

/**
 * ReputationManager — the macro loop's spine.
 *
 * Outsider → Survivor → Trusted Helper → Fixer → Important Player. Reputation
 * is earned globally and per district: the tier drives the story arc, while
 * local standing is what opens an area's deeper missions. That gives the
 * progression loop somewhere to go — points buy equipment, reputation buys
 * access — without a second currency.
 */
export class ReputationManager {
  private static instance: ReputationManager | null = null;

  static getInstance(): ReputationManager {
    if (!ReputationManager.instance) ReputationManager.instance = new ReputationManager();
    return ReputationManager.instance;
  }

  static resetInstance(): void {
    ReputationManager.instance = null;
  }

  /** `districts` is injectable so tests can drive synthetic unlock rules. */
  constructor(private districts: Record<string, DistrictDef> = DISTRICTS) {}

  get total(): number {
    return useGameStore.getState().reputation.total;
  }

  /** Highest tier index whose threshold has been reached (0..4). */
  get tier(): number {
    let tier = 0;
    for (let i = 0; i < REPUTATION_THRESHOLDS.length; i++) {
      if (this.total >= REPUTATION_THRESHOLDS[i]) tier = i;
    }
    return tier;
  }

  get tierName(): string {
    return REPUTATION_TIER_NAMES[this.tier];
  }

  /** Reputation still needed for the next tier, or null at the top. */
  get toNextTier(): number | null {
    const next = REPUTATION_THRESHOLDS[this.tier + 1];
    return next === undefined ? null : next - this.total;
  }

  standingIn(districtId: string): number {
    return useGameStore.getState().reputation.byDistrict[districtId] ?? 0;
  }

  /**
   * Credit reputation. A district-scoped gain also counts toward the global
   * total — helping people anywhere makes you known everywhere, just more so
   * where you did it.
   */
  add(amount: number, districtId?: string): void {
    if (amount === 0) return;

    const state = useGameStore.getState();
    const previousTier = this.tier;
    const byDistrict = { ...state.reputation.byDistrict };
    if (districtId) {
      byDistrict[districtId] = (byDistrict[districtId] ?? 0) + amount;
    }

    state.hydrate({
      reputation: { total: state.reputation.total + amount, byDistrict },
    });

    gameEvents.emit('reputation:changed', {
      total: this.total,
      districtId,
      tier: this.tier,
    });

    if (this.tier > previousTier) {
      gameEvents.emit('reputation:tier', { tier: this.tier, tierName: this.tierName });
    }
  }

  /**
   * Whether a district is enterable: its `unlock` rule satisfied — quest done,
   * flags set, reputation bar met. A district with no rule is always open.
   */
  canEnter(districtId: string): boolean {
    const district = this.districts[districtId];
    if (!district) return false;

    const unlock = district.unlock;
    if (!unlock) return true;

    const { quests, flags } = useGameStore.getState();
    if (unlock.quest && !quests.completed.includes(unlock.quest)) return false;
    if (unlock.flags?.some((flag) => !flags[flag])) return false;
    return this.total >= (unlock.reputation ?? 0);
  }

  /** Every district the player can currently reach, in declaration order. */
  availableDistricts(): DistrictDef[] {
    return Object.values(this.districts).filter((d) => this.canEnter(d.id));
  }
}
