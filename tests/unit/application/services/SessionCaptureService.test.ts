/**
 * SessionCaptureService unit tests
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SessionCaptureService } from '../../../../src/application/services/SessionCaptureService';
import type { ILiberateService, ILiberateResult } from '../../../../src/application/interfaces/ILiberateService';

function createMockLiberateService(result: Partial<ILiberateResult> = {}): ILiberateService {
  return {
    liberate: async () => ({
      commitsScanned: 5,
      commitsAnnotated: 2,
      factsExtracted: 3,
      annotations: [],
      dryRun: false,
      durationMs: 100,
      ...result,
    }),
  };
}

describe('SessionCaptureService', () => {
  it('should delegate to liberateService with enrich false and dryRun false', async () => {
    let capturedOptions: Record<string, unknown> | undefined;
    const liberateService: ILiberateService = {
      liberate: async (options) => {
        capturedOptions = options as unknown as Record<string, unknown>;
        return {
          commitsScanned: 0,
          commitsAnnotated: 0,
          factsExtracted: 0,
          annotations: [],
          dryRun: false,
          durationMs: 0,
        };
      },
    };

    const service = new SessionCaptureService(liberateService);
    await service.capture({ sessionId: 'test', cwd: '/tmp/repo' });

    assert.ok(capturedOptions);
    assert.equal(capturedOptions!.enrich, false);
    assert.equal(capturedOptions!.dryRun, false);
    assert.equal(capturedOptions!.cwd, '/tmp/repo');
    assert.ok(capturedOptions!.since instanceof Date);
  });

  it('should return structured result with facts extracted', async () => {
    const liberateService = createMockLiberateService({
      commitsScanned: 10,
      factsExtracted: 4,
    });

    const service = new SessionCaptureService(liberateService);
    const result = await service.capture({ sessionId: 'sess-1' });

    assert.equal(result.commitsScanned, 10);
    assert.equal(result.memoriesExtracted, 4);
    assert.ok(result.summary.includes('4 memories'));
    assert.ok(result.summary.includes('10 commits'));
  });

  it('should return summary with no memories message when none extracted', async () => {
    const liberateService = createMockLiberateService({
      commitsScanned: 3,
      factsExtracted: 0,
    });

    const service = new SessionCaptureService(liberateService);
    const result = await service.capture({ sessionId: 'sess-1' });

    assert.equal(result.memoriesExtracted, 0);
    assert.ok(result.summary.includes('no new memories'));
  });

  it('should propagate errors from liberateService', async () => {
    const liberateService: ILiberateService = {
      liberate: async () => { throw new Error('git failed'); },
    };

    const service = new SessionCaptureService(liberateService);

    await assert.rejects(
      () => service.capture({ sessionId: 'sess-1' }),
      { message: 'git failed' },
    );
  });
});
