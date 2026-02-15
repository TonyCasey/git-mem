/**
 * AnthropicLLMClient
 *
 * Anthropic provider implementation extending BaseLLMClient.
 * Uses the Anthropic SDK for Claude API calls.
 */

import Anthropic from '@anthropic-ai/sdk';
import { BaseLLMClient } from './BaseLLMClient';
import type { IAPICallResult } from './BaseLLMClient';
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

export class AnthropicLLMClient extends BaseLLMClient {
  private readonly client: Anthropic;

  constructor(options?: IAnthropicLLMClientOptions) {
    const apiKey = options?.apiKey || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new LLMError('Anthropic API key required. Set ANTHROPIC_API_KEY or pass apiKey option.');
    }

    super(options?.model || DEFAULT_MODEL, options?.maxTokens || DEFAULT_MAX_TOKENS);
    this.client = new Anthropic({ apiKey });
  }

  protected async callAPI(
    systemPrompt: string,
    userMessage: string,
    maxTokens?: number,
  ): Promise<IAPICallResult> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: maxTokens ?? this.maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map(block => block.text)
      .join('');

    return {
      text,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
  }
}
