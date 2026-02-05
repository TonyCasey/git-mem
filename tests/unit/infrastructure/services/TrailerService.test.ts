import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { TrailerService } from '../../../../src/infrastructure/services/TrailerService';

function git(args: string[], cwd: string): string {
  return execFileSync('git', args, { encoding: 'utf8', cwd }).trim();
}

describe('TrailerService', () => {
  let service: TrailerService;
  let repoDir: string;

  before(() => {
    service = new TrailerService();
    repoDir = mkdtempSync(join(tmpdir(), 'git-mem-trailer-test-'));

    git(['init'], repoDir);
    git(['config', 'user.email', 'test@test.com'], repoDir);
    git(['config', 'user.name', 'Test User'], repoDir);

    // Commit 1: no trailers
    writeFileSync(join(repoDir, 'file1.txt'), 'hello');
    git(['add', '.'], repoDir);
    git(['commit', '-m', 'initial commit'], repoDir);

    // Commit 2: with AI-* trailers
    writeFileSync(join(repoDir, 'file2.txt'), 'world');
    git(['add', '.'], repoDir);
    const message = [
      'feat: add authentication',
      '',
      'Added JWT-based auth flow.',
      '',
      'AI-Decision: JWT over sessions for stateless API',
      'AI-Confidence: high',
      'AI-Tags: auth, api, architecture',
      'Signed-off-by: Test User <test@test.com>',
    ].join('\n');
    git(['commit', '-m', message], repoDir);

    // Commit 3: with different trailers
    writeFileSync(join(repoDir, 'file3.txt'), 'more');
    git(['add', '.'], repoDir);
    const message2 = [
      'fix: handle edge case',
      '',
      'AI-Gotcha: Must handle null tokens gracefully',
      'AI-Confidence: medium',
    ].join('\n');
    git(['commit', '-m', message2], repoDir);
  });

  after(() => {
    rmSync(repoDir, { recursive: true, force: true });
  });

  describe('readTrailers', () => {
    it('should read AI-* trailers from HEAD', () => {
      const trailers = service.readTrailers('HEAD', repoDir);
      assert.ok(trailers.length >= 1);

      const gotcha = trailers.find(t => t.key === 'AI-Gotcha');
      assert.ok(gotcha);
      assert.equal(gotcha.value, 'Must handle null tokens gracefully');
    });

    it('should read trailers from a specific commit', () => {
      const sha = git(['rev-parse', 'HEAD~1'], repoDir);
      const trailers = service.readTrailers(sha, repoDir);

      const decision = trailers.find(t => t.key === 'AI-Decision');
      assert.ok(decision);
      assert.equal(decision.value, 'JWT over sessions for stateless API');

      const tags = trailers.find(t => t.key === 'AI-Tags');
      assert.ok(tags);
      assert.equal(tags.value, 'auth, api, architecture');
    });

    it('should not include non-AI trailers', () => {
      const sha = git(['rev-parse', 'HEAD~1'], repoDir);
      const trailers = service.readTrailers(sha, repoDir);
      const signedOff = trailers.find(t => t.key === 'Signed-off-by');
      assert.equal(signedOff, undefined);
    });

    it('should return empty array for commit with no trailers', () => {
      const sha = git(['rev-parse', 'HEAD~2'], repoDir);
      const trailers = service.readTrailers(sha, repoDir);
      assert.equal(trailers.length, 0);
    });
  });

  describe('formatTrailers', () => {
    it('should format trailers as key-value lines', () => {
      const result = service.formatTrailers([
        { key: 'AI-Decision', value: 'Use PostgreSQL' },
        { key: 'AI-Confidence', value: 'high' },
      ]);

      assert.equal(result, 'AI-Decision: Use PostgreSQL\nAI-Confidence: high');
    });

    it('should handle empty array', () => {
      assert.equal(service.formatTrailers([]), '');
    });
  });

  describe('queryTrailers', () => {
    it('should find commits with matching trailer key', () => {
      const results = service.queryTrailers('AI-Decision', { cwd: repoDir });
      assert.ok(results.length >= 1);
      assert.ok(results[0].trailers.some(t => t.key === 'AI-Decision'));
    });

    it('should find commits matching AI-Confidence across history', () => {
      const results = service.queryTrailers('AI-Confidence', { cwd: repoDir });
      assert.ok(results.length >= 2);
    });

    it('should return empty for non-existing trailer key', () => {
      const results = service.queryTrailers('AI-Nonexistent', { cwd: repoDir });
      assert.equal(results.length, 0);
    });
  });
});
