import { gameEvents } from '../core/events';
import { getItem } from '../data';
import { StatsManager } from './StatsManager';
import { useGameStore } from '../store';
import { COMBAT } from './combat';

/** Act 4's bag (game_components §5, ADR-151): this many slots. A slot holds one kind of item (up to its stack); key items ride free. */
export const BAG_SLOTS = COMBAT.bag.slots;

/** Slots a bag (one entry per unit) takes. */
export function slotsUsed(inventory: string[]): number {
  return new Set(inventory.filter((id) => getItem(id).type !== 'key_item')).size;
}

/**
 * InventoryManager — item ownership and stacking rules.
 *
 * State lives in the store (`inventory: string[]`, one entry per unit, matching
 * the SaveData shape); this manager owns the rules: stack limits, non-stackable
 * uniqueness, what "using" an item means. Every mutation announces itself on
 * the event bus, which is how collect-objectives progress without the quest
 * system ever being called directly.
 *
 * In Act 4 the bag has 8 slots (ADR-151): a new kind of item needs a free
 * slot; more of one you already carry only needs room in its stack.
 */
export class InventoryManager {
  private static instance: InventoryManager | null = null;

  static getInstance(): InventoryManager {
    if (!InventoryManager.instance) InventoryManager.instance = new InventoryManager();
    return InventoryManager.instance;
  }

  static resetInstance(): void {
    InventoryManager.instance = null;
  }

  count(itemId: string): number {
    return useGameStore.getState().inventory.filter((id) => id === itemId).length;
  }

  has(itemId: string): boolean {
    return this.count(itemId) > 0;
  }

  /**
   * Add `count` units. All-or-nothing: if the stack limit would be exceeded
   * (or a non-stackable is already owned), nothing is added and false comes
   * back — a half-applied trade is worse than a refused one.
   */
  add(itemId: string, count = 1): boolean {
    const item = getItem(itemId); // throws on unknown id — content bug, be loud
    const current = this.count(itemId);

    const limit = item.stackable ? (item.max_stack ?? Infinity) : 1;
    if (current + count > limit) return false;
    if (!this.hasRoomFor(itemId)) return false;

    const { inventory, setInventory } = useGameStore.getState();
    setInventory([...inventory, ...Array<string>(count).fill(itemId)]);
    gameEvents.emit('item:added', { itemId, count });
    return true;
  }

  /** The bag's limit applies (Act 4). */
  limited(): boolean {
    return Boolean(useGameStore.getState().flags.act4);
  }

  /** Slots in use (key items ride free). */
  slotsUsed(): number {
    return slotsUsed(useGameStore.getState().inventory);
  }

  /** A new kind of item needs a free slot in Act 4; a key item or one already carried does not. */
  hasRoomFor(itemId: string): boolean {
    if (!this.limited() || getItem(itemId).type === 'key_item' || this.has(itemId)) return true;
    return this.slotsUsed() < BAG_SLOTS;
  }

  /**
   * Would this swap fit (a recipe, a trade, a container)? Removals first, then every addition, against the stacks
   * and, in Act 4, the slots.
   */
  fits(add: Record<string, number>, remove: Record<string, number> = {}): boolean {
    const bag = new Map<string, number>();
    for (const id of useGameStore.getState().inventory) bag.set(id, (bag.get(id) ?? 0) + 1);
    for (const [id, n] of Object.entries(remove)) bag.set(id, Math.max(0, (bag.get(id) ?? 0) - n));
    for (const [id, n] of Object.entries(add)) {
      const item = getItem(id);
      const limit = item.stackable ? (item.max_stack ?? Infinity) : 1;
      if ((bag.get(id) ?? 0) + n > limit) return false;
      bag.set(id, (bag.get(id) ?? 0) + n);
    }
    if (!this.limited()) return true;
    return [...bag].filter(([id, n]) => n > 0 && getItem(id).type !== 'key_item').length <= BAG_SLOTS;
  }

  /** Remove `count` units. All-or-nothing, like add. */
  remove(itemId: string, count = 1): boolean {
    getItem(itemId);
    if (this.count(itemId) < count) return false;

    const { inventory, setInventory } = useGameStore.getState();
    const next: string[] = [];
    let toRemove = count;
    for (const id of inventory) {
      if (id === itemId && toRemove > 0) {
        toRemove--;
        continue;
      }
      next.push(id);
    }
    setInventory(next);
    gameEvents.emit('item:removed', { itemId, count });
    return true;
  }

  /**
   * Consume one unit of a consumable: apply its stat effect, remove it.
   * Key items and equipment refuse — they are carried, not eaten.
   */
  use(itemId: string): boolean {
    const item = getItem(itemId);
    if (item.type !== 'consumable' || !this.has(itemId)) return false;
    gameEvents.emit('item:used', { itemId });

    if (item.effect) {
      // Only the stat portion — an item whose effect granted items would
      // re-enter this manager mid-mutation.
      const { item_add, item_remove, ...statEffect } = item.effect;
      StatsManager.getInstance().applyEffect(statEffect);
    }
    return this.remove(itemId, 1);
  }
}
