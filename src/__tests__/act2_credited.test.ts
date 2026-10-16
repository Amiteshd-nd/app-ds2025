import { beforeEach, describe, expect, it } from 'vitest';
import { gameEvents } from '../core/events';
import { DIALOGUE, DISTRICTS, NEGOTIATIONS } from '../data';
import { DialogueManager } from '../systems/DialogueManager';
import { MapManager, FLAG } from '../systems/MapManager';
import { QuestManager } from '../systems/QuestManager';
import { ReputationManager } from '../systems/ReputationManager';
import { SaveManager } from '../systems/SaveManager';
import { FUEL_COUNTER, StatsManager } from '../systems/StatsManager';
import { TimeManager } from '../systems/TimeManager';
import { useGameStore } from '../store';
import { meters } from '../ui/hud/viewModel';
import { missingGlyphs } from '../ui/kit/text';
import { EMI_DOWN, EMI_INSTALMENT, EMI_MONTHS, PAYDAY_DAYS, SALARY, SALARY_DAYS, STARTING_WALLET } from '../utils/constants';
import { emi, EMI_LEFT, FLAG_EMI_STARTED, FLAG_SCOOTER_PAID_OFF } from '../world/behaviours/emi';
import { salaryCountdown, FLAG_FIRST_SALARY, FLAG_FLAT_SIGNED, SALARY_DAYS_LEFT } from '../world/behaviours/salaryCountdown';

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
  useGameStore.getState().reset();
});

const store = () => useGameStore.getState();
const time = () => TimeManager.getInstance();

describe('paydays (story 2.1 F1, ADR-126)', () => {
  it('after the first salary the next one is a month away, and the two-wheeler tutorial shows once', () => {
    const toasts: string[] = [];
    gameEvents.on('ui:toast', ({ text }) => toasts.push(text));
    const off = salaryCountdown.attach({} as never) as () => void;
    store().setFlag(FLAG_FLAT_SIGNED, true);
    for (let i = 0; i < SALARY_DAYS; i++) time().sleep();
    expect(store().flags[FLAG_FIRST_SALARY]).toBe(true);
    expect(store().counters[SALARY_DAYS_LEFT]).toBe(PAYDAY_DAYS);
    expect(toasts.filter((t) => t.includes('two-wheeler'))).toHaveLength(1);
    const wallet = store().stats.wallet;
    for (let i = 0; i < PAYDAY_DAYS; i++) time().sleep();
    expect(store().stats.wallet).toBe(wallet + SALARY);
    expect(toasts.filter((t) => t.includes('two-wheeler'))).toHaveLength(1);
    off();
  });
});

describe('the EMI (story 2.1 F3/F6)', () => {
  it('starts at ten on the deal, pays one instalment per salary, bounces when short, and ends in scooter_paid_off', () => {
    const off = emi.attach({} as never) as () => void;
    store().setFlag(FLAG_EMI_STARTED, true);
    expect(store().counters[EMI_LEFT]).toBe(EMI_MONTHS);
    const stats = StatsManager.getInstance();
    stats.earn(SALARY, 'salary', 'Salary');
    expect(store().counters[EMI_LEFT]).toBe(EMI_MONTHS - 1);
    expect(store().transactions[store().transactions.length - 1]).toMatchObject({ amount: -EMI_INSTALMENT, label: 'Noor Motors EMI' });
    // Broke: the instalment bounces, the count holds, stress rises.
    stats.spend(store().stats.wallet, 'test');
    const stress = store().stats.stress;
    stats.earn(1000, 'salary', 'Salary');
    expect(store().counters[EMI_LEFT]).toBe(EMI_MONTHS - 1);
    expect(store().stats.stress).toBe(stress + 5);
    for (let i = 0; i < EMI_MONTHS - 1; i++) stats.earn(SALARY, 'salary', 'Salary');
    expect(store().counters[EMI_LEFT]).toBe(0);
    expect(store().flags[FLAG_SCOOTER_PAID_OFF]).toBe(true);
    // Other income never triggers an instalment.
    stats.earn(500, 'quest:x');
    expect(store().counters[EMI_LEFT]).toBe(0);
    off();
  });

  it("Noor's EMI choice spends the down payment, hands over the keys and four litres", () => {
    const dm = DialogueManager.getInstance();
    dm.start('dlg_noor');
    dm.choose(1);
    expect(store().stats.wallet).toBe(STARTING_WALLET - EMI_DOWN);
    expect(store().flags.scooter_owned).toBe(true);
    expect(store().flags.emi_started).toBe(true);
    expect(store().counters[FUEL_COUNTER]).toBe(30);
  });

  it("Noor's haggle is slick: floor ₹35,000, lowball refused", () => {
    const neg = NEGOTIATIONS.neg_scooter;
    expect(neg.temperament).toBe('slick');
    expect(neg.terms[0]).toMatchObject({ ask: 38000, floor: 35000 });
    expect(neg.counters.some((c) => c.tactic === 'lowball')).toBe(true);
    expect(neg.on_deal!.flags).toContain('scooter_owned');
  });
});

describe('fuel and the scooter (story 2.1 F4/F5)', () => {
  it('the fuel effect fills the tank and clamps at 100; the bunk refuses before you own a scooter', () => {
    StatsManager.getInstance().applyEffect({ fuel: 30 });
    StatsManager.getInstance().applyEffect({ fuel: 100 });
    expect(store().counters[FUEL_COUNTER]).toBe(100);
    StatsManager.getInstance().applyEffect({ fuel: -120 });
    expect(store().counters[FUEL_COUNTER]).toBe(0);
    const dm = DialogueManager.getInstance();
    expect(dm.start('dlg_bunk_attendant').choices).toHaveLength(0); // "Buy the scooter first"
    dm.end();
    store().setFlag('scooter_owned', true);
    expect(dm.start('dlg_bunk_attendant').choices.map((c) => c.text)[0]).toContain('Full tank');
  });

  it('a ride needs the scooter, a visited pocket and enough fuel; it spends fuel, not fare', () => {
    const mm = MapManager.getInstance();
    store().setActiveDistrict('whitefield_street');
    store().setFlag(FLAG.visited('office_gate'), true);
    expect(mm.scooterRide('office_gate')).toBeNull();
    store().setFlag('scooter_owned', true);
    const ride = mm.scooterRide('office_gate')!;
    expect(ride.fuel).toBeGreaterThanOrEqual(1);
    expect(ride.minutes).toBeGreaterThanOrEqual(2);
    expect(ride.enough).toBe(false);
    expect(mm.rideScooter('office_gate')).toBe(false);
    store().setCounter(FUEL_COUNTER, 100);
    expect(mm.rideScooter('office_gate')).toBe(true);
    expect(store().counters[FUEL_COUNTER]).toBe(100 - ride.fuel);
    expect(store().flags.scooter_ridden).toBe(true);
    expect(mm.scooterRide('hill_flat')).toBeNull(); // interiors are not destinations
  });

  it('the fuel gauge is a contextual meter: present only when the caller passes the tank', () => {
    const stats = { health: 100, food: 100, stress: 0 };
    expect(meters(stats, 'auto')).toEqual([]);
    expect(meters(stats, 'auto', 15)).toEqual([{ id: 'fuel', icon: 'fuel', blocks: 1, critical: true }]);
  });
});

describe('the showroom pocket', () => {
  it('is reachable by bus from the street, walks to the gate, lists its behaviours, and its lines are drawable', () => {
    const d = DISTRICTS.scooter_showroom;
    expect(DISTRICTS.whitefield_street.exits!.some((e) => e.to === 'scooter_showroom')).toBe(true);
    expect(d.exits!.map((e) => e.to).sort()).toEqual(['office_gate', 'whitefield_street']);
    expect(d.behaviours).toEqual(expect.arrayContaining(['fuelSpots', 'emi', 'salaryCountdown']));
    expect(d.fuelSpots).toEqual(['bunk_zone']);
    for (const id of ['dlg_noor', 'dlg_bunk_attendant']) for (const node of Object.values(DIALOGUE[id].nodes)) {
      expect(missingGlyphs(node.text), id).toEqual([]);
      for (const c of node.choices ?? []) expect(missingGlyphs(c.text), id).toEqual([]);
    }
  });
});
