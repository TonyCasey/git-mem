import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { IExtractProgress } from '../../../../src/application/interfaces/IExtractService';
import { execFileSync } from 'child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { ExtractService } from '../../../../src/application/services/ExtractService';
import { GitTriageService } from '../../../../src/application/services/GitTriageService';
import { MemoryRepository } from '../../../../src/infrastructure/repositories/MemoryRepository';
import { NotesService } from '../../../../src/infrastructure/services/NotesService';
import { GitClient } from '../../../../src/infrastructure/git/GitClient';

function git(args: string[], cwd: string): string {
  return execFileSync('git', args, { encoding: 'utf8', cwd }).trim();
}

describe('ExtractService', () => {
  let service: ExtractService;
  let repoDir: string;

  before(() => {
    const gitClient = new GitClient();
    const triageService = new GitTriageService(gitClient);
    const notesService = new NotesService();
    const memoryRepo = new MemoryRepository(notesService);
    service = new ExtractService(triageService, memoryRepo);

    repoDir = mkdtempSync(join(tmpdir(), 'git-mem-extract-test-'));
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

  describe('extract', () => {
    it('should scan and report results in dry-run mode', async () => {
      const result = await service.extract({
        cwd: repoDir,
        dryRun: true,
        threshold: 1,
      });

      assert.ok(result.commitsScanned >= 1);
      assert.equal(result.dryRun, true);
      assert.ok(result.durationMs >= 0);
    });

    it('should annotate interesting commits when not dry-run', async () => {
      const result = await service.extract({
        cwd: repoDir,
        dryRun: false,
        threshold: 1,
      });

      assert.ok(result.commitsScanned >= 1);
      assert.equal(result.dryRun, false);
    });

    it('should return zero annotations for high threshold', async () => {
      const result = await service.extract({
        cwd: repoDir,
        dryRun: true,
        threshold: 100,
      });

      assert.equal(result.commitsAnnotated, 0);
      assert.equal(result.factsExtracted, 0);
    });

    it('should call onProgress with triage, processing, and complete phases', async () => {
      const events: IExtractProgress[] = [];

      await service.extract({
        cwd: repoDir,
        dryRun: true,
        threshold: 1,
        onProgress: (p) => events.push({ ...p }),
      });

      assert.ok(events.length >= 2, 'should emit at least triage + complete');

      // First event is triage
      assert.equal(events[0].phase, 'triage');
      assert.equal(events[0].current, 0);
      assert.ok(events[0].total >= 0);

      // Last event is complete
      const last = events[events.length - 1];
      assert.equal(last.phase, 'complete');

      // All middle events are processing
      const processingEvents = events.filter(e => e.phase === 'processing');
      for (let i = 0; i < processingEvents.length; i++) {
        assert.equal(processingEvents[i].current, i + 1, 'current should be 1-based');
        assert.ok(processingEvents[i].sha.length > 0, 'sha should be non-empty');
        assert.ok(processingEvents[i].subject.length > 0, 'subject should be non-empty');
      }
    });

    it('should emit triage and complete even with zero high-interest commits', async () => {
      const events: IExtractProgress[] = [];

      await service.extract({
        cwd: repoDir,
        dryRun: true,
        threshold: 100,
        onProgress: (p) => events.push({ ...p }),
      });

      assert.equal(events.length, 2);
      assert.equal(events[0].phase, 'triage');
      assert.equal(events[0].total, 0);
      assert.equal(events[1].phase, 'complete');
      assert.equal(events[1].factsExtracted, 0);
    });
  });
});
