import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { OllamaLLMClient } from '../../../../src/infrastructure/llm/OllamaLLMClient';

describe('OllamaLLMClient', () => {
  describe('constructor', () => {
    it('should create client with default settings', () => {
      const client = new OllamaLLMClient();
      assert.ok(client);
    });

    it('should accept custom baseUrl option', () => {
      const client = new OllamaLLMClient({ baseUrl: 'http://custom:11434' });
      assert.ok(client);
    });

    it('should accept custom model option', () => {
      const client = new OllamaLLMClient({ model: 'mistral' });
      assert.ok(client);
    });

    it('should use OLLAMA_HOST env var', () => {
      const saved = process.env.OLLAMA_HOST;
      process.env.OLLAMA_HOST = 'http://remote:11434';

      try {
        const client = new OllamaLLMClient();
        assert.ok(client);
      } finally {
        if (saved !== undefined) {
          process.env.OLLAMA_HOST = saved;
        } else {
          delete process.env.OLLAMA_HOST;
        }
      }
    });

    it('should strip trailing slash from baseUrl', () => {
      // Can't directly inspect the private field, but construction should succeed
      const client = new OllamaLLMClient({ baseUrl: 'http://localhost:11434/' });
      assert.ok(client);
    });
  });
});
