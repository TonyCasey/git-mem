import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { ContextService } from '../../../../src/application/services/ContextService';
import { MemoryService } from '../../../../src/application/services/MemoryService';
import { MemoryRepository } from '../../../../src/infrastructure/repositories/MemoryRepository';
import { NotesService } from '../../../../src/infrastructure/services/NotesService';
import { GitClient } from '../../../../src/infrastructure/git/GitClient';

function git(args: string[], cwd: string): string {
  return execFileSync('git', args, { encoding: 'utf8', cwd }).trim();
}

describe('ContextService', () => {
  let contextService: ContextService;
  let memoryService: MemoryService;
  let repoDir: string;
  let commitSha: string;

  before(() => {
    repoDir = mkdtempSync(join(tmpdir(), 'git-mem-context-test-'));
    git(['init'], repoDir);
    git(['config', 'user.email', 'test@test.com'], repoDir);
    git(['config', 'user.name', 'Test User'], repoDir);

    writeFileSync(join(repoDir, 'auth.ts'), 'export function login() {}');
    writeFileSync(join(repoDir, 'database.ts'), 'export function connect() {}');
    git(['add', '.'], repoDir);
    git(['commit', '-m', 'feat: initial setup'], repoDir);
    commitSha = git(['rev-parse', 'HEAD'], repoDir);

    const gitClient = new GitClient();
    const notesService = new NotesService();
    const memoryRepo = new MemoryRepository(notesService);
    contextService = new ContextService(gitClient, memoryRepo);
    memoryService = new MemoryService(memoryRepo);

    // Store memories
    memoryService.remember('Use JWT for stateless authentication', {
      sha: commitSha, cwd: repoDir, type: 'decision', tags: 'auth,security',
    });
    memoryService.remember('PostgreSQL chosen over MySQL', {
      sha: commitSha, cwd: repoDir, type: 'decision', tags: 'database,postgres',
    });
    memoryService.remember('Always validate user input at API boundary', {
      sha: commitSha, cwd: repoDir, type: 'convention', tags: 'validation,api',
    });
    memoryService.remember('Rate limiting uses sliding window algorithm', {
      sha: commitSha, cwd: repoDir, type: 'fact', tags: 'rate-limiting',
    });
  });

  after(() => {
    rmSync(repoDir, { recursive: true, force: true });
  });

  it('should return empty when no files are staged', () => {
    const result = contextService.getContext({ cwd: repoDir });
    assert.equal(result.files.length, 0);
    assert.equal(result.memories.length, 0);
    assert.equal(result.totalScanned, 0);
  });

  it('should find auth-related memories when auth file is staged', () => {
    // Stage a change to auth.ts
    writeFileSync(join(repoDir, 'auth.ts'), 'export function login() { /* JWT token */ }');
    git(['add', 'auth.ts'], repoDir);

    const result = contextService.getContext({ cwd: repoDir });

    assert.ok(result.files.length > 0, 'Should have staged files');
    assert.ok(result.memories.length > 0, 'Should find relevant memories');
    assert.ok(result.totalScanned >= 4, 'Should have scanned all memories');

    // The JWT/auth memory should rank high
    const topMemory = result.memories[0];
    assert.ok(
      topMemory.memory.content.includes('JWT') || topMemory.memory.content.includes('auth'),
      'Top memory should be auth-related'
    );
    assert.ok(topMemory.score > 0, 'Score should be positive');

    // Reset staging
    git(['reset', 'HEAD', 'auth.ts'], repoDir);
  });

  it('should find database-related memories when database file is staged', () => {
    writeFileSync(join(repoDir, 'database.ts'), 'export function connect() { /* PostgreSQL */ }');
    git(['add', 'database.ts'], repoDir);

    const result = contextService.getContext({ cwd: repoDir });

    assert.ok(result.memories.length > 0, 'Should find relevant memories');

    // Database memory should be present
    const dbMemory = result.memories.find(m =>
      m.memory.content.includes('PostgreSQL')
    );
    assert.ok(dbMemory, 'Should find PostgreSQL memory');

    git(['reset', 'HEAD', 'database.ts'], repoDir);
  });

  it('should respect the limit option', () => {
    writeFileSync(join(repoDir, 'auth.ts'), 'export function login() { /* JWT auth token validation */ }');
    git(['add', 'auth.ts'], repoDir);

    const result = contextService.getContext({ cwd: repoDir, limit: 1 });
    assert.ok(result.memories.length <= 1, 'Should respect limit');

    git(['reset', 'HEAD', 'auth.ts'], repoDir);
  });

  it('should respect the threshold option', () => {
    writeFileSync(join(repoDir, 'auth.ts'), 'export function login() {}');
    git(['add', 'auth.ts'], repoDir);

    // Very high threshold should return fewer results
    const highThreshold = contextService.getContext({ cwd: repoDir, threshold: 0.9 });
    const lowThreshold = contextService.getContext({ cwd: repoDir, threshold: 0.01 });

    assert.ok(
      lowThreshold.memories.length >= highThreshold.memories.length,
      'Lower threshold should return more or equal results'
    );

    git(['reset', 'HEAD', 'auth.ts'], repoDir);
  });

  it('should include reason in scored memories', () => {
    writeFileSync(join(repoDir, 'auth.ts'), 'export function login() { /* JWT token auth */ }');
    git(['add', 'auth.ts'], repoDir);

    const result = contextService.getContext({ cwd: repoDir });
    for (const scored of result.memories) {
      assert.ok(scored.reason, 'Each scored memory should have a reason');
      assert.ok(typeof scored.score === 'number', 'Score should be a number');
    }

    git(['reset', 'HEAD', 'auth.ts'], repoDir);
  });
});
