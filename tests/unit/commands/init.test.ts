/**
 * init command — pure helper unit tests
 *
 * Tests ensureGitignoreEntries, readEnvApiKey, and ensureEnvPlaceholder
 * using real temp directories (cleaned up in after()).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { rmSync } from 'fs';
import {
  ensureGitignoreEntries,
  readEnvApiKey,
  ensureEnvPlaceholder,
} from '../../../src/commands/init';

// ── ensureGitignoreEntries ───────────────────────────────────────────

describe('ensureGitignoreEntries', () => {

  it('should create .gitignore with header and entries when file does not exist', () => {
    const dir = mkdtempSync(join(tmpdir(), 'git-mem-gitignore-'));
    try {
      ensureGitignoreEntries(dir, ['.env', '.git-mem.json']);

      const content = readFileSync(join(dir, '.gitignore'), 'utf8');
      assert.ok(content.includes('# git-mem'));
      assert.ok(content.includes('.env'));
      assert.ok(content.includes('.git-mem.json'));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('should append missing entries to existing .gitignore', () => {
    const dir = mkdtempSync(join(tmpdir(), 'git-mem-gitignore-'));
    try {
      writeFileSync(join(dir, '.gitignore'), 'node_modules/\ndist/\n');

      ensureGitignoreEntries(dir, ['.env', '.git-mem.json']);

      const content = readFileSync(join(dir, '.gitignore'), 'utf8');
      assert.ok(content.startsWith('node_modules/'));
      assert.ok(content.includes('# git-mem'));
      assert.ok(content.includes('.env'));
      assert.ok(content.includes('.git-mem.json'));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('should not duplicate entries already present', () => {
    const dir = mkdtempSync(join(tmpdir(), 'git-mem-gitignore-'));
    try {
      writeFileSync(join(dir, '.gitignore'), '.env\nnode_modules/\n');

      ensureGitignoreEntries(dir, ['.env', '.git-mem.json']);

      const content = readFileSync(join(dir, '.gitignore'), 'utf8');
      const envCount = content.split('\n').filter((l: string) => l.trim() === '.env').length;
      assert.equal(envCount, 1, 'should not duplicate .env');
      assert.ok(content.includes('.git-mem.json'));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('should be a no-op when all entries already present', () => {
    const dir = mkdtempSync(join(tmpdir(), 'git-mem-gitignore-'));
    try {
      const original = '.env\n.git-mem.json\n';
      writeFileSync(join(dir, '.gitignore'), original);

      ensureGitignoreEntries(dir, ['.env', '.git-mem.json']);

      const content = readFileSync(join(dir, '.gitignore'), 'utf8');
      assert.equal(content, original);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('should handle .gitignore without trailing newline', () => {
    const dir = mkdtempSync(join(tmpdir(), 'git-mem-gitignore-'));
    try {
      writeFileSync(join(dir, '.gitignore'), 'node_modules/');

      ensureGitignoreEntries(dir, ['.env']);

      const content = readFileSync(join(dir, '.gitignore'), 'utf8');
      assert.ok(content.startsWith('node_modules/'));
      assert.ok(content.includes('.env'));
      // Ensure entries are on separate lines
      const lines = content.split('\n');
      assert.ok(lines.some((l: string) => l.trim() === '.env'));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('should only append missing entries when some are present', () => {
    const dir = mkdtempSync(join(tmpdir(), 'git-mem-gitignore-'));
    try {
      writeFileSync(join(dir, '.gitignore'), '.env\n');

      ensureGitignoreEntries(dir, ['.env', '.git-mem.json']);

      const content = readFileSync(join(dir, '.gitignore'), 'utf8');
      const envCount = content.split('\n').filter((l: string) => l.trim() === '.env').length;
      assert.equal(envCount, 1);
      assert.ok(content.includes('.git-mem.json'));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('should not duplicate # git-mem header on re-run', () => {
    const dir = mkdtempSync(join(tmpdir(), 'git-mem-gitignore-'));
    try {
      // First run
      ensureGitignoreEntries(dir, ['.env']);
      // Second run adds another entry
      ensureGitignoreEntries(dir, ['.env', '.git-mem.json']);

      const content = readFileSync(join(dir, '.gitignore'), 'utf8');
      const headerCount = content.split('\n').filter((l: string) => l.trim() === '# git-mem').length;
      assert.equal(headerCount, 1, 'should only have one # git-mem header');
      assert.ok(content.includes('.env'));
      assert.ok(content.includes('.git-mem.json'));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ── readEnvApiKey ────────────────────────────────────────────────────

describe('readEnvApiKey', () => {
  it('should return null when .env does not exist', () => {
    const dir = mkdtempSync(join(tmpdir(), 'git-mem-env-'));
    try {
      assert.equal(readEnvApiKey(dir), null);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('should return the key value when set', () => {
    const dir = mkdtempSync(join(tmpdir(), 'git-mem-env-'));
    try {
      writeFileSync(join(dir, '.env'), 'ANTHROPIC_API_KEY=sk-ant-test123\n');

      assert.equal(readEnvApiKey(dir), 'sk-ant-test123');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('should return null when key is empty', () => {
    const dir = mkdtempSync(join(tmpdir(), 'git-mem-env-'));
    try {
      writeFileSync(join(dir, '.env'), 'ANTHROPIC_API_KEY=\n');

      assert.equal(readEnvApiKey(dir), null);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('should return null when key is absent from .env', () => {
    const dir = mkdtempSync(join(tmpdir(), 'git-mem-env-'));
    try {
      writeFileSync(join(dir, '.env'), 'OTHER_KEY=value\n');

      assert.equal(readEnvApiKey(dir), null);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('should handle key among other variables', () => {
    const dir = mkdtempSync(join(tmpdir(), 'git-mem-env-'));
    try {
      writeFileSync(join(dir, '.env'), 'FOO=bar\nANTHROPIC_API_KEY=sk-ant-abc\nBAZ=qux\n');

      assert.equal(readEnvApiKey(dir), 'sk-ant-abc');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ── ensureEnvPlaceholder ─────────────────────────────────────────────

describe('ensureEnvPlaceholder', () => {
  it('should create .env with placeholder when file does not exist', () => {
    const dir = mkdtempSync(join(tmpdir(), 'git-mem-env-'));
    try {
      ensureEnvPlaceholder(dir);

      const content = readFileSync(join(dir, '.env'), 'utf8');
      assert.equal(content, 'ANTHROPIC_API_KEY=\n');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('should append placeholder to .env without key', () => {
    const dir = mkdtempSync(join(tmpdir(), 'git-mem-env-'));
    try {
      writeFileSync(join(dir, '.env'), 'OTHER_KEY=value\n');

      ensureEnvPlaceholder(dir);

      const content = readFileSync(join(dir, '.env'), 'utf8');
      assert.ok(content.includes('OTHER_KEY=value'));
      assert.ok(content.includes('ANTHROPIC_API_KEY='));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('should not modify .env when key already present', () => {
    const dir = mkdtempSync(join(tmpdir(), 'git-mem-env-'));
    try {
      const original = 'ANTHROPIC_API_KEY=sk-ant-existing\n';
      writeFileSync(join(dir, '.env'), original);

      ensureEnvPlaceholder(dir);

      const content = readFileSync(join(dir, '.env'), 'utf8');
      assert.equal(content, original);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('should not modify .env when empty placeholder already present', () => {
    const dir = mkdtempSync(join(tmpdir(), 'git-mem-env-'));
    try {
      const original = 'ANTHROPIC_API_KEY=\n';
      writeFileSync(join(dir, '.env'), original);

      ensureEnvPlaceholder(dir);

      const content = readFileSync(join(dir, '.env'), 'utf8');
      assert.equal(content, original);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('should handle .env without trailing newline', () => {
    const dir = mkdtempSync(join(tmpdir(), 'git-mem-env-'));
    try {
      writeFileSync(join(dir, '.env'), 'FOO=bar');

      ensureEnvPlaceholder(dir);

      const content = readFileSync(join(dir, '.env'), 'utf8');
      assert.ok(content.includes('FOO=bar'));
      assert.ok(content.includes('ANTHROPIC_API_KEY='));
      // Key should be on its own line
      const lines = content.split('\n');
      assert.ok(lines.some((l: string) => l === 'ANTHROPIC_API_KEY='));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
