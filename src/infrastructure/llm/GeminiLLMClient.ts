/**
 * GeminiLLMClient
 *
 * Google Gemini provider implementation extending BaseLLMClient.
 * Uses the `@google/generative-ai` npm package.
 */

import { BaseLLMClient } from './BaseLLMClient';
import type { IAPICallResult } from './BaseLLMClient';
import { LLMError } from '../../domain/errors/LLMError';

export interface IGeminiLLMClientOptions {
  /** Google API key. Falls back to GOOGLE_API_KEY or GEMINI_API_KEY env var. */
  readonly apiKey?: string;
  /** Model to use. Default: gemini-2.0-flash. */
  readonly model?: string;
  /** Max tokens for response. Default: 2048. */
  readonly maxTokens?: number;
}

const DEFAULT_MODEL = 'gemini-2.0-flash';
const DEFAULT_MAX_TOKENS = 2048;

export class GeminiLLMClient extends BaseLLMClient {
  private readonly apiKey: string;

  constructor(options?: IGeminiLLMClientOptions) {
    const apiKey = options?.apiKey || process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new LLMError('Google API key required. Set GOOGLE_API_KEY or GEMINI_API_KEY or pass apiKey option.');
    }

    super(options?.model || DEFAULT_MODEL, options?.maxTokens || DEFAULT_MAX_TOKENS);
    this.apiKey = apiKey;
  }

  protected async callAPI(
    systemPrompt: string,
    userMessage: string,
    maxTokens?: number,
  ): Promise<IAPICallResult> {
    type GeminiModel = {
      generateContent: (params: {
        contents: Array<{ role: string; parts: Array<{ text: string }> }>;
        generationConfig: { maxOutputTokens: number };
      }) => Promise<{
        response: {
          text: () => string;
          usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
        };
      }>;
    };
    type GenAIConstructor = new (apiKey: string) => {
      getGenerativeModel: (opts: { model: string; systemInstruction: string }) => GeminiModel;
    };
    let GoogleGenerativeAI: GenAIConstructor;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod: unknown = require('@google/generative-ai');
      GoogleGenerativeAI = (mod as { GoogleGenerativeAI: GenAIConstructor }).GoogleGenerativeAI;
    } catch {
      throw new LLMError(
        'Google Generative AI SDK not installed. Run: npm install @google/generative-ai',
      );
    }

    const genAI = new GoogleGenerativeAI(this.apiKey);
    const model = genAI.getGenerativeModel({
      model: this.model,
      systemInstruction: systemPrompt,
    });

    try {
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: userMessage }] }],
        generationConfig: { maxOutputTokens: maxTokens ?? this.maxTokens },
      });

      const response = result.response;
      const text = response.text() ?? '';
      const usage = response.usageMetadata;

      return {
        text,
        inputTokens: usage?.promptTokenCount ?? 0,
        outputTokens: usage?.candidatesTokenCount ?? 0,
      };
    } catch (error) {
      if (error instanceof LLMError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      throw new LLMError(`Gemini API call failed: ${message}`);
    }
  }
}
