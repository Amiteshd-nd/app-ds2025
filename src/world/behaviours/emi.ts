import { gameEvents } from '../../core/events';
import { useGameStore } from '../../store';
import { StatsManager } from '../../systems/StatsManager';
import { EMI_INSTALMENT, EMI_MONTHS } from '../../utils/constants';
import type { Behaviour } from './index';

/** Set by Noor's EMI deal; the instalments start on the next salary. */
export const FLAG_EMI_STARTED = 'emi_started';
export const FLAG_SCOOTER_PAID_OFF = 'scooter_paid_off';
/** Instalments still to pay; absent = no EMI. */
export const EMI_LEFT = 'emi_left';

/**
 * emi — the scooter's instalments (story 2.1, ADR-126): when a salary lands,
 * one instalment leaves through spend() (the UPI ledger shows "Noor Motors
 * EMI"); when the wallet cannot cover it the instalment is skipped with a
 * toast and some stress — the count does not move, so it waits for the next
 * salary. Ten instalments → `scooter_paid_off`.
 */
export const emi: Behaviour = {
  attach() {
    const store = () => useGameStore.getState();
    const start = () => { if (store().counters[EMI_LEFT] === undefined && !store().flags[FLAG_SCOOTER_PAID_OFF]) store().setCounter(EMI_LEFT, EMI_MONTHS); };
    if (store().flags[FLAG_EMI_STARTED]) start();
    const onFlag = ({ flag, value }: { flag: string; value: boolean }) => { if (flag === FLAG_EMI_STARTED && value) start(); };
    const onEarned = ({ reason }: { reason: string }) => {
      if (reason !== 'salary') return;
      const left = store().counters[EMI_LEFT];
      if (left === undefined || left <= 0) return;
      if (StatsManager.getInstance().spend(EMI_INSTALMENT, 'emi', 'Noor Motors EMI')) {
        const next = left - 1;
        store().setCounter(EMI_LEFT, next);
        if (next === 0) { store().setFlag(FLAG_SCOOTER_PAID_OFF, true); gameEvents.emit('ui:toast', { text: 'Last EMI paid. The scooter is yours.', icon: 'upi' }); }
        else gameEvents.emit('ui:toast', { text: `EMI paid. ${next} to go.`, icon: 'upi' });
      } else {
        StatsManager.getInstance().adjust('stress', 5);
        gameEvents.emit('ui:toast', { text: 'EMI bounced. Noor will call.' });
      }
    };
    const offs = [gameEvents.on('flag:set', onFlag), gameEvents.on('wallet:earned', onEarned)];
    return () => offs.forEach((f) => f());
  },
};
