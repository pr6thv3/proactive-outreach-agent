// ─── Layer 4: Generation Content Guardrails ──────────────────────────────────
// Automatically validates AI-generated outreach copy before it enters the sending queue.
// Catches unresolved variables, excessive word count, spam triggers, and generic AI clichés.
// If validation fails, blocks sending and routes the message to the review/rework queue.
// ─────────────────────────────────────────────────────────────────────────────

export interface ContentGuardrailCheckResult {
  ruleId: string;
  passed: boolean;
  severity: 'block' | 'warn';
  message: string;
  detectedText?: string;
}

export interface ContentValidationResult {
  passed: boolean;
  wordCount: number;
  characterCount: number;
  checks: ContentGuardrailCheckResult[];
  blockReasons: string[];
  warnings: string[];
  suggestedRework?: string;
}

const AI_CLICHES = [
  "i hope this email finds you well",
  "hope this note finds you well",
  "in today's fast-paced world",
  "in today's digital landscape",
  "game-changer",
  "revolutionary solution",
  "cutting-edge technology",
  "dive into",
  "seamlessly integrate",
  "unlock synergy",
  "synergistic",
  "take your business to the next level",
  "at the forefront of",
  "state-of-the-art",
];

const SPAM_TRIGGER_PHRASES = [
  "100% free",
  "act now urgent",
  "risk-free guarantee",
  "make money fast",
  "exclusive deal expires",
  "no catch",
  "congratulations you have been selected",
  "earn extra cash",
];

export class ContentGuardrailsEngine {
  /**
   * Validates email or LinkedIn message copy against strict deliverability & quality rules.
   */
  static validateContent(params: {
    subject?: string;
    body: string;
    channel?: 'email' | 'linkedin_connect' | 'linkedin_message' | 'linkedin_visit';
    sequencePos?: number;
    recipientName?: string;
    companyName?: string;
  }): ContentValidationResult {
    const { subject = '', body, channel = 'email', sequencePos = 1 } = params;
    const checks: ContentGuardrailCheckResult[] = [];
    const combinedText = `${subject} ${body}`;

    const words = body.trim().split(/\s+/).filter(Boolean);
    const wordCount = words.length;
    const characterCount = body.length;

    // ── Rule 1: No Unresolved Template Variables ───────────────────────────
    const unresolvedVarRegex = /\{\{[^}]+\}\}|\{[a-zA-Z0-9_]+\}|%[a-zA-Z0-9_]+%|\bundefined\b|\bnull\b/i;
    const varMatch = combinedText.match(unresolvedVarRegex);
    if (varMatch) {
      checks.push({
        ruleId: 'no_unresolved_variables',
        passed: false,
        severity: 'block',
        message: `Unresolved personalization variable detected: "${varMatch[0]}"`,
        detectedText: varMatch[0],
      });
    } else {
      checks.push({
        ruleId: 'no_unresolved_variables',
        passed: true,
        severity: 'block',
        message: 'All template variables resolved cleanly',
      });
    }

    // ── Rule 2: Length & Character Limits ──────────────────────────────────
    if (channel === 'linkedin_connect') {
      if (characterCount > 300) {
        checks.push({
          ruleId: 'linkedin_300_char_limit',
          passed: false,
          severity: 'block',
          message: `LinkedIn connection note exceeds 300 character limit (${characterCount}/300 chars)`,
        });
      } else {
        checks.push({
          ruleId: 'linkedin_300_char_limit',
          passed: true,
          severity: 'block',
          message: `LinkedIn connection note within character limit (${characterCount}/300 chars)`,
        });
      }
    } else {
      // Email length limits
      const maxWords = sequencePos === 1 ? 160 : 120;
      if (wordCount > maxWords) {
        checks.push({
          ruleId: 'email_word_count_limit',
          passed: false,
          severity: 'block',
          message: `Email body exceeds recommended length (${wordCount} words; limit is ${maxWords} words). Long cold emails reduce reply rates by ~42%.`,
        });
      } else if (wordCount < 15) {
        checks.push({
          ruleId: 'email_word_count_limit',
          passed: false,
          severity: 'block',
          message: `Email body is too brief (${wordCount} words). Requires a clear value proposition.`,
        });
      } else {
        checks.push({
          ruleId: 'email_word_count_limit',
          passed: true,
          severity: 'block',
          message: `Email length optimal (${wordCount} words)`,
        });
      }
    }

    // ── Rule 3: Generic AI Clichés & Stereotypical Openers ──────────────────
    const bodyLower = body.toLowerCase();
    const foundCliche = AI_CLICHES.find(cliche => bodyLower.includes(cliche));
    if (foundCliche) {
      checks.push({
        ruleId: 'no_generic_ai_cliches',
        passed: false,
        severity: 'block',
        message: `Generic AI cliché detected: "${foundCliche}". Cold outreach must feel human and personalized.`,
        detectedText: foundCliche,
      });
    } else {
      checks.push({
        ruleId: 'no_generic_ai_cliches',
        passed: true,
        severity: 'block',
        message: 'No generic AI clichés detected',
      });
    }

    // ── Rule 4: Spam Trigger Phrases ─────────────────────────────────────────
    const foundSpamPhrase = SPAM_TRIGGER_PHRASES.find(phrase => bodyLower.includes(phrase));
    if (foundSpamPhrase) {
      checks.push({
        ruleId: 'no_spam_trigger_phrases',
        passed: false,
        severity: 'block',
        message: `High-risk spam trigger phrase detected: "${foundSpamPhrase}"`,
        detectedText: foundSpamPhrase,
      });
    } else {
      checks.push({
        ruleId: 'no_spam_trigger_phrases',
        passed: true,
        severity: 'block',
        message: 'Copy free of spam trigger keywords',
      });
    }

    // ── Rule 5: Formatting, Capitalization & Exclamations ───────────────────
    const exclamationCount = (body.match(/!/g) || []).length;
    if (exclamationCount > 2) {
      checks.push({
        ruleId: 'excessive_exclamation',
        passed: false,
        severity: 'warn',
        message: `Excessive exclamation marks (${exclamationCount}) detected. May trigger spam filters.`,
      });
    }

    const capsWords = words.filter(w => w.length > 3 && w === w.toUpperCase() && /^[A-Z]+$/.test(w));
    if (capsWords.length > 2) {
      checks.push({
        ruleId: 'excessive_caps',
        passed: false,
        severity: 'warn',
        message: `ALL-CAPS words detected (${capsWords.join(', ')}). Appears promotional to inbox providers.`,
      });
    }

    // ── Rule 6: Subject Line Quality (Email Only) ───────────────────────────
    if (channel === 'email' && sequencePos === 1) {
      if (!subject || subject.trim().length === 0) {
        checks.push({
          ruleId: 'subject_required',
          passed: false,
          severity: 'block',
          message: 'Initial email touchpoint requires a subject line',
        });
      } else if (subject.length > 70) {
        checks.push({
          ruleId: 'subject_length',
          passed: false,
          severity: 'warn',
          message: `Subject line is long (${subject.length} chars). Subject lines under 50 characters achieve higher open rates.`,
        });
      }
    }

    // Evaluate Overall Status
    const blockingFails = checks.filter(c => !c.passed && c.severity === 'block');
    const warnings = checks.filter(c => !c.passed && c.severity === 'warn').map(c => c.message);
    const blockReasons = blockingFails.map(c => c.message);

    const passed = blockingFails.length === 0;

    let suggestedRework: string | undefined;
    if (!passed) {
      suggestedRework = 'Trim body under 120 words, replace clichés with direct reference to the prospect\'s trigger event, and verify all variable placeholders are resolved.';
    }

    return {
      passed,
      wordCount,
      characterCount,
      checks,
      blockReasons,
      warnings,
      suggestedRework,
    };
  }
}
