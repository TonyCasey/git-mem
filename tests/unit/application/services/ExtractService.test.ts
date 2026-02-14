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
import { TrailerService } from '../../../../src/infrastructure/services/TrailerService';

function git(args: string[], cwd: string): string {
  return execFileSync('git', args, { encoding: 'utf8', cwd }).trim();
}

describe('ExtractService', () => {
  let service: ExtractService;
  let serviceWithTrailers: ExtractService;
  let memoryRepo: MemoryRepository;
  let repoDir: string;

  before(() => {
    const gitClient = new GitClient();
    const triageService = new GitTriageService(gitClient);
    const notesService = new NotesService();
    memoryRepo = new MemoryRepository(notesService);
    const trailerService = new TrailerService();
    service = new ExtractService(triageService, memoryRepo);
    serviceWithTrailers = new ExtractService(triageService, memoryRepo, gitClient, undefined, undefined, trailerService);

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

  describe('extract with trailers', () => {
    let trailerRepoDir: string;

    before(() => {
      trailerRepoDir = mkdtempSync(join(tmpdir(), 'git-mem-extract-trailer-'));
      git(['init'], trailerRepoDir);
      git(['config', 'user.email', 'test@test.com'], trailerRepoDir);
      git(['config', 'user.name', 'Test User'], trailerRepoDir);

      writeFileSync(join(trailerRepoDir, 'file1.txt'), 'hello');
      git(['add', '.'], trailerRepoDir);
      git(['commit', '-m', 'initial commit'], trailerRepoDir);
    });

    after(() => {
      rmSync(trailerRepoDir, { recursive: true, force: true });
    });

    it('should import AI-* trailers as high-confidence memories', async () => {
      // Create a commit with AI-Decision trailer
      writeFileSync(join(trailerRepoDir, 'trailer1.txt'), 'trailer1');
      git(['add', '.'], trailerRepoDir);
      const msg = 'feat: add caching layer\n\nAI-Decision: Use Redis for caching\nAI-Confidence: high';
      git(['commit', '-m', msg], trailerRepoDir);

      const result = await serviceWithTrailers.extract({
        cwd: trailerRepoDir,
        dryRun: false,
        threshold: 1,
      });

      // Should extract the trailer as a fact
      const annotation = result.annotations.find(a => a.subject === 'feat: add caching layer');
      assert.ok(annotation, 'should find annotation for trailer commit');
      assert.ok(annotation.factsExtracted >= 1);
      assert.ok(annotation.factTypes.includes('decision'));

      // Verify the memory was stored with correct source
      const memories = memoryRepo.query({ cwd: trailerRepoDir });
      const trailerMemory = memories.memories.find(m => m.content === 'Use Redis for caching');
      assert.ok(trailerMemory);
      assert.equal(trailerMemory.source, 'commit-trailer');
      assert.equal(trailerMemory.type, 'decision');
    });

    it('should not duplicate when trailer and heuristic extract same type', async () => {
      // Create a commit with both a decision trailer AND decision keywords in the message
      writeFileSync(join(trailerRepoDir, 'dedup1.txt'), 'dedup1');
      git(['add', '.'], trailerRepoDir);
      const msg = [
        'feat: migrate to PostgreSQL',
        '',
        'Decided to use PostgreSQL instead of MySQL because it has better JSON support.',
        '',
        'AI-Decision: Use PostgreSQL for persistence',
        'AI-Confidence: high',
      ].join('\n');
      git(['commit', '-m', msg], trailerRepoDir);

      const result = await serviceWithTrailers.extract({
        cwd: trailerRepoDir,
        dryRun: false,
        threshold: 1,
      });

      const annotation = result.annotations.find(a => a.subject === 'feat: migrate to PostgreSQL');
      assert.ok(annotation);

      // The trailer decision should be included but heuristic decision should be skipped
      const memories = memoryRepo.query({ cwd: trailerRepoDir });
      const pgMemories = memories.memories.filter(
        m => m.sha === annotation.sha && m.type === 'decision'
      );

      // Should have exactly 1 decision (from trailer), not 2 (trailer + heuristic)
      assert.equal(pgMemories.length, 1, 'should not duplicate decision from trailer + heuristic');
      assert.equal(pgMemories[0].source, 'commit-trailer');
    });

    it('should still extract heuristic facts for types not covered by trailers', async () => {
      // Commit with AI-Decision trailer but gotcha keywords in message
      writeFileSync(join(trailerRepoDir, 'mixed1.txt'), 'mixed1');
      git(['add', '.'], trailerRepoDir);
      const msg = [
        'feat: add auth middleware',
        '',
        'Watch out: tokens expire after 24h, must handle refresh.',
        '',
        'AI-Decision: Use middleware pattern for auth',
        'AI-Confidence: high',
      ].join('\n');
      git(['commit', '-m', msg], trailerRepoDir);

      const result = await serviceWithTrailers.extract({
        cwd: trailerRepoDir,
        dryRun: false,
        threshold: 1,
      });

      const annotation = result.annotations.find(a => a.subject === 'feat: add auth middleware');
      assert.ok(annotation);
      // Should have both decision (from trailer) and gotcha (from heuristic)
      assert.ok(annotation.factTypes.includes('decision'));
      assert.ok(annotation.factTypes.includes('gotcha'));
    });

    it('should work without trailerService (existing behavior preserved)', async () => {
      writeFileSync(join(trailerRepoDir, 'no-svc.txt'), 'no-svc');
      git(['add', '.'], trailerRepoDir);
      const msg = 'feat: add validation\n\nAI-Decision: Use Zod for validation';
      git(['commit', '-m', msg], trailerRepoDir);

      // Service without trailerService should still work (ignores trailers)
      const result = await service.extract({
        cwd: trailerRepoDir,
        dryRun: true,
        threshold: 1,
      });

      assert.ok(result.commitsScanned >= 1);
      assert.ok(result.durationMs >= 0);
    });
  });
});
