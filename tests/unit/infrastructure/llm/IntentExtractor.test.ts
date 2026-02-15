/**
 * IntentExtractor unit tests
 *
 * Tests for keyword extraction from user prompts.
 * Uses mock ILLMCaller instead of real LLM calls.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { IntentExtractor } from '../../../../src/infrastructure/llm/IntentExtractor';
import type { ILLMCaller, ILLMCallerOptions } from '../../../../src/domain/interfaces/ILLMCaller';

function createMockCaller(response: string): ILLMCaller {
  return {
    async complete(_options: ILLMCallerOptions): Promise<string> {
      return response;
    },
  };
}

function createSlowCaller(delayMs: number, response: string): ILLMCaller {
  return {
    async complete(_options: ILLMCallerOptions): Promise<string> {
      await new Promise(resolve => setTimeout(resolve, delayMs));
      return response;
    },
  };
}

function createFailingCaller(error: Error): ILLMCaller {
  return {
    async complete(_options: ILLMCallerOptions): Promise<string> {
      throw error;
    },
  };
}

describe('IntentExtractor', () => {
  // Confirmation pattern tests (unchanged — test the regex directly)
  const CONFIRMATION_PATTERN = /^(yes|no|ok|okay|go|sure|proceed|continue|done|y|n|yep|nope|thanks|thank you|\d+)$/i;

  describe('confirmation pattern', () => {
    it('should match "yes"', () => assert.ok(CONFIRMATION_PATTERN.test('yes')));
    it('should match "no"', () => assert.ok(CONFIRMATION_PATTERN.test('no')));
    it('should match "ok"', () => assert.ok(CONFIRMATION_PATTERN.test('ok')));
    it('should match "okay"', () => assert.ok(CONFIRMATION_PATTERN.test('okay')));
    it('should match "go"', () => assert.ok(CONFIRMATION_PATTERN.test('go')));
    it('should match "sure"', () => assert.ok(CONFIRMATION_PATTERN.test('sure')));
    it('should match "proceed"', () => assert.ok(CONFIRMATION_PATTERN.test('proceed')));
    it('should match "continue"', () => assert.ok(CONFIRMATION_PATTERN.test('continue')));
    it('should match "done"', () => assert.ok(CONFIRMATION_PATTERN.test('done')));
    it('should match "y"', () => assert.ok(CONFIRMATION_PATTERN.test('y')));
    it('should match "n"', () => assert.ok(CONFIRMATION_PATTERN.test('n')));
    it('should match "yep"', () => assert.ok(CONFIRMATION_PATTERN.test('yep')));
    it('should match "nope"', () => assert.ok(CONFIRMATION_PATTERN.test('nope')));
    it('should match "thanks"', () => assert.ok(CONFIRMATION_PATTERN.test('thanks')));
    it('should match "thank you"', () => assert.ok(CONFIRMATION_PATTERN.test('thank you')));
    it('should match single digit', () => assert.ok(CONFIRMATION_PATTERN.test('1')));
    it('should match multi-digit number', () => assert.ok(CONFIRMATION_PATTERN.test('42')));

    it('should be case-insensitive', () => {
      assert.ok(CONFIRMATION_PATTERN.test('YES'));
      assert.ok(CONFIRMATION_PATTERN.test('Yes'));
      assert.ok(CONFIRMATION_PATTERN.test('NO'));
      assert.ok(CONFIRMATION_PATTERN.test('OK'));
    });

    it('should NOT match substantive prompts', () => {
      assert.ok(!CONFIRMATION_PATTERN.test('fix the bug'));
      assert.ok(!CONFIRMATION_PATTERN.test('yes please fix it'));
      assert.ok(!CONFIRMATION_PATTERN.test('start on GIT-95'));
      assert.ok(!CONFIRMATION_PATTERN.test('implement authentication'));
    });

    it('should NOT match partial matches', () => {
      assert.ok(!CONFIRMATION_PATTERN.test('yes please'));
      assert.ok(!CONFIRMATION_PATTERN.test('okay then'));
      assert.ok(!CONFIRMATION_PATTERN.test('continue with'));
    });
  });

  describe('word count logic', () => {
    function countWords(prompt: string): number {
      return prompt.trim().split(/\s+/).filter(w => w.length > 0).length;
    }

    it('should count words correctly', () => {
      assert.equal(countWords('hello world'), 2);
      assert.equal(countWords('fix the authentication bug'), 4);
      assert.equal(countWords('implement user authentication for the API'), 6);
    });

    it('should handle multiple spaces', () => {
      assert.equal(countWords('hello   world'), 2);
      assert.equal(countWords('  fix   the   bug  '), 3);
    });

    it('should handle empty string', () => {
      assert.equal(countWords(''), 0);
      assert.equal(countWords('   '), 0);
    });

    it('should skip prompts with fewer than 5 words', () => {
      const minWords = 5;
      assert.ok(countWords('yes') < minWords);
      assert.ok(countWords('fix the bug') < minWords);
      assert.ok(countWords('implement authentication') < minWords);
    });

    it('should process prompts with 5 or more words', () => {
      const minWords = 5;
      assert.ok(countWords('fix the authentication bug please') >= minWords);
      assert.ok(countWords('implement user authentication for the API') >= minWords);
    });
  });

  describe('extract with ILLMCaller', () => {
    it('should return extracted keywords from LLM', async () => {
      const caller = createMockCaller('GIT-95, authentication, login');
      const extractor = new IntentExtractor({ caller });

      const result = await extractor.extract({
        prompt: 'fix the authentication bug in login flow please',
      });

      assert.equal(result.skipped, false);
      assert.equal(result.intent, 'GIT-95, authentication, login');
    });

    it('should skip when LLM returns SKIP', async () => {
      const caller = createMockCaller('SKIP');
      const extractor = new IntentExtractor({ caller });

      const result = await extractor.extract({
        prompt: 'can you help me with something in this project please',
      });

      assert.equal(result.skipped, true);
      assert.equal(result.reason, 'llm_skip');
    });

    it('should skip prompts with too few words', async () => {
      const caller = createMockCaller('should not be called');
      const extractor = new IntentExtractor({ caller, minWords: 5 });

      const result = await extractor.extract({ prompt: 'fix bug' });

      assert.equal(result.skipped, true);
      assert.equal(result.reason, 'too_short');
    });

    it('should skip confirmations', async () => {
      const caller = createMockCaller('should not be called');
      const extractor = new IntentExtractor({ caller, minWords: 1 });

      const result = await extractor.extract({ prompt: 'yes' });

      assert.equal(result.skipped, true);
      assert.equal(result.reason, 'confirmation');
    });

    it('should handle LLM errors gracefully', async () => {
      const caller = createFailingCaller(new Error('API down'));
      const extractor = new IntentExtractor({ caller });

      const result = await extractor.extract({
        prompt: 'implement the new feature for user profiles please',
      });

      assert.equal(result.skipped, true);
      assert.equal(result.reason, 'error');
    });

    it('should handle timeout gracefully', async () => {
      const caller = createSlowCaller(200, 'slow response');
      const extractor = new IntentExtractor({ caller, timeout: 50 });

      const result = await extractor.extract({
        prompt: 'implement the new feature for user profiles please',
      });

      assert.equal(result.skipped, true);
      assert.equal(result.reason, 'timeout');
    });

    it('should return null intent for empty LLM response', async () => {
      const caller = createMockCaller('');
      const extractor = new IntentExtractor({ caller });

      const result = await extractor.extract({
        prompt: 'implement the new feature for user profiles please',
      });

      assert.equal(result.skipped, true);
      assert.equal(result.reason, 'llm_skip');
    });

    it('should pass system prompt and user message to caller', async () => {
      let capturedOptions: ILLMCallerOptions | undefined;
      const caller: ILLMCaller = {
        async complete(options: ILLMCallerOptions): Promise<string> {
          capturedOptions = options;
          return 'keywords';
        },
      };
      const extractor = new IntentExtractor({ caller });

      await extractor.extract({
        prompt: 'fix the authentication bug in the login flow please',
      });

      assert.ok(capturedOptions);
      assert.ok(capturedOptions!.system.includes('Extract searchable keywords'));
      assert.ok(capturedOptions!.userMessage.includes('authentication'));
      assert.equal(capturedOptions!.maxTokens, 100);
    });
  });
});
