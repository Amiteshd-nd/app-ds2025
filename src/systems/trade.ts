import type { DialogueChoice, DialogueFile, DialogueNode, DistrictDef, ItemDef } from '../utils/types';

/**
 * The base's conversations, built from data (Act 4 plan §3.8–3.9, ADR-149):
 * the bench crafts from `recipes.json`, a trader deals from `barter.json`, a
 * container is searched from `loot.json`, the stock shelf feeds the base's
 * counters. Each is an ordinary dialogue tree — the conversation box, its
 * locks (`requiresItems`, `requires`) and its effects (`items_add`,
 * `items_remove`, `counters`, `flags`) do the rest. Pure: no store, no engine.
 *
 *   craft:bench        the kitchen table
 *   trade:<trader>     a trader's deals
 *   search:<lootId>    a container, found once (`looted:<id>`)
 *   base:<district>    the stock shelf (food, water, fuel)
 */

export interface Recipe { id: string; name: string; needs: Record<string, number>; makes: Record<string, number>; line: string }
export interface Deal { id: string; give: Record<string, number>; get: Record<string, number>; better: Record<string, number> }
export interface Trader { name: string; temperament: string; margin: number; haggleTier: number; greeting: string; deals: Deal[] }
export interface Loot { label: string; items: Record<string, number> }

/** The base's stock, as store counters. */
export const STOCK = { food: 'stock_food', water: 'stock_water', fuel: 'stock_fuel' } as const;
/** What a deposited item adds to the stock. */
export const STOCK_ITEMS: Array<{ item: string; counter: string; amount: number }> = [
  { item: 'food_packet', counter: STOCK.food, amount: 1 },
  { item: 'canned_food', counter: STOCK.food, amount: 2 },
  { item: 'water_bottle', counter: STOCK.water, amount: 1 },
  { item: 'fuel_can', counter: STOCK.fuel, amount: 1 },
];

export const lootedFlag = (lootId: string): string => `looted:${lootId}`;

/** "2 cloth, 1 bottle" — what a bag of items reads as. */
export function listItems(bag: Record<string, number>, items: Record<string, ItemDef>): string {
  return Object.entries(bag).map(([id, n]) => `${n > 1 ? `${n} × ` : ''}${items[id]?.name ?? id}`).join(', ');
}

/** The value of a bag of items in barter units (1 = a water bottle). */
export const valueOf = (bag: Record<string, number>, items: Record<string, ItemDef>): number =>
  Object.entries(bag).reduce((v, [id, n]) => v + (items[id]?.act4_value ?? 0) * n, 0);

const file = (id: string, speaker: string, nodes: Record<string, DialogueNode>): DialogueFile => ({ id, speaker, portrait: 'npc_placeholder', nodes });

export function craftDialogue(recipes: Recipe[], items: Record<string, ItemDef>): DialogueFile {
  const nodes: Record<string, DialogueNode> = {
    start: {
      text: "The kitchen table that didn't fit. It fits now. What do you make?",
      choices: [
        ...recipes.map((r): DialogueChoice => ({
          text: `${r.name}: ${listItems(r.needs, items)}`,
          next: `made_${r.id}`,
          requiresItems: r.needs,
          lockedText: `Need ${listItems(r.needs, items)}`,
          effect: { items_remove: r.needs, items_add: r.makes },
        })),
        { text: 'Nothing.', next: 'done' },
      ],
    },
    done: { text: '(You leave the table as it is.)' },
  };
  for (const r of recipes) nodes[`made_${r.id}`] = { text: `${r.line} (${listItems(r.makes, items)})` };
  return file('craft:bench', 'Kitchen table', nodes);
}

export function tradeDialogue(id: string, t: Trader, items: Record<string, ItemDef>): DialogueFile {
  const nodes: Record<string, DialogueNode> = {
    start: {
      text: t.greeting,
      choices: [
        ...t.deals.map((d): DialogueChoice => ({
          text: `${listItems(d.give, items)} → ${listItems(d.get, items)}`,
          next: `deal_${d.id}`,
          requiresItems: d.give,
          lockedText: `You don't have ${listItems(d.give, items)}`,
        })),
        { text: 'Nothing today.', next: 'bye' },
      ],
    },
    bye: { text: `${t.name} shrugs. "You'll be back."` },
    thanks: { text: `"Pleasure, boss." ${t.name} packs it away without looking at you.` },
  };
  for (const d of t.deals) {
    const improved = valueOf(d.better, items) > valueOf(d.get, items);
    nodes[`deal_${d.id}`] = {
      text: `"${listItems(d.give, items)} for ${listItems(d.get, items)}. Fair."`,
      choices: [
        { text: 'Deal.', next: 'thanks', requiresItems: d.give, effect: { items_remove: d.give, items_add: d.get } },
        ...(improved ? [{ text: 'Haggle.', next: `haggle_${d.id}`, requires: { skill: 'city_survival' as const, level: t.haggleTier } }] : []),
        { text: 'Leave it.', next: 'bye' },
      ],
    };
    if (improved) nodes[`haggle_${d.id}`] = {
      text: `(${t.name} sucks his teeth.) "You've been in this city too long." ${listItems(d.better, items)}, then.`,
      choices: [
        { text: 'Deal.', next: 'thanks', requiresItems: d.give, effect: { items_remove: d.give, items_add: d.better } },
        { text: 'Leave it.', next: 'bye' },
      ],
    };
  }
  return file(id, t.name, nodes);
}

export function searchDialogue(id: string, lootId: string, loot: Loot, items: Record<string, ItemDef>): DialogueFile {
  return file(id, 'You', {
    start: {
      text: `You search ${loot.label}: ${listItems(loot.items, items)}.`,
      choices: [
        { text: 'Take it.', next: 'taken', effect: { items_add: loot.items, flags: { [lootedFlag(lootId)]: true } } },
        { text: 'Leave it.', next: 'left' },
      ],
    },
    taken: { text: '(Into the bag.)' },
    left: { text: '(You leave it where it is.)' },
  });
}

export function baseDialogue(id: string, district: DistrictDef, counters: Record<string, number>, items: Record<string, ItemDef>): DialogueFile {
  const n = (c: string) => counters[c] ?? 0;
  const lamp = n(STOCK.fuel) > 0 ? 'The generator has fuel: the lamp will burn tonight.' : 'No fuel. The lamp will be dark tonight.';
  return file(id, district.name, {
    start: {
      text: `The stock: food ${n(STOCK.food)} · water ${n(STOCK.water)} · fuel ${n(STOCK.fuel)}. A night here takes one of each. ${lamp}`,
      choices: [
        ...STOCK_ITEMS.map((s): DialogueChoice => ({
          text: `Put in: ${items[s.item]?.name ?? s.item}`,
          next: 'stocked',
          requiresItems: { [s.item]: 1 },
          lockedText: `No ${items[s.item]?.name ?? s.item}`,
          effect: { items_remove: { [s.item]: 1 }, counters: { [s.counter]: s.amount } },
        })),
        { text: 'Leave it.', next: 'done' },
      ],
    },
    stocked: { text: '(On the shelf.)' },
    done: { text: '(You count it again. It is still not enough.)' },
  });
}

/** What a night at a base does (plan §3.9): one of each from the stock; the lamp is lit while there is fuel, unless it fails tonight. */
export function baseNight(counters: Record<string, number>, nightHere: number, lampFailsOnNight?: number): { take: Record<string, number>; ate: boolean; drank: boolean; lit: boolean; failed: boolean } {
  const has = (c: string) => (counters[c] ?? 0) > 0;
  const ate = has(STOCK.food), drank = has(STOCK.water), fuel = has(STOCK.fuel);
  const failed = lampFailsOnNight !== undefined && nightHere === lampFailsOnNight;
  const take: Record<string, number> = {};
  if (ate) take[STOCK.food] = -1;
  if (drank) take[STOCK.water] = -1;
  if (fuel) take[STOCK.fuel] = -1;
  return { take, ate, drank, lit: fuel && !failed, failed };
}

/** Is this a dialogue the game builds from data (and does its source exist)? */
export function virtualSource(id: string, d: { recipes: Recipe[]; traders: Record<string, Trader>; loot: Record<string, Loot>; districts: Record<string, DistrictDef> }): boolean | null {
  if (id === 'craft:bench') return d.recipes.length > 0;
  const [kind, key] = [id.slice(0, id.indexOf(':')), id.slice(id.indexOf(':') + 1)];
  if (kind === 'trade') return Boolean(d.traders[key]);
  if (kind === 'search') return Boolean(d.loot[key]);
  if (kind === 'base') return Boolean(d.districts[key]?.base);
  return null;
}
