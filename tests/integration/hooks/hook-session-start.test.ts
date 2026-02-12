/**
 * Integration test: session-start hook
 *
 * Exercises `git-mem hook session-start` end-to-end against a real
 * git repo with stored memories. Verifies stdout/stderr/exit code.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryService } from '../../../src/application/services/MemoryService';
import { MemoryRepository } from '../../../src/infrastructure/repositories/MemoryRepository';
import { NotesService } from '../../../src/infrastructure/services/NotesService';
import {
  runHook,
  createTestRepo,
  writeGitMemConfig,
  cleanupRepo,
} from './helpers';

describe('Integration: hook session-start', () => {
  let repoDir: string;
  let commitSha: string;

  before(() => {
    const repo = createTestRepo('git-mem-hook-start-');
    repoDir = repo.dir;
    commitSha = repo.sha;
  });

  after(() => {
    cleanupRepo(repoDir);
  });

  describe('with stored memories', () => {
    before(() => {
      // Store a memory in the test repo
      const notesService = new NotesService();
      const memoryRepo = new MemoryRepository(notesService);
      const memoryService = new MemoryService(memoryRepo);

      memoryService.remember('Use JWT for stateless auth', {
        sha: commitSha,
        type: 'decision',
        tags: 'auth',
        cwd: repoDir,
      });

      // Write .git-mem.json with hooks enabled
      writeGitMemConfig(repoDir);
    });

    it('should output formatted memories to stdout', () => {
      const result = runHook('session-start', {
        session_id: 'test-session-1',
        cwd: repoDir,
      });

      assert.equal(result.status, 0);
      assert.ok(result.stdout.includes('JWT'), `stdout should contain memory content, got: ${result.stdout}`);
    });

    it('should output summary to stderr', () => {
      const result = runHook('session-start', {
        session_id: 'test-session-2',
        cwd: repoDir,
      });

      assert.equal(result.status, 0);
      assert.ok(
        result.stderr.includes('Memory loaded'),
        `stderr should contain summary, got: ${result.stderr}`,
      );
    });

    it('should exit with code 0', () => {
      const result = runHook('session-start', {
        session_id: 'test-session-3',
        cwd: repoDir,
      });

      assert.equal(result.status, 0);
    });
  });

  describe('with empty memory store', () => {
    let emptyRepoDir: string;

    before(() => {
      const repo = createTestRepo('git-mem-hook-start-empty-');
      emptyRepoDir = repo.dir;
      writeGitMemConfig(emptyRepoDir);
    });

    after(() => {
      cleanupRepo(emptyRepoDir);
    });

    it('should exit gracefully with no stdout output', () => {
      const result = runHook('session-start', {
        session_id: 'test-session-empty',
        cwd: emptyRepoDir,
      });

      assert.equal(result.status, 0);
      // No memories → no formatted output, no "Memory loaded." stderr
      assert.equal(result.stdout.trim(), '');
    });
  });
});
