/**
 * Integration test: prompt-submit hook
 *
 * Exercises `git-mem hook prompt-submit` end-to-end against a real
 * git repo. Verifies context surfacing when enabled and silent
 * exit when disabled (the default).
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

describe('Integration: hook prompt-submit', () => {
  describe('when enabled with stored memories', () => {
    let repoDir: string;
    let commitSha: string;

    before(() => {
      const repo = createTestRepo('git-mem-hook-prompt-');
      repoDir = repo.dir;
      commitSha = repo.sha;

      // Store a memory
      const notesService = new NotesService();
      const memoryRepo = new MemoryRepository(notesService);
      const memoryService = new MemoryService(memoryRepo);

      memoryService.remember('Always validate user input at API boundary', {
        sha: commitSha,
        type: 'convention',
        tags: 'security',
        cwd: repoDir,
      });

      // Write config with promptSubmit ENABLED
      writeGitMemConfig(repoDir, { promptSubmit: { enabled: true, recordPrompts: false, surfaceContext: true } });
    });

    after(() => {
      cleanupRepo(repoDir);
    });

    it('should return context in stdout', () => {
      const result = runHook('prompt-submit', {
        session_id: 'test-prompt-1',
        prompt: 'How should I validate user input?',
        cwd: repoDir,
      });

      assert.equal(result.status, 0);
      assert.ok(
        result.stdout.includes('validate') || result.stdout.includes('input') || result.stdout.includes('security'),
        `stdout should contain relevant memory context, got: ${result.stdout}`,
      );
    });

    it('should exit with code 0', () => {
      const result = runHook('prompt-submit', {
        session_id: 'test-prompt-2',
        prompt: 'test prompt',
        cwd: repoDir,
      });

      assert.equal(result.status, 0);
    });
  });

  describe('when disabled (default)', () => {
    let repoDir: string;

    before(() => {
      const repo = createTestRepo('git-mem-hook-prompt-disabled-');
      repoDir = repo.dir;

      // Default config has promptSubmit.enabled: false
      writeGitMemConfig(repoDir);
    });

    after(() => {
      cleanupRepo(repoDir);
    });

    it('should produce no output when disabled', () => {
      const result = runHook('prompt-submit', {
        session_id: 'test-prompt-disabled',
        prompt: 'some prompt',
        cwd: repoDir,
      });

      assert.equal(result.status, 0);
      assert.equal(result.stdout.trim(), '');
    });
  });
});
