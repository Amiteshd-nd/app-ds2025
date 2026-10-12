import { gameEvents } from '../core/events';
import { CHATS, DISTRICTS, PHONE_APPS, QUESTS } from '../data';
import { useGameStore } from '../store';
import type { ChatMessage, ChatThread, DistrictDef, PhoneApp } from '../utils/types';
import { ReputationManager } from './ReputationManager';
import { settings } from './SettingsManager';

/**
 * PhoneManager — the phone's rules, no pixels (P6, game_components §3).
 *
 * Chats: a thread's messages arrive in order as their `after` flags get set;
 * each arrival buzzes (a toast) unless Do Not Disturb is on and it is not
 * story-critical. Apps unlock as their mechanic is taught (ADR-39). UPI reads
 * the wallet ledger. Maps turns districts' real-world anchors and the active
 * quest's destination into pins (map_navigation §2: one source of truth).
 * PhoneScene (the UI) only renders what this returns.
 */
export class PhoneManager {
  private static instance: PhoneManager | null = null;

  static getInstance(): PhoneManager {
    if (!PhoneManager.instance) PhoneManager.instance = new PhoneManager();
    return PhoneManager.instance;
  }

  static resetInstance(): void {
    PhoneManager.instance?.dispose();
    PhoneManager.instance = null;
  }

  private off: Array<() => void> = [];

  constructor(private threads: Record<string, ChatThread> = CHATS) {
    this.off.push(
      gameEvents.on('flag:set', ({ value }) => { if (value) this.deliver(); }),
      // Messages with no flag arrive on the first step into the world ("Landed? Call.").
      gameEvents.on('district:entered', () => this.deliver()),
    );
  }

  dispose(): void {
    this.off.forEach((f) => f());
    this.off = [];
  }

  // ── Chats ────────────────────────────────────────────────────────────────

  /** Deliver everything now due. Call on boot/new game/load as well as on flags. */
  deliver(options: { quiet?: boolean } = {}): ChatMessage[] {
    const store = useGameStore.getState();
    const delivered = new Set(store.phone.delivered);
    const fresh: Array<{ thread: ChatThread; message: ChatMessage }> = [];
    for (const thread of Object.values(this.threads)) {
      for (const message of thread.messages) {
        if (delivered.has(message.id)) continue;
        if (message.after && !store.flags[message.after]) break; // in order: wait for this one
        delivered.add(message.id);
        fresh.push({ thread, message });
      }
    }
    if (!fresh.length) return [];
    store.setPhone({ ...store.phone, delivered: [...delivered] });
    const dnd = settings().gameplay.doNotDisturb;
    for (const { thread, message } of fresh) {
      gameEvents.emit('phone:message', { threadId: thread.id, messageId: message.id, contact: thread.contact, text: message.text });
      if (message.from === 'them' && !options.quiet && (!dnd || message.critical)) {
        gameEvents.emit('ui:toast', { text: `📱 ${thread.contact}: ${message.text}` });
      }
    }
    return fresh.map((f) => f.message);
  }

  /** Threads with their delivered messages, most recent activity first. */
  threadsView(): Array<{ thread: ChatThread; messages: ChatMessage[]; unread: number }> {
    const { delivered, read } = useGameStore.getState().phone;
    const d = new Set(delivered), r = new Set(read);
    return Object.values(this.threads)
      .map((thread) => {
        const messages = thread.messages.filter((m) => d.has(m.id));
        return { thread, messages, unread: messages.filter((m) => m.from === 'them' && !r.has(m.id)).length, last: delivered.indexOf(messages[messages.length - 1]?.id ?? '') };
      })
      .filter((t) => t.messages.length)
      .sort((a, b) => b.last - a.last)
      .map(({ thread, messages, unread }) => ({ thread, messages, unread }));
  }

  unreadCount(): number {
    return this.threadsView().reduce((n, t) => n + t.unread, 0);
  }

  /** Opening a thread reads it. */
  markRead(threadId: string): void {
    const store = useGameStore.getState();
    const ids = (this.threads[threadId]?.messages ?? []).map((m) => m.id).filter((id) => store.phone.delivered.includes(id));
    store.setPhone({ ...store.phone, read: [...new Set([...store.phone.read, ...ids])] });
  }

  // ── Apps ─────────────────────────────────────────────────────────────────

  apps(): Array<PhoneApp & { unlocked: boolean }> {
    const { flags } = useGameStore.getState();
    return PHONE_APPS.map((app) => ({ ...app, unlocked: !app.unlock || Boolean(flags[app.unlock]) }));
  }

  // ── UPI ──────────────────────────────────────────────────────────────────

  upi() {
    const { stats, transactions } = useGameStore.getState();
    return { balance: stats.wallet, transactions: [...transactions].reverse() };
  }

  // ── Maps ─────────────────────────────────────────────────────────────────

  /**
   * Pins for the Maps app: every outdoor pocket (interiors fold into their
   * parent), marked here / open / locked, and the active objective's
   * destination. Lat/lng are real; the app projects them.
   */
  maps() {
    const { activeDistrict, quests } = useGameStore.getState();
    const rep = ReputationManager.getInstance();
    const anchorOf = (id: string | null | undefined): DistrictDef | undefined => {
      let d = id ? DISTRICTS[id] : undefined;
      for (let i = 0; d?.realworld && 'parent' in d.realworld && i < 5; i++) d = DISTRICTS[d.realworld.parent];
      return d;
    };
    const here = anchorOf(activeDistrict)?.id;
    const pins = Object.values(DISTRICTS)
      .filter((d) => d.realworld && 'lat' in d.realworld)
      .map((d) => {
        const rw = d.realworld as { lat: number; lng: number; label?: string };
        return { districtId: d.id, label: rw.label ?? d.name, lat: rw.lat, lng: rw.lng, state: d.id === here ? 'here' : rep.canEnter(d.id) ? 'open' : 'locked' } as const;
      });

    // The first unfinished, non-optional objective of the first active quest that names a place.
    let destination: { districtId: string; label: string; objective: string } | null = null;
    for (const [questId, done] of Object.entries(quests.active)) {
      const objective = QUESTS[questId]?.objectives.find((o) => !done.includes(o.id) && !o.optional && o.destination);
      if (!objective) continue;
      const anchor = anchorOf(objective.destination);
      if (anchor) destination = { districtId: anchor.id, label: (anchor.realworld as { label?: string }).label ?? anchor.name, objective: objective.text };
      break;
    }
    return { pins, here, destination };
  }
}
