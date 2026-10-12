import { gameEvents } from '../core/events';
import { useGameStore } from '../store';
import { InventoryManager } from './InventoryManager';
import { ReputationManager } from './ReputationManager';
import type { AdjustableStat, PlayerStats, SkillBranchName, StatEffect } from '../utils/types';

/**
 * StatsManager — the survival stats (profile doc §2), the wallet and skill XP.
 *
 * Singleton via getInstance(). It holds no state of its own: the zustand store
 * is the single source of truth, so the React HUD re-renders whenever a Phaser
 * scene applies an effect.
 *
 * Money leaves the wallet through exactly one door, `spend()`, which refuses
 * when the player cannot afford it (game_components §7: "every purchase is a
 * canAfford() call"). Income arrives through `earn()`.
 */
export class StatsManager {
  private static instance: StatsManager | null = null;

  static getInstance(): StatsManager {
    if (!StatsManager.instance) StatsManager.instance = new StatsManager();
    return StatsManager.instance;
  }

  /** Test seam — drops the cached singleton. */
  static resetInstance(): void {
    StatsManager.instance = null;
  }

  get stats(): PlayerStats {
    return useGameStore.getState().stats;
  }

  adjust(stat: AdjustableStat, delta: number): void {
    useGameStore.getState().adjustStat(stat, delta);
  }

  addXp(branch: SkillBranchName, amount: number): void {
    useGameStore.getState().addXp(branch, amount);
  }

  /** True when the player can cover a cost. */
  canAfford(cost: number): boolean {
    return this.stats.wallet >= cost;
  }

  /**
   * Pay. Refuses (false, nothing changes) when the wallet is short — the
   * caller shows "can't afford", never a negative balance. `reason` is for
   * feedback and analytics ("chai", "bus_fare").
   */
  spend(cost: number, reason = '', label?: string): boolean {
    if (cost < 0) throw new Error(`spend() takes a positive cost, got ${cost}`);
    if (!this.canAfford(cost)) return false;
    useGameStore.getState().adjustWallet(-cost);
    this.record(-cost, reason, label);
    gameEvents.emit('wallet:spent', { amount: cost, reason, balance: this.stats.wallet });
    return true;
  }

  /** Income: salary, a quest reward, a sold item. */
  earn(amount: number, reason = '', label?: string): void {
    if (amount <= 0) return;
    useGameStore.getState().adjustWallet(amount);
    this.record(amount, reason, label);
    gameEvents.emit('wallet:earned', { amount, reason, balance: this.stats.wallet });
  }

  /** Every rupee in or out is a UPI ledger line (the phone's UPI app reads it). */
  private record(amount: number, reason: string, label?: string): void {
    const store = useGameStore.getState();
    store.addTransaction({
      amount,
      label: label ?? (amount > 0 ? 'Received' : 'Payment'),
      reason,
      day: store.clock.day,
      minute: store.clock.minute,
      balance: store.stats.wallet,
    });
  }

  /**
   * First conversation with a named NPC: social +1 (profile doc §2, loop
   * step Reward). Ambient crowd never counts. Returns true when it was new.
   */
  meet(npcId: string): boolean {
    const isNew = useGameStore.getState().markMet(npcId);
    if (isNew) gameEvents.emit('social:met', { npcId, social: this.stats.social });
    return isNew;
  }

  /**
   * Apply a dialogue/quest/item StatEffect in one go, items included. A
   * negative wallet effect is a purchase and goes through spend(); callers
   * that need to refuse before the effect (dialogue choices) ask canAfford()
   * first, so a refusal here only means the content and the gate disagree.
   */
  applyEffect(effect: StatEffect, label?: string): void {
    if (effect.health) this.adjust('health', effect.health);
    if (effect.food) this.adjust('food', effect.food);
    if (effect.stress) this.adjust('stress', effect.stress);
    if (effect.stamina) this.adjust('stamina', effect.stamina);
    if (effect.battery) this.adjust('battery', effect.battery);
    if (effect.wallet) {
      if (effect.wallet > 0) this.earn(effect.wallet, 'effect', label);
      else if (!this.spend(-effect.wallet, 'effect', label)) {
        console.warn(`[StatsManager] could not spend ₹${-effect.wallet} (wallet ₹${this.stats.wallet})`);
      }
    }
    if (effect.xp && effect.xp_branch) this.addXp(effect.xp_branch, effect.xp);
    for (const [flag, value] of Object.entries(effect.flags ?? {})) useGameStore.getState().setFlag(flag, value);
    if (effect.reputation) {
      const district = useGameStore.getState().activeDistrict ?? undefined;
      ReputationManager.getInstance().add(effect.reputation, district);
    }

    if (effect.item_add) {
      const added = InventoryManager.getInstance().add(effect.item_add);
      // A full stack is a soft failure the player can see; say so in dev.
      if (!added) console.warn(`[StatsManager] could not add item "${effect.item_add}" (stack full?)`);
    }
    if (effect.item_remove) {
      const removed = InventoryManager.getInstance().remove(effect.item_remove);
      if (!removed) console.warn(`[StatsManager] could not remove item "${effect.item_remove}" (not held)`);
    }
  }
}
