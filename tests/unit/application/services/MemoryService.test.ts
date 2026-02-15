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

      const memory = serviceWithTrailers.remember('No trailer for this', {
        cwd: repoDir,
        type: 'fact',
        trailers: false,
      });

      // SHA unchanged means commit was not amended
      const shaAfter = git(['rev-parse', 'HEAD'], repoDir);
      assert.equal(shaBefore, shaAfter);
      // Memory should still be created in notes even without trailers
      assert.ok(memory.id);
      assert.equal(memory.content, 'No trailer for this');
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

    it('should write AI-Agent and AI-Model trailers when provided', () => {
      writeFileSync(join(repoDir, 'agent-model.txt'), 'agent-model');
      git(['add', '.'], repoDir);
      git(['commit', '-m', 'feat: agent model test'], repoDir);

      serviceWithTrailers.remember('Memory with agent and model', {
        cwd: repoDir,
        type: 'fact',
        agent: 'Claude-Code',
        model: 'claude-opus-4-6',
      });

      const trailers = trailerService.readTrailers('HEAD', repoDir);
      assert.ok(trailers.find(t => t.key === 'AI-Agent' && t.value === 'Claude-Code'));
      assert.ok(trailers.find(t => t.key === 'AI-Model' && t.value === 'claude-opus-4-6'));
    });

    it('should not write AI-Agent or AI-Model trailers when not provided', () => {
      writeFileSync(join(repoDir, 'no-agent-model.txt'), 'no-agent');
      git(['add', '.'], repoDir);
      git(['commit', '-m', 'feat: no agent model test'], repoDir);

      serviceWithTrailers.remember('Memory without agent', {
        cwd: repoDir,
        type: 'fact',
      });

      const trailers = trailerService.readTrailers('HEAD', repoDir);
      assert.ok(!trailers.find(t => t.key === 'AI-Agent'));
      assert.ok(!trailers.find(t => t.key === 'AI-Model'));
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

    it('should handle query on memories with undefined content gracefully (GIT-96)', () => {
      // Regression test: inject actual malformed data with missing content/tags
      const malformedFile = join(repoDir, 'git-96-memsvc-malformed.txt');
      writeFileSync(malformedFile, 'malformed memory service test');
      git(['add', 'git-96-memsvc-malformed.txt'], repoDir);
      git(['commit', '-m', 'git-96 memsvc malformed memory'], repoDir);
      const malformedSha = git(['rev-parse', 'HEAD'], repoDir);

      // Write a malformed note payload (missing content and tags fields)
      const malformedPayload = JSON.stringify({
        memories: [{
          id: 'git-96-memsvc-malformed-id',
          type: 'gotcha',
          sha: malformedSha,
          confidence: 'medium',
          source: 'user-explicit',
          lifecycle: 'project',
          // Intentionally omit content and tags to simulate malformed data
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }],
      });

      git(['notes', '--ref', 'refs/notes/mem', 'add', '-f', '-m', malformedPayload, malformedSha], repoDir);

      // Query should not throw even with malformed data
      const result = service.recall('test-query', { cwd: repoDir });
      assert.ok(Array.isArray(result.memories));
    });
  });

  describe('unified recall (notes + trailers)', () => {
    it('should find trailer-only memories via recall', () => {
      // Create a commit with trailers added manually (no notes)
      writeFileSync(join(repoDir, 'manual-trailer.txt'), 'manual');
      git(['add', '.'], repoDir);
      git(['commit', '-m', 'feat: manual trailer\n\nAI-Decision: Use PostgreSQL for persistence\nAI-Confidence: high'], repoDir);

      const result = serviceWithTrailers.recall('PostgreSQL', { cwd: repoDir });
      assert.ok(result.memories.length >= 1);
      const found = result.memories.find(m => m.content === 'Use PostgreSQL for persistence');
      assert.ok(found);
      assert.equal(found.type, 'decision');
      assert.equal(found.source, 'commit-trailer');
    });

    it('should deduplicate when trailer has matching AI-Memory-Id in notes', () => {
      // Create a commit and use dual-write (creates both notes and trailers)
      writeFileSync(join(repoDir, 'dedup-test.txt'), 'dedup');
      git(['add', '.'], repoDir);
      git(['commit', '-m', 'feat: dedup test'], repoDir);

      const memory = serviceWithTrailers.remember('Dedup test memory', {
        cwd: repoDir,
        type: 'decision',
      });

      // recall should return the notes version, not duplicate with trailer
      const result = serviceWithTrailers.recall('Dedup test', { cwd: repoDir });
      const matches = result.memories.filter(m => m.content === 'Dedup test memory');
      assert.equal(matches.length, 1);
      assert.equal(matches[0].id, memory.id);
      // Notes source (user-explicit), not commit-trailer
      assert.notEqual(matches[0].source, 'commit-trailer');
    });

    it('should include manually-added trailers with no AI-Memory-Id', () => {
      writeFileSync(join(repoDir, 'no-memid.txt'), 'no-memid');
      git(['add', '.'], repoDir);
      git(['commit', '-m', 'fix: manual gotcha\n\nAI-Gotcha: Always check for null tokens'], repoDir);

      const result = serviceWithTrailers.recall('null tokens', { cwd: repoDir });
      const found = result.memories.find(m => m.content === 'Always check for null tokens');
      assert.ok(found);
      assert.equal(found.type, 'gotcha');
      assert.equal(found.source, 'commit-trailer');
      // Synthetic ID since no AI-Memory-Id
      assert.ok(found.id.startsWith('trailer:'));
    });

    it('should set source to commit-trailer for trailer-sourced memories', () => {
      writeFileSync(join(repoDir, 'source-test.txt'), 'source');
      git(['add', '.'], repoDir);
      git(['commit', '-m', 'docs: convention\n\nAI-Convention: Always use kebab-case for files'], repoDir);

      const result = serviceWithTrailers.recall('kebab-case', { cwd: repoDir });
      const found = result.memories.find(m => m.content === 'Always use kebab-case for files');
      assert.ok(found);
      assert.equal(found.source, 'commit-trailer');
      assert.equal(found.type, 'convention');
    });

    it('should respect type filter for trailer memories', () => {
      writeFileSync(join(repoDir, 'type-filter.txt'), 'type-filter');
      git(['add', '.'], repoDir);
      git(['commit', '-m', 'feat: type filter\n\nAI-Fact: TypeScript is great'], repoDir);

      // Query without type filter should find it
      const allResult = serviceWithTrailers.recall('TypeScript', { cwd: repoDir });
      assert.ok(allResult.memories.find(m => m.content === 'TypeScript is great'));

      // Query with wrong type filter should not find it
      const filtered = serviceWithTrailers.recall('TypeScript', { cwd: repoDir, type: 'decision' });
      assert.ok(!filtered.memories.find(m => m.content === 'TypeScript is great'));
    });

    it('should not include trailer memories when trailerService is not injected', () => {
      // Create a manual trailer commit
      writeFileSync(join(repoDir, 'no-svc-recall.txt'), 'no-svc');
      git(['add', '.'], repoDir);
      git(['commit', '-m', 'feat: no svc recall\n\nAI-Decision: Use bun for testing'], repoDir);

      // service (without trailerService) should only return notes
      const result = service.recall('bun for testing', { cwd: repoDir });
      const found = result.memories.find(m => m.content === 'Use bun for testing');
      assert.equal(found, undefined);
    });

    it('should parse tags from AI-Tags trailer', () => {
      writeFileSync(join(repoDir, 'tags-recall.txt'), 'tags-recall');
      git(['add', '.'], repoDir);
      git(['commit', '-m', 'feat: tagged\n\nAI-Decision: Use Redis\nAI-Tags: cache, performance'], repoDir);

      const result = serviceWithTrailers.recall('Redis', { cwd: repoDir });
      const found = result.memories.find(m => m.content === 'Use Redis');
      assert.ok(found);
      assert.deepEqual(found.tags, ['cache', 'performance']);
    });

    it('should handle invalid AI-Confidence trailer values gracefully', () => {
      writeFileSync(join(repoDir, 'invalid-conf.txt'), 'invalid-conf');
      git(['add', '.'], repoDir);
      git(
        ['commit', '-m', 'feat: invalid confidence\n\nAI-Fact: Confidence parsing should be robust\nAI-Confidence: very-high'],
        repoDir,
      );

      const result = serviceWithTrailers.recall('Confidence parsing', { cwd: repoDir });
      const found = result.memories.find(m => m.content === 'Confidence parsing should be robust');
      assert.ok(found);
      // Invalid 'very-high' should fall back to 'high'
      assert.equal(found.confidence, 'high');
    });

    it('should generate unique synthetic IDs for multiple same-type trailers', () => {
      writeFileSync(join(repoDir, 'multi-type.txt'), 'multi');
      git(['add', '.'], repoDir);
      git(
        ['commit', '-m', 'feat: multiple decisions\n\nAI-Decision: Use Redis\nAI-Decision: Use PostgreSQL'],
        repoDir,
      );

      const result = serviceWithTrailers.recall('', { cwd: repoDir });
      const redis = result.memories.find(m => m.content === 'Use Redis' && m.source === 'commit-trailer');
      const postgres = result.memories.find(m => m.content === 'Use PostgreSQL' && m.source === 'commit-trailer');
      assert.ok(redis);
      assert.ok(postgres);
      // Synthetic IDs must be different
      assert.notEqual(redis.id, postgres.id);
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
