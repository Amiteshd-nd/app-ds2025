import { beforeEach, describe, expect, it, vi } from 'vitest';
import { gameEvents } from '../core/events';
import { DialogueManager } from '../systems/DialogueManager';
import { InventoryManager } from '../systems/InventoryManager';
import { QuestManager } from '../systems/QuestManager';
import { ReputationManager } from '../systems/ReputationManager';
import { SaveManager } from '../systems/SaveManager';
import { StatsManager } from '../systems/StatsManager';
import { useGameStore } from '../store';
import type { QuestFile } from '../utils/types';

const installLocalStorage = () => {
  const mem = new Map<string, string>();
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  };
};

beforeEach(() => {
  gameEvents.clear();
  QuestManager.resetInstance();
  ReputationManager.resetInstance();
  DialogueManager.resetInstance();
  InventoryManager.resetInstance();
  StatsManager.resetInstance();
  useGameStore.getState().reset();
  installLocalStorage();
});

const quests = () => useGameStore.getState().quests;

describe('QuestManager', () => {
  it('starts a quest and emits quest:started', () => {
    const started = vi.fn();
    gameEvents.on('quest:started', started);
    expect(QuestManager.getInstance().start('q_act0_arrival')).toBe(true);
    expect(quests().active.q_act0_arrival).toEqual([]);
    expect(started).toHaveBeenCalledWith({ questId: 'q_act0_arrival' });
  });

  it('refuses to start a quest twice', () => {
    const qm = QuestManager.getInstance();
    expect(qm.start('q_act0_arrival')).toBe(true);
    expect(qm.start('q_act0_arrival')).toBe(false);
  });

  it('throws loudly on an unknown quest id', () => {
    expect(() => QuestManager.getInstance().start('ghost_quest')).toThrow(/Unknown quest/);
  });

  it('honors prerequisites on an injected quest graph', () => {
    const graph: Record<string, QuestFile> = {
      first: { id: 'first', title: 'A', description: '', chapter: 1,
        district: 'airport', type: 'search',
        objectives: [{ id: 'o', text: '', type: 'reach', target: 'z' }], rewards: { xp: 0 } },
      second: { id: 'second', title: 'B', description: '', chapter: 1,
        district: 'airport', type: 'investigation',
        prerequisite_quests: ['first'],
        objectives: [{ id: 'o', text: '', type: 'reach', target: 'z2' }], rewards: { xp: 0 } },
    };
    const qm = new QuestManager(graph);
    expect(qm.start('second')).toBe(false); // first not completed
    qm.start('first');
    gameEvents.emit('zone:reached', { zoneId: 'z', districtId: 'x' }); // completes first
    expect(qm.isCompleted('first')).toBe(true);
    expect(qm.start('second')).toBe(true);
    qm.dispose();
  });

  it('a dialogue objective completes when that conversation ends', () => {
    QuestManager.getInstance().start('q_act0_arrival');
    const d = DialogueManager.getInstance();
    d.start('dlg_chai_anna');
    d.choose(2); // "Not now" — declining still counts as having talked (fail-forward)
    d.end();     // bus emission progresses the objective
    expect(quests().active.q_act0_arrival).toContain('talk_anna');
  });

  it('a collect objective completes on pickup, and optionals never block', () => {
    QuestManager.getInstance().start('q_act0_arrival');
    InventoryManager.getInstance().add('cutting_chai');
    expect(quests().active.q_act0_arrival).toContain('buy_chai');
    expect(quests().completed).toEqual([]); // required objectives still open
  });

  it('M0: chai → UPI spend → bus stop completes the arrival quest and opens Whitefield', () => {
    const objective = vi.fn();
    const completed = vi.fn();
    const spent = vi.fn();
    gameEvents.on('quest:objective', objective);
    gameEvents.on('quest:completed', completed);
    gameEvents.on('wallet:spent', spent);

    QuestManager.getInstance().start('q_act0_arrival');

    // Chai Anna: buy the chai (₹20 through spend(), +chai item, -2 stress).
    const d = DialogueManager.getInstance();
    const view = d.start('dlg_chai_anna');
    expect(view.choices[0].enabled).toBe(true); // ₹35,000 covers ₹20
    d.choose(0);
    d.advance();
    d.end();
    expect(spent).toHaveBeenCalledWith({ amount: 20, reason: 'effect', balance: 34_980 });

    // Find the Vayu Vajra stop.
    gameEvents.emit('zone:reached', { zoneId: 'zone_exit', districtId: 'airport' });

    const state = useGameStore.getState();
    expect(state.quests.completed).toEqual(['q_act0_arrival']);
    expect(state.quests.active).toEqual({});
    expect(objective).toHaveBeenCalledTimes(3); // talk, buy (optional), reach
    expect(completed).toHaveBeenCalledWith({ questId: 'q_act0_arrival' });

    // Rewards + flag.
    expect(state.skills.city_survival.xp).toBe(65); // 15 from the chai line + 50 quest
    expect(state.flags.act0_arrived).toBe(true);
    expect(ReputationManager.getInstance().total).toBe(10);

    // Whitefield is gated on this quest, so the exit is now open.
    expect(ReputationManager.getInstance().canEnter('whitefield_street')).toBe(true);

    // And the purchase really happened.
    expect(state.stats.wallet).toBe(34_980);
    expect(InventoryManager.getInstance().has('cutting_chai')).toBe(true);
  });

  it('a chai the player cannot afford is shown locked, not hidden', () => {
    useGameStore.getState().adjustWallet(-35_000);
    const view = DialogueManager.getInstance().start('dlg_chai_anna');
    expect(view.choices[0].enabled).toBe(false);
    expect(view.choices[0].lockedReason).toBe('Needs ₹20');
    expect(view.choices[1].enabled).toBe(true); // directions are free — fail-forward
    expect(() => DialogueManager.getInstance().choose(0)).toThrow(/locked/);
  });

  it('a completed quest cannot be restarted', () => {
    const qm = QuestManager.getInstance();
    qm.start('q_act0_arrival');
    const d = DialogueManager.getInstance();
    d.start('dlg_chai_anna'); d.choose(2); d.end();
    gameEvents.emit('zone:reached', { zoneId: 'zone_exit', districtId: 'airport' });
    expect(qm.isCompleted('q_act0_arrival')).toBe(true);
    expect(qm.start('q_act0_arrival')).toBe(false);
  });

  it('quest progress and inventory survive a save/restore round trip', () => {
    QuestManager.getInstance().start('q_act0_arrival');
    InventoryManager.getInstance().add('cutting_chai');
    const d = DialogueManager.getInstance();
    d.start('dlg_chai_anna'); d.choose(2); d.end();

    expect(SaveManager.getInstance().save({ districtId: 'airport', x: 1, y: 2 })).toBe(true);
    useGameStore.getState().reset();
    expect(useGameStore.getState().inventory).toEqual([]);

    expect(SaveManager.getInstance().restore()).toBe(true);
    const state = useGameStore.getState();
    expect(state.inventory).toContain('cutting_chai');
    expect(state.quests.active.q_act0_arrival).toEqual(
      expect.arrayContaining(['talk_anna', 'buy_chai']),
    );
  });

  it('resetInstance unsubscribes — a dead manager reacts to nothing', () => {
    QuestManager.getInstance().start('q_act0_arrival');
    QuestManager.resetInstance();
    gameEvents.emit('zone:reached', { zoneId: 'zone_exit', districtId: 'airport' });
    // Objective untouched: the store still has the quest active and empty.
    expect(quests().active.q_act0_arrival).toEqual([]);
  });
});
