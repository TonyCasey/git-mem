import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { NotesService } from '../../../../src/infrastructure/services/NotesService';

function git(args: string[], cwd: string): string {
  return execFileSync('git', args, { encoding: 'utf8', cwd }).trim();
}

describe('NotesService', () => {
  let service: NotesService;
  let repoDir: string;
  let commitSha1: string;
  let commitSha2: string;

  before(() => {
    service = new NotesService();
    repoDir = mkdtempSync(join(tmpdir(), 'git-mem-notes-test-'));

    git(['init'], repoDir);
    git(['config', 'user.email', 'test@test.com'], repoDir);
    git(['config', 'user.name', 'Test User'], repoDir);

    // Create two commits
    writeFileSync(join(repoDir, 'file1.txt'), 'hello');
    git(['add', '.'], repoDir);
    git(['commit', '-m', 'first commit'], repoDir);
    commitSha1 = git(['rev-parse', 'HEAD'], repoDir);

    writeFileSync(join(repoDir, 'file2.txt'), 'world');
    git(['add', '.'], repoDir);
    git(['commit', '-m', 'second commit'], repoDir);
    commitSha2 = git(['rev-parse', 'HEAD'], repoDir);
  });

  after(() => {
    rmSync(repoDir, { recursive: true, force: true });
  });

  describe('write and read', () => {
    it('should write and read a note', () => {
      const noteContent = JSON.stringify({
        id: 'test-123',
        type: 'decision',
        content: 'Use JWT for auth',
      });

      service.write(commitSha1, noteContent, undefined, repoDir);
      const result = service.read(commitSha1, undefined, repoDir);

      assert.ok(result);
      const parsed = JSON.parse(result);
      assert.equal(parsed.id, 'test-123');
      assert.equal(parsed.type, 'decision');
      assert.equal(parsed.content, 'Use JWT for auth');
    });

    it('should return null for commit without note', () => {
      // commitSha2 has no note yet
      const result = service.read(commitSha2, undefined, repoDir);
      assert.equal(result, null);
    });

    it('should overwrite existing note with write', () => {
      const original = JSON.stringify({ id: 'original' });
      const updated = JSON.stringify({ id: 'updated' });

      service.write(commitSha2, original, undefined, repoDir);
      service.write(commitSha2, updated, undefined, repoDir);

      const result = service.read(commitSha2, undefined, repoDir);
      assert.ok(result);
      const parsed = JSON.parse(result);
      assert.equal(parsed.id, 'updated');
    });
  });

  describe('append', () => {
    it('should append to existing note', () => {
      const ref = 'refs/notes/mem-append-test';
      const first = 'line one';
      const second = 'line two';

      service.write(commitSha1, first, ref, repoDir);
      service.append(commitSha1, second, ref, repoDir);

      const result = service.read(commitSha1, ref, repoDir);
      assert.ok(result);
      assert.ok(result.includes('line one'));
      assert.ok(result.includes('line two'));
    });

    it('should create note if none exists when appending', () => {
      const ref = 'refs/notes/mem-append-new';
      service.append(commitSha2, 'new note', ref, repoDir);

      const result = service.read(commitSha2, ref, repoDir);
      assert.ok(result);
      assert.ok(result.includes('new note'));
    });
  });

  describe('remove', () => {
    it('should remove an existing note', () => {
      const ref = 'refs/notes/mem-remove-test';
      service.write(commitSha1, 'to be removed', ref, repoDir);

      // Verify it exists
      assert.ok(service.read(commitSha1, ref, repoDir));

      service.remove(commitSha1, ref, repoDir);
      assert.equal(service.read(commitSha1, ref, repoDir), null);
    });

    it('should not throw when removing non-existing note', () => {
      const ref = 'refs/notes/mem-remove-noop';
      // Should not throw
      service.remove(commitSha1, ref, repoDir);
    });
  });

  describe('list', () => {
    it('should list all notes in a ref', () => {
      const ref = 'refs/notes/mem-list-test';
      service.write(commitSha1, 'note 1', ref, repoDir);
      service.write(commitSha2, 'note 2', ref, repoDir);

      const entries = service.list(ref, repoDir);
      assert.equal(entries.length, 2);

      const objectShas = entries.map(e => e.objectSha);
      assert.ok(objectShas.includes(commitSha1));
      assert.ok(objectShas.includes(commitSha2));
    });

    it('should return empty array for ref with no notes', () => {
      const entries = service.list('refs/notes/mem-empty', repoDir);
      assert.equal(entries.length, 0);
    });
  });
});
