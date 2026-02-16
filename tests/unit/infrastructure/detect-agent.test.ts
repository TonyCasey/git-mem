/**
 * detect-agent.ts — unit tests
 *
 * Tests agent and model detection from environment variables and config files.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { detectClaudeAgent, resolveAgent, resolveModel } from '../../../src/infrastructure/detect-agent';

describe('detect-agent', () => {
  // Store original env vars
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    delete process.env.CODEX_HOME;
    delete process.env.CODEX_THREAD_ID;
    delete process.env.CODEX_MODEL;
    delete process.env.CLAUDE_MODEL;
    delete process.env.OPENAI_MODEL;
    delete process.env.GEMINI_MODEL;
    delete process.env.OLLAMA_MODEL;
    delete process.env.MODEL;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('detectClaudeAgent', () => {
    it('should return Claude-Code with version when claude binary is available', () => {
      // This test depends on having claude CLI installed
      // If not available, it should fall back to just "Claude-Code"
      const result = detectClaudeAgent();
      assert.ok(result.startsWith('Claude-Code'), `Expected result to start with Claude-Code, got: ${result}`);
    });

    it('should return Claude-Code (possibly with version)', () => {
      const result = detectClaudeAgent();
      // Either "Claude-Code" or "Claude-Code/X.Y.Z"
      assert.match(result, /^Claude-Code(\/[\d.]+)?$/);
    });
  });

  describe('resolveAgent', () => {
    beforeEach(() => {
      // Clear all AI-related env vars
      delete process.env.GIT_MEM_AGENT;
      delete process.env.CLAUDECODE;
      delete process.env.CLAUDE_CODE;
      delete process.env.CODEX_THREAD_ID;
    });

    it('should return explicit value when provided', () => {
      process.env.GIT_MEM_AGENT = 'should-be-ignored';
      const result = resolveAgent('ExplicitAgent/1.0');
      assert.equal(result, 'ExplicitAgent/1.0');
    });

    it('should return GIT_MEM_AGENT when set', () => {
      process.env.GIT_MEM_AGENT = 'CustomAgent/2.0';
      const result = resolveAgent();
      assert.equal(result, 'CustomAgent/2.0');
    });

    it('should detect Codex when CODEX_THREAD_ID is set', () => {
      process.env.CODEX_THREAD_ID = 'thread-123';
      const result = resolveAgent();
      assert.ok(result?.startsWith('Codex'), `Expected Codex agent, got: ${result}`);
    });

    it('should detect Claude-Code when CLAUDECODE is set', () => {
      process.env.CLAUDECODE = '1';
      const result = resolveAgent();
      assert.ok(result?.startsWith('Claude-Code'), `Expected Claude-Code, got: ${result}`);
    });

    it('should return Claude-Code when legacy CLAUDE_CODE is set', () => {
      process.env.CLAUDE_CODE = '1';
      const result = resolveAgent();
      assert.equal(result, 'Claude-Code');
    });

    it('should prioritize GIT_MEM_AGENT over CLAUDECODE', () => {
      process.env.GIT_MEM_AGENT = 'CustomAgent';
      process.env.CLAUDECODE = '1';
      const result = resolveAgent();
      assert.equal(result, 'CustomAgent');
    });

    it('should prioritize CODEX_THREAD_ID over CLAUDECODE', () => {
      process.env.CODEX_THREAD_ID = 'thread-123';
      process.env.CLAUDECODE = '1';
      const result = resolveAgent();
      assert.ok(result?.startsWith('Codex'), `Expected Codex, got: ${result}`);
    });

    it('should prioritize CLAUDECODE over CLAUDE_CODE', () => {
      process.env.CLAUDECODE = '1';
      process.env.CLAUDE_CODE = '1';
      const result = resolveAgent();
      // CLAUDECODE triggers detectClaudeAgent() which returns Claude-Code with possible version
      assert.ok(result?.startsWith('Claude-Code'));
    });

    it('should return undefined when no env vars are set', () => {
      const result = resolveAgent();
      assert.equal(result, undefined);
    });

    it('should return undefined when explicit is empty string', () => {
      const result = resolveAgent('');
      assert.equal(result, undefined);
    });
  });

  describe('resolveModel', () => {
    beforeEach(() => {
      delete process.env.GIT_MEM_MODEL;
      delete process.env.ANTHROPIC_MODEL;
      delete process.env.CLAUDECODE;
      delete process.env.CODEX_THREAD_ID;
    });

    it('should return explicit value when provided', () => {
      process.env.GIT_MEM_MODEL = 'should-be-ignored';
      const result = resolveModel('explicit-model');
      assert.equal(result, 'explicit-model');
    });

    it('should return GIT_MEM_MODEL when set', () => {
      process.env.GIT_MEM_MODEL = 'claude-opus-4-6';
      const result = resolveModel();
      assert.equal(result, 'claude-opus-4-6');
    });

    it('should detect model from Codex config.toml', () => {
      const codexHome = mkdtempSync(join(tmpdir(), 'git-mem-codex-'));
      writeFileSync(
        join(codexHome, 'config.toml'),
        'model = "gpt-5.3-codex"\napproval_policy = "never"\n',
      );

      process.env.CODEX_HOME = codexHome;
      process.env.CODEX_THREAD_ID = 'thread-123';

      try {
        const result = resolveModel();
        assert.equal(result, 'gpt-5.3-codex');
      } finally {
        rmSync(codexHome, { recursive: true, force: true });
      }
    });

    it('should detect model from Claude session JSONL', () => {
      const fakeHome = mkdtempSync(join(tmpdir(), 'git-mem-home-'));
      const cwdEncoded = process.cwd().replace(/[:\\/]/g, '-').replace(/^-/, '');
      const claudeDir = join(fakeHome, '.claude', 'projects', cwdEncoded);
      mkdirSync(claudeDir, { recursive: true });
      writeFileSync(
        join(claudeDir, 'test-session.jsonl'),
        '{"type":"message","model":"claude-opus-4-6"}\n',
      );

      const origUserProfile = process.env.USERPROFILE;
      const origHome = process.env.HOME;
      process.env.USERPROFILE = fakeHome;
      process.env.HOME = fakeHome;
      process.env.CLAUDECODE = '1';

      try {
        const result = resolveModel();
        assert.equal(result, 'claude-opus-4-6');
      } finally {
        process.env.USERPROFILE = origUserProfile;
        process.env.HOME = origHome;
        rmSync(fakeHome, { recursive: true, force: true });
      }
    });

    it('should return ANTHROPIC_MODEL when set', () => {
      process.env.ANTHROPIC_MODEL = 'claude-sonnet-4-5';
      const result = resolveModel();
      assert.equal(result, 'claude-sonnet-4-5');
    });

    it('should return CLAUDE_MODEL when set', () => {
      process.env.CLAUDE_MODEL = 'claude-haiku-4-5';
      const result = resolveModel();
      assert.equal(result, 'claude-haiku-4-5');
    });

    it('should return OPENAI_MODEL when set', () => {
      process.env.OPENAI_MODEL = 'gpt-4o';
      const result = resolveModel();
      assert.equal(result, 'gpt-4o');
    });

    it('should prioritize GIT_MEM_MODEL over ANTHROPIC_MODEL', () => {
      process.env.GIT_MEM_MODEL = 'custom-model';
      process.env.ANTHROPIC_MODEL = 'anthropic-model';
      const result = resolveModel();
      assert.equal(result, 'custom-model');
    });

    it('should return GEMINI_MODEL when set', () => {
      process.env.GEMINI_MODEL = 'gemini-2.0-flash';
      const result = resolveModel();
      assert.equal(result, 'gemini-2.0-flash');
    });

    it('should return OLLAMA_MODEL when set', () => {
      process.env.OLLAMA_MODEL = 'llama3.2';
      const result = resolveModel();
      assert.equal(result, 'llama3.2');
    });

    it('should return MODEL when set', () => {
      process.env.MODEL = 'generic-model';
      const result = resolveModel();
      assert.equal(result, 'generic-model');
    });

    it('should prioritize GIT_MEM_MODEL over config-based detection', () => {
      const codexHome = mkdtempSync(join(tmpdir(), 'git-mem-codex-pri-'));
      writeFileSync(
        join(codexHome, 'config.toml'),
        'model = "gpt-5.3-codex"\n',
      );
      process.env.CODEX_HOME = codexHome;
      process.env.CODEX_THREAD_ID = 'thread-123';
      process.env.GIT_MEM_MODEL = 'explicit-model';

      try {
        const result = resolveModel();
        assert.equal(result, 'explicit-model');
      } finally {
        rmSync(codexHome, { recursive: true, force: true });
      }
    });

    it('should prioritize Codex config over env var fallbacks', () => {
      const codexHome = mkdtempSync(join(tmpdir(), 'git-mem-codex-pri2-'));
      writeFileSync(
        join(codexHome, 'config.toml'),
        'model = "gpt-5.3-codex"\n',
      );
      process.env.CODEX_HOME = codexHome;
      process.env.CODEX_THREAD_ID = 'thread-123';
      process.env.ANTHROPIC_MODEL = 'claude-sonnet';
      process.env.OPENAI_MODEL = 'gpt-4o';

      try {
        const result = resolveModel();
        assert.equal(result, 'gpt-5.3-codex');
      } finally {
        rmSync(codexHome, { recursive: true, force: true });
      }
    });

    it('should prioritize ANTHROPIC_MODEL over OPENAI_MODEL', () => {
      process.env.ANTHROPIC_MODEL = 'claude-sonnet';
      process.env.OPENAI_MODEL = 'gpt-4o';
      const result = resolveModel();
      assert.equal(result, 'claude-sonnet');
    });

    it('should return undefined when no env vars are set', () => {
      const result = resolveModel();
      assert.equal(result, undefined);
    });

    it('should return undefined when explicit is empty string', () => {
      const result = resolveModel('');
      assert.equal(result, undefined);
    });
  });
});
