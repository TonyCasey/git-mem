import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { RetrofitService } from '../../../../src/application/services/RetrofitService';
import { GitTriageService } from '../../../../src/application/services/GitTriageService';
import { MemoryRepository } from '../../../../src/infrastructure/repositories/MemoryRepository';
import { NotesService } from '../../../../src/infrastructure/services/NotesService';
import { GitClient } from '../../../../src/infrastructure/git/GitClient';

function git(args: string[], cwd: string): string {
  return execFileSync('git', args, { encoding: 'utf8', cwd }).trim();
}

describe('RetrofitService', () => {
  let service: RetrofitService;
  let repoDir: string;

  before(() => {
    const gitClient = new GitClient();
    const triageService = new GitTriageService(gitClient);
    const notesService = new NotesService();
    const memoryRepo = new MemoryRepository(notesService);
    service = new RetrofitService(triageService, memoryRepo);

    repoDir = mkdtempSync(join(tmpdir(), 'git-mem-retrofit-test-'));
    git(['init'], repoDir);
    git(['config', 'user.email', 'test@test.com'], repoDir);
    git(['config', 'user.name', 'Test User'], repoDir);

    // Create commits with various signals
    writeFileSync(join(repoDir, 'file1.txt'), 'hello');
    git(['add', '.'], repoDir);
    git(['commit', '-m', 'initial commit'], repoDir);

    // Commit with decision keywords and conventional prefix
    writeFileSync(join(repoDir, 'file2.txt'), 'world');
    git(['add', '.'], repoDir);
    const message = [
      'feat: migrate to JWT authentication',
      '',
      'Decided to use JWT instead of sessions because it allows stateless API authentication.',
      'Watch out: token refresh needs careful handling to avoid race conditions.',
    ].join('\n');
    git(['commit', '-m', message], repoDir);

    // Tag for tag-adjacency
    git(['tag', 'v1.0.0'], repoDir);

    // Another commit near tag
    writeFileSync(join(repoDir, 'file3.txt'), 'more');
    git(['add', '.'], repoDir);
    git(['commit', '-m', 'fix: handle edge case in token validation'], repoDir);
  });

  after(() => {
    rmSync(repoDir, { recursive: true, force: true });
  });

  describe('retrofit', () => {
    it('should scan and report results in dry-run mode', async () => {
      const result = await service.retrofit({
        cwd: repoDir,
        dryRun: true,
        threshold: 1,
      });

      assert.ok(result.commitsScanned >= 1);
      assert.equal(result.dryRun, true);
      assert.ok(result.durationMs >= 0);
    });

    it('should annotate interesting commits when not dry-run', async () => {
      const result = await service.retrofit({
        cwd: repoDir,
        dryRun: false,
        threshold: 1,
      });

      assert.ok(result.commitsScanned >= 1);
      assert.equal(result.dryRun, false);
    });

    it('should return zero annotations for high threshold', async () => {
      const result = await service.retrofit({
        cwd: repoDir,
        dryRun: true,
        threshold: 100,
      });

      assert.equal(result.commitsAnnotated, 0);
      assert.equal(result.factsExtracted, 0);
    });
  });
});
