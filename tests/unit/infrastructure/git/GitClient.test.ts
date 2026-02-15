import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { GitClient } from '../../../../src/infrastructure/git/GitClient';

function git(args: string[], cwd: string): string {
  return execFileSync('git', args, { encoding: 'utf8', cwd }).trim();
}

describe('GitClient', () => {
  let client: GitClient;
  let repoDir: string;

  before(() => {
    client = new GitClient();
    repoDir = mkdtempSync(join(tmpdir(), 'git-mem-test-'));

    // Set up a test git repo
    git(['init'], repoDir);
    git(['config', 'user.email', 'test@test.com'], repoDir);
    git(['config', 'user.name', 'Test User'], repoDir);

    // Create initial commit
    writeFileSync(join(repoDir, 'file1.txt'), '');
    git(['add', '.'], repoDir);
    git(['commit', '-m', 'feat: initial commit\n\nThis is the body of the commit.'], repoDir);

    // Create second commit
    writeFileSync(join(repoDir, 'file2.txt'), '');
    git(['add', '.'], repoDir);
    git(['commit', '-m', 'fix: second commit'], repoDir);

    // Create a tag
    git(['tag', 'v1.0.0'], repoDir);
  });

  after(() => {
    rmSync(repoDir, { recursive: true, force: true });
  });

  describe('log', () => {
    it('should return log output', () => {
      const output = client.log({ cwd: repoDir });
      assert.ok(output.includes('second commit'));
      assert.ok(output.includes('initial commit'));
    });

    it('should respect maxCount', () => {
      const output = client.log({ maxCount: 1, cwd: repoDir });
      assert.ok(output.includes('second commit'));
      assert.ok(!output.includes('initial commit'));
    });
  });

  describe('refExists', () => {
    it('should return true for existing ref', () => {
      assert.equal(client.refExists('HEAD', repoDir), true);
    });

    it('should return false for non-existing ref', () => {
      assert.equal(client.refExists('nonexistent-branch', repoDir), false);
    });

    it('should return true for existing tag', () => {
      assert.equal(client.refExists('v1.0.0', repoDir), true);
    });
  });

  describe('getDefaultBranch', () => {
    it('should detect default branch', () => {
      const branch = client.getDefaultBranch(repoDir);
      assert.ok(branch === 'main' || branch === 'master');
    });
  });

  describe('logDetailed', () => {
    it('should return structured commits', () => {
      const commits = client.logDetailed({ cwd: repoDir });
      assert.ok(commits.length >= 2);

      const latest = commits[0];
      assert.equal(latest.subject, 'fix: second commit');
      assert.equal(latest.authorName, 'Test User');
      assert.equal(latest.authorEmail, 'test@test.com');
      assert.ok(latest.sha.length === 40);
      assert.ok(latest.shortSha.length >= 7);
      assert.ok(latest.authorTimestamp > 0);
    });

    it('should respect maxCount', () => {
      const commits = client.logDetailed({ maxCount: 1, cwd: repoDir });
      assert.equal(commits.length, 1);
      assert.equal(commits[0].subject, 'fix: second commit');
    });

    it('should return empty array for empty range', () => {
      const commits = client.logDetailed({ since: '2099-01-01', cwd: repoDir });
      assert.equal(commits.length, 0);
    });
  });

  describe('getCommitStats', () => {
    it('should return stats for a commit', () => {
      const sha = git(['rev-parse', 'HEAD'], repoDir);
      const stats = client.getCommitStats(sha, repoDir);
      assert.ok(stats.length > 0);

      const fileStat = stats.find(s => s.path === 'file2.txt');
      assert.ok(fileStat);
      assert.equal(fileStat.isNew, true);
    });
  });

  describe('listTags', () => {
    it('should list tags', () => {
      const tags = client.listTags(repoDir);
      assert.ok(tags.length >= 1);
      assert.equal(tags[0].name, 'v1.0.0');
      assert.ok(tags[0].sha.length === 40);
    });
  });

  describe('countCommits', () => {
    it('should return correct commit count', () => {
      const count = client.countCommits(repoDir);
      assert.equal(count, 2);
    });
  });
});
