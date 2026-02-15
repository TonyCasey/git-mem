/**
 * PromptSubmitHandler unit tests
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PromptSubmitHandler } from '../../../../src/application/handlers/PromptSubmitHandler';
import type { IMemoryContextLoader, IMemoryContextResult } from '../../../../src/domain/interfaces/IMemoryContextLoader';
import type { IContextFormatter } from '../../../../src/domain/interfaces/IContextFormatter';
import type { IPromptSubmitEvent } from '../../../../src/domain/events/HookEvents';
import type { IMemoryEntity } from '../../../../src/domain/entities/IMemoryEntity';
import type { IHookConfigLoader } from '../../../../src/domain/interfaces/IHookConfigLoader';
import type { IHookConfig } from '../../../../src/domain/interfaces/IHookConfig';
import type { IIntentExtractor, IIntentExtractorResult } from '../../../../src/domain/interfaces/IIntentExtractor';

function createEvent(overrides?: Partial<IPromptSubmitEvent>): IPromptSubmitEvent {
  return {
    type: 'prompt:submit',
    sessionId: 'test-session',
    prompt: 'What is this project?',
    cwd: '/tmp/test',
    ...overrides,
  };
}

function createMemory(overrides?: Partial<IMemoryEntity>): IMemoryEntity {
  return {
    id: 'mem-1',
    content: 'Test memory',
    type: 'fact',
    sha: 'abc123',
    confidence: 'high',
    source: 'user-explicit',
    lifecycle: 'project',
    tags: [],
    createdAt: '2026-02-12T10:00:00Z',
    updatedAt: '2026-02-12T10:00:00Z',
    ...overrides,
  };
}

function createMockLoader(
  result: IMemoryContextResult,
  queryResult?: IMemoryContextResult,
): IMemoryContextLoader {
  return {
    load: () => result,
    loadWithQuery: () => queryResult ?? result,
  };
}

function createMockFormatter(output: string): IContextFormatter {
  return {
    format: () => output,
  };
}

function createMockConfigLoader(overrides?: Partial<IHookConfig['hooks']['promptSubmit']>): IHookConfigLoader {
  const defaultPromptSubmit = {
    enabled: true,
    recordPrompts: false,
    surfaceContext: true,
    extractIntent: false,
    intentTimeout: 3000,
    minWords: 5,
    memoryLimit: 20,
    ...overrides,
  };

  return {
    loadConfig: (): IHookConfig => ({
      hooks: {
        enabled: true,
        sessionStart: { enabled: true, memoryLimit: 20 },
        sessionStop: { enabled: true, autoExtract: true, threshold: 3 },
        promptSubmit: defaultPromptSubmit,
        postCommit: { enabled: true },
        commitMsg: {
          enabled: true,
          autoAnalyze: true,
          inferTags: true,
          requireType: false,
          defaultLifecycle: 'project',
          enrich: true,
          enrichTimeout: 8000,
        },
      },
    }),
  };
}

function createMockIntentExtractor(result: IIntentExtractorResult): IIntentExtractor {
  return {
    extract: async () => result,
  };
}

describe('PromptSubmitHandler', () => {
  describe('basic functionality', () => {
    it('should return success with formatted output when memories exist', async () => {
      const memories = [createMemory()];
      const loader = createMockLoader({ memories, total: 1, filtered: 1 });
      const formatter = createMockFormatter('# Context');
      const handler = new PromptSubmitHandler(loader, formatter);

      const result = await handler.handle(createEvent());

      assert.equal(result.success, true);
      assert.equal(result.handler, 'PromptSubmitHandler');
      assert.equal(result.output, '# Context');
    });

    it('should return success with empty output when no memories', async () => {
      const loader = createMockLoader({ memories: [], total: 0, filtered: 0 });
      let formatterCalled = false;
      const formatter: IContextFormatter = {
        format: () => { formatterCalled = true; return ''; },
      };
      const handler = new PromptSubmitHandler(loader, formatter);

      const result = await handler.handle(createEvent());

      assert.equal(result.success, true);
      assert.equal(result.output, '');
      assert.ok(!formatterCalled, 'formatter should not be called when no memories');
    });

    it('should handle non-Error throws', async () => {
      const loader: IMemoryContextLoader = {
        load: () => { throw 'string error'; },
        loadWithQuery: () => { throw 'string error'; },
      };
      const formatter = createMockFormatter('');
      const handler = new PromptSubmitHandler(loader, formatter);

      const result = await handler.handle(createEvent());

      assert.equal(result.success, false);
      assert.ok(result.error instanceof Error);
      assert.equal(result.error!.message, 'string error');
    });

    it('should pass event cwd to loader', async () => {
      let capturedCwd: string | undefined;
      const loader: IMemoryContextLoader = {
        load: (options) => {
          capturedCwd = options?.cwd;
          return { memories: [], total: 0, filtered: 0 };
        },
        loadWithQuery: () => ({ memories: [], total: 0, filtered: 0 }),
      };
      const formatter = createMockFormatter('');
      const handler = new PromptSubmitHandler(loader, formatter);

      await handler.handle(createEvent({ cwd: '/my/repo' }));

      assert.equal(capturedCwd, '/my/repo');
    });

    it('should return failure result when loader throws', async () => {
      const loader: IMemoryContextLoader = {
        load: () => { throw new Error('load failed'); },
        loadWithQuery: () => { throw new Error('load failed'); },
      };
      const formatter = createMockFormatter('');
      const handler = new PromptSubmitHandler(loader, formatter);

      const result = await handler.handle(createEvent());

      assert.equal(result.success, false);
      assert.equal(result.handler, 'PromptSubmitHandler');
      assert.ok(result.error instanceof Error);
      assert.equal(result.error!.message, 'load failed');
    });

    it('should return failure result when formatter throws', async () => {
      const memories = [createMemory()];
      const loader = createMockLoader({ memories, total: 1, filtered: 1 });
      const formatter: IContextFormatter = {
        format: () => { throw new Error('format failed'); },
      };
      const handler = new PromptSubmitHandler(loader, formatter);

      const result = await handler.handle(createEvent());

      assert.equal(result.success, false);
      assert.equal(result.error!.message, 'format failed');
    });
  });

  describe('config handling', () => {
    it('should return empty output when surfaceContext is disabled', async () => {
      const memories = [createMemory()];
      const loader = createMockLoader({ memories, total: 1, filtered: 1 });
      const formatter = createMockFormatter('# Context');
      const configLoader = createMockConfigLoader({ surfaceContext: false });
      const handler = new PromptSubmitHandler(loader, formatter, undefined, configLoader);

      const result = await handler.handle(createEvent());

      assert.equal(result.success, true);
      assert.equal(result.output, '');
    });

    it('should respect memoryLimit from config', async () => {
      let capturedLimit: number | undefined;
      const loader: IMemoryContextLoader = {
        load: (options) => {
          capturedLimit = options?.limit;
          return { memories: [], total: 0, filtered: 0 };
        },
        loadWithQuery: () => ({ memories: [], total: 0, filtered: 0 }),
      };
      const formatter = createMockFormatter('');
      const configLoader = createMockConfigLoader({ memoryLimit: 10 });
      const handler = new PromptSubmitHandler(loader, formatter, undefined, configLoader);

      await handler.handle(createEvent());

      assert.equal(capturedLimit, 10);
    });
  });

  describe('intent extraction', () => {
    it('should use loadWithQuery when intent is extracted', async () => {
      let loadWithQueryCalled = false;
      let capturedQuery: string | undefined;
      const memories = [createMemory({ content: 'Authentication decision' })];
      const loader: IMemoryContextLoader = {
        load: () => ({ memories: [], total: 0, filtered: 0 }),
        loadWithQuery: (query) => {
          loadWithQueryCalled = true;
          capturedQuery = query;
          return { memories, total: 1, filtered: 1 };
        },
      };
      const formatter = createMockFormatter('# Context');
      const configLoader = createMockConfigLoader({ extractIntent: true });
      const intentExtractor = createMockIntentExtractor({
        intent: 'authentication, LoginHandler',
        skipped: false,
      });
      const handler = new PromptSubmitHandler(
        loader,
        formatter,
        undefined,
        configLoader,
        intentExtractor,
      );

      const result = await handler.handle(createEvent({
        prompt: 'Fix the authentication bug in LoginHandler',
      }));

      assert.equal(result.success, true);
      assert.ok(loadWithQueryCalled, 'loadWithQuery should be called');
      assert.equal(capturedQuery, 'authentication, LoginHandler');
    });

    it('should fall back to load when intent is skipped', async () => {
      let loadCalled = false;
      let loadWithQueryCalled = false;
      const loader: IMemoryContextLoader = {
        load: () => {
          loadCalled = true;
          return { memories: [], total: 0, filtered: 0 };
        },
        loadWithQuery: () => {
          loadWithQueryCalled = true;
          return { memories: [], total: 0, filtered: 0 };
        },
      };
      const formatter = createMockFormatter('');
      const configLoader = createMockConfigLoader({ extractIntent: true });
      const intentExtractor = createMockIntentExtractor({
        intent: null,
        skipped: true,
        reason: 'too_short',
      });
      const handler = new PromptSubmitHandler(
        loader,
        formatter,
        undefined,
        configLoader,
        intentExtractor,
      );

      await handler.handle(createEvent({ prompt: 'yes' }));

      assert.ok(loadCalled, 'load should be called');
      assert.ok(!loadWithQueryCalled, 'loadWithQuery should not be called');
    });

    it('should use load when extractIntent is disabled', async () => {
      let loadCalled = false;
      let extractCalled = false;
      const loader: IMemoryContextLoader = {
        load: () => {
          loadCalled = true;
          return { memories: [], total: 0, filtered: 0 };
        },
        loadWithQuery: () => ({ memories: [], total: 0, filtered: 0 }),
      };
      const formatter = createMockFormatter('');
      const configLoader = createMockConfigLoader({ extractIntent: false });
      const intentExtractor: IIntentExtractor = {
        extract: async () => {
          extractCalled = true;
          return { intent: 'keywords', skipped: false };
        },
      };
      const handler = new PromptSubmitHandler(
        loader,
        formatter,
        undefined,
        configLoader,
        intentExtractor,
      );

      await handler.handle(createEvent());

      assert.ok(loadCalled, 'load should be called');
      assert.ok(!extractCalled, 'extract should not be called when disabled');
    });

    it('should use load when intentExtractor is null', async () => {
      let loadCalled = false;
      const loader: IMemoryContextLoader = {
        load: () => {
          loadCalled = true;
          return { memories: [], total: 0, filtered: 0 };
        },
        loadWithQuery: () => ({ memories: [], total: 0, filtered: 0 }),
      };
      const formatter = createMockFormatter('');
      const configLoader = createMockConfigLoader({ extractIntent: true });
      const handler = new PromptSubmitHandler(
        loader,
        formatter,
        undefined,
        configLoader,
        null, // No intent extractor available
      );

      await handler.handle(createEvent());

      assert.ok(loadCalled, 'load should be called');
    });
  });
});
