/**
 * BaseLLMClient
 *
 * Abstract base class for LLM provider implementations.
 * Contains provider-agnostic logic: message building, response parsing,
 * fact validation, and enrichCommit orchestration.
 *
 * Concrete providers implement only `callAPI()`; this base class provides the default `complete()` implementation from `ILLMCaller`.
 */

import type {
  ILLMClient,
  ILLMEnrichmentInput,
  ILLMEnrichmentResult,
  ILLMExtractedFact,
} from '../../domain/interfaces/ILLMClient';
import type { ILLMCaller, ILLMCallerOptions } from '../../domain/interfaces/ILLMCaller';
import type { MemoryType } from '../../domain/entities/IMemoryEntity';
import { MEMORY_TYPE_VALUES } from '../../domain/entities/IMemoryEntity';
import type { ConfidenceLevel } from '../../domain/types/IMemoryQuality';
import { CONFIDENCE_VALUES } from '../../domain/types/IMemoryQuality';
import { LLMError } from '../../domain/errors/LLMError';

/**
 * Result returned by the provider-specific API call.
 */
export interface IAPICallResult {
  readonly text: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
}

export const ENRICHMENT_SYSTEM_PROMPT = `You are a code archaeology assistant. Given a git commit message and its diff, extract structured memories (decisions, gotchas, conventions, and facts) that would be valuable for future AI coding tools working in this codebase.

Return a JSON array of extracted facts. Each fact should have:
- "content": A clear, concise description of the insight (1-2 sentences)
- "type": One of "decision", "gotcha", "convention", "fact"
  - decision: An architectural or design choice and its rationale
  - gotcha: A pitfall, workaround, or non-obvious behavior
  - convention: A coding pattern or standard established
  - fact: A factual observation about the codebase
- "confidence": One of "verified", "high", "medium", "low"
  - verified: Explicitly stated in the commit message
  - high: Strongly implied by the changes
  - medium: Reasonable inference from the diff
  - low: Weak inference, may need verification
- "tags": An array of relevant tags (e.g., file paths, technologies, concepts)

Guidelines:
- Focus on insights that would help future developers understand WHY changes were made
- Skip trivial commits (version bumps, formatting, typo fixes) — return an empty array []
- Prefer fewer high-quality facts over many low-quality ones
- Do not extract facts that are obvious from reading the code itself
- Tags should be lowercase, hyphenated (e.g., "error-handling", "api-design")

Return ONLY a JSON array, no other text.`;

export abstract class BaseLLMClient implements ILLMClient, ILLMCaller {
  protected readonly model: string;
  protected readonly maxTokens: number;

  constructor(model: string, maxTokens: number) {
    this.model = model;
    this.maxTokens = maxTokens;
  }

  /**
   * Provider-specific API call.
   * @param maxTokens - Optional override for max response tokens.
   */
  protected abstract callAPI(
    systemPrompt: string,
    userMessage: string,
    maxTokens?: number,
  ): Promise<IAPICallResult>;

  /**
   * Provider-specific API call for simple completions (used by ILLMCaller).
   * Default implementation delegates to callAPI and returns just the text.
   */
  async complete(options: ILLMCallerOptions): Promise<string> {
    const result = await this.callAPI(options.system, options.userMessage, options.maxTokens);
    return result.text;
  }

  async enrichCommit(input: ILLMEnrichmentInput): Promise<ILLMEnrichmentResult> {
    const userMessage = this.buildUserMessage(input);

    try {
      const result = await this.callAPI(ENRICHMENT_SYSTEM_PROMPT, userMessage, this.maxTokens);
      const facts = this.parseResponse(result.text);

      return {
        facts,
        usage: {
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
        },
      };
    } catch (error) {
      if (error instanceof LLMError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      throw new LLMError(`LLM API call failed: ${message}`, {
        sha: input.sha,
        model: this.model,
      });
    }
  }

  /**
   * Build the user message from commit data.
   */
  buildUserMessage(input: ILLMEnrichmentInput): string {
    const parts: string[] = [
      `## Commit: ${input.sha.slice(0, 8)}`,
      '',
      `**Subject:** ${input.subject}`,
    ];

    if (input.body) {
      parts.push('', '**Body:**', input.body);
    }

    if (input.filesChanged.length > 0) {
      parts.push('', `**Files changed:** ${input.filesChanged.join(', ')}`);
    }

    if (input.diff) {
      parts.push('', '**Diff:**', '```', input.diff, '```');
    }

    return parts.join('\n');
  }

  /**
   * Parse the LLM response into structured facts.
   * Defensive: strips markdown fences, validates each entry, drops malformed.
   */
  parseResponse(text: string): ILLMExtractedFact[] {
    let cleaned = text.trim();

    // Strip markdown code fences if present
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return [];
    }

    if (!Array.isArray(parsed)) {
      return [];
    }

    const facts: ILLMExtractedFact[] = [];
    for (const entry of parsed) {
      const fact = this.validateFact(entry);
      if (fact) {
        facts.push(fact);
      }
    }

    return facts;
  }

  /**
   * Validate a single parsed fact entry.
   * Returns null if the entry is malformed.
   */
  validateFact(entry: unknown): ILLMExtractedFact | null {
    if (!entry || typeof entry !== 'object') return null;

    const obj = entry as Record<string, unknown>;

    // content is required and must be a non-empty string
    if (typeof obj.content !== 'string' || obj.content.trim().length === 0) {
      return null;
    }

    // type must be a valid MemoryType
    if (typeof obj.type !== 'string' || !MEMORY_TYPE_VALUES.includes(obj.type as MemoryType)) {
      return null;
    }

    // confidence: default to 'medium' if missing/invalid
    let confidence: ConfidenceLevel = 'medium';
    if (typeof obj.confidence === 'string' && CONFIDENCE_VALUES.includes(obj.confidence as ConfidenceLevel)) {
      confidence = obj.confidence as ConfidenceLevel;
    }

    // tags: default to empty array if missing/invalid
    let tags: string[] = [];
    if (Array.isArray(obj.tags)) {
      tags = obj.tags.filter((t): t is string => typeof t === 'string');
    }

    return {
      content: obj.content.trim(),
      type: obj.type as MemoryType,
      confidence,
      tags,
    };
  }
}
