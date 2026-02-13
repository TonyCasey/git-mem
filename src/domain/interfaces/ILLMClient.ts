/**
 * ILLMClient
 *
 * Provider-agnostic interface for LLM operations used during extract enrichment.
 * Infrastructure layer provides concrete implementations (Anthropic, OpenAI, etc.).
 */

import type { MemoryType } from '../entities/IMemoryEntity';
import type { ConfidenceLevel } from '../types/IMemoryQuality';

/**
 * Input to an LLM enrichment call for a single commit.
 */
export interface ILLMEnrichmentInput {
  /** Commit SHA. */
  readonly sha: string;
  /** Commit subject line. */
  readonly subject: string;
  /** Commit body. */
  readonly body: string;
  /** Full diff text (may be truncated). */
  readonly diff: string;
  /** File paths changed. */
  readonly filesChanged: readonly string[];
}

/**
 * A single fact extracted by the LLM from a commit.
 */
export interface ILLMExtractedFact {
  /** The memory content text. */
  readonly content: string;
  /** Memory type classification. */
  readonly type: MemoryType;
  /** Confidence level assigned by the LLM. */
  readonly confidence: ConfidenceLevel;
  /** Tags extracted by the LLM. */
  readonly tags: readonly string[];
}

/**
 * Result of an LLM enrichment call for a single commit.
 */
export interface ILLMEnrichmentResult {
  /** Extracted facts. */
  readonly facts: readonly ILLMExtractedFact[];
  /** Token usage for cost tracking. */
  readonly usage: {
    readonly inputTokens: number;
    readonly outputTokens: number;
  };
}

/**
 * Provider-agnostic LLM client interface.
 */
export interface ILLMClient {
  /**
   * Extract structured memories from a commit's message and diff.
   * @param input - Commit data and diff to analyze.
   * @returns Extracted facts and token usage.
   * @throws LLMError on API failure.
   */
  enrichCommit(input: ILLMEnrichmentInput): Promise<ILLMEnrichmentResult>;
}
