import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GeminiLLMClient } from '../../../../src/infrastructure/llm/GeminiLLMClient';
import { LLMError } from '../../../../src/domain/errors/LLMError';

describe('GeminiLLMClient', () => {
  describe('constructor', () => {
    it('should throw LLMError when no API key is provided', () => {
      const savedGoogle = process.env.GOOGLE_API_KEY;
      const savedGemini = process.env.GEMINI_API_KEY;
      delete process.env.GOOGLE_API_KEY;
      delete process.env.GEMINI_API_KEY;

      try {
        assert.throws(
          () => new GeminiLLMClient(),
          (err: unknown) => {
            assert.ok(err instanceof LLMError);
            assert.ok(err.message.includes('API key'));
            return true;
          },
        );
      } finally {
        if (savedGoogle !== undefined) process.env.GOOGLE_API_KEY = savedGoogle;
        if (savedGemini !== undefined) process.env.GEMINI_API_KEY = savedGemini;
      }
    });

    it('should accept explicit apiKey option', () => {
      const client = new GeminiLLMClient({ apiKey: 'AIza-test-key' });
      assert.ok(client);
    });

    it('should accept GEMINI_API_KEY env var', () => {
      const savedGoogle = process.env.GOOGLE_API_KEY;
      const savedGemini = process.env.GEMINI_API_KEY;
      delete process.env.GOOGLE_API_KEY;
      process.env.GEMINI_API_KEY = 'AIza-env-key';

      try {
        const client = new GeminiLLMClient();
        assert.ok(client);
      } finally {
        if (savedGoogle !== undefined) process.env.GOOGLE_API_KEY = savedGoogle;
        else delete process.env.GOOGLE_API_KEY;
        if (savedGemini !== undefined) process.env.GEMINI_API_KEY = savedGemini;
        else delete process.env.GEMINI_API_KEY;
      }
    });

    it('should accept custom model option', () => {
      const client = new GeminiLLMClient({ apiKey: 'AIza-test', model: 'gemini-1.5-pro' });
      assert.ok(client);
    });
  });
});
