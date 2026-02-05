import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { MemoryService } from '../../../../src/application/services/MemoryService';
import { MemoryRepository } from '../../../../src/infrastructure/repositories/MemoryRepository';
import { NotesService } from '../../../../src/infrastructure/services/NotesService';

function git(args: string[], cwd: string): string {
  return execFileSync('git', args, { encoding: 'utf8', cwd }).trim();
}

describe('MemoryService', () => {
  let service: MemoryService;
  let repoDir: string;
  let commitSha: string;

  before(() => {
    const notesService = new NotesService();
    const memoryRepo = new MemoryRepository(notesService);
    service = new MemoryService(memoryRepo);

    repoDir = mkdtempSync(join(tmpdir(), 'git-mem-memsvc-test-'));
    git(['init'], repoDir);
    git(['config', 'user.email', 'test@test.com'], repoDir);
    git(['config', 'user.name', 'Test User'], repoDir);

    writeFileSync(join(repoDir, 'file1.txt'), 'hello');
    git(['add', '.'], repoDir);
    git(['commit', '-m', 'initial commit'], repoDir);
    commitSha = git(['rev-parse', 'HEAD'], repoDir);
  });

  after(() => {
    rmSync(repoDir, { recursive: true, force: true });
  });

  describe('remember', () => {
    it('should store a memory and return entity', () => {
      const memory = service.remember('JWT chosen for auth', {
        sha: commitSha,
        cwd: repoDir,
        type: 'decision',
        tags: 'auth, api',
      });

      assert.ok(memory.id);
      assert.equal(memory.content, 'JWT chosen for auth');
      assert.equal(memory.type, 'decision');
      assert.deepEqual(memory.tags, ['auth', 'api']);
    });
  });

  describe('recall', () => {
    it('should find memories by query', () => {
      const result = service.recall('JWT', { cwd: repoDir });
      assert.ok(result.memories.length >= 1);
      assert.ok(result.memories[0].content.includes('JWT'));
    });

    it('should return empty for non-matching query', () => {
      const result = service.recall('nonexistent-xyz-query', { cwd: repoDir });
      assert.equal(result.memories.length, 0);
    });
  });

  describe('get', () => {
    it('should retrieve a memory by id', () => {
      const created = service.remember('Test get by id', {
        sha: commitSha,
        cwd: repoDir,
      });

      const found = service.get(created.id, repoDir);
      assert.ok(found);
      assert.equal(found.id, created.id);
    });
  });

  describe('delete', () => {
    it('should delete a memory', () => {
      const created = service.remember('To be deleted', {
        sha: commitSha,
        cwd: repoDir,
      });

      const deleted = service.delete(created.id, repoDir);
      assert.equal(deleted, true);

      const found = service.get(created.id, repoDir);
      assert.equal(found, null);
    });
  });
});
