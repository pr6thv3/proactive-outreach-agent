// ─── Edit Tracker — Human-in-the-Loop Learning ────────
// THE GOLD: Track what users change in AI-generated emails
// This is the most valuable training data — what humans rewrite reveals what AI gets wrong

import { db } from '@/lib/db';
import { AgentMemoryService } from '@/lib/agents/infrastructure/agent-memory';
import { logger } from '@/lib/agents/infrastructure/observability';

export type EditType = 'no_change' | 'subject_changed' | 'body_changed' | 'cta_changed' | 'hook_changed' | 'full_rewrite' | 'minor_edit' | 'deletion';

export interface TrackEditParams {
  messageId: string;
  fieldName: 'subject' | 'body' | 'cta' | 'angle' | 'tone' | 'strategy';
  originalValue: string;
  editedValue: string;
  signalType?: string;
  pitchAngle?: string;
  urgency?: number;
  leadId?: string;
  campaignId?: string;
}

export interface EditAnalysis {
  editType: EditType;
  changeMagnitude: number;    // 0-1
  addedWords: number;
  removedWords: number;
  keptPhrases: string[];      // Phrases the user kept — GOLD
  removedPhrases: string[];   // Phrases the user removed
  addedPhrases: string[];     // New phrases the user added
}

/**
 * Analyze the difference between original and edited text
 */
export function analyzeEdit(original: string, edited: string): EditAnalysis {
  if (original === edited) {
    return {
      editType: 'no_change',
      changeMagnitude: 0,
      addedWords: 0,
      removedWords: 0,
      keptPhrases: extractPhrases(original, 4),
      removedPhrases: [],
      addedPhrases: [],
    };
  }

  if (!original || !edited) {
    return {
      editType: edited ? 'full_rewrite' : 'deletion',
      changeMagnitude: edited ? 1 : 0,
      addedWords: edited ? edited.split(/\s+/).length : 0,
      removedWords: original ? original.split(/\s+/).length : 0,
      keptPhrases: [],
      removedPhrases: [],
      addedPhrases: [],
    };
  }

  const origWords = original.split(/\s+/).filter(Boolean);
  const editWords = edited.split(/\s+/).filter(Boolean);

  const addedWords = Math.max(0, editWords.length - origWords.length);
  const removedWords = Math.max(0, origWords.length - editWords.length);

  // Calculate change magnitude (0 = no change, 1 = complete rewrite)
  const maxLen = Math.max(origWords.length, editWords.length);
  const commonWords = countCommonWords(origWords, editWords);
  const changeMagnitude = maxLen > 0 ? 1 - (commonWords / maxLen) : 0;

  // Extract phrases (3-5 word sequences) that were kept, added, or removed
  const origPhrases = extractPhrases(original, 4);
  const editPhrases = extractPhrases(edited, 4);

  const keptPhrases = origPhrases.filter(p => editPhrases.includes(p));
  const removedPhrases = origPhrases.filter(p => !editPhrases.includes(p));
  const addedPhrases = editPhrases.filter(p => !origPhrases.includes(p));

  // Classify edit type
  let editType: EditType;
  if (changeMagnitude === 0) {
    editType = 'no_change';
  } else if (changeMagnitude < 0.1) {
    editType = 'minor_edit';
  } else if (changeMagnitude > 0.8) {
    editType = 'full_rewrite';
  } else if (removedPhrases.some(p => isCtaPhrase(p)) || addedPhrases.some(p => isCtaPhrase(p))) {
    editType = 'cta_changed';
  } else if (removedPhrases.some(p => isHookPhrase(p)) || addedPhrases.some(p => isHookPhrase(p))) {
    editType = 'hook_changed';
  } else if (changeMagnitude > 0.3) {
    editType = 'body_changed';
  } else {
    editType = 'subject_changed';
  }

  return {
    editType,
    changeMagnitude,
    addedWords,
    removedWords,
    keptPhrases: keptPhrases.slice(0, 10),
    removedPhrases: removedPhrases.slice(0, 10),
    addedPhrases: addedPhrases.slice(0, 10),
  };
}

/**
 * Track an edit and store it for learning
 */
export async function trackEdit(params: TrackEditParams): Promise<string | null> {
  const { messageId, fieldName, originalValue, editedValue, signalType, pitchAngle, urgency, leadId, campaignId } = params;

  // Skip if nothing actually changed
  if (originalValue === editedValue) return null;

  const analysis = analyzeEdit(originalValue, editedValue);

  // Store the edit
  const edit = await db.messageEdit.create({
    data: {
      messageId,
      editType: analysis.editType,
      fieldName,
      originalValue: originalValue.slice(0, 5000),
      editedValue: editedValue.slice(0, 5000),
      changeMagnitude: analysis.changeMagnitude,
      addedWords: analysis.addedWords,
      removedWords: analysis.removedWords,
      keptPhrases: JSON.stringify(analysis.keptPhrases),
      signalTypeUsed: signalType,
      pitchAngleUsed: pitchAngle,
      urgencyAtGeneration: urgency,
      leadId,
      campaignId,
    },
  });

  logger.info('Email edit tracked', {
    agent: 'EditTracker',
    phase: 'act',
    leadId,
    metadata: {
      messageId,
      fieldName,
      editType: analysis.editType,
      changeMagnitude: analysis.changeMagnitude.toFixed(2),
      keptPhrases: analysis.keptPhrases.length,
    },
  });

  // Immediately feed significant edits to memory
  if (analysis.changeMagnitude > 0.3 || analysis.editType === 'cta_changed' || analysis.editType === 'hook_changed') {
    await feedEditToMemory(edit.id);
  }

  return edit.id;
}

/**
 * Feed an edit into agent memory for learning
 * This is the compounding intelligence step
 */
export async function feedEditToMemory(editId: string): Promise<void> {
  const edit = await db.messageEdit.findUnique({ where: { id: editId } });
  if (!edit || edit.fedToMemory) return;

  const analysis: EditAnalysis = {
    editType: edit.editType as EditType,
    changeMagnitude: edit.changeMagnitude,
    addedWords: edit.addedWords,
    removedWords: edit.removedWords,
    keptPhrases: edit.keptPhrases ? JSON.parse(edit.keptPhrases) : [],
    removedPhrases: [],
    addedPhrases: [],
  };

  // Get the lead context
  const message = await db.outreachMessage.findUnique({ where: { id: edit.messageId } });
  const lead = message ? await db.lead.findUnique({ where: { id: message.leadId } }) : null;

  const industry = lead?.company || undefined;
  const persona = lead?.title || undefined;
  const channel = message?.channel || 'email';

  // ═══ LEARNING PATTERNS ═══

  // 1. CTA override — user changed the CTA → the AI's CTA was wrong
  if (analysis.editType === 'cta_changed' && edit.fieldName === 'body') {
    await AgentMemoryService.recordFeedback({
      category: 'winning_hook',
      key: `cta_override_${industry || 'unknown'}_${persona || 'unknown'}`,
      wasSuccessful: false, // The AI's CTA was overridden
      industry,
      persona,
      channel,
    });
  }

  // 2. Hook rejection — user removed the hook/opening
  if (analysis.editType === 'hook_changed') {
    await AgentMemoryService.recordFeedback({
      category: 'winning_hook',
      key: `hook_rejection_${edit.pitchAngleUsed || 'unknown'}_${industry || 'unknown'}`,
      wasSuccessful: false, // The AI's hook was rejected
      industry,
      persona,
      channel,
    });
  }

  // 3. Full rewrite — AI's entire approach was wrong for this persona
  if (analysis.editType === 'full_rewrite') {
    await AgentMemoryService.recordFeedback({
      category: 'persona_pattern',
      key: `full_rewrite_${persona || 'unknown'}_${industry || 'unknown'}`,
      wasSuccessful: false,
      industry,
      persona,
      channel,
    });
  }

  // 4. Kept phrases — these are GOLD. The user kept these specific phrases.
  // This means these phrases resonate. Store them as winning hooks.
  if (analysis.keptPhrases.length > 0 && edit.editedValue) {
    for (const phrase of analysis.keptPhrases.slice(0, 3)) {
      await AgentMemoryService.recordFeedback({
        category: 'winning_hook',
        key: `kept_phrase_${phrase.replace(/\s+/g, '_').slice(0, 40)}_${industry || 'unknown'}`,
        wasSuccessful: true, // User kept this phrase — it's good
        industry,
        persona,
        channel,
      });
    }
  }

  // 5. Signal-type specific feedback — was the pitch angle based on the right signal?
  if (edit.signalTypeUsed && analysis.changeMagnitude > 0.5) {
    await AgentMemoryService.recordFeedback({
      category: 'signal_correlation',
      key: `signal_mismatch_${edit.signalTypeUsed}_${industry || 'unknown'}`,
      wasSuccessful: false, // High edit rate = wrong signal interpretation
      industry,
      channel,
    });
  }

  // Mark as fed to memory
  await db.messageEdit.update({
    where: { id: editId },
    data: { fedToMemory: true },
  });

  logger.info('Edit fed to memory', {
    agent: 'EditTracker',
    phase: 'memory',
    metadata: {
      editId,
      editType: analysis.editType,
      keptPhrases: analysis.keptPhrases.length,
      signalType: edit.signalTypeUsed,
    },
  });
}

/**
 * Update edit outcomes after we know the result
 * (e.g., edited email got a reply → the edit was good)
 */
export async function updateEditOutcome(messageId: string, outcome: 'replied' | 'interested' | 'bounced' | 'unsubscribed' | 'no_response'): Promise<void> {
  await db.messageEdit.updateMany({
    where: { messageId, outcomeAfterEdit: null },
    data: { outcomeAfterEdit: outcome },
  });

  // If the edited email got a positive result, boost the memory entries
  if (outcome === 'interested') {
    const edits = await db.messageEdit.findMany({ where: { messageId, fedToMemory: true } });
    for (const edit of edits) {
      // Re-feed with success signal
      const keptPhrases: string[] = edit.keptPhrases ? JSON.parse(edit.keptPhrases) : [];
      for (const phrase of keptPhrases.slice(0, 2)) {
        await AgentMemoryService.recordFeedback({
          category: 'winning_hook',
          key: `kept_phrase_${phrase.replace(/\s+/g, '_').slice(0, 40)}_confirmed`,
          wasSuccessful: true,
        });
      }
    }
  }
}

/**
 * Get edit insights for dashboard display
 */
export async function getEditInsights(days: number = 30) {
  const since = new Date(Date.now() - days * 86400000);

  const edits = await db.messageEdit.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  const totalEdits = edits.length;
  const fullRewrites = edits.filter(e => e.editType === 'full_rewrite').length;
  const ctaChanges = edits.filter(e => e.editType === 'cta_changed').length;
  const hookChanges = edits.filter(e => e.editType === 'hook_changed').length;
  const minorEdits = edits.filter(e => e.editType === 'minor_edit').length;

  // Average change magnitude
  const avgMagnitude = totalEdits > 0
    ? edits.reduce((sum, e) => sum + e.changeMagnitude, 0) / totalEdits
    : 0;

  // Most commonly kept phrases (GOLD)
  const keptPhraseCounts: Record<string, number> = {};
  for (const edit of edits) {
    const phrases: string[] = edit.keptPhrases ? JSON.parse(edit.keptPhrases) : [];
    for (const phrase of phrases) {
      keptPhraseCounts[phrase] = (keptPhraseCounts[phrase] || 0) + 1;
    }
  }
  const topKeptPhrases = Object.entries(keptPhraseCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([phrase, count]) => ({ phrase, count }));

  // Outcome tracking
  const editsWithOutcome = edits.filter(e => e.outcomeAfterEdit);
  const positiveOutcomes = editsWithOutcome.filter(e => e.outcomeAfterEdit === 'interested').length;

  return {
    totalEdits,
    fullRewrites,
    ctaChanges,
    hookChanges,
    minorEdits,
    avgMagnitude,
    topKeptPhrases,
    editsWithOutcome: editsWithOutcome.length,
    positiveOutcomes,
    editQualityScore: totalEdits > 0 ? 1 - avgMagnitude : 1, // Higher = less editing needed = better AI
  };
}

// ─── Helpers ──────────────────────────────────────────

function countCommonWords(a: string[], b: string[]): number {
  const bSet = new Set(b.map(w => w.toLowerCase()));
  return a.filter(w => bSet.has(w.toLowerCase())).length;
}

function extractPhrases(text: string, length: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const phrases: string[] = [];
  for (let i = 0; i <= words.length - length; i++) {
    phrases.push(words.slice(i, i + length).join(' ').toLowerCase());
  }
  return phrases;
}

function isCtaPhrase(phrase: string): boolean {
  const ctaIndicators = ['book a', 'schedule a', 'let\'s chat', 'free trial', 'demo', 'call', 'meeting', 'click here', 'sign up', 'get started', 'reply to'];
  return ctaIndicators.some(i => phrase.includes(i));
}

function isHookPhrase(phrase: string): boolean {
  const hookIndicators = ['congratulations on', 'saw that you', 'noticed you', 'i saw', 'heard about', 'read about', 'came across'];
  return hookIndicators.some(i => phrase.includes(i));
}
