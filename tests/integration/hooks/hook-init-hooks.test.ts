/**
 * Integration test: init-hooks command
 *
 * Exercises `git-mem init-hooks --yes` and `git-mem init-hooks --remove`
 * end-to-end in temp directories. Verifies file creation, schema
 * correctness, and cleanup.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, mkdirSync, writeFileSync, mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { runCli } from './helpers';

describe('Integration: init-hooks', () => {
  let workDir: string;

  before(() => {
    workDir = mkdtempSync(join(tmpdir(), 'git-mem-init-hooks-'));
  });

  after(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  describe('install mode (--yes)', () => {
    it('should create .claude/settings.json and .git-mem.json', () => {
      const result = runCli(['init-hooks', '--yes'], { cwd: workDir });

      assert.equal(result.status, 0);
      assert.ok(existsSync(join(workDir, '.claude', 'settings.json')), '.claude/settings.json should exist');
      assert.ok(existsSync(join(workDir, '.git-mem.json')), '.git-mem.json should exist');
    });

    it('should write correct hook commands in settings.json', () => {
      const settingsPath = join(workDir, '.claude', 'settings.json');
      const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));

      assert.ok(settings.hooks, 'settings should have hooks key');
      assert.ok(settings.hooks.SessionStart, 'should have SessionStart');
      assert.ok(settings.hooks.SessionStop, 'should have SessionStop');
      assert.ok(settings.hooks.UserPromptSubmit, 'should have UserPromptSubmit');

      // Verify hook command format
      const startHook = settings.hooks.SessionStart[0];
      assert.equal(startHook.matcher, '');
      assert.equal(startHook.hooks[0].type, 'command');
      assert.equal(startHook.hooks[0].command, 'git-mem hook session-start');

      const stopHook = settings.hooks.SessionStop[0];
      assert.equal(stopHook.hooks[0].command, 'git-mem hook session-stop');

      const promptHook = settings.hooks.UserPromptSubmit[0];
      assert.equal(promptHook.hooks[0].command, 'git-mem hook prompt-submit');
    });

    it('should write correct defaults in .git-mem.json', () => {
      const configPath = join(workDir, '.git-mem.json');
      const config = JSON.parse(readFileSync(configPath, 'utf8'));

      assert.ok(config.hooks, 'should have hooks key');
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
  });

  describe('remove mode (--remove)', () => {
    let removeDir: string;

    before(() => {
      removeDir = mkdtempSync(join(tmpdir(), 'git-mem-init-hooks-remove-'));

      // First install hooks
      runCli(['init-hooks', '--yes'], { cwd: removeDir });
      // Verify they exist before testing removal
      assert.ok(existsSync(join(removeDir, '.claude', 'settings.json')));
      assert.ok(existsSync(join(removeDir, '.git-mem.json')));
    });

    after(() => {
      rmSync(removeDir, { recursive: true, force: true });
    });

    it('should remove both config files', () => {
      const result = runCli(['init-hooks', '--remove'], { cwd: removeDir });

      assert.equal(result.status, 0);
      assert.ok(!existsSync(join(removeDir, '.git-mem.json')), '.git-mem.json should be removed');
      // settings.json is deleted entirely when only git-mem hooks were present
      assert.ok(!existsSync(join(removeDir, '.claude', 'settings.json')), 'settings.json should be removed');
    });
  });

  describe('preserves other tools hooks', () => {
    let preserveDir: string;

    before(() => {
      preserveDir = mkdtempSync(join(tmpdir(), 'git-mem-init-hooks-preserve-'));

      // Create existing settings.json with another tool's hooks
      const claudeDir = join(preserveDir, '.claude');
      mkdirSync(claudeDir, { recursive: true });

      const existingSettings = {
        hooks: {
          SessionStart: [
            {
              matcher: '',
              hooks: [{ type: 'command', command: 'other-tool start' }],
            },
          ],
          PreToolUse: [
            {
              matcher: 'Bash',
              hooks: [{ type: 'command', command: 'other-tool guard' }],
            },
          ],
        },
      };
      writeFileSync(
        join(claudeDir, 'settings.json'),
        JSON.stringify(existingSettings, null, 2) + '\n',
      );
    });

    after(() => {
      rmSync(preserveDir, { recursive: true, force: true });
    });

    it('should preserve other tools hooks on install', () => {
      const result = runCli(['init-hooks', '--yes'], { cwd: preserveDir });
      assert.equal(result.status, 0);

      const settings = JSON.parse(readFileSync(join(preserveDir, '.claude', 'settings.json'), 'utf8'));

      // SessionStart should have both: other-tool entry + git-mem entry
      const sessionStartEntries = settings.hooks.SessionStart;
      assert.equal(sessionStartEntries.length, 2);

      const otherToolEntry = sessionStartEntries.find(
        (e: Record<string, unknown>) => Array.isArray(e.hooks) && (e.hooks as Array<Record<string, string>>).some((h) => h.command === 'other-tool start'),
      );
      assert.ok(otherToolEntry, 'other-tool SessionStart entry should be preserved');

      const gitMemEntry = sessionStartEntries.find(
        (e: Record<string, unknown>) => Array.isArray(e.hooks) && (e.hooks as Array<Record<string, string>>).some((h) => h.command === 'git-mem hook session-start'),
      );
      assert.ok(gitMemEntry, 'git-mem SessionStart entry should be added');

      // PreToolUse should be untouched
      assert.ok(settings.hooks.PreToolUse, 'PreToolUse should be preserved');
      assert.equal(settings.hooks.PreToolUse[0].hooks[0].command, 'other-tool guard');
    });

    it('should preserve other tools hooks on remove', () => {
      const result = runCli(['init-hooks', '--remove'], { cwd: preserveDir });
      assert.equal(result.status, 0);

      const settings = JSON.parse(readFileSync(join(preserveDir, '.claude', 'settings.json'), 'utf8'));

      // Other tool's SessionStart entry should survive
      assert.ok(settings.hooks.SessionStart, 'SessionStart should still exist');
      assert.equal(settings.hooks.SessionStart.length, 1);
      assert.equal(settings.hooks.SessionStart[0].hooks[0].command, 'other-tool start');

      // PreToolUse untouched
      assert.ok(settings.hooks.PreToolUse);

      // git-mem event types with no remaining entries should be removed
      assert.ok(!settings.hooks.SessionStop, 'SessionStop should be removed (was only git-mem)');
      assert.ok(!settings.hooks.UserPromptSubmit, 'UserPromptSubmit should be removed (was only git-mem)');
    });
  });
});
