/**
 * OllamaLLMClient
 *
 * Ollama provider implementation extending BaseLLMClient.
 * Uses native fetch (no npm dependency) to call the Ollama HTTP API.
 */

import { BaseLLMClient } from './BaseLLMClient';
import type { IAPICallResult } from './BaseLLMClient';
import { LLMError } from '../../domain/errors/LLMError';

export interface IOllamaLLMClientOptions {
  /** Ollama host URL. Falls back to OLLAMA_HOST env var. Default: http://localhost:11434. */
  readonly baseUrl?: string;
  /** Model to use. Default: llama3.2. */
  readonly model?: string;
  /** Max tokens for response. Default: 2048. */
  readonly maxTokens?: number;
  /** Request timeout in ms. Default: 60000 (Ollama is slower than cloud APIs). */
  readonly timeout?: number;
}

const DEFAULT_BASE_URL = 'http://localhost:11434';
const DEFAULT_MODEL = 'llama3.2';
const DEFAULT_MAX_TOKENS = 2048;
const DEFAULT_TIMEOUT = 60000;

export class OllamaLLMClient extends BaseLLMClient {
  private readonly baseUrl: string;
  private readonly timeout: number;

  constructor(options?: IOllamaLLMClientOptions) {
    super(
      options?.model || DEFAULT_MODEL,
      options?.maxTokens || DEFAULT_MAX_TOKENS,
    );
    this.baseUrl = (options?.baseUrl || process.env.OLLAMA_HOST || DEFAULT_BASE_URL).replace(/\/$/, '');
    this.timeout = options?.timeout || DEFAULT_TIMEOUT;
  }

  protected async callAPI(
    systemPrompt: string,
    userMessage: string,
    maxTokens?: number,
  ): Promise<IAPICallResult> {
    const url = `${this.baseUrl}/api/chat`;
    const body = JSON.stringify({
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      stream: false,
      options: {
        num_predict: maxTokens ?? this.maxTokens,
      },
    });

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeout);

      let response: Response;
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'unknown error');
        throw new LLMError(`Ollama API returned ${response.status}: ${errorText}`);
      }

      const data = await response.json() as {
        message?: { content?: string };
        prompt_eval_count?: number;
        eval_count?: number;
      };

      return {
        text: data.message?.content ?? '',
        inputTokens: data.prompt_eval_count ?? 0,
        outputTokens: data.eval_count ?? 0,
      };
    } catch (error) {
      if (error instanceof LLMError) throw error;

      // Specific timeout detection from AbortController
      if (error instanceof Error && error.name === 'AbortError') {
        throw new LLMError(
          `Ollama API request timed out after ${this.timeout}ms`,
        );
      }

      // Friendly message for connection errors
      if (error instanceof TypeError && (error as NodeJS.ErrnoException).cause) {
        const cause = (error as NodeJS.ErrnoException).cause as NodeJS.ErrnoException;
        if (cause.code === 'ECONNREFUSED') {
          throw new LLMError(
            `Cannot connect to Ollama at ${this.baseUrl}. Is Ollama running?`,
          );
        }
      }

      const message = error instanceof Error ? error.message : String(error);
      throw new LLMError(`Ollama API call failed: ${message}`);
    }
  }
}
