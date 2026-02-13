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

  describe('buildCommitMessage', () => {
    it('should append trailers with blank line separator', () => {
      const result = service.buildCommitMessage('feat: add auth', [
        { key: 'AI-Decision', value: 'Use JWT' },
      ]);
      assert.equal(result, 'feat: add auth\n\nAI-Decision: Use JWT\n');
    });

    it('should append multiple trailers', () => {
      const result = service.buildCommitMessage('feat: add auth', [
        { key: 'AI-Decision', value: 'Use JWT' },
        { key: 'AI-Confidence', value: 'high' },
      ]);
      assert.equal(result, 'feat: add auth\n\nAI-Decision: Use JWT\nAI-Confidence: high\n');
    });

    it('should append after existing trailers without extra blank line', () => {
      const msg = 'feat: add auth\n\nCo-Authored-By: Someone <s@e.com>';
      const result = service.buildCommitMessage(msg, [
        { key: 'AI-Decision', value: 'Use JWT' },
      ]);
      assert.equal(
        result,
        'feat: add auth\n\nCo-Authored-By: Someone <s@e.com>\nAI-Decision: Use JWT\n'
      );
    });

    it('should handle message with body and no existing trailers', () => {
      const msg = 'feat: add auth\n\nAdded JWT-based auth flow.';
      const result = service.buildCommitMessage(msg, [
        { key: 'AI-Decision', value: 'Use JWT' },
      ]);
      assert.equal(
        result,
        'feat: add auth\n\nAdded JWT-based auth flow.\n\nAI-Decision: Use JWT\n'
      );
    });

    it('should return original message when trailers array is empty', () => {
      assert.equal(service.buildCommitMessage('feat: add auth', []), 'feat: add auth');
    });

    it('should handle trailing whitespace in message', () => {
      const result = service.buildCommitMessage('feat: add auth  \n\n', [
        { key: 'AI-Fact', value: 'test' },
      ]);
      assert.equal(result, 'feat: add auth\n\nAI-Fact: test\n');
    });
  });

  describe('addTrailers', () => {
    let writeRepoDir: string;

    before(() => {
      writeRepoDir = mkdtempSync(join(tmpdir(), 'git-mem-trailer-write-'));
      git(['init'], writeRepoDir);
      git(['config', 'user.email', 'test@test.com'], writeRepoDir);
      git(['config', 'user.name', 'Test User'], writeRepoDir);
    });

    after(() => {
      rmSync(writeRepoDir, { recursive: true, force: true });
    });

    it('should amend HEAD with new trailers', () => {
      writeFileSync(join(writeRepoDir, 'a.txt'), 'content');
      git(['add', '.'], writeRepoDir);
      git(['commit', '-m', 'feat: initial'], writeRepoDir);

      service.addTrailers(
        [{ key: 'AI-Decision', value: 'Use Redis' }],
        writeRepoDir
      );

      const trailers = service.readTrailers('HEAD', writeRepoDir);
      const decision = trailers.find(t => t.key === 'AI-Decision');
      assert.ok(decision);
      assert.equal(decision.value, 'Use Redis');
    });

    it('should preserve existing trailers', () => {
      writeFileSync(join(writeRepoDir, 'b.txt'), 'content');
      git(['add', '.'], writeRepoDir);
      const msg = 'feat: with trailer\n\nAI-Gotcha: Watch out for nulls';
      git(['commit', '-m', msg], writeRepoDir);

      service.addTrailers(
        [{ key: 'AI-Confidence', value: 'high' }],
        writeRepoDir
      );

      const trailers = service.readTrailers('HEAD', writeRepoDir);
      assert.ok(trailers.find(t => t.key === 'AI-Gotcha'));
      assert.ok(trailers.find(t => t.key === 'AI-Confidence'));
    });

    it('should not duplicate existing trailers', () => {
      writeFileSync(join(writeRepoDir, 'c.txt'), 'content');
      git(['add', '.'], writeRepoDir);
      const msg = 'feat: dup test\n\nAI-Decision: Use Redis';
      git(['commit', '-m', msg], writeRepoDir);

      service.addTrailers(
        [{ key: 'AI-Decision', value: 'Use Redis' }],
        writeRepoDir
      );

      const trailers = service.readTrailers('HEAD', writeRepoDir);
      const decisions = trailers.filter(t => t.key === 'AI-Decision');
      assert.equal(decisions.length, 1);
    });

    it('should be a no-op when trailers array is empty', () => {
      writeFileSync(join(writeRepoDir, 'd.txt'), 'content');
      git(['add', '.'], writeRepoDir);
      git(['commit', '-m', 'feat: empty test'], writeRepoDir);
      const shaBefore = git(['rev-parse', 'HEAD'], writeRepoDir);

      service.addTrailers([], writeRepoDir);

      const shaAfter = git(['rev-parse', 'HEAD'], writeRepoDir);
      assert.equal(shaBefore, shaAfter);
    });

    it('should add multiple trailers at once', () => {
      writeFileSync(join(writeRepoDir, 'e.txt'), 'content');
      git(['add', '.'], writeRepoDir);
      git(['commit', '-m', 'feat: multi trailer'], writeRepoDir);

      service.addTrailers(
        [
          { key: 'AI-Decision', value: 'Use PostgreSQL' },
          { key: 'AI-Confidence', value: 'high' },
          { key: 'AI-Tags', value: 'db, infrastructure' },
        ],
        writeRepoDir
      );

      const trailers = service.readTrailers('HEAD', writeRepoDir);
      assert.equal(trailers.length, 3);
      assert.ok(trailers.find(t => t.key === 'AI-Decision'));
      assert.ok(trailers.find(t => t.key === 'AI-Confidence'));
      assert.ok(trailers.find(t => t.key === 'AI-Tags'));
    });
  });
});
