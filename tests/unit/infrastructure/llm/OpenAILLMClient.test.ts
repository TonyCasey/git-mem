import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { OpenAILLMClient } from '../../../../src/infrastructure/llm/OpenAILLMClient';
import { LLMError } from '../../../../src/domain/errors/LLMError';

describe('OpenAILLMClient', () => {
  describe('constructor', () => {
    it('should throw LLMError when no API key is provided', () => {
      const saved = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;

      try {
        assert.throws(
          () => new OpenAILLMClient(),
          (err: unknown) => {
            assert.ok(err instanceof LLMError);
            assert.ok(err.message.includes('API key'));
            return true;
          },
        );
      } finally {
        if (saved !== undefined) {
          process.env.OPENAI_API_KEY = saved;
        }
      }
    });

    it('should accept explicit apiKey option', () => {
      const client = new OpenAILLMClient({ apiKey: 'sk-test-key' });
      assert.ok(client);
    });

    it('should accept custom model option', () => {
      const client = new OpenAILLMClient({ apiKey: 'sk-test-key', model: 'gpt-4o-mini' });
      assert.ok(client);
    });
  });
});
