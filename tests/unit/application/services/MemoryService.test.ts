import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { MemoryService } from '../../../../src/application/services/MemoryService';
import { MemoryRepository } from '../../../../src/infrastructure/repositories/MemoryRepository';
import { NotesService } from '../../../../src/infrastructure/services/NotesService';
import { TrailerService } from '../../../../src/infrastructure/services/TrailerService';

function git(args: string[], cwd: string): string {
  return execFileSync('git', args, { encoding: 'utf8', cwd }).trim();
}

describe('MemoryService', () => {
  let service: MemoryService;
  let serviceWithTrailers: MemoryService;
  let trailerService: TrailerService;
  let repoDir: string;
  let commitSha: string;

  before(() => {
    const notesService = new NotesService();
    const memoryRepo = new MemoryRepository(notesService);
    trailerService = new TrailerService();
    service = new MemoryService(memoryRepo);
    serviceWithTrailers = new MemoryService(memoryRepo, undefined, trailerService);

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

  describe('remember with trailers', () => {
    it('should write AI-* trailers to the commit', () => {
      // Create a fresh commit for this test
      writeFileSync(join(repoDir, 'trailer-test.txt'), 'trailer');
      git(['add', '.'], repoDir);
      git(['commit', '-m', 'feat: trailer test'], repoDir);

      serviceWithTrailers.remember('Use Redis for caching', {
        cwd: repoDir,
        type: 'decision',
        confidence: 'high',
        tags: 'cache, infra',
      });

      const trailers = trailerService.readTrailers('HEAD', repoDir);
      assert.ok(trailers.find(t => t.key === 'AI-Decision' && t.value === 'Use Redis for caching'));
      assert.ok(trailers.find(t => t.key === 'AI-Confidence' && t.value === 'high'));
      assert.ok(trailers.find(t => t.key === 'AI-Tags' && t.value === 'cache, infra'));
      assert.ok(trailers.find(t => t.key === 'AI-Memory-Id'));
    });

    it('should map memory type to correct trailer key', () => {
      writeFileSync(join(repoDir, 'gotcha-test.txt'), 'gotcha');
      git(['add', '.'], repoDir);
      git(['commit', '-m', 'fix: gotcha test'], repoDir);

      serviceWithTrailers.remember('Watch out for null tokens', {
        cwd: repoDir,
        type: 'gotcha',
      });

      const trailers = trailerService.readTrailers('HEAD', repoDir);
      assert.ok(trailers.find(t => t.key === 'AI-Gotcha'));
      assert.ok(!trailers.find(t => t.key === 'AI-Decision'));
    });

    it('should skip trailers when trailers: false', () => {
      writeFileSync(join(repoDir, 'no-trailer.txt'), 'skip');
      git(['add', '.'], repoDir);
      git(['commit', '-m', 'feat: no trailer test'], repoDir);
      const shaBefore = git(['rev-parse', 'HEAD'], repoDir);

      serviceWithTrailers.remember('No trailer for this', {
        cwd: repoDir,
        type: 'fact',
        trailers: false,
      });

      // SHA unchanged means commit was not amended
      const shaAfter = git(['rev-parse', 'HEAD'], repoDir);
      assert.equal(shaBefore, shaAfter);
    });

    it('should not fail when trailerService is not injected', () => {
      writeFileSync(join(repoDir, 'no-svc.txt'), 'plain');
      git(['add', '.'], repoDir);
      git(['commit', '-m', 'feat: no service'], repoDir);

      // service (without trailerService) should not throw
      const memory = service.remember('Plain memory', { cwd: repoDir });
      assert.ok(memory.id);
    });

    it('should include AI-Memory-Id linking trailer to notes entry', () => {
      writeFileSync(join(repoDir, 'link-test.txt'), 'link');
      git(['add', '.'], repoDir);
      git(['commit', '-m', 'feat: link test'], repoDir);

      const memory = serviceWithTrailers.remember('Linked memory', {
        cwd: repoDir,
        type: 'convention',
      });

      const trailers = trailerService.readTrailers('HEAD', repoDir);
      const memoryId = trailers.find(t => t.key === 'AI-Memory-Id');
      assert.ok(memoryId);
      assert.equal(memoryId.value, memory.id);
    });

    it('should not write AI-Tags trailer when tags are empty', () => {
      writeFileSync(join(repoDir, 'no-tags.txt'), 'notags');
      git(['add', '.'], repoDir);
      git(['commit', '-m', 'feat: no tags test'], repoDir);

      serviceWithTrailers.remember('No tags here', {
        cwd: repoDir,
        type: 'fact',
      });

      const trailers = trailerService.readTrailers('HEAD', repoDir);
      assert.ok(!trailers.find(t => t.key === 'AI-Tags'));
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
