/**
 * Hook config reader unit tests
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { loadHookConfig } from '../../../../src/hooks/utils/config';

describe('loadHookConfig', () => {
  let tempDir: string;

  before(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'git-mem-config-test-'));
  });

  after(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  function createTestDir(): string {
    return mkdtempSync(join(tempDir, 'test-'));
  }

  it('should return defaults when no config file exists', () => {
    const testDir = createTestDir();
    const config = loadHookConfig(testDir);

    assert.equal(config.hooks.enabled, true);
    assert.equal(config.hooks.sessionStart.enabled, true);
    assert.equal(config.hooks.sessionStart.memoryLimit, 20);
    assert.equal(config.hooks.sessionStop.enabled, true);
    assert.equal(config.hooks.sessionStop.autoLiberate, true);
    assert.equal(config.hooks.sessionStop.threshold, 3);
    assert.equal(config.hooks.promptSubmit.enabled, false);
    assert.equal(config.hooks.promptSubmit.recordPrompts, false);
    assert.equal(config.hooks.promptSubmit.surfaceContext, true);
  });

  it('should read and merge config from .git-mem.json', () => {
    const testDir = createTestDir();
    writeFileSync(join(testDir, '.git-mem.json'), JSON.stringify({
      hooks: {
        enabled: true,
        sessionStart: { enabled: true, memoryLimit: 50 },
        promptSubmit: { enabled: true },
      },
    }));

    const config = loadHookConfig(testDir);

    assert.equal(config.hooks.sessionStart.memoryLimit, 50);
    assert.equal(config.hooks.promptSubmit.enabled, true);
    // Defaults preserved for unset fields
    assert.equal(config.hooks.promptSubmit.recordPrompts, false);
    assert.equal(config.hooks.sessionStop.enabled, true);
  });

  it('should return defaults for invalid JSON', () => {
    const testDir = createTestDir();
    writeFileSync(join(testDir, '.git-mem.json'), 'not-json{{{');

    const config = loadHookConfig(testDir);

    assert.equal(config.hooks.enabled, true);
    assert.equal(config.hooks.sessionStart.memoryLimit, 20);
  });

  it('should return defaults when hooks key is missing', () => {
    const testDir = createTestDir();
    writeFileSync(join(testDir, '.git-mem.json'), JSON.stringify({ other: 'stuff' }));

    const config = loadHookConfig(testDir);

    assert.equal(config.hooks.enabled, true);
    assert.equal(config.hooks.sessionStart.enabled, true);
  });

  it('should allow disabling all hooks', () => {
    const testDir = createTestDir();
    writeFileSync(join(testDir, '.git-mem.json'), JSON.stringify({
      hooks: { enabled: false },
    }));

    const config = loadHookConfig(testDir);

    assert.equal(config.hooks.enabled, false);
  });

  it('should use process.cwd() when no cwd provided', () => {
    // This should not throw — just returns defaults if no .git-mem.json
    const config = loadHookConfig();
    assert.ok(config.hooks);
  });
});
