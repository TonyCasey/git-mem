/**
 * IIntentExtractor
 *
 * Interface for extracting searchable keywords from user prompts.
 * Used by the prompt-submit hook to query memories with intent-based filtering.
 */

/**
 * Input to the intent extraction service.
 */
export interface IIntentExtractorInput {
  /** The user's prompt text. */
  readonly prompt: string;
}

/**
 * Result of intent extraction.
 */
export interface IIntentExtractorResult {
  /**
   * Extracted keywords for memory search.
   * null if extraction was skipped or no keywords found.
   */
  readonly intent: string | null;
  /** Whether extraction was skipped. */
  readonly skipped: boolean;
  /**
   * Reason for skipping.
   * - 'too_short': Prompt has fewer words than minWords threshold.
   * - 'confirmation': Prompt is a simple confirmation (yes/no/ok/etc).
   * - 'no_llm': No LLM client available.
   * - 'llm_skip': LLM returned SKIP (no extractable keywords).
   * - 'timeout': LLM call timed out.
   * - 'error': LLM call failed with error.
   */
  readonly reason?: 'too_short' | 'confirmation' | 'no_llm' | 'llm_skip' | 'timeout' | 'error';
}

/**
 * Service for extracting searchable keywords from user prompts.
 */
export interface IIntentExtractor {
  /**
   * Extract searchable keywords from a user prompt.
   * Returns keywords suitable for memory search, or null if skipped.
   *
   * @param input - The prompt to extract intent from.
   * @returns Extracted keywords or skip indicator.
   */
  extract(input: IIntentExtractorInput): Promise<IIntentExtractorResult>;
}
