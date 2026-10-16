import { gameEvents } from '../core/events';
import { useGameStore } from '../store';
import type { RelationshipState } from '../utils/types';

/** The five states in story order (game_components §8). */
export const RELATIONSHIP_STATES: readonly RelationshipState[] = ['met', 'warm', 'strained', 'resolved', 'lost'];

/** What the phone's Contacts app says under a name — plain words, no meter. */
export const RELATIONSHIP_LABEL: Record<RelationshipState, string> = {
  met: 'Met',
  warm: 'Friends',
  strained: 'Not talking',
  resolved: 'Made up',
  lost: 'Gone',
};

/**
 * RelationshipManager — named-NPC relationships (ADR-123). *For you: Ananya's
 * arc is one word that moves — met, warm, strained, resolved or lost — set by
 * dialogue choices (`effect.relationship`) and shown in Contacts; no hearts,
 * no meters.* Saved with the run. Reputation (the city's trust) stays in
 * ReputationManager; this is about one person at a time.
 */
export class RelationshipManager {
  private static instance: RelationshipManager | null = null;

  static getInstance(): RelationshipManager {
    if (!RelationshipManager.instance) RelationshipManager.instance = new RelationshipManager();
    return RelationshipManager.instance;
  }

  static resetInstance(): void {
    RelationshipManager.instance = null;
  }

  get(npcId: string): RelationshipState | null {
    return useGameStore.getState().relationships[npcId] ?? null;
  }

  /** Someone the player has a relationship with at all (the system "opens" at `met`). */
  knows(npcId: string): boolean {
    return this.get(npcId) !== null;
  }

  /** Move to a state; no-op when already there. Emits `relationship:changed`. */
  set(npcId: string, state: RelationshipState): void {
    if (!RELATIONSHIP_STATES.includes(state)) throw new Error(`Unknown relationship state "${state}"`);
    const store = useGameStore.getState();
    if (store.relationships[npcId] === state) return;
    store.setRelationship(npcId, state);
    gameEvents.emit('relationship:changed', { npcId, state });
  }

  label(npcId: string): string | null {
    const state = this.get(npcId);
    return state ? RELATIONSHIP_LABEL[state] : null;
  }
}
