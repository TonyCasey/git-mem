/**
 * Integration test: Remember + Recall flow
 *
 * Tests the full end-to-end flow of storing and retrieving memories
 * using real git repos (no mocks).
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { MemoryService } from '../../src/application/services/MemoryService';
import { MemoryRepository } from '../../src/infrastructure/repositories/MemoryRepository';
import { NotesService } from '../../src/infrastructure/services/NotesService';

function git(args: string[], cwd: string): string {
  return execFileSync('git', args, { encoding: 'utf8', cwd }).trim();
}

describe('Integration: Remember + Recall', () => {
  let repoDir: string;
  let memoryService: MemoryService;
  let commitSha: string;

  before(() => {
    repoDir = mkdtempSync(join(tmpdir(), 'git-mem-integ-remember-'));

    git(['init'], repoDir);
    git(['config', 'user.email', 'test@test.com'], repoDir);
    git(['config', 'user.name', 'Test User'], repoDir);

    writeFileSync(join(repoDir, 'app.ts'), 'console.log("hello");');
    git(['add', '.'], repoDir);
    git(['commit', '-m', 'feat: initial app setup'], repoDir);
    commitSha = git(['rev-parse', 'HEAD'], repoDir);

    const notesService = new NotesService();
    const memoryRepo = new MemoryRepository(notesService);
    memoryService = new MemoryService(memoryRepo);
  });

  after(() => {
    rmSync(repoDir, { recursive: true, force: true });
  });

  it('should remember a fact and recall it by query', () => {
    const memory = memoryService.remember('JWT chosen over sessions for stateless API', {
      sha: commitSha,
      type: 'decision',
      confidence: 'high',
      tags: 'auth, architecture',
      cwd: repoDir,
    });

    assert.ok(memory.id);
    assert.equal(memory.content, 'JWT chosen over sessions for stateless API');
    assert.equal(memory.type, 'decision');
    assert.equal(memory.sha, commitSha);
    assert.deepEqual(memory.tags, ['auth', 'architecture']);

    // Verify note exists in git
    const noteRaw = git(['notes', '--ref=refs/notes/mem', 'show', commitSha], repoDir);
    const parsed = JSON.parse(noteRaw);
    assert.ok(parsed.memories);
    assert.equal(parsed.memories.length, 1);
    assert.equal(parsed.memories[0].id, memory.id);

    // Recall by query
    const result = memoryService.recall('JWT', { cwd: repoDir });
    assert.equal(result.total, 1);
    assert.equal(result.memories[0].id, memory.id);
    assert.equal(result.memories[0].content, 'JWT chosen over sessions for stateless API');
  });

  it('should store multiple memories on the same commit', () => {
    memoryService.remember('Always use HTTPS in production', {
      sha: commitSha,
      type: 'convention',
      tags: 'security',
      cwd: repoDir,
    });

    memoryService.remember('Watch out for CORS issues with API gateway', {
      sha: commitSha,
      type: 'gotcha',
      tags: 'networking',
      cwd: repoDir,
    });

    // Should now have 3 total (1 from previous test + 2 new)
    const result = memoryService.recall(undefined, { cwd: repoDir });
    assert.equal(result.total, 3);
  });

  it('should filter by type', () => {
    const decisions = memoryService.recall(undefined, { type: 'decision', cwd: repoDir });
    assert.equal(decisions.total, 1);
    assert.equal(decisions.memories[0].type, 'decision');

    const gotchas = memoryService.recall(undefined, { type: 'gotcha', cwd: repoDir });
    assert.equal(gotchas.total, 1);
    assert.equal(gotchas.memories[0].type, 'gotcha');
  });

  it('should get a memory by ID', () => {
    const all = memoryService.recall(undefined, { cwd: repoDir });
    const firstId = all.memories[0].id;

    const found = memoryService.get(firstId, repoDir);
    assert.ok(found);
    assert.equal(found.id, firstId);
  });

  it('should delete a memory by ID', () => {
    const all = memoryService.recall(undefined, { cwd: repoDir });
    const countBefore = all.total;
    const targetId = all.memories[0].id;

    const deleted = memoryService.delete(targetId, repoDir);
    assert.ok(deleted);

    const afterDelete = memoryService.recall(undefined, { cwd: repoDir });
    assert.equal(afterDelete.total, countBefore - 1);

    // Should not find deleted memory
    const notFound = memoryService.get(targetId, repoDir);
    assert.equal(notFound, null);
  });

  it('should work across multiple commits', () => {
    writeFileSync(join(repoDir, 'config.ts'), 'export const config = {};');
    git(['add', '.'], repoDir);
    git(['commit', '-m', 'feat: add config module'], repoDir);
    const sha2 = git(['rev-parse', 'HEAD'], repoDir);

    memoryService.remember('Config module uses environment variables', {
      sha: sha2,
      type: 'fact',
      cwd: repoDir,
    });

    // Should find memories across both commits
    const all = memoryService.recall(undefined, { cwd: repoDir });
    assert.ok(all.total >= 3); // 2 remaining from first commit + 1 new

    // Search specific to second commit content
    const configResult = memoryService.recall('config', { cwd: repoDir });
    assert.ok(configResult.total >= 1);
    assert.ok(configResult.memories.some(m => m.sha === sha2));
  });
});
