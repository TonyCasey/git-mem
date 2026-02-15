/**
 * ILLMCaller
 *
 * Generic LLM completion interface used by services that need simple
 * text-in/text-out LLM calls (e.g., IntentExtractor).
 * Implemented by BaseLLMClient so any provider can serve as a caller.
 */

export interface ILLMCallerOptions {
  /** System prompt for the LLM. */
  readonly system: string;
  /** User message to send. */
  readonly userMessage: string;
  /** Maximum tokens for the response. */
  readonly maxTokens: number;
}

export interface ILLMCaller {
  /**
   * Send a simple completion request to the LLM.
   * @param options - System prompt, user message, and token limit.
   * @returns The LLM's text response.
   */
  complete(options: ILLMCallerOptions): Promise<string>;
}
