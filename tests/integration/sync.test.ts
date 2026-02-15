/**
 * Integration test: Sync flow
 *
 * Tests pushing and pulling memory notes refs between local and remote.
 * Uses a bare git repo as a "remote".
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'child_process';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { MemoryService } from '../../src/application/services/MemoryService';
import { MemoryRepository } from '../../src/infrastructure/repositories/MemoryRepository';
import { NotesService } from '../../src/infrastructure/services/NotesService';
import { DEFAULT_NOTES_REF } from '../../src/domain/interfaces/INotesService';

function git(args: string[], cwd: string): string {
  return execFileSync('git', args, { encoding: 'utf8', cwd }).trim();
}

describe('Integration: Sync', () => {
  let bareDir: string;
  let localDir: string;
  let cloneDir: string;
  let notesService: NotesService;
  let memoryService: MemoryService;

  before(() => {
    const base = mkdtempSync(join(tmpdir(), 'git-mem-integ-sync-'));

    // Create bare remote repo
    bareDir = join(base, 'remote.git');
    mkdirSync(bareDir, { recursive: true });
    git(['init', '--bare'], bareDir);

    // Clone as "local"
    localDir = join(base, 'local');
    git(['clone', bareDir, localDir], base);
    git(['config', 'user.email', 'test@test.com'], localDir);
    git(['config', 'user.name', 'Test User'], localDir);

    // Create a commit
    writeFileSync(join(localDir, 'app.ts'), 'console.log("hello");');
    git(['add', '.'], localDir);
    git(['commit', '-m', 'feat: initial app'], localDir);
    git(['push'], localDir);

    // Set up services for the local repo
    notesService = new NotesService();
    const memoryRepo = new MemoryRepository(notesService);
    memoryService = new MemoryService(memoryRepo);

    // Clone dir will be created in the sync test
    cloneDir = join(base, 'clone');
  });

  after(() => {
    // Clean up the parent dir which contains all three repos
    const base = join(bareDir, '..');
    rmSync(base, { recursive: true, force: true });
  });

  it('should push memory notes to remote and pull into fresh clone', () => {
    const commitSha = git(['rev-parse', 'HEAD'], localDir);

    // Remember something locally
    const memory = memoryService.remember('PostgreSQL chosen for ACID compliance', {
      sha: commitSha,
      type: 'decision',
      tags: 'database',
      cwd: localDir,
    });

    // Verify note exists locally
    const localNote = notesService.read(commitSha, DEFAULT_NOTES_REF, localDir);
    assert.ok(localNote, 'Note should exist locally');
    assert.ok(localNote.includes(memory.id));

    // Push notes to remote
    execFileSync('git', ['push', 'origin', DEFAULT_NOTES_REF], {
      encoding: 'utf8',
      cwd: localDir,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Clone fresh from remote
    git(['clone', bareDir, cloneDir], join(bareDir, '..'));

    // Pull notes into the fresh clone
    execFileSync('git', ['fetch', 'origin', `${DEFAULT_NOTES_REF}:${DEFAULT_NOTES_REF}`], {
      encoding: 'utf8',
      cwd: cloneDir,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Verify notes exist in fresh clone
    const cloneCommitSha = git(['rev-parse', 'HEAD'], cloneDir);
    const cloneNote = notesService.read(cloneCommitSha, DEFAULT_NOTES_REF, cloneDir);
    assert.ok(cloneNote, 'Note should exist in clone after pull');

    const parsed = JSON.parse(cloneNote);
    assert.ok(parsed.memories);
    assert.equal(parsed.memories.length, 1);
    assert.equal(parsed.memories[0].id, memory.id);
    assert.equal(parsed.memories[0].content, 'PostgreSQL chosen for ACID compliance');
    assert.equal(parsed.memories[0].type, 'decision');
  });

  it('should allow recall in the cloned repo after sync', () => {
    const cloneNotesService = new NotesService();
    const cloneMemoryRepo = new MemoryRepository(cloneNotesService);
    const cloneMemoryService = new MemoryService(cloneMemoryRepo);

    const result = cloneMemoryService.recall('PostgreSQL', { cwd: cloneDir });
    assert.equal(result.total, 1);
    assert.equal(result.memories[0].content, 'PostgreSQL chosen for ACID compliance');
  });
});
