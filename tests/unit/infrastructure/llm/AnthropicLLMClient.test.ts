import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AnthropicLLMClient } from '../../../../src/infrastructure/llm/AnthropicLLMClient';
import { LLMError } from '../../../../src/domain/errors/LLMError';

describe('AnthropicLLMClient', () => {
  describe('constructor', () => {
    it('should throw LLMError when no API key is provided', () => {
      // Save and clear env
      const saved = process.env.ANTHROPIC_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;

      try {
        assert.throws(
          () => new AnthropicLLMClient(),
          (err: unknown) => {
            assert.ok(err instanceof LLMError);
            assert.ok(err.message.includes('API key'));
            return true;
          }
        );
      } finally {
        // Restore env
        if (saved !== undefined) {
          process.env.ANTHROPIC_API_KEY = saved;
        }
      }
    });

    it('should accept explicit apiKey option', () => {
      const client = new AnthropicLLMClient({ apiKey: 'sk-ant-test-key' });
      assert.ok(client);
    });
  });

  describe('buildUserMessage', () => {
    let client: AnthropicLLMClient;

    // Use a dummy API key for non-API tests
    const dummyKey = 'sk-ant-test-dummy';

    it('should include subject and SHA', () => {
      client = new AnthropicLLMClient({ apiKey: dummyKey });
      const msg = client.buildUserMessage({
        sha: 'abc12345def67890',
        subject: 'feat: add login page',
        body: '',
        diff: '',
        filesChanged: [],
      });

      assert.ok(msg.includes('abc12345'));
      assert.ok(msg.includes('feat: add login page'));
    });

    it('should include body when present', () => {
      client = new AnthropicLLMClient({ apiKey: dummyKey });
      const msg = client.buildUserMessage({
        sha: 'abc12345',
        subject: 'feat: something',
        body: 'Decided to use Redis for caching because it supports TTL.',
        diff: '',
        filesChanged: [],
      });

      assert.ok(msg.includes('Decided to use Redis'));
      assert.ok(msg.includes('**Body:**'));
    });

    it('should omit body section when body is empty', () => {
      client = new AnthropicLLMClient({ apiKey: dummyKey });
      const msg = client.buildUserMessage({
        sha: 'abc12345',
        subject: 'feat: something',
        body: '',
        diff: 'some diff',
        filesChanged: [],
      });

      assert.ok(!msg.includes('**Body:**'));
    });

    it('should include files changed', () => {
      client = new AnthropicLLMClient({ apiKey: dummyKey });
      const msg = client.buildUserMessage({
        sha: 'abc12345',
        subject: 'feat: something',
        body: '',
        diff: '',
        filesChanged: ['src/auth.ts', 'src/login.ts'],
      });

      assert.ok(msg.includes('src/auth.ts'));
      assert.ok(msg.includes('src/login.ts'));
    });

    it('should include diff in code block', () => {
      client = new AnthropicLLMClient({ apiKey: dummyKey });
      const msg = client.buildUserMessage({
        sha: 'abc12345',
        subject: 'feat: something',
        body: '',
        diff: '+const x = 1;\n-const y = 2;',
        filesChanged: [],
      });

      assert.ok(msg.includes('```'));
      assert.ok(msg.includes('+const x = 1;'));
    });
  });

  describe('parseResponse', () => {
    let client: AnthropicLLMClient;
    const dummyKey = 'sk-ant-test-dummy';

    it('should parse valid JSON array', () => {
      client = new AnthropicLLMClient({ apiKey: dummyKey });
      const facts = client.parseResponse(JSON.stringify([
        {
          content: 'Using JWT for stateless auth',
          type: 'decision',
          confidence: 'high',
          tags: ['authentication', 'jwt'],
        },
      ]));

      assert.equal(facts.length, 1);
      assert.equal(facts[0]!.content, 'Using JWT for stateless auth');
      assert.equal(facts[0]!.type, 'decision');
      assert.equal(facts[0]!.confidence, 'high');
      assert.deepEqual(facts[0]!.tags, ['authentication', 'jwt']);
    });

    it('should return empty array for empty JSON array', () => {
      client = new AnthropicLLMClient({ apiKey: dummyKey });
      const facts = client.parseResponse('[]');
      assert.equal(facts.length, 0);
    });

    it('should strip markdown code fences', () => {
      client = new AnthropicLLMClient({ apiKey: dummyKey });
      const wrapped = '```json\n[\n  {\n    "content": "test fact",\n    "type": "fact",\n    "confidence": "medium",\n    "tags": []\n  }\n]\n```';
      const facts = client.parseResponse(wrapped);
      assert.equal(facts.length, 1);
      assert.equal(facts[0]!.content, 'test fact');
    });

    it('should return empty array for invalid JSON', () => {
      client = new AnthropicLLMClient({ apiKey: dummyKey });
      const facts = client.parseResponse('this is not json');
      assert.equal(facts.length, 0);
    });

    it('should return empty array for non-array JSON', () => {
      client = new AnthropicLLMClient({ apiKey: dummyKey });
      const facts = client.parseResponse('{"content": "not an array"}');
      assert.equal(facts.length, 0);
    });

    it('should drop entries with missing content', () => {
      client = new AnthropicLLMClient({ apiKey: dummyKey });
      const facts = client.parseResponse(JSON.stringify([
        { type: 'fact', confidence: 'high', tags: [] },
        { content: 'valid fact', type: 'fact', confidence: 'high', tags: [] },
      ]));

      assert.equal(facts.length, 1);
      assert.equal(facts[0]!.content, 'valid fact');
    });

    it('should drop entries with empty content', () => {
      client = new AnthropicLLMClient({ apiKey: dummyKey });
      const facts = client.parseResponse(JSON.stringify([
        { content: '', type: 'fact', confidence: 'high', tags: [] },
        { content: '  ', type: 'fact', confidence: 'high', tags: [] },
      ]));

      assert.equal(facts.length, 0);
    });

    it('should drop entries with invalid type', () => {
      client = new AnthropicLLMClient({ apiKey: dummyKey });
      const facts = client.parseResponse(JSON.stringify([
        { content: 'some insight', type: 'invalid-type', confidence: 'high', tags: [] },
        { content: 'valid fact', type: 'gotcha', confidence: 'high', tags: [] },
      ]));

      assert.equal(facts.length, 1);
      assert.equal(facts[0]!.type, 'gotcha');
    });

    it('should default confidence to medium when invalid', () => {
      client = new AnthropicLLMClient({ apiKey: dummyKey });
      const facts = client.parseResponse(JSON.stringify([
        { content: 'some fact', type: 'fact', confidence: 'super-high', tags: [] },
      ]));

      assert.equal(facts.length, 1);
      assert.equal(facts[0]!.confidence, 'medium');
    });

    it('should default tags to empty array when missing', () => {
      client = new AnthropicLLMClient({ apiKey: dummyKey });
      const facts = client.parseResponse(JSON.stringify([
        { content: 'some fact', type: 'fact', confidence: 'high' },
      ]));

      assert.equal(facts.length, 1);
      assert.deepEqual(facts[0]!.tags, []);
    });

    it('should filter non-string tags', () => {
      client = new AnthropicLLMClient({ apiKey: dummyKey });
      const facts = client.parseResponse(JSON.stringify([
        { content: 'some fact', type: 'fact', confidence: 'high', tags: ['valid', 123, null, 'also-valid'] },
      ]));

      assert.equal(facts.length, 1);
      assert.deepEqual(facts[0]!.tags, ['valid', 'also-valid']);
    });

    it('should handle multiple valid facts', () => {
      client = new AnthropicLLMClient({ apiKey: dummyKey });
      const facts = client.parseResponse(JSON.stringify([
        { content: 'decision one', type: 'decision', confidence: 'verified', tags: ['auth'] },
        { content: 'gotcha one', type: 'gotcha', confidence: 'high', tags: ['race-condition'] },
        { content: 'convention one', type: 'convention', confidence: 'medium', tags: [] },
      ]));

      assert.equal(facts.length, 3);
      assert.equal(facts[0]!.type, 'decision');
      assert.equal(facts[1]!.type, 'gotcha');
      assert.equal(facts[2]!.type, 'convention');
    });

    it('should drop null and non-object entries', () => {
      client = new AnthropicLLMClient({ apiKey: dummyKey });
      const facts = client.parseResponse(JSON.stringify([
        null,
        42,
        'string',
        { content: 'valid', type: 'fact', confidence: 'high', tags: [] },
      ]));

      assert.equal(facts.length, 1);
    });

    it('should trim content whitespace', () => {
      client = new AnthropicLLMClient({ apiKey: dummyKey });
      const facts = client.parseResponse(JSON.stringify([
        { content: '  padded content  ', type: 'fact', confidence: 'high', tags: [] },
      ]));

      assert.equal(facts[0]!.content, 'padded content');
    });
  });
});
