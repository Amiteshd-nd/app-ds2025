import { ACT4_DAY } from './stability';

/**
 * "My Bangalore" (landmarks doc §3.4, story 4.6, ADR-158): what the end card says about the run — pure, from the
 * save. Days in the city, days the city was shut, people you met, ₹ that went on chai (the UPI ledger), City
 * Moments photographed, who came through with you, and the ending.
 */
export interface MyBangalore {
  daysInCity: number;
  daysShut: number;
  peopleMet: number;
  chaiRupees: number;
  photos: number;
  keptAlive: string[];
  ending: 'evacuate' | 'hold' | 'groundzero' | null;
}

export interface SaveLike {
  clock: { day: number };
  counters: Record<string, number>;
  met: string[];
  flags: Record<string, boolean>;
  transactions: Array<{ amount: number; label: string; reason: string }>;
}

/** Who came through, by the flags that kept them (Deepa's medicine, the two rescues, Ananya unless strained). */
const KEPT: Array<[string, (f: Record<string, boolean>) => boolean]> = [
  ['Deepa', (f) => Boolean(f.deepa_medicine)],
  ['Kumar', (f) => Boolean(f.kumar_saved)],
  ['Raju', (f) => Boolean(f.raju_saved)],
  ['Ananya', (f) => !f.ananya_strained],
];

export function myBangalore(s: SaveLike): MyBangalore {
  const chai = s.transactions.filter((t) => /chai/i.test(`${t.label} ${t.reason}`)).reduce((sum, t) => sum + Math.abs(t.amount), 0);
  const ending = s.flags.ending_groundzero ? 'groundzero' : s.flags.ending_hold ? 'hold' : s.flags.ending_evacuate ? 'evacuate' : null;
  return {
    daysInCity: s.clock.day,
    daysShut: s.counters[ACT4_DAY] ?? 0,
    peopleMet: s.met.length,
    chaiRupees: chai,
    photos: Object.keys(s.flags).filter((f) => f.startsWith('photo_') && s.flags[f]).length,
    keptAlive: KEPT.filter(([, kept]) => kept(s.flags)).map(([name]) => name),
    ending,
  };
}

const ENDING_LINE: Record<NonNullable<MyBangalore['ending']>, string> = {
  evacuate: 'You got out.',
  hold: 'You held the glass house.',
  groundzero: 'You ended it where it started.',
};

/** The card's lines, in order (the scene draws them; tests read them). */
export function myBangaloreLines(m: MyBangalore): string[] {
  const days = (n: number) => (n === 1 ? '1 day' : `${n} days`);
  return [
    `${days(m.daysInCity)} in Bangalore.${m.daysShut ? ` ${m.daysShut === m.daysInCity ? 'All' : m.daysShut} of them with the city shut.` : ''}`,
    m.peopleMet === 0 ? 'Nobody you knew by name.' : m.peopleMet === 1 ? 'One person you knew by name.' : `${m.peopleMet} people you knew by name.`,
    m.chaiRupees ? `₹${m.chaiRupees.toLocaleString('en-IN')} on chai.` : 'Not a single chai.',
    m.photos === 0 ? 'No City Moments photographed.' : m.photos === 1 ? 'One City Moment photographed.' : `${m.photos} City Moments photographed.`,
    m.keptAlive.length ? `With you at the end: ${m.keptAlive.join(', ')}.` : 'Nobody you saved made it to the end with you.',
    m.ending ? ENDING_LINE[m.ending] : '',
  ].filter(Boolean);
}
