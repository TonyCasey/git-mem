/**
 * OpenAILLMClient
 *
 * OpenAI provider implementation extending BaseLLMClient.
 * Uses the `openai` npm package for GPT API calls.
 */

import { BaseLLMClient } from './BaseLLMClient';
import type { IAPICallResult } from './BaseLLMClient';
import { LLMError } from '../../domain/errors/LLMError';

// OpenAI SDK is an optional peer dependency — no static import.
// eslint-disable-next-line @typescript-eslint/no-require-imports

export interface IOpenAILLMClientOptions {
  /** OpenAI API key. Falls back to OPENAI_API_KEY env var. */
  readonly apiKey?: string;
  /** Model to use. Default: gpt-4o. */
  readonly model?: string;
  /** Max tokens for response. Default: 2048. */
  readonly maxTokens?: number;
}

const DEFAULT_MODEL = 'gpt-4o';
const DEFAULT_MAX_TOKENS = 2048;

export class OpenAILLMClient extends BaseLLMClient {
  private readonly apiKey: string;

  constructor(options?: IOpenAILLMClientOptions) {
    const apiKey = options?.apiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new LLMError('OpenAI API key required. Set OPENAI_API_KEY or pass apiKey option.');
    }

    super(options?.model || DEFAULT_MODEL, options?.maxTokens || DEFAULT_MAX_TOKENS);
    this.apiKey = apiKey;
  }

  protected async callAPI(
    systemPrompt: string,
    userMessage: string,
    maxTokens?: number,
  ): Promise<IAPICallResult> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let OpenAI: any;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require('openai');
      OpenAI = mod.default ?? mod;
    } catch {
      throw new LLMError(
        'OpenAI SDK not installed. Run: npm install openai',
      );
    }

    const client = new OpenAI({ apiKey: this.apiKey });

    try {
      const response = await client.chat.completions.create({
        model: this.model,
        max_tokens: maxTokens ?? this.maxTokens,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
      });

      const text = response.choices[0]?.message?.content ?? '';

      return {
        text,
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
      };
    } catch (error) {
      if (error instanceof LLMError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      throw new LLMError(`OpenAI API call failed: ${message}`);
    }
  }
}
