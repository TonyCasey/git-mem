/**
 * post-commit hook — unit tests
 *
 * Tests installPostCommitHook / uninstallPostCommitHook against real temp git repos.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, chmodSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { installPostCommitHook, uninstallPostCommitHook } from '../../../src/hooks/post-commit';

function git(args: string[], cwd: string): string {
  return execFileSync('git', args, { encoding: 'utf8', cwd }).trim();
}

describe('installPostCommitHook', () => {
  let repoDir: string;

  before(() => {
    repoDir = mkdtempSync(join(tmpdir(), 'git-mem-post-commit-install-'));
    git(['init'], repoDir);
    git(['config', 'user.email', 'test@test.com'], repoDir);
    git(['config', 'user.name', 'Test User'], repoDir);
  });

  after(() => {
    rmSync(repoDir, { recursive: true, force: true });
  });

  it('should install hook into .git/hooks', () => {
    const result = installPostCommitHook(repoDir);

    assert.equal(result.installed, true);
    assert.equal(result.wrapped, false);
    assert.ok(existsSync(result.hookPath));

    const content = readFileSync(result.hookPath, 'utf8');
    assert.ok(content.includes('#!/bin/sh'));
    assert.ok(content.includes('git-mem:post-commit v1'));
    assert.ok(content.includes('git-mem hook post-commit'));
  });

  it('should be idempotent — second install is a no-op', () => {
    const result = installPostCommitHook(repoDir);

    assert.equal(result.installed, false);
    assert.equal(result.wrapped, false);
  });

  it('should wrap an existing non-git-mem hook', () => {
    // Create a fresh repo with a user hook
    const freshRepo = mkdtempSync(join(tmpdir(), 'git-mem-post-commit-wrap-'));
    git(['init'], freshRepo);

    const hooksDir = join(freshRepo, '.git', 'hooks');
    const hookPath = join(hooksDir, 'post-commit');
    const userHook = '#!/bin/sh\necho "user post-commit running"\n';
    writeFileSync(hookPath, userHook);
    chmodSync(hookPath, 0o755);

    try {
      const result = installPostCommitHook(freshRepo);

      assert.equal(result.installed, true);
      assert.equal(result.wrapped, true);

      // Backup should exist
      const backupPath = join(hooksDir, 'post-commit.user-backup');
      assert.ok(existsSync(backupPath));
      assert.equal(readFileSync(backupPath, 'utf8'), userHook);

      // Installed hook should contain both fingerprint and wrapper reference
      const content = readFileSync(hookPath, 'utf8');
      assert.ok(content.includes('git-mem:post-commit v1'));
      assert.ok(content.includes('user-backup'));
    } finally {
      rmSync(freshRepo, { recursive: true, force: true });
    }
  });

  it('should throw when backup already exists', () => {
    const freshRepo = mkdtempSync(join(tmpdir(), 'git-mem-post-commit-backup-exists-'));
    git(['init'], freshRepo);

    const hooksDir = join(freshRepo, '.git', 'hooks');
    const hookPath = join(hooksDir, 'post-commit');
    const backupPath = join(hooksDir, 'post-commit.user-backup');

    // Create both a user hook and a leftover backup
    writeFileSync(hookPath, '#!/bin/sh\necho "user hook"\n');
    chmodSync(hookPath, 0o755);
    writeFileSync(backupPath, '#!/bin/sh\necho "old backup"\n');

    try {
      assert.throws(
        () => installPostCommitHook(freshRepo),
        /Backup hook already exists/,
      );
    } finally {
      rmSync(freshRepo, { recursive: true, force: true });
    }
  });

  it('should upgrade older hook version in-place', () => {
    const freshRepo = mkdtempSync(join(tmpdir(), 'git-mem-post-commit-upgrade-'));
    git(['init'], freshRepo);

    const hooksDir = join(freshRepo, '.git', 'hooks');
    const hookPath = join(hooksDir, 'post-commit');

    // Write a hypothetical v0 hook (old fingerprint)
    const v0Hook = '#!/bin/sh\n# git-mem:post-commit v0\n# Old hook version\nexit 0\n';
    mkdirSync(hooksDir, { recursive: true });
    writeFileSync(hookPath, v0Hook);
    chmodSync(hookPath, 0o755);

    try {
      const result = installPostCommitHook(freshRepo);

      // Should have upgraded in-place
      assert.equal(result.installed, true);
      assert.equal(result.wrapped, false);

      const content = readFileSync(hookPath, 'utf8');
      assert.ok(content.includes('git-mem:post-commit v1'), 'Should be upgraded to v1');
      assert.ok(content.includes('git-mem hook post-commit'), 'Should have current command');

      // Second install should be idempotent
      const result2 = installPostCommitHook(freshRepo);
      assert.equal(result2.installed, false);
    } finally {
      rmSync(freshRepo, { recursive: true, force: true });
    }
  });
});

describe('uninstallPostCommitHook', () => {
  it('should remove git-mem hook', () => {
    const repoDir = mkdtempSync(join(tmpdir(), 'git-mem-post-commit-uninstall-'));
    git(['init'], repoDir);

    try {
      // Install first
      installPostCommitHook(repoDir);

      // Uninstall
      const removed = uninstallPostCommitHook(repoDir);
      assert.equal(removed, true);

      const hookPath = join(repoDir, '.git', 'hooks', 'post-commit');
      assert.equal(existsSync(hookPath), false);
    } finally {
      rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it('should return false when no git-mem hook is present', () => {
    const repoDir = mkdtempSync(join(tmpdir(), 'git-mem-post-commit-uninstall-none-'));
    git(['init'], repoDir);

    try {
      const removed = uninstallPostCommitHook(repoDir);
      assert.equal(removed, false);
    } finally {
      rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it('should restore wrapped user hook on uninstall', () => {
    const repoDir = mkdtempSync(join(tmpdir(), 'git-mem-post-commit-restore-'));
    git(['init'], repoDir);

    const hooksDir = join(repoDir, '.git', 'hooks');
    const hookPath = join(hooksDir, 'post-commit');
    const userHook = '#!/bin/sh\necho "user post-commit"\n';
    writeFileSync(hookPath, userHook);
    chmodSync(hookPath, 0o755);

    try {
      installPostCommitHook(repoDir);
      const removed = uninstallPostCommitHook(repoDir);
      assert.equal(removed, true);

      // User hook should be restored
      assert.ok(existsSync(hookPath));
      assert.equal(readFileSync(hookPath, 'utf8'), userHook);

      // Backup should be gone
      const backupPath = join(hooksDir, 'post-commit.user-backup');
      assert.equal(existsSync(backupPath), false);
    } finally {
      rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it('should not remove a non-git-mem hook', () => {
    const repoDir = mkdtempSync(join(tmpdir(), 'git-mem-post-commit-foreign-'));
    git(['init'], repoDir);

    const hooksDir = join(repoDir, '.git', 'hooks');
    const hookPath = join(hooksDir, 'post-commit');
    const foreignHook = '#!/bin/sh\necho "foreign post-commit hook"\n';
    writeFileSync(hookPath, foreignHook);
    chmodSync(hookPath, 0o755);

    try {
      const removed = uninstallPostCommitHook(repoDir);
      assert.equal(removed, false);

      // Foreign hook should still be there
      assert.ok(existsSync(hookPath));
      assert.equal(readFileSync(hookPath, 'utf8'), foreignHook);
    } finally {
      rmSync(repoDir, { recursive: true, force: true });
    }
  });
});

describe('post-commit hook script content', () => {
  it('should pipe SHA as JSON to git-mem hook post-commit', () => {
    const repoDir = mkdtempSync(join(tmpdir(), 'git-mem-post-commit-script-'));
    git(['init'], repoDir);

    try {
      const result = installPostCommitHook(repoDir);
      const content = readFileSync(result.hookPath, 'utf8');

      // Verify script structure
      assert.ok(content.includes('SHA=$(git rev-parse HEAD)'), 'should capture commit SHA');
      assert.ok(content.includes('echo'), 'should echo JSON');
      assert.ok(content.includes('git-mem hook post-commit'), 'should pipe to git-mem');
      assert.ok(content.includes('2>/dev/null'), 'should suppress stderr');
      assert.ok(content.includes('|| true'), 'should not fail on error');
    } finally {
      rmSync(repoDir, { recursive: true, force: true });
    }
  });
});
