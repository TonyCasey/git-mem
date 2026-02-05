import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { MemoryRepository } from '../../../../src/infrastructure/repositories/MemoryRepository';
import { NotesService } from '../../../../src/infrastructure/services/NotesService';

function git(args: string[], cwd: string): string {
  return execFileSync('git', args, { encoding: 'utf8', cwd }).trim();
}

describe('MemoryRepository', () => {
  let repo: MemoryRepository;
  let notesService: NotesService;
  let repoDir: string;
  let commitSha: string;

  before(() => {
    notesService = new NotesService();
    repo = new MemoryRepository(notesService);
    repoDir = mkdtempSync(join(tmpdir(), 'git-mem-memrepo-test-'));

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

  describe('create', () => {
    it('should create a memory with defaults', () => {
      const memory = repo.create('JWT chosen for stateless API', {
        sha: commitSha,
        cwd: repoDir,
      });

      assert.ok(memory.id);
      assert.equal(memory.content, 'JWT chosen for stateless API');
      assert.equal(memory.type, 'fact');
      assert.equal(memory.sha, commitSha);
      assert.equal(memory.confidence, 'high');
      assert.equal(memory.source, 'user-explicit');
      assert.equal(memory.lifecycle, 'project');
      assert.ok(memory.createdAt);
    });

    it('should create a memory with custom options', () => {
      const memory = repo.create('Always use constructor injection', {
        sha: commitSha,
        cwd: repoDir,
        type: 'convention',
        confidence: 'verified',
        lifecycle: 'permanent',
        tags: 'architecture, di',
      });

      assert.equal(memory.type, 'convention');
      assert.equal(memory.confidence, 'verified');
      assert.equal(memory.lifecycle, 'permanent');
      assert.deepEqual(memory.tags, ['architecture', 'di']);
    });
  });

  describe('getById', () => {
    it('should find a memory by id', () => {
      const created = repo.create('Test memory for getById', {
        sha: commitSha,
        cwd: repoDir,
      });

      const found = repo.getById(created.id, repoDir);
      assert.ok(found);
      assert.equal(found.id, created.id);
      assert.equal(found.content, 'Test memory for getById');
    });

    it('should return null for non-existing id', () => {
      const found = repo.getById('nonexistent-uuid', repoDir);
      assert.equal(found, null);
    });
  });

  describe('query', () => {
    it('should return all memories', () => {
      const result = repo.query({ cwd: repoDir, limit: 100 });
      assert.ok(result.memories.length >= 1);
      assert.ok(result.total >= 1);
    });

    it('should filter by type', () => {
      const result = repo.query({ type: 'convention', cwd: repoDir });
      assert.ok(result.memories.every(m => m.type === 'convention'));
    });

    it('should filter by query text', () => {
      const result = repo.query({ query: 'JWT', cwd: repoDir });
      assert.ok(result.memories.every(m =>
        m.content.toLowerCase().includes('jwt')
      ));
    });

    it('should filter by tag', () => {
      const result = repo.query({ tag: 'architecture', cwd: repoDir });
      assert.ok(result.memories.every(m =>
        m.tags.includes('architecture')
      ));
    });

    it('should respect limit', () => {
      const result = repo.query({ limit: 1, cwd: repoDir });
      assert.ok(result.memories.length <= 1);
    });
  });

  describe('delete', () => {
    it('should delete an existing memory', () => {
      const created = repo.create('To be deleted', {
        sha: commitSha,
        cwd: repoDir,
      });

      const deleted = repo.delete(created.id, repoDir);
      assert.equal(deleted, true);

      const found = repo.getById(created.id, repoDir);
      assert.equal(found, null);
    });

    it('should return false for non-existing id', () => {
      const result = repo.delete('nonexistent-uuid', repoDir);
      assert.equal(result, false);
    });
  });
});
