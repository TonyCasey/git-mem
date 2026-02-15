import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createLLMClient, detectProvider } from '../../../../src/infrastructure/llm/LLMClientFactory';
import { AnthropicLLMClient } from '../../../../src/infrastructure/llm/AnthropicLLMClient';

describe('LLMClientFactory', () => {
  // Save all env vars we'll modify
  const envKeys = [
    'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_API_KEY',
    'GEMINI_API_KEY', 'OLLAMA_HOST', 'GIT_MEM_LLM_PROVIDER',
  ] as const;

  let savedEnv: Record<string, string | undefined>;

  function clearAllEnv(): void {
    for (const key of envKeys) {
      delete process.env[key];
    }
  }

  before(() => {
    savedEnv = {};
    for (const key of envKeys) {
      savedEnv[key] = process.env[key];
    }
  });

  after(() => {
    for (const key of envKeys) {
      if (savedEnv[key] !== undefined) {
        process.env[key] = savedEnv[key];
      } else {
        delete process.env[key];
      }
    }
  });

  describe('detectProvider', () => {
    it('should return null when no env vars are set', () => {
      clearAllEnv();
      assert.equal(detectProvider(), null);
    });

    it('should detect anthropic from ANTHROPIC_API_KEY', () => {
      clearAllEnv();
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
      assert.equal(detectProvider(), 'anthropic');
    });

    it('should detect openai from OPENAI_API_KEY', () => {
      clearAllEnv();
      process.env.OPENAI_API_KEY = 'sk-test';
      assert.equal(detectProvider(), 'openai');
    });

    it('should detect gemini from GOOGLE_API_KEY', () => {
      clearAllEnv();
      process.env.GOOGLE_API_KEY = 'AIza-test';
      assert.equal(detectProvider(), 'gemini');
    });

    it('should detect gemini from GEMINI_API_KEY', () => {
      clearAllEnv();
      process.env.GEMINI_API_KEY = 'AIza-test';
      assert.equal(detectProvider(), 'gemini');
    });

    it('should detect ollama from OLLAMA_HOST', () => {
      clearAllEnv();
      process.env.OLLAMA_HOST = 'http://localhost:11434';
      assert.equal(detectProvider(), 'ollama');
    });

    it('should prioritize anthropic over openai', () => {
      clearAllEnv();
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
      process.env.OPENAI_API_KEY = 'sk-test';
      assert.equal(detectProvider(), 'anthropic');
    });

    it('should prioritize openai over gemini', () => {
      clearAllEnv();
      process.env.OPENAI_API_KEY = 'sk-test';
      process.env.GOOGLE_API_KEY = 'AIza-test';
      assert.equal(detectProvider(), 'openai');
    });

    it('should prioritize gemini over ollama', () => {
      clearAllEnv();
      process.env.GOOGLE_API_KEY = 'AIza-test';
      process.env.OLLAMA_HOST = 'http://localhost:11434';
      assert.equal(detectProvider(), 'gemini');
    });

    it('should honor GIT_MEM_LLM_PROVIDER override', () => {
      clearAllEnv();
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
      process.env.GIT_MEM_LLM_PROVIDER = 'openai';
      assert.equal(detectProvider(), 'openai');
    });

    it('should ignore invalid GIT_MEM_LLM_PROVIDER', () => {
      clearAllEnv();
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
      process.env.GIT_MEM_LLM_PROVIDER = 'invalid-provider';
      assert.equal(detectProvider(), 'anthropic');
    });

    it('should use explicit API key to detect anthropic', () => {
      clearAllEnv();
      assert.equal(detectProvider('sk-ant-explicit'), 'anthropic');
    });
  });

  describe('createLLMClient', () => {
    it('should return null when no API key is available', () => {
      clearAllEnv();
      const client = createLLMClient();
      assert.equal(client, null);
    });

    it('should return AnthropicLLMClient when ANTHROPIC_API_KEY is set', () => {
      clearAllEnv();
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key';
      const client = createLLMClient();
      assert.ok(client instanceof AnthropicLLMClient);
    });

    it('should return AnthropicLLMClient when explicit apiKey is passed', () => {
      clearAllEnv();
      const client = createLLMClient({ apiKey: 'sk-ant-explicit-key' });
      assert.ok(client instanceof AnthropicLLMClient);
    });

    it('should return AnthropicLLMClient when provider is explicitly anthropic', () => {
      clearAllEnv();
      const client = createLLMClient({
        provider: 'anthropic',
        apiKey: 'sk-ant-test-key',
      });
      assert.ok(client instanceof AnthropicLLMClient);
    });

    it('should return null when provider is anthropic but no key', () => {
      clearAllEnv();
      const client = createLLMClient({ provider: 'anthropic' });
      assert.equal(client, null);
    });

    it('should pass model option through to client', () => {
      clearAllEnv();
      const client = createLLMClient({
        apiKey: 'sk-ant-test-key',
        model: 'claude-haiku-4-5-20251001',
      });
      assert.ok(client instanceof AnthropicLLMClient);
    });

    it('should not throw for openai even if SDK is missing', () => {
      clearAllEnv();
      process.env.OPENAI_API_KEY = 'sk-test';
      // Factory creates client if openai SDK is installed, returns null if not.
      // SDK availability is checked in the provider's callAPI(), not at construction.
      const client = createLLMClient({ provider: 'openai', apiKey: 'sk-test' });
      assert.ok(client === null || typeof client.enrichCommit === 'function');
    });

    it('should not throw for gemini even if SDK is missing', () => {
      clearAllEnv();
      // Factory creates client if @google/generative-ai is installed, returns null if not.
      // SDK availability is checked in the provider's callAPI(), not at construction.
      const client = createLLMClient({ provider: 'gemini', apiKey: 'AIza-test' });
      assert.ok(client === null || typeof client.enrichCommit === 'function');
    });

    it('should return null for openai when no key provided', () => {
      clearAllEnv();
      const client = createLLMClient({ provider: 'openai' });
      assert.equal(client, null);
    });

    it('should return null for gemini when no key provided', () => {
      clearAllEnv();
      const client = createLLMClient({ provider: 'gemini' });
      assert.equal(client, null);
    });
  });
});
