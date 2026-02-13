/**
 * trailers command — unit tests
 *
 * Tests the trailers CLI command against a real temp git repo
 * with AI-* trailers on commits.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { TrailerService } from '../../../src/infrastructure/services/TrailerService';

function git(args: string[], cwd: string): string {
  return execFileSync('git', args, { encoding: 'utf8', cwd }).trim();
}

describe('trailers command — TrailerService integration', () => {
  let repoDir: string;
  let service: TrailerService;
  let sha1: string;
  let sha2: string;
  let sha3: string;

  before(() => {
    repoDir = mkdtempSync(join(tmpdir(), 'git-mem-trailers-cmd-'));
    git(['init'], repoDir);
    git(['config', 'user.email', 'test@test.com'], repoDir);
    git(['config', 'user.name', 'Test User'], repoDir);

    service = new TrailerService();

    // Commit 1: decision trailer
    writeFileSync(join(repoDir, 'file1.txt'), 'hello');
    git(['add', '.'], repoDir);
    git(['commit', '-m', 'feat: add auth\n\nAI-Decision: Use JWT for authentication\nAI-Confidence: high\nAI-Tags: auth, api'], repoDir);
    sha1 = git(['rev-parse', 'HEAD'], repoDir);

    // Commit 2: convention trailer
    writeFileSync(join(repoDir, 'file2.txt'), 'world');
    git(['add', '.'], repoDir);
    git(['commit', '-m', 'refactor: naming\n\nAI-Convention: Interfaces prefixed with I\nAI-Confidence: verified'], repoDir);
    sha2 = git(['rev-parse', 'HEAD'], repoDir);

    // Commit 3: no trailers
    writeFileSync(join(repoDir, 'file3.txt'), 'plain');
    git(['add', '.'], repoDir);
    git(['commit', '-m', 'chore: cleanup'], repoDir);
    sha3 = git(['rev-parse', 'HEAD'], repoDir);
  });

  after(() => {
    rmSync(repoDir, { recursive: true, force: true });
  });

  describe('readTrailers (single commit)', () => {
    it('should return trailers for commit with trailers', () => {
      const trailers = service.readTrailers(sha1, repoDir);
      assert.ok(trailers.length >= 1);
      assert.ok(trailers.some(t => t.key === 'AI-Decision' && t.value === 'Use JWT for authentication'));
      assert.ok(trailers.some(t => t.key === 'AI-Confidence' && t.value === 'high'));
    });

    it('should return trailers for HEAD (sha3 has none)', () => {
      const trailers = service.readTrailers(sha3, repoDir);
      assert.equal(trailers.length, 0);
    });

    it('should return trailers for sha2', () => {
      const trailers = service.readTrailers(sha2, repoDir);
      assert.ok(trailers.some(t => t.key === 'AI-Convention'));
    });
  });

  describe('queryTrailers (across history)', () => {
    it('should find commits with AI-Decision trailer', () => {
      const results = service.queryTrailers('AI-Decision', { cwd: repoDir });
      assert.equal(results.length, 1);
      assert.equal(results[0].sha, sha1);
      assert.ok(results[0].trailers.some(t => t.key === 'AI-Decision'));
    });

    it('should find commits with AI-Convention trailer', () => {
      const results = service.queryTrailers('AI-Convention', { cwd: repoDir });
      assert.equal(results.length, 1);
      assert.equal(results[0].sha, sha2);
    });

    it('should find all commits with AI- prefix', () => {
      const results = service.queryTrailers('AI-', { cwd: repoDir });
      assert.equal(results.length, 2);
    });

    it('should return empty for non-existing key', () => {
      const results = service.queryTrailers('AI-Gotcha', { cwd: repoDir });
      assert.equal(results.length, 0);
    });
  });

  describe('--keys equivalent (distinct keys)', () => {
    it('should collect all distinct AI-* keys', () => {
      const commits = service.queryTrailers('AI-', { cwd: repoDir });
      const keys = new Set<string>();
      for (const commit of commits) {
        for (const trailer of commit.trailers) {
          keys.add(trailer.key);
        }
      }

      assert.ok(keys.has('AI-Decision'));
      assert.ok(keys.has('AI-Convention'));
      assert.ok(keys.has('AI-Confidence'));
      assert.ok(keys.has('AI-Tags'));
      assert.equal(keys.size, 4);
    });
  });
});
