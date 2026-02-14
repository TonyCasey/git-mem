/**
 * Integration test: post-commit hook
 *
 * Exercises `git-mem hook post-commit` end-to-end against a real
 * git repo. Verifies session metadata is written to git notes.
 */

import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'child_process';  // Used by readNote()
import {
  runHook,
  createTestRepo,
  writeGitMemConfig,
  cleanupRepo,
  addCommit,
  git,
} from './helpers';

function readNote(sha: string, cwd: string): string | null {
  try {
    return execFileSync('git', ['notes', '--ref=refs/notes/mem', 'show', sha], {
      encoding: 'utf8',
      cwd,
    }).trim();
  } catch {
    return null;
  }
}

describe('Integration: hook post-commit', () => {
  let repoDir: string;
  let commitSha: string;
  let originalEnv: NodeJS.ProcessEnv;

  before(() => {
    const repo = createTestRepo('git-mem-hook-post-commit-');
    repoDir = repo.dir;
    commitSha = repo.sha;
    writeGitMemConfig(repoDir);
  });

  after(() => {
    cleanupRepo(repoDir);
  });

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    // Remove keys that were added during the test
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    }
    // Restore original values
    Object.assign(process.env, originalEnv);
  });

  describe('when agent is detected', () => {
    it('should write session note with agent and model', () => {
      // Set env vars for agent detection
      process.env.GIT_MEM_AGENT = 'TestAgent/2.0';
      process.env.GIT_MEM_MODEL = 'test-model-integration';

      const result = runHook('post-commit', {
        sha: commitSha,
        cwd: repoDir,
      });

      assert.equal(result.status, 0, `Hook should exit 0, stderr: ${result.stderr}`);

      // Verify note was written
      const noteContent = readNote(commitSha, repoDir);
      assert.ok(noteContent, 'Note should exist on commit');

      const payload = JSON.parse(noteContent);
      assert.ok(payload.session, 'Note should have session field');
      assert.equal(payload.session.agent, 'TestAgent/2.0');
      assert.equal(payload.session.model, 'test-model-integration');
      assert.ok(payload.session.timestamp, 'Session should have timestamp');
    });

    it('should exit successfully with status 0', () => {
      process.env.GIT_MEM_AGENT = 'TestAgent/2.0';

      const newSha = addCommit(repoDir, 'file2.txt', 'content', 'feat: second commit');

      const result = runHook('post-commit', {
        sha: newSha,
        cwd: repoDir,
      });

      assert.equal(result.status, 0);
      // Note: post-commit handler doesn't output to stdout, so no stderr summary is printed
      // Verify note was written instead
      const noteContent = readNote(newSha, repoDir);
      assert.ok(noteContent, 'Note should exist on commit');
    });

    it('should preserve existing memories when adding session', () => {
      process.env.GIT_MEM_AGENT = 'TestAgent/2.0';

      // Create a commit and add a memory to it first
      const sha = addCommit(repoDir, 'file3.txt', 'content', 'feat: commit with memory');

      // Write a note with existing memories
      const existingPayload = JSON.stringify({
        memories: [
          { id: 'mem-1', content: 'Existing memory', type: 'fact' },
        ],
      });
      execFileSync('git', ['notes', '--ref=refs/notes/mem', 'add', '-f', '-m', existingPayload, sha], {
        cwd: repoDir,
      });

      // Run post-commit hook
      const result = runHook('post-commit', {
        sha,
        cwd: repoDir,
      });

      assert.equal(result.status, 0);

      // Verify both memories and session exist
      const noteContent = readNote(sha, repoDir);
      assert.ok(noteContent);

      const payload = JSON.parse(noteContent);
      assert.ok(payload.memories, 'Should preserve memories');
      assert.equal(payload.memories.length, 1);
      assert.equal(payload.memories[0].id, 'mem-1');
      assert.ok(payload.session, 'Should have session');
      assert.equal(payload.session.agent, 'TestAgent/2.0');
    });
  });

  describe('when no agent is detected', () => {
    beforeEach(() => {
      delete process.env.GIT_MEM_AGENT;
      delete process.env.GIT_MEM_MODEL;
      delete process.env.CLAUDECODE;
      delete process.env.CLAUDE_CODE;
      delete process.env.ANTHROPIC_MODEL;
    });

    it('should exit successfully without writing note', () => {
      const sha = addCommit(repoDir, 'noagent.txt', 'content', 'chore: no agent commit');

      const result = runHook('post-commit', {
        sha,
        cwd: repoDir,
      });

      assert.equal(result.status, 0);

      // No note should be written
      const noteContent = readNote(sha, repoDir);
      assert.equal(noteContent, null, 'Should not write note when no agent');
    });
  });

  describe('with CLAUDECODE env var', () => {
    it('should detect Claude Code agent from env var', () => {
      delete process.env.GIT_MEM_AGENT;
      process.env.CLAUDECODE = '1';
      process.env.ANTHROPIC_MODEL = 'claude-opus-4-6';

      const sha = addCommit(repoDir, 'claude.txt', 'content', 'feat: claude commit');

      const result = runHook('post-commit', {
        sha,
        cwd: repoDir,
      });

      assert.equal(result.status, 0);

      const noteContent = readNote(sha, repoDir);
      assert.ok(noteContent);

      const payload = JSON.parse(noteContent);
      assert.ok(payload.session.agent.includes('Claude-Code'));
      assert.equal(payload.session.model, 'claude-opus-4-6');
    });
  });

  describe('when hook is disabled', () => {
    it('should exit without action when postCommit.enabled is false', () => {
      const disabledRepo = createTestRepo('git-mem-hook-post-commit-disabled-');

      try {
        writeGitMemConfig(disabledRepo.dir, { postCommit: { enabled: false } });
        process.env.GIT_MEM_AGENT = 'TestAgent/2.0';

        const sha = addCommit(disabledRepo.dir, 'disabled.txt', 'content', 'feat: disabled hook');

        const result = runHook('post-commit', {
          sha,
          cwd: disabledRepo.dir,
        });

        assert.equal(result.status, 0);

        // Should indicate hook was skipped
        assert.ok(
          result.stderr.includes('disabled') || result.stderr === '',
          `stderr should indicate skipped or be empty, got: ${result.stderr}`,
        );

        // No note should be written
        const noteContent = readNote(sha, disabledRepo.dir);
        assert.equal(noteContent, null, 'Should not write note when hook disabled');
      } finally {
        cleanupRepo(disabledRepo.dir);
      }
    });
  });
});
