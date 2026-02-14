/**
 * Integration test: Extract flow
 *
 * Tests scanning existing commit history, extracting facts via
 * heuristic patterns, and writing them as git notes.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { ExtractService } from '../../src/application/services/ExtractService';
import { GitTriageService } from '../../src/application/services/GitTriageService';
import { MemoryRepository } from '../../src/infrastructure/repositories/MemoryRepository';
import { NotesService } from '../../src/infrastructure/services/NotesService';
import { GitClient } from '../../src/infrastructure/git/GitClient';

function git(args: string[], cwd: string): string {
  return execFileSync('git', args, { encoding: 'utf8', cwd }).trim();
}

describe('Integration: Extract', () => {
  let repoDir: string;
  let extractService: ExtractService;
  let notesService: NotesService;

  before(() => {
    repoDir = mkdtempSync(join(tmpdir(), 'git-mem-integ-extract-'));

    git(['init'], repoDir);
    git(['config', 'user.email', 'test@test.com'], repoDir);
    git(['config', 'user.name', 'Test User'], repoDir);

    // Commit 1: Interesting — conventional commit with decision keywords
    writeFileSync(join(repoDir, 'auth.ts'), 'export function login() {}');
    git(['add', '.'], repoDir);
    git(['commit', '-m', 'feat: implement JWT auth\n\nChose JWT over sessions because stateless APIs scale better.\nWatch out for token expiration edge cases.'], repoDir);

    // Commit 2: Not interesting — plain chore
    writeFileSync(join(repoDir, 'readme.md'), '# App');
    git(['add', '.'], repoDir);
    git(['commit', '-m', 'chore: add readme'], repoDir);

    // Commit 3: Interesting — fix with gotcha
    writeFileSync(join(repoDir, 'auth.ts'), 'export function login() { /* fixed */ }');
    git(['add', '.'], repoDir);
    git(['commit', '-m', 'fix: resolve race condition in token refresh\n\nInstead of concurrent requests, use a mutex lock.\nThis gotcha caught us when multiple tabs triggered simultaneous refreshes.'], repoDir);

    // Commit 4: Interesting — convention
    writeFileSync(join(repoDir, 'config.ts'), 'export const config = {};');
    git(['add', '.'], repoDir);
    git(['commit', '-m', 'feat: add config module\n\nAlways load config from environment variables, never hardcode secrets.'], repoDir);

    const gitClient = new GitClient();
    const triageService = new GitTriageService(gitClient);
    notesService = new NotesService();
    const memoryRepo = new MemoryRepository(notesService);
    extractService = new ExtractService(triageService, memoryRepo);
  });

  after(() => {
    rmSync(repoDir, { recursive: true, force: true });
  });

  it('should identify interesting commits in dry-run mode', async () => {
    const result = await extractService.extract({
      dryRun: true,
      threshold: 1,
      cwd: repoDir,
    });

    assert.equal(result.dryRun, true);
    assert.equal(result.commitsScanned, 4);
    assert.ok(result.commitsAnnotated >= 2, `Expected >=2 annotated, got ${result.commitsAnnotated}`);
    assert.ok(result.factsExtracted >= 2, `Expected >=2 facts, got ${result.factsExtracted}`);

    // No notes should be written in dry-run mode
    const entries = notesService.list(undefined, repoDir);
    assert.equal(entries.length, 0, 'Dry run should not write notes');
  });

  it('should write notes when not in dry-run mode', async () => {
    const result = await extractService.extract({
      dryRun: false,
      threshold: 1,
      cwd: repoDir,
    });

    assert.equal(result.dryRun, false);
    assert.ok(result.commitsAnnotated >= 2);
    assert.ok(result.factsExtracted >= 2);

    // Notes should now exist
    const entries = notesService.list(undefined, repoDir);
    assert.ok(entries.length >= 2, `Expected >=2 notes, got ${entries.length}`);

    // Verify the notes contain valid JSON with memories
    for (const entry of entries) {
      const raw = notesService.read(entry.objectSha, undefined, repoDir);
      assert.ok(raw, `Note for ${entry.objectSha} should not be empty`);
      const parsed = JSON.parse(raw);
      assert.ok(parsed.memories, 'Note should have memories array');
      assert.ok(parsed.memories.length > 0, 'Note should have at least one memory');

      for (const memory of parsed.memories) {
        assert.ok(memory.id, 'Memory should have id');
        assert.ok(memory.content, 'Memory should have content');
        assert.ok(memory.type, 'Memory should have type');
        assert.equal(memory.source, 'heuristic-extraction');
        assert.ok(memory.tags.includes('extract'));
      }
    }
  });

  it('should extract correct fact types from commit messages', async () => {
    const result = await extractService.extract({
      dryRun: true,
      threshold: 1,
      cwd: repoDir,
    });

    // Check that annotations contain expected fact types
    const allFactTypes = result.annotations.flatMap(a => a.factTypes);
    assert.ok(allFactTypes.includes('decision'), 'Should find decisions (because/instead of)');

    // At least some annotations should have multiple fact types
    const multiFactAnnotations = result.annotations.filter(a => a.factTypes.length > 1);
    assert.ok(multiFactAnnotations.length >= 1, 'Should have at least one commit with multiple fact types');
  });

  it('should respect maxCommits option', async () => {
    const result = await extractService.extract({
      dryRun: true,
      threshold: 1,
      maxCommits: 2,
      cwd: repoDir,
    });

    assert.ok(result.commitsScanned <= 2, `Expected <=2 scanned, got ${result.commitsScanned}`);
  });
});
