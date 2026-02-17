import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { RuntimeService } from '../../../../src/infrastructure/services/RuntimeService';
import type { IRuntimeData } from '../../../../src/domain/interfaces/IRuntimeService';

describe('RuntimeService', () => {
  let service: RuntimeService;
  let testDir: string;

  before(() => {
    service = new RuntimeService();
  });

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'git-mem-runtime-test-'));
  });

  after(() => {
    // Cleanup is handled per-test in beforeEach/individual tests
  });

  function cleanup(): void {
    if (testDir && existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  }

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

  describe('activate', () => {
    it('should create runtime.json with correct content', () => {
      try {
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
      } finally {
        cleanup();
      }
    });

    it('should create .git-mem/ directory if missing', () => {
      try {
        const gitMemDir = join(testDir, '.git-mem');
        assert.ok(!existsSync(gitMemDir), '.git-mem should not exist initially');

        const data = createRuntimeData();
        service.activate(data, testDir);

        assert.ok(existsSync(gitMemDir), '.git-mem directory should be created');
        assert.ok(existsSync(join(gitMemDir, 'runtime.json')), 'runtime.json should exist');
      } finally {
        cleanup();
      }
    });

    it('should overwrite existing runtime.json', () => {
      try {
        const firstData = createRuntimeData({ sessionId: 'first-session' });
        const secondData = createRuntimeData({ sessionId: 'second-session' });

        service.activate(firstData, testDir);
        service.activate(secondData, testDir);

        const filePath = join(testDir, '.git-mem', 'runtime.json');
        const content = JSON.parse(readFileSync(filePath, 'utf8'));
        assert.equal(content.sessionId, 'second-session');
      } finally {
        cleanup();
      }
    });

    it('should handle write errors gracefully (never throw)', () => {
      try {
        // Force write path failure deterministically by using a file as cwd.
        const invalidCwd = join(testDir, 'not-a-dir');
        writeFileSync(invalidCwd, 'x', 'utf8');
        const data = createRuntimeData();
        service.activate(data, invalidCwd);

        // If we get here without throwing, the test passes
        assert.ok(true, 'activate should not throw on write errors');
      } finally {
        cleanup();
      }
    });
  });

  describe('deactivate', () => {
    it('should remove runtime.json file', () => {
      try {
        const data = createRuntimeData();
        service.activate(data, testDir);

        const filePath = join(testDir, '.git-mem', 'runtime.json');
        assert.ok(existsSync(filePath), 'runtime.json should exist before deactivate');

        service.deactivate(testDir);
        assert.ok(!existsSync(filePath), 'runtime.json should be removed after deactivate');
      } finally {
        cleanup();
      }
    });

    it('should handle missing file gracefully (never throw)', () => {
      try {
        // Deactivate when no runtime.json exists should not throw
        service.deactivate(testDir);
        assert.ok(true, 'deactivate should not throw on missing file');
      } finally {
        cleanup();
      }
    });

    it('should handle missing directory gracefully', () => {
      try {
        // Deactivate when .git-mem directory doesn't exist
        const nonExistentDir = join(testDir, 'does-not-exist');
        service.deactivate(nonExistentDir);
        assert.ok(true, 'deactivate should not throw on missing directory');
      } finally {
        cleanup();
      }
    });
  });

  describe('read', () => {
    it('should return data when file exists and is fresh', () => {
      try {
        const data = createRuntimeData();
        service.activate(data, testDir);

        const result = service.read(testDir);
        assert.ok(result, 'read should return data');
        assert.equal(result.sessionId, data.sessionId);
        assert.equal(result.agent, data.agent);
        assert.equal(result.model, data.model);
        assert.equal(result.source, data.source);
      } finally {
        cleanup();
      }
    });

    it('should return undefined when file is stale (past TTL)', () => {
      try {
        // Create data with old timestamp
        const oldTimestamp = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(); // 3 hours ago
        const data = createRuntimeData({ timestamp: oldTimestamp });
        service.activate(data, testDir);

        // Default TTL is 2 hours, so this should be stale
        const result = service.read(testDir);
        assert.equal(result, undefined, 'read should return undefined for stale data');
      } finally {
        cleanup();
      }
    });

    it('should respect custom TTL', () => {
      try {
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
      } finally {
        cleanup();
      }
    });

    it('should return undefined when file is missing', () => {
      try {
        const result = service.read(testDir);
        assert.equal(result, undefined, 'read should return undefined for missing file');
      } finally {
        cleanup();
      }
    });

    it('should return undefined when JSON is invalid', () => {
      try {
        const gitMemDir = join(testDir, '.git-mem');
        mkdirSync(gitMemDir, { recursive: true });
        writeFileSync(join(gitMemDir, 'runtime.json'), 'not valid json{{{', 'utf8');

        const result = service.read(testDir);
        assert.equal(result, undefined, 'read should return undefined for invalid JSON');
      } finally {
        cleanup();
      }
    });

    it('should return undefined when data structure is invalid', () => {
      try {
        const gitMemDir = join(testDir, '.git-mem');
        mkdirSync(gitMemDir, { recursive: true });
        // Valid JSON but missing timestamp field
        writeFileSync(join(gitMemDir, 'runtime.json'), '{"sessionId": "test"}', 'utf8');

        const result = service.read(testDir);
        assert.equal(result, undefined, 'read should return undefined for invalid structure');
      } finally {
        cleanup();
      }
    });

    it('should return data with undefined agent and model', () => {
      try {
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
      } finally {
        cleanup();
      }
    });

    it('should return undefined when timestamp is invalid/unparseable', () => {
      try {
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
      } finally {
        cleanup();
      }
    });

    it('should return undefined when timestamp is in the future', () => {
      try {
        // Create data with timestamp 2 minutes in the future (beyond 1 minute skew allowance)
        const futureTimestamp = new Date(Date.now() + 2 * 60 * 1000).toISOString();
        const data = createRuntimeData({ timestamp: futureTimestamp });
        service.activate(data, testDir);

        const result = service.read(testDir);
        assert.equal(result, undefined, 'read should return undefined for future timestamp');
      } finally {
        cleanup();
      }
    });

    it('should allow small clock skew for recent timestamps', () => {
      try {
        // Create data with timestamp 30 seconds in the future (within 1 minute skew allowance)
        const slightlyFutureTimestamp = new Date(Date.now() + 30 * 1000).toISOString();
        const data = createRuntimeData({ timestamp: slightlyFutureTimestamp });
        service.activate(data, testDir);

        const result = service.read(testDir);
        assert.ok(result, 'read should allow small clock skew');
      } finally {
        cleanup();
      }
    });
  });
});
