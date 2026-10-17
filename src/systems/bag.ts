import type { DialogueChoice, DialogueFile, DialogueNode, ItemDef } from '../utils/types';
import { COMBAT, readyEffect, readyFlag, weaponFor } from './combat';

/** The bag's conversation id. */
export const BAG_DIALOGUE = 'bag:';

/**
 * The bag (game_components §5, Act 4 plan step S4, ADR-151) — a conversation
 * built from what you carry, like the bench and the trading table: I / TAB /
 * the BAG plate opens `bag:` (`virtualDialogue`). One pill per kind of item;
 * each opens what you can do with it:
 *
 *   use      a consumable with an effect ("Eat it.", "Bandage the cut.")
 *   ready    a throwable (Act 4): Q / THROW sends it
 *   leave    put the whole stack down to free a slot (Act 4)
 *
 * Weapons are not chosen: you swing the best you carry (`combat.order`), and
 * the bag says which. In Act 4 the header counts the 8 slots; key items ride
 * free. Pure: no store, no engine.
 */
export function bagDialogue(inventory: string[], flags: Record<string, boolean>, items: Record<string, ItemDef>): DialogueFile {
  const act4 = Boolean(flags.act4);
  const counts = new Map<string, number>();
  for (const id of inventory) counts.set(id, (counts.get(id) ?? 0) + 1);
  const kinds = [...counts.keys()].filter((id) => items[id] && items[id].type !== 'key_item');
  const keys = [...counts.keys()].filter((id) => items[id]?.type === 'key_item');
  const carried = (id: string) => counts.has(id);
  const hand = act4 ? weaponFor(carried) : null;

  const head = kinds.length ? (act4 ? `Your bag: ${kinds.length} of ${COMBAT.bag.slots} slots.` : 'Your bag.') : 'Your bag is empty.';
  const extra = keys.length ? ` Plus ${keys.map((k) => items[k].name).join(', ')}, which ${keys.length === 1 ? 'takes' : 'take'} no slot.` : '';
  const label = (id: string) => {
    const n = counts.get(id)!;
    const tags = [flags[readyFlag(id)] && act4 && COMBAT.throws[id] ? 'ready' : '', hand?.id === id ? 'in hand' : ''].filter(Boolean);
    return `${items[id].name}${n > 1 ? ` ×${n}` : ''}${tags.length ? ` (${tags.join(', ')})` : ''}`;
  };

  const nodes: Record<string, DialogueNode> = {
    start: {
      text: `${head}${extra}`,
      choices: [...kinds.map((id): DialogueChoice => ({ text: label(id), next: `item_${id}` })), { text: 'Close.', next: 'closed' }],
    },
    closed: { text: '(You zip it shut.)', effect: { cue: 'a.sfx.world.bag_zip' } },
    used: { text: '(Done.)' },
    readied: { text: '(In your hand, ready to throw. Q or THROW.)' },
    left: { text: '(You leave it behind.)' },
  };
  for (const id of kinds) {
    const item = items[id];
    const n = counts.get(id)!;
    const choices: DialogueChoice[] = [];
    if (item.type === 'consumable' && item.effect) choices.push({ text: item.use_verb ?? 'Use it.', next: 'used', effect: { item_use: id, cue: /Drink/.test(item.use_verb ?? '') ? 'a.sfx.player.drink' : /Eat/.test(item.use_verb ?? '') ? 'a.sfx.player.eat' : undefined } });
    if (act4 && COMBAT.throws[id]) choices.push({ text: 'Ready it to throw.', next: 'readied', unlessFlag: readyFlag(id), lockedText: 'Ready', effect: { flags: readyEffect(id, flags) } });
    if (act4 && item.tradeable !== false) choices.push({ text: n > 1 ? `Leave all ${n} here.` : 'Leave it here.', next: 'left', effect: { items_remove: { [id]: n }, flags: flags[readyFlag(id)] ? { [readyFlag(id)]: false } : undefined, cue: 'a.sfx.player.drop' } });
    choices.push({ text: 'Back.', next: 'start' });
    const swing = hand?.id === id ? ' You swing it when you fight (SPACE or HIT).' : '';
    nodes[`item_${id}`] = { text: `${item.description}${swing}`, choices };
  }
  // Effects with an undefined key are tidier gone (the validator reads every key).
  for (const node of Object.values(nodes)) for (const c of node.choices ?? []) if (c.effect) for (const k of Object.keys(c.effect) as Array<keyof typeof c.effect>) if (c.effect[k] === undefined) delete c.effect[k];
  return { id: BAG_DIALOGUE, speaker: 'Your bag', portrait: 'npc_placeholder', nodes };
}
