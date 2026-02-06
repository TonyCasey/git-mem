import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createLLMClient } from '../../../../src/infrastructure/llm/LLMClientFactory';
import { AnthropicLLMClient } from '../../../../src/infrastructure/llm/AnthropicLLMClient';

describe('LLMClientFactory', () => {
  describe('createLLMClient', () => {
    let savedKey: string | undefined;

    before(() => {
      savedKey = process.env.ANTHROPIC_API_KEY;
    });

    after(() => {
      if (savedKey !== undefined) {
        process.env.ANTHROPIC_API_KEY = savedKey;
      } else {
        delete process.env.ANTHROPIC_API_KEY;
      }
    });

    it('should return null when no API key is available', () => {
      delete process.env.ANTHROPIC_API_KEY;
      const client = createLLMClient();
      assert.equal(client, null);
    });

    it('should return AnthropicLLMClient when ANTHROPIC_API_KEY is set', () => {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key';
      const client = createLLMClient();
      assert.ok(client instanceof AnthropicLLMClient);
    });

    it('should return AnthropicLLMClient when explicit apiKey is passed', () => {
      delete process.env.ANTHROPIC_API_KEY;
      const client = createLLMClient({ apiKey: 'sk-ant-explicit-key' });
      assert.ok(client instanceof AnthropicLLMClient);
    });

    it('should return AnthropicLLMClient when provider is explicitly anthropic', () => {
      const client = createLLMClient({
        provider: 'anthropic',
        apiKey: 'sk-ant-test-key',
      });
      assert.ok(client instanceof AnthropicLLMClient);
    });

    it('should return null when provider is anthropic but no key', () => {
      delete process.env.ANTHROPIC_API_KEY;
      const client = createLLMClient({ provider: 'anthropic' });
      assert.equal(client, null);
    });

    it('should pass model option through to client', () => {
      const client = createLLMClient({
        apiKey: 'sk-ant-test-key',
        model: 'claude-haiku-4-5-20251001',
      });
      assert.ok(client instanceof AnthropicLLMClient);
    });
  });
});
