/**
 * Hook config reader unit tests
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { stringify as stringifyYaml } from 'yaml';
import {
  loadHookConfig,
  getConfigPath,
  getConfigDir,
  CONFIG_DIR,
  CONFIG_FILE,
} from '../../../../src/hooks/utils/config';

describe('config', () => {
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

  function writeConfig(testDir: string, config: object): void {
    const configDir = join(testDir, CONFIG_DIR);
    mkdirSync(configDir, { recursive: true });
    writeFileSync(join(configDir, CONFIG_FILE), stringifyYaml(config));
  }

  describe('getConfigPath', () => {
    it('should return path to .git-mem/.git-mem.yaml', () => {
      const testDir = '/some/dir';
      const result = getConfigPath(testDir);
      assert.equal(result, '/some/dir/.git-mem/.git-mem.yaml');
    });

    it('should use process.cwd() when no cwd provided', () => {
      const result = getConfigPath();
      assert.ok(result.endsWith('.git-mem/.git-mem.yaml'));
    });
  });

  describe('getConfigDir', () => {
    it('should return path to .git-mem directory', () => {
      const testDir = '/some/dir';
      const result = getConfigDir(testDir);
      assert.equal(result, '/some/dir/.git-mem');
    });

    it('should use process.cwd() when no cwd provided', () => {
      const result = getConfigDir();
      assert.ok(result.endsWith('.git-mem'));
    });
  });

  describe('loadHookConfig', () => {
    it('should return defaults when no config file exists', () => {
      const testDir = createTestDir();
      const config = loadHookConfig(testDir);

      assert.equal(config.hooks.enabled, true);
      assert.equal(config.hooks.sessionStart.enabled, true);
      assert.equal(config.hooks.sessionStart.memoryLimit, 20);
      assert.equal(config.hooks.sessionStop.enabled, true);
      assert.equal(config.hooks.sessionStop.autoExtract, true);
      assert.equal(config.hooks.sessionStop.threshold, 3);
      assert.equal(config.hooks.promptSubmit.enabled, true);
      assert.equal(config.hooks.promptSubmit.recordPrompts, false);
      assert.equal(config.hooks.promptSubmit.surfaceContext, true);
      assert.equal(config.hooks.promptSubmit.extractIntent, true);
      assert.equal(config.hooks.promptSubmit.intentTimeout, 3000);
      assert.equal(config.hooks.promptSubmit.minWords, 5);
      assert.equal(config.hooks.promptSubmit.memoryLimit, 20);
    });

    it('should read and merge config from .git-mem/.git-mem.yaml', () => {
      const testDir = createTestDir();
      writeConfig(testDir, {
        hooks: {
          enabled: true,
          sessionStart: { enabled: true, memoryLimit: 50 },
          promptSubmit: { enabled: true },
        },
      });

      const config = loadHookConfig(testDir);

      assert.equal(config.hooks.sessionStart.memoryLimit, 50);
      assert.equal(config.hooks.promptSubmit.enabled, true);
      // Defaults preserved for unset fields
      assert.equal(config.hooks.promptSubmit.recordPrompts, false);
      assert.equal(config.hooks.sessionStop.enabled, true);
    });

    it('should return defaults for invalid YAML', () => {
      const testDir = createTestDir();
      const configDir = join(testDir, CONFIG_DIR);
      mkdirSync(configDir, { recursive: true });
      writeFileSync(join(configDir, CONFIG_FILE), 'not: valid: yaml: {{{}}}');

      const config = loadHookConfig(testDir);

      assert.equal(config.hooks.enabled, true);
      assert.equal(config.hooks.sessionStart.memoryLimit, 20);
    });

    it('should return defaults when hooks key is missing', () => {
      const testDir = createTestDir();
      writeConfig(testDir, { other: 'stuff' });

      const config = loadHookConfig(testDir);

      assert.equal(config.hooks.enabled, true);
      assert.equal(config.hooks.sessionStart.enabled, true);
    });

    it('should allow disabling all hooks', () => {
      const testDir = createTestDir();
      writeConfig(testDir, {
        hooks: { enabled: false },
      });

      const config = loadHookConfig(testDir);

      assert.equal(config.hooks.enabled, false);
    });

    it('should use process.cwd() when no cwd provided', () => {
      // This should not throw — just returns defaults if no config
      const config = loadHookConfig();
      assert.ok(config.hooks);
    });

    it('should handle commitMsg configuration', () => {
      const testDir = createTestDir();
      writeConfig(testDir, {
        hooks: {
          commitMsg: {
            enabled: true,
            enrich: false,
            enrichTimeout: 10000,
          },
        },
      });

      const config = loadHookConfig(testDir);

      assert.equal(config.hooks.commitMsg.enabled, true);
      assert.equal(config.hooks.commitMsg.enrich, false);
      assert.equal(config.hooks.commitMsg.enrichTimeout, 10000);
      // Defaults preserved
      assert.equal(config.hooks.commitMsg.autoAnalyze, true);
      assert.equal(config.hooks.commitMsg.inferTags, true);
    });
  });
});
