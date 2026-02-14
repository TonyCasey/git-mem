/**
 * commit-msg hook — unit tests
 *
 * Tests installCommitMsgHook / uninstallCommitMsgHook against real temp git repos.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, chmodSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { installCommitMsgHook, uninstallCommitMsgHook } from '../../../src/hooks/commit-msg';

function git(args: string[], cwd: string): string {
  return execFileSync('git', args, { encoding: 'utf8', cwd }).trim();
}

describe('installCommitMsgHook', () => {
  let repoDir: string;

  before(() => {
    repoDir = mkdtempSync(join(tmpdir(), 'git-mem-commit-msg-install-'));
    git(['init'], repoDir);
    git(['config', 'user.email', 'test@test.com'], repoDir);
    git(['config', 'user.name', 'Test User'], repoDir);
  });

  after(() => {
    rmSync(repoDir, { recursive: true, force: true });
  });

  it('should install hook into .git/hooks', () => {
    const result = installCommitMsgHook(repoDir);

    assert.equal(result.installed, true);
    assert.equal(result.wrapped, false);
    assert.ok(existsSync(result.hookPath));

    const content = readFileSync(result.hookPath, 'utf8');
    assert.ok(content.includes('#!/bin/sh'));
    assert.ok(content.includes('git-mem:commit-msg v3'));
    assert.ok(content.includes('git-mem hook commit-msg'));
  });

  it('should be idempotent — second install is a no-op', () => {
    const result = installCommitMsgHook(repoDir);

    assert.equal(result.installed, false);
    assert.equal(result.wrapped, false);
  });

  it('should wrap an existing non-git-mem hook', () => {
    // Create a fresh repo with a user hook
    const freshRepo = mkdtempSync(join(tmpdir(), 'git-mem-commit-msg-wrap-'));
    git(['init'], freshRepo);

    const hooksDir = join(freshRepo, '.git', 'hooks');
    const hookPath = join(hooksDir, 'commit-msg');
    const userHook = '#!/bin/sh\necho "user commit-msg hook running"\n';
    writeFileSync(hookPath, userHook);
    chmodSync(hookPath, 0o755);

    try {
      const result = installCommitMsgHook(freshRepo);

      assert.equal(result.installed, true);
      assert.equal(result.wrapped, true);

      // Backup should exist
      const backupPath = join(hooksDir, 'commit-msg.user-backup');
      assert.ok(existsSync(backupPath));
      assert.equal(readFileSync(backupPath, 'utf8'), userHook);

      // Installed hook should contain both fingerprint and wrapper reference
      const content = readFileSync(hookPath, 'utf8');
      assert.ok(content.includes('git-mem:commit-msg v3'));
      assert.ok(content.includes('user-backup'));
    } finally {
      rmSync(freshRepo, { recursive: true, force: true });
    }
  });

  it('should upgrade older hook version on reinstall', () => {
    const freshRepo = mkdtempSync(join(tmpdir(), 'git-mem-commit-msg-upgrade-'));
    git(['init'], freshRepo);

    const hooksDir = join(freshRepo, '.git', 'hooks');
    const hookPath = join(hooksDir, 'commit-msg');

    // Write an "old" hook with the git-mem fingerprint but outdated content
    const oldHook = '#!/bin/sh\n# git-mem:commit-msg v0\n# Old hook\nexit 0\n';
    mkdirSync(hooksDir, { recursive: true });
    writeFileSync(hookPath, oldHook);
    chmodSync(hookPath, 0o755);

    try {
      const result = installCommitMsgHook(freshRepo);

      // Should have upgraded in-place
      assert.equal(result.installed, true);
      assert.equal(result.wrapped, false);

      const content = readFileSync(hookPath, 'utf8');
      assert.ok(content.includes('git-mem:commit-msg v3'), 'Should be upgraded to v1');
      assert.ok(content.includes('git-mem hook commit-msg'), 'Should include git-mem command');

      // Second install should be idempotent
      const result2 = installCommitMsgHook(freshRepo);
      assert.equal(result2.installed, false);
    } finally {
      rmSync(freshRepo, { recursive: true, force: true });
    }
  });
});

describe('uninstallCommitMsgHook', () => {
  it('should remove git-mem hook', () => {
    const repoDir = mkdtempSync(join(tmpdir(), 'git-mem-commit-msg-uninstall-'));
    git(['init'], repoDir);

    try {
      // Install first
      installCommitMsgHook(repoDir);

      // Uninstall
      const removed = uninstallCommitMsgHook(repoDir);
      assert.equal(removed, true);

      const hookPath = join(repoDir, '.git', 'hooks', 'commit-msg');
      assert.equal(existsSync(hookPath), false);
    } finally {
      rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it('should return false when no git-mem hook is present', () => {
    const repoDir = mkdtempSync(join(tmpdir(), 'git-mem-commit-msg-uninstall-'));
    git(['init'], repoDir);

    try {
      const removed = uninstallCommitMsgHook(repoDir);
      assert.equal(removed, false);
    } finally {
      rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it('should restore wrapped user hook on uninstall', () => {
    const repoDir = mkdtempSync(join(tmpdir(), 'git-mem-commit-msg-restore-'));
    git(['init'], repoDir);

    const hooksDir = join(repoDir, '.git', 'hooks');
    const hookPath = join(hooksDir, 'commit-msg');
    const userHook = '#!/bin/sh\necho "user commit-msg hook"\n';
    writeFileSync(hookPath, userHook);
    chmodSync(hookPath, 0o755);

    try {
      installCommitMsgHook(repoDir);
      const removed = uninstallCommitMsgHook(repoDir);
      assert.equal(removed, true);

      // User hook should be restored
      assert.ok(existsSync(hookPath));
      assert.equal(readFileSync(hookPath, 'utf8'), userHook);

      // Backup should be gone
      const backupPath = join(hooksDir, 'commit-msg.user-backup');
      assert.equal(existsSync(backupPath), false);
    } finally {
      rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it('should not remove a non-git-mem hook', () => {
    const repoDir = mkdtempSync(join(tmpdir(), 'git-mem-commit-msg-foreign-'));
    git(['init'], repoDir);

    const hooksDir = join(repoDir, '.git', 'hooks');
    const hookPath = join(hooksDir, 'commit-msg');
    const foreignHook = '#!/bin/sh\necho "foreign commit-msg hook"\n';
    writeFileSync(hookPath, foreignHook);
    chmodSync(hookPath, 0o755);

    try {
      const removed = uninstallCommitMsgHook(repoDir);
      assert.equal(removed, false);

      // Foreign hook should still be there
      assert.ok(existsSync(hookPath));
      assert.equal(readFileSync(hookPath, 'utf8'), foreignHook);
    } finally {
      rmSync(repoDir, { recursive: true, force: true });
    }
  });
});
