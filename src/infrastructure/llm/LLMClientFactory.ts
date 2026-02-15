/**
 * LLMClientFactory
 *
 * Creates an ILLMClient instance based on available configuration.
 * Returns null if no API key/provider is found (graceful degradation).
 * Supports Anthropic, OpenAI, Gemini, and Ollama providers.
 */

import type { ILLMClient } from '../../domain/interfaces/ILLMClient';
import type { LLMProvider } from '../../domain/interfaces/IHookConfig';

export interface ILLMClientFactoryOptions {
  /** Explicit provider selection. Auto-detected from env if omitted. */
  readonly provider?: LLMProvider;
  /** API key override. Falls back to env var. */
  readonly apiKey?: string;
  /** Model override. */
  readonly model?: string;
  /** Base URL override (e.g., for Ollama host). */
  readonly baseUrl?: string;
}

/**
 * Create an LLM client from options or environment.
 * Returns null if no API key/provider is available (no throw).
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
      const { AnthropicLLMClient } = require('./AnthropicLLMClient');
      return new AnthropicLLMClient({
        apiKey,
        model: options?.model,
      });
    }

    case 'openai': {
      const apiKey = options?.apiKey || process.env.OPENAI_API_KEY;
      if (!apiKey) return null;
      try {
        const { OpenAILLMClient } = require('./OpenAILLMClient');
        return new OpenAILLMClient({
          apiKey,
          model: options?.model,
        });
      } catch {
        return null;
      }
    }

    case 'gemini': {
      const apiKey = options?.apiKey || process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
      if (!apiKey) return null;
      try {
        const { GeminiLLMClient } = require('./GeminiLLMClient');
        return new GeminiLLMClient({
          apiKey,
          model: options?.model,
        });
      } catch {
        return null;
      }
    }

    case 'ollama': {
      try {
        const { OllamaLLMClient } = require('./OllamaLLMClient');
        return new OllamaLLMClient({
          model: options?.model,
          baseUrl: options?.baseUrl,
        });
      } catch {
        return null;
      }
    }

    default:
      return null;
  }
}

/**
 * Detect which LLM provider to use from environment variables.
 * Priority: explicit override > Anthropic > OpenAI > Gemini > Ollama.
 */
export function detectProvider(explicitApiKey?: string): LLMProvider | null {
  // Explicit override via environment variable
  const envProvider = process.env.GIT_MEM_LLM_PROVIDER;
  if (envProvider && isKnownProvider(envProvider)) {
    return envProvider;
  }

  if (explicitApiKey || process.env.ANTHROPIC_API_KEY) {
    return 'anthropic';
  }

  if (process.env.OPENAI_API_KEY) {
    return 'openai';
  }

  if (process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY) {
    return 'gemini';
  }

  if (process.env.OLLAMA_HOST) {
    return 'ollama';
  }

  return null;
}

function isKnownProvider(value: string): value is LLMProvider {
  return ['anthropic', 'openai', 'gemini', 'ollama'].includes(value);
}
