import { gameEvents } from '../core/events';
import { DIALOGUE_ENTRY_NODE, getDialogue } from '../data';
import { StatsManager } from './StatsManager';
import { NegotiationManager, type Negotiation } from './NegotiationManager';
import { useGameStore } from '../store';
import { SKILL_TIER_NAMES } from '../utils/constants';
import type {
  DialogueChoice,
  DialogueFile,
  DialogueNode,
  SkillRequirement,
} from '../utils/types';

/** A choice as the UI should draw it — locked ones are shown, not hidden. */
export interface DialogueChoiceView {
  index: number;
  text: string;
  enabled: boolean;
  /** Why it is locked, ready to render, e.g. "Needs City Survival: Newcomer". */
  lockedReason?: string;
}

/** Everything a dialogue box needs for one node. */
export interface DialogueView {
  dialogueId: string;
  nodeId: string;
  speaker: string;
  portrait: string;
  portraitExpression: number;
  text: string;
  choices: DialogueChoiceView[];
  /** True when tapping through advances to another node. */
  canAdvance: boolean;
  /** True when this node ends the conversation. */
  isEnd: boolean;
  /** The bill under negotiation ("Deposit ₹10,000 + Rent ₹8,000 = ₹18,000"), drawn apart from the line. */
  ledger?: string;
}

const SKILL_LABELS: Record<string, string> = {
  technical: 'Technical',
  soft_skills: 'Soft Skills',
  city_survival: 'City Survival',
};

/**
 * DialogueManager — walks a dialogue tree, applies effects, gates choices.
 *
 * Deliberately free of Phaser: a scene drives it and renders the view it
 * returns, which keeps the whole conversation system unit-testable.
 */
export class DialogueManager {
  private static instance: DialogueManager | null = null;

  static getInstance(): DialogueManager {
    if (!DialogueManager.instance) DialogueManager.instance = new DialogueManager();
    return DialogueManager.instance;
  }

  static resetInstance(): void {
    DialogueManager.instance = null;
  }

  private file: DialogueFile | null = null;
  private nodeId: string | null = null;
  private questTriggers: string[] = [];
  /** A haggle running inside the current node (ADR-95). */
  private negotiation: Negotiation | null = null;

  get isActive(): boolean {
    return this.file !== null;
  }

  /** Quest ids triggered since the conversation began. */
  get triggeredQuests(): readonly string[] {
    return this.questTriggers;
  }

  /** Begin a conversation. Applies the entry node's effect, if any. */
  start(dialogueId: string): DialogueView {
    this.file = getDialogue(dialogueId);
    this.questTriggers = [];
    this.negotiation = null;

    // NPCs remember: the first `enter` branch whose flag is set picks the
    // opening node (the owner who already took your token, ADR-96).
    const { flags } = useGameStore.getState();
    const entryId = this.file.enter?.find((b) => flags[b.flag])?.node ?? DIALOGUE_ENTRY_NODE;
    const entry = this.file.nodes[entryId];
    if (!entry) {
      throw new Error(`Dialogue "${dialogueId}" has no "${entryId}" node`);
    }

    this.nodeId = entryId;
    gameEvents.emit('dialogue:started', { dialogueId });
    this.applyNode(entry);
    return this.view();
  }

  /**
   * Take a choice by index. Applies the choice's effect, then moves to its
   * target node and applies that node's effect.
   */
  choose(index: number): DialogueView {
    const node = this.requireNode();

    if (this.negotiation) {
      const option = this.negotiation.options()[index];
      if (!option) throw new Error(`Negotiation option ${index} does not exist`);
      if (!option.enabled) throw new Error(`Negotiation option ${index} is locked`);
      const outcome = this.negotiation.choose(index);
      if (!outcome) return this.view();
      this.negotiation = null;
      return this.goTo(outcome === 'deal' ? node.negotiate!.deal : node.negotiate!.walk);
    }

    const choice = node.choices?.[index];
    if (!choice) throw new Error(`Choice ${index} does not exist on node "${this.nodeId}"`);

    const cost = choice.effect?.wallet !== undefined && choice.effect.wallet < 0 ? -choice.effect.wallet : 0;
    if (!this.meetsRequirement(choice.requires) || !StatsManager.getInstance().canAfford(cost)) {
      throw new Error(`Choice ${index} on node "${this.nodeId}" is locked`);
    }

    this.applyEffects(choice);
    return this.goTo(choice.next);
  }

  /** Advance a node that has `next` and no choices. */
  advance(): DialogueView {
    const node = this.requireNode();
    if (!node.next) throw new Error(`Node "${this.nodeId}" has nothing to advance to`);
    return this.goTo(node.next);
  }

  /**
   * End the conversation. The bus event is what progresses `dialogue`
   * objectives and starts triggered quests — callers need do nothing more.
   */
  end(): { dialogueId: string; triggeredQuests: string[] } {
    const result = {
      dialogueId: this.requireFile().id,
      triggeredQuests: this.questTriggers,
    };
    this.file = null;
    this.nodeId = null;
    this.questTriggers = [];
    this.negotiation = null;
    gameEvents.emit('dialogue:ended', result);
    return result;
  }

  /** Current node as a renderable view. */
  view(): DialogueView {
    const file = this.requireFile();
    const node = this.requireNode();

    if (this.negotiation) {
      const neg = this.negotiation;
      return {
        dialogueId: file.id,
        nodeId: this.nodeId!,
        speaker: file.speaker,
        portrait: file.portrait,
        portraitExpression: node.portrait_expression ?? 0,
        text: neg.line ?? node.text,
        choices: neg.options().map((o, index) => ({
          index,
          text: o.text,
          enabled: o.enabled,
          ...(o.lockedReason ? { lockedReason: o.lockedReason } : {}),
        })),
        canAdvance: false,
        isEnd: false,
        ledger: neg.ledger,
      };
    }

    const choices = (node.choices ?? []).map((choice, index) => {
      // A choice can be locked by a skill tier or by the wallet. Both are
      // shown greyed with the reason — the player sees what they are missing.
      const skillOk = this.meetsRequirement(choice.requires);
      const cost = choice.effect?.wallet !== undefined && choice.effect.wallet < 0 ? -choice.effect.wallet : 0;
      const walletOk = cost === 0 || StatsManager.getInstance().canAfford(cost);
      const enabled = skillOk && walletOk;
      const lockedReason = !skillOk
        ? this.describeRequirement(choice.requires!)
        : !walletOk
          ? `Needs ₹${cost.toLocaleString('en-IN')}`
          : undefined;
      return {
        index,
        text: choice.text,
        enabled,
        ...(enabled ? {} : { lockedReason }),
      } satisfies DialogueChoiceView;
    });

    return {
      dialogueId: file.id,
      nodeId: this.nodeId!,
      speaker: file.speaker,
      portrait: file.portrait,
      portraitExpression: node.portrait_expression ?? 0,
      text: node.text,
      choices,
      canAdvance: choices.length === 0 && Boolean(node.next),
      isEnd: choices.length === 0 && !node.next,
    };
  }

  private goTo(nodeId: string): DialogueView {
    const file = this.requireFile();
    const node = file.nodes[nodeId];
    // The validator rules this out at build time; if it happens at runtime the
    // content and the build have diverged, and silence would be a soft-lock.
    if (!node) throw new Error(`Dialogue "${file.id}" has no node "${nodeId}"`);

    this.nodeId = nodeId;
    this.applyNode(node);
    return this.view();
  }

  private applyNode(node: DialogueNode): void {
    this.applyEffects(node);
    if (node.negotiate) this.negotiation = NegotiationManager.begin(node.negotiate.id);
  }

  private applyEffects(source: DialogueNode | DialogueChoice): void {
    if (source.effect) StatsManager.getInstance().applyEffect(source.effect);
    if (source.quest_trigger && !this.questTriggers.includes(source.quest_trigger)) {
      this.questTriggers.push(source.quest_trigger);
    }
  }

  private meetsRequirement(requires?: SkillRequirement): boolean {
    if (!requires) return true;
    return useGameStore.getState().skills[requires.skill].level >= requires.level;
  }

  private describeRequirement(requires: SkillRequirement): string {
    const label = SKILL_LABELS[requires.skill] ?? requires.skill;
    const tier = SKILL_TIER_NAMES[requires.skill]?.[requires.level];
    return tier ? `Needs ${label}: ${tier}` : `Needs ${label} ${requires.level}`;
  }

  private requireFile(): DialogueFile {
    if (!this.file) throw new Error('No dialogue is active');
    return this.file;
  }

  private requireNode(): DialogueNode {
    const file = this.requireFile();
    return file.nodes[this.nodeId!];
  }
}
