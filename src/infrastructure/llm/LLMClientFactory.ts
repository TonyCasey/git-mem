/**
 * LLMClientFactory
 *
 * Creates an ILLMClient instance based on available configuration.
 * Returns null if no API key is found (graceful degradation).
 */

import type { ILLMClient } from '../../domain/interfaces/ILLMClient';
import { AnthropicLLMClient } from './AnthropicLLMClient';

export interface ILLMClientFactoryOptions {
  /** Explicit provider selection. Auto-detected from env if omitted. */
  readonly provider?: 'anthropic';
  /** API key override. Falls back to env var. */
  readonly apiKey?: string;
  /** Model override. */
  readonly model?: string;
}

/**
 * Create an LLM client from options or environment.
 * Returns null if no API key is available (no throw).
 */
export function createLLMClient(options?: ILLMClientFactoryOptions): ILLMClient | null {
  const provider = options?.provider || detectProvider(options?.apiKey);

  if (!provider) {
    return null;
  }

  switch (provider) {
    case 'anthropic': {
      const apiKey = options?.apiKey || process.env.ANTHROPIC_API_KEY;
      if (!apiKey) return null;
      return new AnthropicLLMClient({
        apiKey,
        model: options?.model,
      });
    }
    default:
      return null;
  }
}

/**
 * Detect which LLM provider to use from environment variables.
 */
function detectProvider(explicitApiKey?: string): 'anthropic' | null {
  if (explicitApiKey || process.env.ANTHROPIC_API_KEY) {
    return 'anthropic';
  }
  return null;
}
