/**
 * SessionStartHandler unit tests
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SessionStartHandler } from '../../../../src/application/handlers/SessionStartHandler';
import type { IMemoryContextLoader, IMemoryContextResult } from '../../../../src/domain/interfaces/IMemoryContextLoader';
import type { IContextFormatter } from '../../../../src/domain/interfaces/IContextFormatter';
import type { ISessionStartEvent } from '../../../../src/domain/events/HookEvents';
import type { IMemoryEntity } from '../../../../src/domain/entities/IMemoryEntity';
import type { IRuntimeService, IRuntimeData } from '../../../../src/domain/interfaces/IRuntimeService';

function createEvent(overrides?: Partial<ISessionStartEvent>): ISessionStartEvent {
  return {
    type: 'session:start',
    sessionId: 'test-session',
    trigger: 'startup',
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

function createMockLoader(result: IMemoryContextResult): IMemoryContextLoader {
  return {
    load: () => result,
  };
}

function createMockFormatter(output: string): IContextFormatter {
  return {
    format: () => output,
  };
}

function createMockRuntimeService(overrides?: Partial<IRuntimeService>): IRuntimeService & { activateCalls: IRuntimeData[] } {
  const activateCalls: IRuntimeData[] = [];
  return {
    activateCalls,
    activate: (data: IRuntimeData) => { activateCalls.push(data); },
    deactivate: () => {},
    read: () => undefined,
    ...overrides,
  };
}

function createDetectFunctions(agent?: string, model?: string): { detectAgent: () => string | undefined; detectModel: () => string | undefined } {
  return {
    detectAgent: () => agent,
    detectModel: () => model,
  };
}

describe('SessionStartHandler', () => {
  it('should return success with formatted output when memories exist', async () => {
    const memories = [createMemory()];
    const loader = createMockLoader({ memories, total: 1, filtered: 1 });
    const formatter = createMockFormatter('# Formatted output');
    const handler = new SessionStartHandler(loader, formatter);

    const result = await handler.handle(createEvent());

    assert.equal(result.success, true);
    assert.equal(result.handler, 'SessionStartHandler');
    assert.equal(result.output, '# Formatted output');
  });

  it('should return success with empty output when no memories', async () => {
    const loader = createMockLoader({ memories: [], total: 0, filtered: 0 });
    let formatterCalled = false;
    const formatter: IContextFormatter = {
      format: () => { formatterCalled = true; return ''; },
    };
    const handler = new SessionStartHandler(loader, formatter);

    const result = await handler.handle(createEvent());

    assert.equal(result.success, true);
    assert.equal(result.output, '');
    assert.ok(!formatterCalled, 'formatter should not be called when no memories');
  });

  it('should handle non-Error throws', async () => {
    const loader: IMemoryContextLoader = {
      load: () => { throw 'string error'; },
    };
    const formatter = createMockFormatter('');
    const handler = new SessionStartHandler(loader, formatter);

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
    };
    const formatter = createMockFormatter('');
    const handler = new SessionStartHandler(loader, formatter);

    await handler.handle(createEvent({ cwd: '/my/repo' }));

    assert.equal(capturedCwd, '/my/repo');
  });

  it('should pass trigger to formatter options', async () => {
    let capturedTrigger: string | undefined;
    const memories = [createMemory()];
    const loader = createMockLoader({ memories, total: 1, filtered: 1 });
    const formatter: IContextFormatter = {
      format: (_mems, options) => {
        capturedTrigger = options?.trigger;
        return 'output';
      },
    };
    const handler = new SessionStartHandler(loader, formatter);

    await handler.handle(createEvent({ trigger: 'resume' }));

    assert.equal(capturedTrigger, 'resume');
  });

  it('should return failure result when loader throws', async () => {
    const loader: IMemoryContextLoader = {
      load: () => { throw new Error('load failed'); },
    };
    const formatter = createMockFormatter('');
    const handler = new SessionStartHandler(loader, formatter);

    const result = await handler.handle(createEvent());

    assert.equal(result.success, false);
    assert.equal(result.handler, 'SessionStartHandler');
    assert.ok(result.error instanceof Error);
    assert.equal(result.error!.message, 'load failed');
  });

  it('should return failure result when formatter throws', async () => {
    const memories = [createMemory()];
    const loader = createMockLoader({ memories, total: 1, filtered: 1 });
    const formatter: IContextFormatter = {
      format: () => { throw new Error('format failed'); },
    };
    const handler = new SessionStartHandler(loader, formatter);

    const result = await handler.handle(createEvent());

    assert.equal(result.success, false);
    assert.equal(result.error!.message, 'format failed');
  });

  describe('runtime activation', () => {
    it('should call runtimeService.activate with detected agent/model', async () => {
      const loader = createMockLoader({ memories: [], total: 0, filtered: 0 });
      const formatter = createMockFormatter('');
      const runtimeService = createMockRuntimeService();
      const { detectAgent, detectModel } = createDetectFunctions('Claude-Code/2.1.0', 'claude-opus-4-5-20251101');
      const handler = new SessionStartHandler(loader, formatter, undefined, runtimeService, detectAgent, detectModel);

      await handler.handle(createEvent({ sessionId: 'session-123', cwd: '/my/repo' }));

      assert.equal(runtimeService.activateCalls.length, 1);
      const activateData = runtimeService.activateCalls[0];
      assert.equal(activateData.sessionId, 'session-123');
      assert.equal(activateData.agent, 'Claude-Code/2.1.0');
      assert.equal(activateData.model, 'claude-opus-4-5-20251101');
      assert.ok(activateData.timestamp);
      assert.ok(activateData.source);
    });

    it('should not crash if runtimeService is not provided', async () => {
      const loader = createMockLoader({ memories: [], total: 0, filtered: 0 });
      const formatter = createMockFormatter('');
      const handler = new SessionStartHandler(loader, formatter);

      const result = await handler.handle(createEvent());

      assert.equal(result.success, true);
    });

    it('should not crash if detect functions are not provided', async () => {
      const loader = createMockLoader({ memories: [], total: 0, filtered: 0 });
      const formatter = createMockFormatter('');
      const runtimeService = createMockRuntimeService();
      const handler = new SessionStartHandler(loader, formatter, undefined, runtimeService);

      const result = await handler.handle(createEvent());

      assert.equal(result.success, true);
      assert.equal(runtimeService.activateCalls.length, 0);
    });

    it('should continue if runtimeService.activate throws', async () => {
      const loader = createMockLoader({ memories: [], total: 0, filtered: 0 });
      const formatter = createMockFormatter('');
      const runtimeService = createMockRuntimeService({
        activate: () => { throw new Error('activate failed'); },
      });
      const { detectAgent, detectModel } = createDetectFunctions('Claude-Code/2.1.0', 'claude-opus-4-5-20251101');
      const handler = new SessionStartHandler(loader, formatter, undefined, runtimeService, detectAgent, detectModel);

      const result = await handler.handle(createEvent());

      assert.equal(result.success, true);
    });

    it('should handle undefined agent and model', async () => {
      const loader = createMockLoader({ memories: [], total: 0, filtered: 0 });
      const formatter = createMockFormatter('');
      const runtimeService = createMockRuntimeService();
      const { detectAgent, detectModel } = createDetectFunctions(undefined, undefined);
      const handler = new SessionStartHandler(loader, formatter, undefined, runtimeService, detectAgent, detectModel);

      await handler.handle(createEvent());

      assert.equal(runtimeService.activateCalls.length, 1);
      assert.equal(runtimeService.activateCalls[0].agent, undefined);
      assert.equal(runtimeService.activateCalls[0].model, undefined);
    });
  });
});
