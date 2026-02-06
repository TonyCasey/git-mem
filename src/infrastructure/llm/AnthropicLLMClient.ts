/**
 * AnthropicLLMClient
 *
 * Infrastructure implementation of ILLMClient using the Anthropic SDK.
 * Sends commit message + diff to Claude for structured memory extraction.
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
  ILLMClient,
  ILLMEnrichmentInput,
  ILLMEnrichmentResult,
  ILLMExtractedFact,
} from '../../domain/interfaces/ILLMClient';
import type { MemoryType } from '../../domain/entities/IMemoryEntity';
import { MEMORY_TYPE_VALUES } from '../../domain/entities/IMemoryEntity';
import type { ConfidenceLevel } from '../../domain/types/IMemoryQuality';
import { CONFIDENCE_VALUES } from '../../domain/types/IMemoryQuality';
import { LLMError } from '../../domain/errors/LLMError';

export interface IAnthropicLLMClientOptions {
  /** Anthropic API key. Falls back to ANTHROPIC_API_KEY env var. */
  readonly apiKey?: string;
  /** Model to use. Default: claude-sonnet-4-20250514. */
  readonly model?: string;
  /** Max tokens for response. Default: 2048. */
  readonly maxTokens?: number;
}

const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const DEFAULT_MAX_TOKENS = 2048;

const SYSTEM_PROMPT = `You are a code archaeology assistant. Given a git commit message and its diff, extract structured memories (decisions, gotchas, conventions, and facts) that would be valuable for future AI coding tools working in this codebase.

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

export class AnthropicLLMClient implements ILLMClient {
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly maxTokens: number;

  constructor(options?: IAnthropicLLMClientOptions) {
    const apiKey = options?.apiKey || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new LLMError('Anthropic API key required. Set ANTHROPIC_API_KEY or pass apiKey option.');
    }

    this.client = new Anthropic({ apiKey });
    this.model = options?.model || DEFAULT_MODEL;
    this.maxTokens = options?.maxTokens || DEFAULT_MAX_TOKENS;
  }

  async enrichCommit(input: ILLMEnrichmentInput): Promise<ILLMEnrichmentResult> {
    const userMessage = this.buildUserMessage(input);

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
      });

      const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map(block => block.text)
        .join('');

      const facts = this.parseResponse(text);

      return {
        facts,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
      };
    } catch (error) {
      if (error instanceof LLMError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      throw new LLMError(`Anthropic API call failed: ${message}`, {
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
      parts.push('', `**Body:**`, input.body);
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
  private validateFact(entry: unknown): ILLMExtractedFact | null {
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
