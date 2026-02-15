import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BaseLLMClient, ENRICHMENT_SYSTEM_PROMPT } from '../../../../src/infrastructure/llm/BaseLLMClient';
import type { IAPICallResult } from '../../../../src/infrastructure/llm/BaseLLMClient';
import type { ILLMEnrichmentInput } from '../../../../src/domain/interfaces/ILLMClient';
import { LLMError } from '../../../../src/domain/errors/LLMError';

/**
 * Concrete test implementation of BaseLLMClient.
 */
class TestLLMClient extends BaseLLMClient {
  public callAPIFn: (system: string, user: string) => Promise<IAPICallResult>;

  constructor(
    callAPIFn?: (system: string, user: string) => Promise<IAPICallResult>,
  ) {
    super('test-model', 2048);
    this.callAPIFn = callAPIFn ?? (async () => ({
      text: '[]',
      inputTokens: 10,
      outputTokens: 5,
    }));
  }

  protected async callAPI(systemPrompt: string, userMessage: string): Promise<IAPICallResult> {
    return this.callAPIFn(systemPrompt, userMessage);
  }
}

describe('BaseLLMClient', () => {
  describe('buildUserMessage', () => {
    const client = new TestLLMClient();

    it('should include subject and SHA', () => {
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
      const msg = client.buildUserMessage({
        sha: 'abc12345',
        subject: 'feat: something',
        body: 'Decided to use Redis for caching.',
        diff: '',
        filesChanged: [],
      });

      assert.ok(msg.includes('Decided to use Redis'));
      assert.ok(msg.includes('**Body:**'));
    });

    it('should omit body section when body is empty', () => {
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
    const client = new TestLLMClient();

    it('should parse valid JSON array', () => {
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
      assert.equal(client.parseResponse('[]').length, 0);
    });

    it('should strip markdown code fences', () => {
      const wrapped = '```json\n[{"content":"test","type":"fact","confidence":"medium","tags":[]}]\n```';
      const facts = client.parseResponse(wrapped);
      assert.equal(facts.length, 1);
      assert.equal(facts[0]!.content, 'test');
    });

    it('should return empty array for invalid JSON', () => {
      assert.equal(client.parseResponse('not json').length, 0);
    });

    it('should return empty array for non-array JSON', () => {
      assert.equal(client.parseResponse('{"content":"obj"}').length, 0);
    });

    it('should drop entries with missing content', () => {
      const facts = client.parseResponse(JSON.stringify([
        { type: 'fact', confidence: 'high', tags: [] },
        { content: 'valid', type: 'fact', confidence: 'high', tags: [] },
      ]));
      assert.equal(facts.length, 1);
    });

    it('should drop entries with empty content', () => {
      const facts = client.parseResponse(JSON.stringify([
        { content: '', type: 'fact', confidence: 'high', tags: [] },
        { content: '  ', type: 'fact', confidence: 'high', tags: [] },
      ]));
      assert.equal(facts.length, 0);
    });

    it('should drop entries with invalid type', () => {
      const facts = client.parseResponse(JSON.stringify([
        { content: 'bad', type: 'invalid-type', confidence: 'high', tags: [] },
        { content: 'good', type: 'gotcha', confidence: 'high', tags: [] },
      ]));
      assert.equal(facts.length, 1);
      assert.equal(facts[0]!.type, 'gotcha');
    });

    it('should default confidence to medium when invalid', () => {
      const facts = client.parseResponse(JSON.stringify([
        { content: 'fact', type: 'fact', confidence: 'super-high', tags: [] },
      ]));
      assert.equal(facts[0]!.confidence, 'medium');
    });

    it('should default tags to empty array when missing', () => {
      const facts = client.parseResponse(JSON.stringify([
        { content: 'fact', type: 'fact', confidence: 'high' },
      ]));
      assert.deepEqual(facts[0]!.tags, []);
    });

    it('should filter non-string tags', () => {
      const facts = client.parseResponse(JSON.stringify([
        { content: 'fact', type: 'fact', confidence: 'high', tags: ['ok', 123, null, 'fine'] },
      ]));
      assert.deepEqual(facts[0]!.tags, ['ok', 'fine']);
    });

    it('should trim content whitespace', () => {
      const facts = client.parseResponse(JSON.stringify([
        { content: '  padded  ', type: 'fact', confidence: 'high', tags: [] },
      ]));
      assert.equal(facts[0]!.content, 'padded');
    });

    it('should drop null and non-object entries', () => {
      const facts = client.parseResponse(JSON.stringify([
        null, 42, 'str',
        { content: 'valid', type: 'fact', confidence: 'high', tags: [] },
      ]));
      assert.equal(facts.length, 1);
    });
  });

  describe('validateFact', () => {
    const client = new TestLLMClient();

    it('should return null for null input', () => {
      assert.equal(client.validateFact(null), null);
    });

    it('should return null for non-object input', () => {
      assert.equal(client.validateFact('string'), null);
      assert.equal(client.validateFact(42), null);
    });

    it('should accept all valid memory types', () => {
      for (const type of ['decision', 'gotcha', 'convention', 'fact']) {
        const result = client.validateFact({ content: 'test', type, confidence: 'high', tags: [] });
        assert.ok(result, `Should accept type: ${type}`);
        assert.equal(result!.type, type);
      }
    });

    it('should accept all valid confidence levels', () => {
      for (const confidence of ['verified', 'high', 'medium', 'low']) {
        const result = client.validateFact({ content: 'test', type: 'fact', confidence, tags: [] });
        assert.ok(result, `Should accept confidence: ${confidence}`);
        assert.equal(result!.confidence, confidence);
      }
    });
  });

  describe('enrichCommit', () => {
    it('should orchestrate callAPI and return parsed facts', async () => {
      const client = new TestLLMClient(async (_system, _user) => ({
        text: JSON.stringify([
          { content: 'A decision', type: 'decision', confidence: 'high', tags: ['arch'] },
        ]),
        inputTokens: 100,
        outputTokens: 50,
      }));

      const input: ILLMEnrichmentInput = {
        sha: 'abc12345',
        subject: 'feat: add auth',
        body: '',
        diff: '+code',
        filesChanged: ['auth.ts'],
      };

      const result = await client.enrichCommit(input);

      assert.equal(result.facts.length, 1);
      assert.equal(result.facts[0]!.content, 'A decision');
      assert.equal(result.usage.inputTokens, 100);
      assert.equal(result.usage.outputTokens, 50);
    });

    it('should pass ENRICHMENT_SYSTEM_PROMPT to callAPI', async () => {
      let capturedSystem = '';
      const client = new TestLLMClient(async (system, _user) => {
        capturedSystem = system;
        return { text: '[]', inputTokens: 0, outputTokens: 0 };
      });

      await client.enrichCommit({
        sha: 'abc', subject: 'test', body: '', diff: '', filesChanged: [],
      });

      assert.equal(capturedSystem, ENRICHMENT_SYSTEM_PROMPT);
    });

    it('should wrap non-LLMError exceptions', async () => {
      const client = new TestLLMClient(async () => {
        throw new Error('network down');
      });

      await assert.rejects(
        () => client.enrichCommit({
          sha: 'abc', subject: 'test', body: '', diff: '', filesChanged: [],
        }),
        (err: unknown) => {
          assert.ok(err instanceof LLMError);
          assert.ok(err.message.includes('network down'));
          return true;
        },
      );
    });

    it('should re-throw LLMError directly', async () => {
      const client = new TestLLMClient(async () => {
        throw new LLMError('specific error');
      });

      await assert.rejects(
        () => client.enrichCommit({
          sha: 'abc', subject: 'test', body: '', diff: '', filesChanged: [],
        }),
        (err: unknown) => {
          assert.ok(err instanceof LLMError);
          assert.equal(err.message, 'specific error');
          return true;
        },
      );
    });
  });

  describe('complete (ILLMCaller)', () => {
    it('should delegate to callAPI and return text', async () => {
      const client = new TestLLMClient(async (_system, _user) => ({
        text: 'keyword1, keyword2',
        inputTokens: 10,
        outputTokens: 5,
      }));

      const result = await client.complete({
        system: 'Extract keywords',
        userMessage: 'some prompt',
        maxTokens: 100,
      });

      assert.equal(result, 'keyword1, keyword2');
    });
  });
});
