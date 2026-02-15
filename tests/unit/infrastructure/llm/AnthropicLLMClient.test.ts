import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AnthropicLLMClient } from '../../../../src/infrastructure/llm/AnthropicLLMClient';
import { BaseLLMClient } from '../../../../src/infrastructure/llm/BaseLLMClient';
import { LLMError } from '../../../../src/domain/errors/LLMError';

describe('AnthropicLLMClient', () => {
  describe('constructor', () => {
    it('should throw LLMError when no API key is provided', () => {
      const saved = process.env.ANTHROPIC_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;

      try {
        assert.throws(
          () => new AnthropicLLMClient(),
          (err: unknown) => {
            assert.ok(err instanceof LLMError);
            assert.ok(err.message.includes('API key'));
            return true;
          },
        );
      } finally {
        if (saved !== undefined) {
          process.env.ANTHROPIC_API_KEY = saved;
        }
      }
    });

    it('should accept explicit apiKey option', () => {
      const client = new AnthropicLLMClient({ apiKey: 'sk-ant-test-key' });
      assert.ok(client);
    });

    it('should extend BaseLLMClient', () => {
      const client = new AnthropicLLMClient({ apiKey: 'sk-ant-test-key' });
      assert.ok(client instanceof BaseLLMClient);
    });

    it('should implement ILLMCaller (complete method)', () => {
      const client = new AnthropicLLMClient({ apiKey: 'sk-ant-test-key' });
      assert.equal(typeof client.complete, 'function');
    });
  });

  // Note: buildUserMessage, parseResponse, validateFact, and enrichCommit
  // are tested in BaseLLMClient.test.ts since they are shared logic.
});
