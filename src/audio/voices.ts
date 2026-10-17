import { NPCS } from '../data';

/** Dialogue id → the speaking NPC's bleep voice (ADR-139); narration and unknown speakers tick instead. */
const byDialogue = new Map<string, string>();
for (const n of Object.values(NPCS)) if (n.dialogue && n.voice && !byDialogue.has(n.dialogue)) byDialogue.set(n.dialogue, n.voice);

export const voiceOf = (dialogueId: string): { voice?: string } => {
  const voice = byDialogue.get(dialogueId);
  return voice ? { voice } : {};
};
