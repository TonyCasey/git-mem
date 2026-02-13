/**
 * SessionCaptureService unit tests
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SessionCaptureService } from '../../../../src/application/services/SessionCaptureService';
import type { IExtractService, IExtractResult } from '../../../../src/application/interfaces/IExtractService';

function createMockExtractService(result: Partial<IExtractResult> = {}): IExtractService {
  return {
    extract: async () => ({
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
  it('should delegate to extractService with enrich false and dryRun false', async () => {
    let capturedOptions: Record<string, unknown> | undefined;
    const extractService: IExtractService = {
      extract: async (options) => {
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

    const service = new SessionCaptureService(extractService);
    await service.capture({ sessionId: 'test', cwd: '/tmp/repo' });

    assert.ok(capturedOptions);
    assert.equal(capturedOptions!.enrich, false);
    assert.equal(capturedOptions!.dryRun, false);
    assert.equal(capturedOptions!.cwd, '/tmp/repo');
    assert.ok(capturedOptions!.since instanceof Date);
  });

  it('should return structured result with facts extracted', async () => {
    const extractService = createMockExtractService({
      commitsScanned: 10,
      factsExtracted: 4,
    });

    const service = new SessionCaptureService(extractService);
    const result = await service.capture({ sessionId: 'sess-1' });

    assert.equal(result.commitsScanned, 10);
    assert.equal(result.memoriesExtracted, 4);
    assert.ok(result.summary.includes('4 memories'));
    assert.ok(result.summary.includes('10 commits'));
  });

  it('should return summary with no memories message when none extracted', async () => {
    const extractService = createMockExtractService({
      commitsScanned: 3,
      factsExtracted: 0,
    });

    const service = new SessionCaptureService(extractService);
    const result = await service.capture({ sessionId: 'sess-1' });

    assert.equal(result.memoriesExtracted, 0);
    assert.ok(result.summary.includes('no new memories'));
  });

  it('should propagate errors from extractService', async () => {
    const extractService: IExtractService = {
      extract: async () => { throw new Error('git failed'); },
    };

    const service = new SessionCaptureService(extractService);

    await assert.rejects(
      () => service.capture({ sessionId: 'sess-1' }),
      { message: 'git failed' },
    );
  });
});
