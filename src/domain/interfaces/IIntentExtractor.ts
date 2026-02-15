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
 * Reason for skipping intent extraction.
 */
export type IntentSkipReason =
  | 'too_short'
  | 'confirmation'
  | 'no_llm'
  | 'llm_skip'
  | 'timeout'
  | 'error';

/**
 * Result of intent extraction.
 *
 * This is a discriminated union keyed by `skipped`:
 * - When `skipped` is `true`, `intent` is always `null` and `reason` is defined.
 * - When `skipped` is `false`, `intent` may be a string, and `reason` is undefined.
 */
export type IIntentExtractorResult =
  | {
      /** Whether extraction was skipped. */
      readonly skipped: true;
      /** Always null when extraction is skipped. */
      readonly intent: null;
      /**
       * Reason for skipping.
       * - 'too_short': Prompt has fewer words than minWords threshold.
       * - 'confirmation': Prompt is a simple confirmation (yes/no/ok/etc).
       * - 'no_llm': No LLM client available.
       * - 'llm_skip': LLM returned SKIP (no extractable keywords).
       * - 'timeout': LLM call timed out.
       * - 'error': LLM call failed with error.
       */
      readonly reason: IntentSkipReason;
    }
  | {
      /** Whether extraction was skipped. */
      readonly skipped: false;
      /** Extracted keywords for memory search. */
      readonly intent: string;
      /** Reason is not present when extraction succeeded. */
      readonly reason?: undefined;
    };

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
