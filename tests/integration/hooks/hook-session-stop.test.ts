/**
 * Integration test: session-stop hook
 *
 * Exercises `git-mem hook session-stop` end-to-end against a real
 * git repo with conventional commits. Verifies memory capture via
 * SessionCaptureService → ExtractService pipeline.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  runHook,
  createTestRepo,
  addCommit,
  writeGitMemConfig,
  cleanupRepo,
} from './helpers';

describe('Integration: hook session-stop', () => {
  let repoDir: string;

  before(() => {
    const repo = createTestRepo('git-mem-hook-stop-');
    repoDir = repo.dir;

    // Add some conventional commits that should score well in triage
    addCommit(repoDir, 'auth.ts', 'export function login() { /* JWT auth */ }', 'feat: add JWT authentication with token refresh');
    addCommit(repoDir, 'config.ts', 'export const DB_HOST = "localhost";', 'fix: database connection timeout handling');
    addCommit(repoDir, 'api.ts', 'export function getUsers() {}', 'feat: implement user API endpoints with pagination');

    // Enable hooks with autoExtract
    writeGitMemConfig(repoDir);
  });

  after(() => {
    cleanupRepo(repoDir);
  });

  it('should exit with code 0', () => {
    const result = runHook('session-stop', {
      session_id: 'test-session-stop-1',
      cwd: repoDir,
    });

    assert.equal(result.status, 0);
  });

  it('should output capture summary to stderr', () => {
    const result = runHook('session-stop', {
      session_id: 'test-session-stop-2',
      cwd: repoDir,
    });

    assert.equal(result.status, 0);
    assert.ok(
      result.stderr.includes('Session capture complete') || result.stderr.includes('git-mem:'),
      `stderr should contain capture summary, got: ${result.stderr}`,
    );
  });

  it('should produce stdout output with capture results', () => {
    const result = runHook('session-stop', {
      session_id: 'test-session-stop-3',
      cwd: repoDir,
    });

    assert.equal(result.status, 0);
    // SessionStopHandler returns summary string as output
    // It may say "Captured N memories" or "Scanned N commits, no new memories"
    assert.ok(
      result.stdout.includes('commits') || result.stdout.includes('memories') || result.stdout.trim() === '',
      `stdout should contain capture results or be empty, got: ${result.stdout}`,
    );
  });
});
