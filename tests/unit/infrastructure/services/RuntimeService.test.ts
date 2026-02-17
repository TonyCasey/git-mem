import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { RuntimeService } from '../../../../src/infrastructure/services/RuntimeService';
import type { IRuntimeData } from '../../../../src/domain/interfaces/IRuntimeService';

describe('RuntimeService', () => {
  let service: RuntimeService;

  before(() => {
    service = new RuntimeService();
  });

  function createRuntimeData(overrides?: Partial<IRuntimeData>): IRuntimeData {
    return {
      sessionId: 'test-session-123',
      agent: 'Claude-Code/2.1.0',
      model: 'claude-opus-4-5-20251101',
      timestamp: new Date().toISOString(),
      source: 'env:CLAUDECODE',
      ...overrides,
    };
  }

  function withTestDir(run: (testDir: string) => void): void {
    const testDir = mkdtempSync(join(tmpdir(), 'git-mem-runtime-test-'));
    try {
      run(testDir);
    } finally {
      if (existsSync(testDir)) {
        rmSync(testDir, { recursive: true, force: true });
      }
    }
  }

  describe('activate', () => {
    it('should create runtime.json with correct content', () => {
      withTestDir((testDir) => {
        const data = createRuntimeData();
        service.activate(data, testDir);

        const filePath = join(testDir, '.git-mem', 'runtime.json');
        assert.ok(existsSync(filePath), 'runtime.json should exist');

        const content = JSON.parse(readFileSync(filePath, 'utf8'));
        assert.equal(content.sessionId, data.sessionId);
        assert.equal(content.agent, data.agent);
        assert.equal(content.model, data.model);
        assert.equal(content.timestamp, data.timestamp);
        assert.equal(content.source, data.source);
      });
    });

    it('should create .git-mem/ directory if missing', () => {
      withTestDir((testDir) => {
        const gitMemDir = join(testDir, '.git-mem');
        assert.ok(!existsSync(gitMemDir), '.git-mem should not exist initially');

        const data = createRuntimeData();
        service.activate(data, testDir);

        assert.ok(existsSync(gitMemDir), '.git-mem directory should be created');
        assert.ok(existsSync(join(gitMemDir, 'runtime.json')), 'runtime.json should exist');
      });
    });

    it('should overwrite existing runtime.json', () => {
      withTestDir((testDir) => {
        const firstData = createRuntimeData({ sessionId: 'first-session' });
        const secondData = createRuntimeData({ sessionId: 'second-session' });

        service.activate(firstData, testDir);
        service.activate(secondData, testDir);

        const filePath = join(testDir, '.git-mem', 'runtime.json');
        const content = JSON.parse(readFileSync(filePath, 'utf8'));
        assert.equal(content.sessionId, 'second-session');
      });
    });

    it('should handle write errors gracefully (never throw)', () => {
      withTestDir(() => {
        // Try to write to an invalid path (root or protected directory)
        // This should not throw
        const data = createRuntimeData();
        service.activate(data, '/nonexistent/path/that/should/not/exist');
        // If we get here without throwing, the test passes
        assert.ok(true, 'activate should not throw on write errors');
      });
    });
  });

  describe('deactivate', () => {
    it('should remove runtime.json file', () => {
      withTestDir((testDir) => {
        const data = createRuntimeData();
        service.activate(data, testDir);

        const filePath = join(testDir, '.git-mem', 'runtime.json');
        assert.ok(existsSync(filePath), 'runtime.json should exist before deactivate');

        service.deactivate(testDir);
        assert.ok(!existsSync(filePath), 'runtime.json should be removed after deactivate');
      });
    });

    it('should handle missing file gracefully (never throw)', () => {
      withTestDir((testDir) => {
        // Deactivate when no runtime.json exists should not throw
        service.deactivate(testDir);
        assert.ok(true, 'deactivate should not throw on missing file');
      });
    });

    it('should handle missing directory gracefully', () => {
      withTestDir((testDir) => {
        // Deactivate when .git-mem directory doesn't exist
        const nonExistentDir = join(testDir, 'does-not-exist');
        service.deactivate(nonExistentDir);
        assert.ok(true, 'deactivate should not throw on missing directory');
      });
    });
  });

  describe('read', () => {
    it('should return data when file exists and is fresh', () => {
      withTestDir((testDir) => {
        const data = createRuntimeData();
        service.activate(data, testDir);

        const result = service.read(testDir);
        assert.ok(result, 'read should return data');
        assert.equal(result.sessionId, data.sessionId);
        assert.equal(result.agent, data.agent);
        assert.equal(result.model, data.model);
        assert.equal(result.source, data.source);
      });
    });

    it('should return undefined when file is stale (past TTL)', () => {
      withTestDir((testDir) => {
        // Create data with old timestamp
        const oldTimestamp = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(); // 3 hours ago
        const data = createRuntimeData({ timestamp: oldTimestamp });
        service.activate(data, testDir);

        // Default TTL is 2 hours, so this should be stale
        const result = service.read(testDir);
        assert.equal(result, undefined, 'read should return undefined for stale data');
      });
    });

    it('should respect custom TTL', () => {
      withTestDir((testDir) => {
        // Create data with timestamp 30 minutes ago
        const timestamp = new Date(Date.now() - 30 * 60 * 1000).toISOString();
        const data = createRuntimeData({ timestamp });
        service.activate(data, testDir);

        // With 1 hour TTL, data should be fresh
        const freshResult = service.read(testDir, 60 * 60 * 1000);
        assert.ok(freshResult, 'data should be fresh with 1 hour TTL');

        // With 15 minute TTL, data should be stale
        const staleResult = service.read(testDir, 15 * 60 * 1000);
        assert.equal(staleResult, undefined, 'data should be stale with 15 minute TTL');
      });
    });

    it('should return undefined when file is missing', () => {
      withTestDir((testDir) => {
        const result = service.read(testDir);
        assert.equal(result, undefined, 'read should return undefined for missing file');
      });
    });

    it('should return undefined when JSON is invalid', () => {
      withTestDir((testDir) => {
        const gitMemDir = join(testDir, '.git-mem');
        mkdirSync(gitMemDir, { recursive: true });
        writeFileSync(join(gitMemDir, 'runtime.json'), 'not valid json{{{', 'utf8');

        const result = service.read(testDir);
        assert.equal(result, undefined, 'read should return undefined for invalid JSON');
      });
    });

    it('should return undefined when data structure is invalid', () => {
      withTestDir((testDir) => {
        const gitMemDir = join(testDir, '.git-mem');
        mkdirSync(gitMemDir, { recursive: true });
        // Valid JSON but missing timestamp field
        writeFileSync(join(gitMemDir, 'runtime.json'), '{"sessionId": "test"}', 'utf8');

        const result = service.read(testDir);
        assert.equal(result, undefined, 'read should return undefined for invalid structure');
      });
    });

    it('should return data with undefined agent and model', () => {
      withTestDir((testDir) => {
        const data = createRuntimeData({
          agent: undefined,
          model: undefined,
        });
        service.activate(data, testDir);

        const result = service.read(testDir);
        assert.ok(result, 'read should return data');
        assert.equal(result.agent, undefined);
        assert.equal(result.model, undefined);
        assert.equal(result.sessionId, data.sessionId);
      });
    });

    it('should return undefined when timestamp is invalid/unparseable', () => {
      withTestDir((testDir) => {
        const gitMemDir = join(testDir, '.git-mem');
        mkdirSync(gitMemDir, { recursive: true });
        // Valid JSON with unparseable timestamp
        writeFileSync(join(gitMemDir, 'runtime.json'), JSON.stringify({
          sessionId: 'test',
          timestamp: 'not-a-date',
          agent: 'test',
          model: 'test',
          source: 'test',
        }), 'utf8');

        const result = service.read(testDir);
        assert.equal(result, undefined, 'read should return undefined for invalid timestamp');
      });
    });

    it('should return undefined when timestamp is in the future', () => {
      withTestDir((testDir) => {
        // Create data with timestamp 2 minutes in the future (beyond 1 minute skew allowance)
        const futureTimestamp = new Date(Date.now() + 2 * 60 * 1000).toISOString();
        const data = createRuntimeData({ timestamp: futureTimestamp });
        service.activate(data, testDir);

        const result = service.read(testDir);
        assert.equal(result, undefined, 'read should return undefined for future timestamp');
      });
    });

    it('should allow small clock skew for recent timestamps', () => {
      withTestDir((testDir) => {
        // Create data with timestamp 30 seconds in the future (within 1 minute skew allowance)
        const slightlyFutureTimestamp = new Date(Date.now() + 30 * 1000).toISOString();
        const data = createRuntimeData({ timestamp: slightlyFutureTimestamp });
        service.activate(data, testDir);

        const result = service.read(testDir);
        assert.ok(result, 'read should allow small clock skew');
      });
    });
  });
});
