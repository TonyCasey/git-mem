/**
 * SessionStopHandler unit tests
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SessionStopHandler } from '../../../../src/application/handlers/SessionStopHandler';
import type { ISessionCaptureService, ISessionCaptureResult } from '../../../../src/domain/interfaces/ISessionCaptureService';
import type { ISessionStopEvent } from '../../../../src/domain/events/HookEvents';
import type { IRuntimeService } from '../../../../src/domain/interfaces/IRuntimeService';

function createEvent(overrides?: Partial<ISessionStopEvent>): ISessionStopEvent {
  return {
    type: 'session:stop',
    sessionId: 'test-session',
    cwd: '/tmp/test',
    ...overrides,
  };
}

function createMockCaptureService(result: Partial<ISessionCaptureResult> = {}): ISessionCaptureService {
  return {
    capture: async () => ({
      commitsScanned: 5,
      memoriesExtracted: 2,
      summary: 'Captured 2 memories from 5 commits.',
      ...result,
    }),
  };
}

function createMockRuntimeService(overrides?: Partial<IRuntimeService>): IRuntimeService & { deactivateCalls: string[] } {
  const deactivateCalls: string[] = [];
  return {
    deactivateCalls,
    activate: () => {},
    deactivate: (cwd?: string) => { deactivateCalls.push(cwd ?? ''); },
    read: () => undefined,
    ...overrides,
  };
}

describe('SessionStopHandler', () => {
  it('should return success with capture summary', async () => {
    const captureService = createMockCaptureService();
    const handler = new SessionStopHandler(captureService);

    const result = await handler.handle(createEvent());

    assert.equal(result.success, true);
    assert.equal(result.handler, 'SessionStopHandler');
    assert.ok(result.output?.includes('Captured 2 memories'));
  });

  it('should pass sessionId and cwd to capture service', async () => {
    let capturedOptions: Record<string, unknown> | undefined;
    const captureService: ISessionCaptureService = {
      capture: async (options) => {
        capturedOptions = options as unknown as Record<string, unknown>;
        return { commitsScanned: 0, memoriesExtracted: 0, summary: '' };
      },
    };
    const handler = new SessionStopHandler(captureService);

    await handler.handle(createEvent({ sessionId: 'abc', cwd: '/my/repo' }));

    assert.equal(capturedOptions!.sessionId, 'abc');
    assert.equal(capturedOptions!.cwd, '/my/repo');
  });

  it('should return failure when capture service throws', async () => {
    const captureService: ISessionCaptureService = {
      capture: async () => { throw new Error('capture failed'); },
    };
    const handler = new SessionStopHandler(captureService);

    const result = await handler.handle(createEvent());

    assert.equal(result.success, false);
    assert.equal(result.handler, 'SessionStopHandler');
    assert.ok(result.error instanceof Error);
    assert.equal(result.error!.message, 'capture failed');
  });

  it('should handle non-Error throws', async () => {
    const captureService: ISessionCaptureService = {
      capture: async () => { throw 'string error'; },
    };
    const handler = new SessionStopHandler(captureService);

    const result = await handler.handle(createEvent());

    assert.equal(result.success, false);
    assert.ok(result.error instanceof Error);
    assert.equal(result.error!.message, 'string error');
  });

  describe('runtime deactivation', () => {
    it('should call runtimeService.deactivate with cwd after capture', async () => {
      const captureService = createMockCaptureService();
      const runtimeService = createMockRuntimeService();
      const handler = new SessionStopHandler(captureService, undefined, runtimeService);

      await handler.handle(createEvent({ cwd: '/my/repo' }));

      assert.equal(runtimeService.deactivateCalls.length, 1);
      assert.equal(runtimeService.deactivateCalls[0], '/my/repo');
    });

    it('should not crash if runtimeService is not provided', async () => {
      const captureService = createMockCaptureService();
      const handler = new SessionStopHandler(captureService);

      const result = await handler.handle(createEvent());

      assert.equal(result.success, true);
    });

    it('should continue if runtimeService.deactivate throws', async () => {
      const captureService = createMockCaptureService();
      const runtimeService = createMockRuntimeService({
        deactivate: () => { throw new Error('deactivate failed'); },
      });
      const handler = new SessionStopHandler(captureService, undefined, runtimeService);

      const result = await handler.handle(createEvent());

      assert.equal(result.success, true);
    });

    it('should call deactivate after capture completes', async () => {
      const callOrder: string[] = [];
      const captureService: ISessionCaptureService = {
        capture: async () => {
          callOrder.push('capture');
          return { commitsScanned: 0, memoriesExtracted: 0, summary: '' };
        },
      };
      const runtimeService: IRuntimeService = {
        activate: () => {},
        deactivate: () => { callOrder.push('deactivate'); },
        read: () => undefined,
      };
      const handler = new SessionStopHandler(captureService, undefined, runtimeService);

      await handler.handle(createEvent());

      assert.deepEqual(callOrder, ['capture', 'deactivate']);
    });
  });
});
