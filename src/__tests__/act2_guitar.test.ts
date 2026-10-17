import { beforeEach, describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gameEvents } from '../core/events';
import { DIALOGUE, DISTRICTS, MINIGAMES, QUESTS, SCENES } from '../data';
import { DialogueManager } from '../systems/DialogueManager';
import { FLAG, MapManager } from '../systems/MapManager';
import { PhoneManager } from '../systems/PhoneManager';
import { QuestManager } from '../systems/QuestManager';
import { ReputationManager } from '../systems/ReputationManager';
import { SaveManager } from '../systems/SaveManager';
import { StatsManager } from '../systems/StatsManager';
import { TimeManager } from '../systems/TimeManager';
import {
  CLEAN_WINDOW_MS, HIT_WINDOW_MS, beatMs, hits, notesFor, outcome, passShare, passed, pick, press, songMs, sweep,
  type RhythmLesson, type RhythmSet,
} from '../systems/rhythm';
import { useGameStore } from '../store';
import { BEHAVIOURS } from '../world/behaviours';
import { FLAG_GUITAR_IN_STOCK, FLAG_GUITAR_PLAYED_TONIGHT, guitarNights } from '../world/behaviours/guitarNights';
import { FLAG_METRO_OPEN } from '../world/behaviours/metroFlags';
import { validateMinigames } from '../../scripts/validate-content.ts';

beforeEach(() => {
  (globalThis as Record<string, unknown>).localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  gameEvents.clear();
  TimeManager.resetInstance();
  StatsManager.resetInstance();
  QuestManager.resetInstance();
  SaveManager.resetInstance();
  ReputationManager.resetInstance();
  MapManager.resetInstance();
  DialogueManager.resetInstance();
  PhoneManager.resetInstance();
  useGameStore.getState().reset();
});

const store = () => useGameStore.getState();
const guitar = (): RhythmSet => MINIGAMES.guitar;
const lesson = (id: string): RhythmLesson => guitar().lessons.find((l) => l.id === id)!;

describe('the rhythm lane rules (story 2.3, ADR-131)', () => {
  it('lays a strum on every listed beat of every bar, after the count-in', () => {
    const g = lesson('g');
    const notes = notesFor(g);
    expect(notes).toHaveLength(g.bars * g.strums.length); // 16
    expect(notes[0].at).toBe(0);
    expect(notes[1].at).toBe(Math.round(2 * beatMs(g.bpm))); // beat 3
    expect(notes.every((n) => n.chord === 'G')).toBe(true);
    expect(songMs(g)).toBe(Math.round(g.bars * 4 * beatMs(g.bpm)));
    const d = notesFor(lesson('d'));
    expect(d.map((n) => n.chord).slice(0, 12)).toEqual(['G', 'G', 'G', 'C', 'C', 'C', 'D', 'D', 'D', 'G', 'G', 'G']);
  });

  it('a press near a note hits it (clean inside 60 ms), a press in empty air only buzzes, a passed window is a miss', () => {
    const notes = notesFor(lesson('g'));
    expect(press(notes, 0 + CLEAN_WINDOW_MS - 1)).toBe('clean');
    expect(press(notes, notes[1].at - HIT_WINDOW_MS + 1)).toBe('hit');
    expect(press(notes, notes[2].at - 500)).toBe('early');
    expect(hits(notes)).toBe(2);
    expect(sweep(notes, notes[3].at + HIT_WINDOW_MS + 1)).toBe(2); // notes 3 and 4 went by
    expect(notes[2].missed && notes[3].missed).toBe(true);
    expect(press(notes, notes[2].at)).toBe('early'); // a missed note cannot be hit late
  });

  it('70% learns a lesson; the busker\'s G shape makes the first one 60%', () => {
    const g = lesson('g');
    const notes = notesFor(g);
    notes.slice(0, 10).forEach((n) => { n.hit = true; });
    expect(passShare(g, {})).toBe(0.7);
    expect(passed(g, notes, {})).toBe(false); // 10/16 = 62.5%
    expect(passed(g, notes, { busker_tipped: true })).toBe(true);
    notes[10].hit = true; notes[11].hit = true;
    expect(passed(g, notes, {})).toBe(true); // 12/16 = 75%
  });

  it('offers the first lesson not learned, then the free strum; once a night', () => {
    expect(pick(guitar(), {})).toMatchObject({ kind: 'lesson', index: 0 });
    expect(pick(guitar(), { chord_g: true })).toMatchObject({ kind: 'lesson', index: 1 });
    expect(pick(guitar(), { chord_g: true, chord_c: true, chord_d: true, three_chords: true }).kind).toBe('free');
    expect(pick(guitar(), { [FLAG_GUITAR_PLAYED_TONIGHT]: true }).kind).toBe('tired');
  });

  it('a pass sets the flags and uses the night; a fail only uses the night; quitting changes nothing; the last lesson opens the clip', () => {
    const set = guitar();
    const first = pick(set, {}) as Exclude<ReturnType<typeof pick>, { kind: 'tired' }>;
    expect(outcome(set, first, true, {})).toMatchObject({ flags: ['chord_g', FLAG_GUITAR_PLAYED_TONIGHT], stress: -10 });
    expect(outcome(set, first, false, {})).toMatchObject({ flags: [FLAG_GUITAR_PLAYED_TONIGHT], stress: -10 });
    expect(outcome(set, first, 'quit', {})).toMatchObject({ flags: [], stress: 0 });
    const last = pick(set, { chord_g: true, chord_c: true }) as Exclude<ReturnType<typeof pick>, { kind: 'tired' }>;
    expect(outcome(set, last, true, {}).dialogue).toBe('dlg_guitar_clip');
    expect(outcome(set, last, true, { guitar_clip_decided: true }).dialogue).toBeUndefined();
    const free = pick(set, { chord_g: true, chord_c: true, chord_d: true, three_chords: true }) as Exclude<ReturnType<typeof pick>, { kind: 'tired' }>;
    expect(outcome(set, free, true, {})).toMatchObject({ flags: [FLAG_GUITAR_PLAYED_TONIGHT], stress: -5 });
  });
});

describe('Tuesday and the nights (guitarNights)', () => {
  it('the first sleep after the metro ride stocks the guitar; every sleep frees the guitar for another session', () => {
    const toasts: string[] = [];
    gameEvents.on('ui:toast', ({ text }) => toasts.push(text));
    const off = guitarNights.attach({} as never) as () => void;
    store().setFlag(FLAG_GUITAR_PLAYED_TONIGHT, true);
    TimeManager.getInstance().sleep();
    expect(store().flags[FLAG_GUITAR_IN_STOCK]).toBeUndefined(); // the metro ride has not happened
    expect(store().flags[FLAG_GUITAR_PLAYED_TONIGHT]).toBe(false);
    store().setFlag('act2_metro_done', true);
    TimeManager.getInstance().sleep();
    expect(store().flags[FLAG_GUITAR_IN_STOCK]).toBe(true);
    expect(toasts.some((t) => t.includes('Tuesday'))).toBe(true);
    off();
    expect(BEHAVIOURS.guitarNights).toBe(guitarNights);
    expect(DISTRICTS.hill_flat.behaviours).toContain('guitarNights');
  });

  it('the flat\'s guitar is an object and a rhythm trigger, both only once the guitar is owned', () => {
    const flat = DISTRICTS.hill_flat;
    expect(flat.objects).toContainEqual({ id: 'GUITAR_STAND', at: 'guitar_spot', requiresFlag: 'guitar_owned' });
    expect(flat.triggers).toContainEqual({ zone: 'guitar_zone', action: 'rhythm', minigame: 'guitar', requiresFlag: 'guitar_owned', once: false });
  });
});

describe('Church Street and the shop', () => {
  it('Maps offers METRO to Church Street once the shop has texted — before the first visit', () => {
    const mm = MapManager.getInstance();
    store().setActiveDistrict('cubbon_park');
    store().setFlag(FLAG_METRO_OPEN, true);
    expect(mm.fastTravel('church_street')).toBeNull();
    store().setFlag(FLAG_GUITAR_IN_STOCK, true);
    expect(mm.fastTravel('church_street')?.station).toBe('stn_mg_road');
    expect(store().flags[FLAG.visited('church_street')]).toBeUndefined();
    expect(DISTRICTS.church_street.exits?.find((e) => e.zone === 'bus_stop')).toMatchObject({ to: 'whitefield_street', transit: 'bus', fare: 35 });
  });

  it('the owner leaves Cubbon\'s pavement for his counter; the guitar is six-five, the chart is free', () => {
    expect([DISTRICTS.cubbon_park.npcs?.find((n) => n.id === 'npc_guitar_shop')?.unlessFlag].flat()).toContain(FLAG_GUITAR_IN_STOCK);
    expect(DISTRICTS.guitar_shop.npcs).toEqual([{ id: 'npc_guitar_shop', spawn: 'shop_counter' }]);
    const dlg = DIALOGUE.dlg_guitar_shop;
    expect(dlg.enter?.map((b) => b.flag)).toEqual(['guitar_owned', 'guitar_in_stock', 'guitar_wishlisted']);
    const take = dlg.nodes.tuesday.choices![0];
    expect(take.effect).toMatchObject({ wallet: -6500, item_add: 'guitar', flags: { guitar_owned: true } });
    expect(dlg.nodes.sold.effect?.item_add).toBe('chord_chart');
  });

  it('buys the guitar through spend(): ₹6,500 leaves the wallet', () => {
    store().setFlag(FLAG_GUITAR_IN_STOCK, true);
    const before = store().stats.wallet;
    const dm = DialogueManager.getInstance();
    dm.start('dlg_guitar_shop');
    expect(dm.view()?.nodeId).toBe('tuesday');
    dm.choose(0);
    expect(store().flags.guitar_owned).toBe(true);
    expect(store().stats.wallet).toBe(before - 6500);
    expect(store().inventory).toContain('guitar');
  });

  it('the scene is built and every flag it saves is set by something', () => {
    expect(SCENES.act2_guitar.status).toBe('P12');
    expect(QUESTS.q_act2_guitar.prerequisite_quests).toEqual(['q_act2_metro_opens']);
  });
});

describe('the phone in 2.3', () => {
  it('the wishlist note turns to READY, then disappears once the guitar is yours', () => {
    store().setFlag('guitar_wishlisted', true);
    expect(PhoneManager.getInstance().notes().map((n) => n.id)).toEqual(['note_guitar']);
    store().setFlag(FLAG_GUITAR_IN_STOCK, true);
    expect(PhoneManager.getInstance().notes().map((n) => n.id)).toEqual(['note_guitar_ready']);
    store().setFlag('guitar_owned', true);
    expect(PhoneManager.getInstance().notes().map((n) => n.id)).toEqual(['note_chords']);
  });

  it('an optional message (the walk she never took) does not hold back the guitar replies', () => {
    for (const f of ['ananya_number', 'amma_news_called', 'act1_done', 'guitar_clip_sent']) store().setFlag(f, true);
    PhoneManager.getInstance().deliver({ quiet: true });
    const got = store().phone.delivered;
    expect(got).toEqual(expect.arrayContaining(['ananya_1', 'ananya_3', 'ananya_4', 'ananya_5', 'ananya_6']));
    expect(got).not.toContain('ananya_2');
    expect(got).not.toContain('ananya_7');
  });
});

describe('mini-game validation', () => {
  const dataDir = join(__dirname, '../data');
  const files = readdirSync(join(dataDir, 'minigames')).map((f) => ({ file: f, basename: f.replace(/\.json$/, ''), json: JSON.parse(readFileSync(join(dataDir, 'minigames', f), 'utf8')) }));
  const districts = JSON.parse(readFileSync(join(dataDir, 'districts.json'), 'utf8'));
  const dialogueIds = new Set(Object.keys(DIALOGUE));

  it('the real data is clean', () => {
    expect(validateMinigames(files, dialogueIds, districts)).toEqual([]);
  });

  it('catches a bad tempo, an off-beat strum, a missing follow-up and a trigger naming nothing', () => {
    const bad = JSON.parse(JSON.stringify(files[0].json));
    bad.lessons[0].bpm = 400;
    bad.lessons[1].strums = [5];
    bad.afterLast.dialogue = 'dlg_nobody';
    const p = validateMinigames([{ file: 'guitar.json', basename: 'guitar', json: bad }], dialogueIds, [{ id: 'x', triggers: [{ zone: 'z', action: 'rhythm', minigame: 'piano' }] }]).join('\n');
    expect(p).toMatch(/bpm must be 40–200/);
    expect(p).toMatch(/strums must be beats 1–4/);
    expect(p).toMatch(/dlg_nobody/);
    expect(p).toMatch(/minigame "piano"/);
  });
});
