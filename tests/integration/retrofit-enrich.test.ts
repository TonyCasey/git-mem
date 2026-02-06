/**
 * Integration test: Retrofit with LLM enrichment
 *
 * Tests the full retrofit pipeline with a real git repo and a mock ILLMClient.
 * Verifies merge, dedup, graceful degradation, and enrichment stats.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { RetrofitService } from '../../src/application/services/RetrofitService';
import { GitTriageService } from '../../src/application/services/GitTriageService';
import { MemoryRepository } from '../../src/infrastructure/repositories/MemoryRepository';
import { NotesService } from '../../src/infrastructure/services/NotesService';
import { GitClient } from '../../src/infrastructure/git/GitClient';
import type { ILLMClient, ILLMEnrichmentInput, ILLMEnrichmentResult } from '../../src/domain/interfaces/ILLMClient';

function git(args: string[], cwd: string): string {
  return execFileSync('git', args, { encoding: 'utf8', cwd }).trim();
}

/**
 * Mock LLM client that returns predictable results.
 */
class MockLLMClient implements ILLMClient {
  calls: ILLMEnrichmentInput[] = [];
  shouldFail = false;

  async enrichCommit(input: ILLMEnrichmentInput): Promise<ILLMEnrichmentResult> {
    this.calls.push(input);

    if (this.shouldFail) {
      throw new Error('Mock LLM failure');
    }

    // Return a fact for commits with "JWT" in the subject
    if (input.subject.toLowerCase().includes('jwt')) {
      return {
        facts: [{
          content: 'JWT chosen for stateless API authentication to improve horizontal scaling',
          type: 'decision',
          confidence: 'high',
          tags: ['authentication', 'jwt', 'architecture'],
        }],
        usage: { inputTokens: 500, outputTokens: 100 },
      };
    }

    // Return a fact for commits mentioning race condition
    if (input.subject.toLowerCase().includes('race') || input.body.toLowerCase().includes('race')) {
      return {
        facts: [{
          content: 'Mutex lock required for concurrent token refresh to prevent race conditions',
          type: 'gotcha',
          confidence: 'high',
          tags: ['concurrency', 'token-refresh'],
        }],
        usage: { inputTokens: 600, outputTokens: 120 },
      };
    }

    // Return empty for everything else
    return {
      facts: [],
      usage: { inputTokens: 300, outputTokens: 10 },
    };
  }
}

describe('Integration: Retrofit with LLM Enrichment', () => {
  let repoDir: string;
  let gitClient: GitClient;
  let notesService: NotesService;

  before(() => {
    repoDir = mkdtempSync(join(tmpdir(), 'git-mem-integ-enrich-'));

    git(['init'], repoDir);
    git(['config', 'user.email', 'test@test.com'], repoDir);
    git(['config', 'user.name', 'Test User'], repoDir);

    // Commit 1: Has heuristic + LLM match (JWT decision)
    writeFileSync(join(repoDir, 'auth.ts'), 'export function login() {}');
    git(['add', '.'], repoDir);
    git(['commit', '-m', 'feat: implement JWT auth\n\nChose JWT over sessions because stateless APIs scale better.'], repoDir);

    // Commit 2: Has heuristic match only (convention)
    writeFileSync(join(repoDir, 'config.ts'), 'export const config = {};');
    git(['add', '.'], repoDir);
    git(['commit', '-m', 'feat: add config module\n\nAlways load config from environment variables.'], repoDir);

    // Commit 3: Has LLM match + heuristic gotcha (race condition)
    writeFileSync(join(repoDir, 'auth.ts'), 'export function login() { /* fixed */ }');
    git(['add', '.'], repoDir);
    git(['commit', '-m', 'fix: resolve race condition in token refresh\n\nThis gotcha caught us when multiple tabs refreshed simultaneously.'], repoDir);

    gitClient = new GitClient();
    notesService = new NotesService();
  });

  after(() => {
    rmSync(repoDir, { recursive: true, force: true });
  });

  it('should merge LLM and heuristic facts in dry-run mode', async () => {
    const mockLLM = new MockLLMClient();
    const triageService = new GitTriageService(gitClient);
    const memoryRepo = new MemoryRepository(notesService);
    const retrofitService = new RetrofitService(triageService, memoryRepo, gitClient, mockLLM);

    const result = await retrofitService.retrofit({
      dryRun: true,
      threshold: 1,
      cwd: repoDir,
      enrich: true,
    });

    assert.equal(result.dryRun, true);
    assert.ok(result.commitsAnnotated >= 2, `Expected >=2 annotated, got ${result.commitsAnnotated}`);
    assert.ok(result.factsExtracted >= 2, `Expected >=2 facts, got ${result.factsExtracted}`);

    // LLM should have been called for each high-interest commit
    assert.ok(mockLLM.calls.length >= 2, `Expected >=2 LLM calls, got ${mockLLM.calls.length}`);

    // Enrichment stats should be present
    assert.ok(result.enrichment, 'Should have enrichment stats');
    assert.ok(result.enrichment!.commitsEnriched >= 2, 'Should have enriched commits');
    assert.equal(result.enrichment!.commitsFailed, 0, 'No failures expected');
    assert.ok(result.enrichment!.totalInputTokens > 0, 'Should have token usage');
    assert.ok(result.enrichment!.totalOutputTokens > 0, 'Should have token usage');

    // Some annotations should be enriched by LLM
    const enriched = result.annotations.filter(a => a.enrichedByLLM);
    assert.ok(enriched.length >= 1, 'Should have at least 1 LLM-enriched annotation');

    // No notes should be written in dry-run
    const entries = notesService.list(undefined, repoDir);
    assert.equal(entries.length, 0, 'Dry run should not write notes');
  });

  it('should write LLM-enriched notes when not dry-run', async () => {
    const mockLLM = new MockLLMClient();
    const triageService = new GitTriageService(gitClient);
    const memoryRepo = new MemoryRepository(notesService);
    const retrofitService = new RetrofitService(triageService, memoryRepo, gitClient, mockLLM);

    const result = await retrofitService.retrofit({
      dryRun: false,
      threshold: 1,
      cwd: repoDir,
      enrich: true,
    });

    assert.equal(result.dryRun, false);
    assert.ok(result.factsExtracted >= 2);

    // Notes should now exist
    const entries = notesService.list(undefined, repoDir);
    assert.ok(entries.length >= 2, `Expected >=2 notes, got ${entries.length}`);

    // Check that some notes contain LLM-enriched memories
    let hasLLMSource = false;
    for (const entry of entries) {
      const raw = notesService.read(entry.objectSha, undefined, repoDir);
      assert.ok(raw);
      const parsed = JSON.parse(raw);
      for (const memory of parsed.memories) {
        if (memory.source === 'llm-enrichment') {
          hasLLMSource = true;
          assert.ok(memory.tags.includes('llm-enrichment'), 'LLM memory should have llm-enrichment tag');
        }
      }
    }
    assert.ok(hasLLMSource, 'Should have at least one LLM-sourced memory');
  });

  it('should degrade gracefully when LLM fails', async () => {
    const mockLLM = new MockLLMClient();
    mockLLM.shouldFail = true;
    const triageService = new GitTriageService(gitClient);

    // Need a fresh repo to avoid note conflicts
    const freshRepoDir = mkdtempSync(join(tmpdir(), 'git-mem-integ-enrich-fail-'));
    git(['init'], freshRepoDir);
    git(['config', 'user.email', 'test@test.com'], freshRepoDir);
    git(['config', 'user.name', 'Test User'], freshRepoDir);

    writeFileSync(join(freshRepoDir, 'auth.ts'), 'export function login() {}');
    git(['add', '.'], freshRepoDir);
    git(['commit', '-m', 'feat: implement JWT auth\n\nChose JWT because stateless APIs scale better.'], freshRepoDir);

    const freshNotesService = new NotesService();
    const memoryRepo = new MemoryRepository(freshNotesService);
    const retrofitService = new RetrofitService(triageService, memoryRepo, gitClient, mockLLM);

    const result = await retrofitService.retrofit({
      dryRun: true,
      threshold: 1,
      cwd: freshRepoDir,
      enrich: true,
    });

    // Should still produce heuristic results
    assert.ok(result.factsExtracted >= 1, 'Heuristic facts should still be extracted');

    // Enrichment stats should show failure
    assert.ok(result.enrichment, 'Should have enrichment stats');
    assert.ok(result.enrichment!.commitsFailed >= 1, 'Should have failed commits');
    assert.equal(result.enrichment!.commitsEnriched, 0, 'No commits should be enriched');

    rmSync(freshRepoDir, { recursive: true, force: true });
  });

  it('should skip LLM when enrich is false', async () => {
    const mockLLM = new MockLLMClient();
    const triageService = new GitTriageService(gitClient);
    const notesService2 = new NotesService();
    const memoryRepo = new MemoryRepository(notesService2);
    const retrofitService = new RetrofitService(triageService, memoryRepo, gitClient, mockLLM);

    const result = await retrofitService.retrofit({
      dryRun: true,
      threshold: 1,
      cwd: repoDir,
      enrich: false,
    });

    // LLM should not be called
    assert.equal(mockLLM.calls.length, 0, 'LLM should not be called when enrich is false');

    // Should not have enrichment stats
    assert.equal(result.enrichment, undefined, 'Should not have enrichment stats');

    // Should still have heuristic results
    assert.ok(result.factsExtracted >= 1);
  });

  it('should pass commit diff to LLM client', async () => {
    const mockLLM = new MockLLMClient();
    const triageService = new GitTriageService(gitClient);
    const notesService2 = new NotesService();
    const memoryRepo = new MemoryRepository(notesService2);
    const retrofitService = new RetrofitService(triageService, memoryRepo, gitClient, mockLLM);

    await retrofitService.retrofit({
      dryRun: true,
      threshold: 1,
      cwd: repoDir,
      enrich: true,
    });

    // Verify LLM received diff content
    for (const call of mockLLM.calls) {
      assert.ok(call.sha, 'LLM call should have SHA');
      assert.ok(call.subject, 'LLM call should have subject');
      // Diff should be present (real git repo has actual diffs)
      assert.ok(typeof call.diff === 'string', 'LLM call should have diff string');
      assert.ok(Array.isArray(call.filesChanged), 'LLM call should have filesChanged array');
    }
  });
});
