/**
 * prepare-commit-msg hook — unit tests
 *
 * Tests installHook / uninstallHook against real temp git repos.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, chmodSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { installHook, uninstallHook } from '../../../src/hooks/prepare-commit-msg';

function git(args: string[], cwd: string): string {
  return execFileSync('git', args, { encoding: 'utf8', cwd }).trim();
}

describe('installHook', () => {
  let repoDir: string;

  before(() => {
    repoDir = mkdtempSync(join(tmpdir(), 'git-mem-hook-install-'));
    git(['init'], repoDir);
    git(['config', 'user.email', 'test@test.com'], repoDir);
    git(['config', 'user.name', 'Test User'], repoDir);
  });

  after(() => {
    rmSync(repoDir, { recursive: true, force: true });
  });

  it('should install hook into .git/hooks', () => {
    const result = installHook(repoDir);

    assert.equal(result.installed, true);
    assert.equal(result.wrapped, false);
    assert.ok(existsSync(result.hookPath));

    const content = readFileSync(result.hookPath, 'utf8');
    assert.ok(content.includes('#!/bin/sh'));
    assert.ok(content.includes('git-mem:prepare-commit-msg v3'));
    assert.ok(content.includes('git interpret-trailers'));
    assert.ok(content.includes('AI-Agent'));
  });

  it('should be idempotent — second install is a no-op', () => {
    const result = installHook(repoDir);

    assert.equal(result.installed, false);
    assert.equal(result.wrapped, false);
  });

  it('should wrap an existing non-git-mem hook', () => {
    // Create a fresh repo with a user hook
    const freshRepo = mkdtempSync(join(tmpdir(), 'git-mem-hook-wrap-'));
    git(['init'], freshRepo);

    const hooksDir = join(freshRepo, '.git', 'hooks');
    const hookPath = join(hooksDir, 'prepare-commit-msg');
    const userHook = '#!/bin/sh\necho "user hook running"\n';
    writeFileSync(hookPath, userHook);
    chmodSync(hookPath, 0o755);

    try {
      const result = installHook(freshRepo);

      assert.equal(result.installed, true);
      assert.equal(result.wrapped, true);

      // Backup should exist
      const backupPath = join(hooksDir, 'prepare-commit-msg.user-backup');
      assert.ok(existsSync(backupPath));
      assert.equal(readFileSync(backupPath, 'utf8'), userHook);

      // Installed hook should contain both fingerprint and wrapper reference
      const content = readFileSync(hookPath, 'utf8');
      assert.ok(content.includes('git-mem:prepare-commit-msg v3'));
      assert.ok(content.includes('user-backup'));
    } finally {
      rmSync(freshRepo, { recursive: true, force: true });
    }
  });

  it('should upgrade older hook to v3 on reinstall', () => {
    const freshRepo = mkdtempSync(join(tmpdir(), 'git-mem-hook-upgrade-'));
    git(['init'], freshRepo);

    const hooksDir = join(freshRepo, '.git', 'hooks');
    const hookPath = join(hooksDir, 'prepare-commit-msg');

    // Write a v2 hook (old fingerprint, no CLAUDECODE/ANTHROPIC_MODEL support)
    const v2Hook = '#!/bin/sh\n# git-mem:prepare-commit-msg v2\n# Old hook without auto-detect\nexit 0\n';
    mkdirSync(hooksDir, { recursive: true });
    writeFileSync(hookPath, v2Hook);
    chmodSync(hookPath, 0o755);

    try {
      const result = installHook(freshRepo);

      // Should have upgraded in-place
      assert.equal(result.installed, true);
      assert.equal(result.wrapped, false);

      const content = readFileSync(hookPath, 'utf8');
      assert.ok(content.includes('git-mem:prepare-commit-msg v3'), 'Should be upgraded to v3');
      assert.ok(content.includes('CLAUDECODE'), 'Should include CLAUDECODE detection');
      assert.ok(content.includes('ANTHROPIC_MODEL'), 'Should include ANTHROPIC_MODEL detection');

      // Second install should be idempotent
      const result2 = installHook(freshRepo);
      assert.equal(result2.installed, false);
    } finally {
      rmSync(freshRepo, { recursive: true, force: true });
    }
  });
});

describe('uninstallHook', () => {
  it('should remove git-mem hook', () => {
    const repoDir = mkdtempSync(join(tmpdir(), 'git-mem-hook-uninstall-'));
    git(['init'], repoDir);

    try {
      // Install first
      installHook(repoDir);

      // Uninstall
      const removed = uninstallHook(repoDir);
      assert.equal(removed, true);

      const hookPath = join(repoDir, '.git', 'hooks', 'prepare-commit-msg');
      assert.equal(existsSync(hookPath), false);
    } finally {
      rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it('should return false when no git-mem hook is present', () => {
    const repoDir = mkdtempSync(join(tmpdir(), 'git-mem-hook-uninstall-'));
    git(['init'], repoDir);

    try {
      const removed = uninstallHook(repoDir);
      assert.equal(removed, false);
    } finally {
      rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it('should restore wrapped user hook on uninstall', () => {
    const repoDir = mkdtempSync(join(tmpdir(), 'git-mem-hook-restore-'));
    git(['init'], repoDir);

    const hooksDir = join(repoDir, '.git', 'hooks');
    const hookPath = join(hooksDir, 'prepare-commit-msg');
    const userHook = '#!/bin/sh\necho "user hook"\n';
    writeFileSync(hookPath, userHook);
    chmodSync(hookPath, 0o755);

    try {
      installHook(repoDir);
      const removed = uninstallHook(repoDir);
      assert.equal(removed, true);

      // User hook should be restored
      assert.ok(existsSync(hookPath));
      assert.equal(readFileSync(hookPath, 'utf8'), userHook);

      // Backup should be gone
      const backupPath = join(hooksDir, 'prepare-commit-msg.user-backup');
      assert.equal(existsSync(backupPath), false);
    } finally {
      rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it('should not remove a non-git-mem hook', () => {
    const repoDir = mkdtempSync(join(tmpdir(), 'git-mem-hook-foreign-'));
    git(['init'], repoDir);

    const hooksDir = join(repoDir, '.git', 'hooks');
    const hookPath = join(hooksDir, 'prepare-commit-msg');
    const foreignHook = '#!/bin/sh\necho "foreign hook"\n';
    writeFileSync(hookPath, foreignHook);
    chmodSync(hookPath, 0o755);

    try {
      const removed = uninstallHook(repoDir);
      assert.equal(removed, false);

      // Foreign hook should still be there
      assert.ok(existsSync(hookPath));
      assert.equal(readFileSync(hookPath, 'utf8'), foreignHook);
    } finally {
      rmSync(repoDir, { recursive: true, force: true });
    }
  });
});

describe('hook integration — commit message modification', () => {
  let repoDir: string;

  before(() => {
    repoDir = mkdtempSync(join(tmpdir(), 'git-mem-hook-commit-'));
    git(['init'], repoDir);
    git(['config', 'user.email', 'test@test.com'], repoDir);
    git(['config', 'user.name', 'Test User'], repoDir);

    installHook(repoDir);
  });

  after(() => {
    rmSync(repoDir, { recursive: true, force: true });
  });

  it('should add AI-Agent trailer when GIT_MEM_AGENT is set', () => {
    writeFileSync(join(repoDir, 'test.txt'), 'hello');
    git(['add', '.'], repoDir);

    execFileSync('git', ['commit', '-m', 'feat: test commit'], {
      encoding: 'utf8',
      cwd: repoDir,
      env: { ...process.env, GIT_MEM_AGENT: 'TestAgent/1.0' },
    });

    const message = git(['log', '-1', '--format=%B'], repoDir);
    assert.ok(message.includes('AI-Agent: TestAgent/1.0'), `Expected AI-Agent trailer in: ${message}`);
  });

  it('should add AI-Agent trailer with version when CLAUDECODE is set', () => {
    writeFileSync(join(repoDir, 'test2.txt'), 'world');
    git(['add', '.'], repoDir);

    const env = { ...process.env, CLAUDECODE: '1' };
    delete env.GIT_MEM_AGENT;

    execFileSync('git', ['commit', '-m', 'fix: another commit'], {
      encoding: 'utf8',
      cwd: repoDir,
      env,
    });

    const message = git(['log', '-1', '--format=%B'], repoDir);
    // Should contain Claude-Code (with or without version depending on claude binary availability)
    assert.ok(message.includes('AI-Agent: Claude-Code'), `Expected Claude-Code trailer in: ${message}`);
  });

  it('should add AI-Agent trailer with legacy CLAUDE_CODE env var', () => {
    writeFileSync(join(repoDir, 'test2b.txt'), 'legacy');
    git(['add', '.'], repoDir);

    const env = { ...process.env, CLAUDE_CODE: '1', GIT_MEM_AGENT: '' };
    delete env.CLAUDECODE;

    execFileSync('git', ['commit', '-m', 'fix: legacy env var'], {
      encoding: 'utf8',
      cwd: repoDir,
      env,
    });

    const message = git(['log', '-1', '--format=%B'], repoDir);
    assert.ok(message.includes('AI-Agent: Claude-Code'), `Expected Claude-Code trailer in: ${message}`);
  });

  it('should not add trailer when no AI env vars are set', () => {
    writeFileSync(join(repoDir, 'test3.txt'), 'plain');
    git(['add', '.'], repoDir);

    // Strip AI-related env vars
    const cleanEnv = { ...process.env };
    delete cleanEnv.GIT_MEM_AGENT;
    delete cleanEnv.CLAUDE_CODE;
    delete cleanEnv.CLAUDECODE;

    execFileSync('git', ['commit', '-m', 'chore: plain commit'], {
      encoding: 'utf8',
      cwd: repoDir,
      env: cleanEnv,
    });

    const message = git(['log', '-1', '--format=%B'], repoDir);
    assert.ok(!message.includes('AI-Agent:'), `Should not have AI-Agent trailer in: ${message}`);
  });

  it('should not duplicate AI-Agent trailer if already present', () => {
    writeFileSync(join(repoDir, 'test4.txt'), 'dedup');
    git(['add', '.'], repoDir);

    const msgWithTrailer = 'feat: already has trailer\n\nAI-Agent: ExistingAgent';
    execFileSync('git', ['commit', '-m', msgWithTrailer], {
      encoding: 'utf8',
      cwd: repoDir,
      env: { ...process.env, GIT_MEM_AGENT: 'ShouldNotAppear' },
    });

    const message = git(['log', '-1', '--format=%B'], repoDir);
    const agentCount = message.split('\n').filter((l: string) => l.startsWith('AI-Agent:')).length;
    assert.equal(agentCount, 1, `Should have exactly one AI-Agent trailer, got: ${message}`);
    assert.ok(message.includes('ExistingAgent'));
  });

  it('should add AI-Model trailer when GIT_MEM_MODEL is set', () => {
    writeFileSync(join(repoDir, 'model-test.txt'), 'model');
    git(['add', '.'], repoDir);

    execFileSync('git', ['commit', '-m', 'feat: model trailer test'], {
      encoding: 'utf8',
      cwd: repoDir,
      env: { ...process.env, GIT_MEM_AGENT: 'TestAgent', GIT_MEM_MODEL: 'claude-opus-4-6' },
    });

    const message = git(['log', '-1', '--format=%B'], repoDir);
    assert.ok(message.includes('AI-Model: claude-opus-4-6'), `Expected AI-Model trailer in: ${message}`);
  });

  it('should auto-detect AI-Model from ANTHROPIC_MODEL env var', () => {
    writeFileSync(join(repoDir, 'anthropic-model.txt'), 'auto-model');
    git(['add', '.'], repoDir);

    const env = { ...process.env, GIT_MEM_AGENT: 'TestAgent', ANTHROPIC_MODEL: 'claude-sonnet-4-5' };
    delete env.GIT_MEM_MODEL;

    execFileSync('git', ['commit', '-m', 'feat: anthropic model auto-detect'], {
      encoding: 'utf8',
      cwd: repoDir,
      env,
    });

    const message = git(['log', '-1', '--format=%B'], repoDir);
    assert.ok(message.includes('AI-Model: claude-sonnet-4-5'), `Expected AI-Model trailer in: ${message}`);
  });

  it('should not add AI-Model trailer when no model env vars are set', () => {
    writeFileSync(join(repoDir, 'no-model.txt'), 'no-model');
    git(['add', '.'], repoDir);

    const cleanEnv = { ...process.env, GIT_MEM_AGENT: 'TestAgent' };
    delete cleanEnv.GIT_MEM_MODEL;
    delete cleanEnv.ANTHROPIC_MODEL;

    execFileSync('git', ['commit', '-m', 'feat: no model test'], {
      encoding: 'utf8',
      cwd: repoDir,
      env: cleanEnv,
    });

    const message = git(['log', '-1', '--format=%B'], repoDir);
    assert.ok(!message.includes('AI-Model:'), `Should not have AI-Model trailer in: ${message}`);
  });

  it('should add both AI-Agent and AI-Model when both env vars set', () => {
    writeFileSync(join(repoDir, 'both-trailers.txt'), 'both');
    git(['add', '.'], repoDir);

    execFileSync('git', ['commit', '-m', 'feat: both trailers test'], {
      encoding: 'utf8',
      cwd: repoDir,
      env: { ...process.env, GIT_MEM_AGENT: 'Claude-Code', GIT_MEM_MODEL: 'claude-opus-4-6' },
    });

    const message = git(['log', '-1', '--format=%B'], repoDir);
    assert.ok(message.includes('AI-Agent: Claude-Code'), `Expected AI-Agent trailer in: ${message}`);
    assert.ok(message.includes('AI-Model: claude-opus-4-6'), `Expected AI-Model trailer in: ${message}`);
  });

  it('should skip merge commits', () => {
    // Determine the default branch name before creating feature branch
    const defaultBranch = git(['rev-parse', '--abbrev-ref', 'HEAD'], repoDir);

    // Create a branch, make a commit, merge back
    git(['checkout', '-b', 'feature-merge-test'], repoDir);
    writeFileSync(join(repoDir, 'feature.txt'), 'feature');
    git(['add', '.'], repoDir);
    execFileSync('git', ['commit', '-m', 'feat: feature branch'], {
      encoding: 'utf8',
      cwd: repoDir,
      env: { ...process.env, GIT_MEM_AGENT: '' },
    });

    git(['checkout', defaultBranch], repoDir);
    writeFileSync(join(repoDir, 'main-change.txt'), 'main');
    git(['add', '.'], repoDir);
    execFileSync('git', ['commit', '-m', 'chore: main change'], {
      encoding: 'utf8',
      cwd: repoDir,
      env: { ...process.env, GIT_MEM_AGENT: '' },
    });

    // Merge (--no-ff forces merge commit)
    execFileSync('git', ['merge', '--no-ff', 'feature-merge-test', '-m', 'Merge feature-merge-test'], {
      encoding: 'utf8',
      cwd: repoDir,
      env: { ...process.env, GIT_MEM_AGENT: 'ShouldNotAppear' },
    });

    const message = git(['log', '-1', '--format=%B'], repoDir);
    assert.ok(!message.includes('AI-Agent:'), `Merge commit should not have AI-Agent trailer: ${message}`);
  });
});
