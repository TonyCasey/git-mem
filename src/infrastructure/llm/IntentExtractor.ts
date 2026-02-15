/**
 * IntentExtractor
 *
 * Infrastructure implementation of IIntentExtractor using the Anthropic SDK.
 * Extracts searchable keywords from user prompts for memory retrieval.
 * Uses Claude Haiku for fast, cheap keyword extraction.
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
  IIntentExtractor,
  IIntentExtractorInput,
  IIntentExtractorResult,
} from '../../domain/interfaces/IIntentExtractor';
import type { ILogger } from '../../domain/interfaces/ILogger';

export interface IIntentExtractorOptions {
  /** Anthropic API key. Falls back to ANTHROPIC_API_KEY env var. */
  readonly apiKey?: string;
  /** Timeout in ms for LLM call. Default: 3000. */
  readonly timeout?: number;
  /** Minimum word count to trigger extraction. Default: 5. */
  readonly minWords?: number;
  /** Logger for debug output. */
  readonly logger?: ILogger;
}

const HAIKU_MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 100; // Keywords are short

const SYSTEM_PROMPT = `Extract searchable keywords from this user prompt.
Return ONLY a comma-separated list of: file names, class names, function names, issue IDs (e.g., GIT-95), and technical concepts.
No articles, no verbs, no summaries — just the nouns/identifiers that would appear in code or documentation.
If the prompt is a simple confirmation or has no extractable keywords, respond with "SKIP".`;

/** Pattern for simple confirmations that should skip extraction. */
const CONFIRMATION_PATTERN = /^(yes|no|ok|okay|go|sure|proceed|continue|done|y|n|yep|nope|thanks|thank you|\d+)$/i;

export class IntentExtractor implements IIntentExtractor {
  private readonly client: Anthropic;
  private readonly timeout: number;
  private readonly minWords: number;
  private readonly logger?: ILogger;

  constructor(options: IIntentExtractorOptions) {
    const apiKey = options.apiKey || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('Anthropic API key required for IntentExtractor');
    }

    this.client = new Anthropic({ apiKey });
    this.timeout = options.timeout ?? 3000;
    this.minWords = options.minWords ?? 5;
    this.logger = options.logger;
  }

  async extract(input: IIntentExtractorInput): Promise<IIntentExtractorResult> {
    const prompt = input.prompt.trim();

    // Check minimum words
    const words = prompt.split(/\s+/).filter(w => w.length > 0);
    if (words.length < this.minWords) {
      this.logger?.debug('Intent extraction skipped: too short', { wordCount: words.length });
      return { intent: null, skipped: true, reason: 'too_short' };
    }

    // Check confirmation patterns
    if (CONFIRMATION_PATTERN.test(prompt)) {
      this.logger?.debug('Intent extraction skipped: confirmation');
      return { intent: null, skipped: true, reason: 'confirmation' };
    }

    // Extract via LLM with timeout
    try {
      const intent = await this.extractWithTimeout(prompt);

      if (!intent || intent.toUpperCase() === 'SKIP') {
        this.logger?.debug('Intent extraction: LLM returned SKIP');
        return { intent: null, skipped: true, reason: 'llm_skip' };
      }

      this.logger?.debug('Intent extracted', { intent });
      return { intent, skipped: false };
    } catch (error) {
      const isTimeout = error instanceof Error && error.message.includes('timed out');
      this.logger?.warn('Intent extraction failed', {
        error: error instanceof Error ? error.message : String(error),
        isTimeout,
      });
      return {
        intent: null,
        skipped: true,
        reason: isTimeout ? 'timeout' : 'error',
      };
    }
  }

  /**
   * Call LLM with timeout enforcement.
   */
  private async extractWithTimeout(prompt: string): Promise<string | null> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Intent extraction timed out')), this.timeout);
    });

    const extractPromise = this.callLLM(prompt);

    return Promise.race([extractPromise, timeoutPromise]);
  }

  /**
   * Make the actual LLM call.
   */
  private async callLLM(prompt: string): Promise<string | null> {
    const response = await this.client.messages.create({
      model: HAIKU_MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `User prompt: "${prompt}"` }],
    });

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map(block => block.text)
      .join('')
      .trim();

    return text || null;
  }
}
