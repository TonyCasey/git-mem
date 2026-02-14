/**
 * detect-agent.ts — unit tests
 *
 * Tests agent and model detection from environment variables.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { detectClaudeAgent, resolveAgent, resolveModel } from '../../../src/infrastructure/detect-agent';

describe('detect-agent', () => {
  // Store original env vars
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
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

    it('should return ANTHROPIC_MODEL when set', () => {
      process.env.ANTHROPIC_MODEL = 'claude-sonnet-4-5';
      const result = resolveModel();
      assert.equal(result, 'claude-sonnet-4-5');
    });

    it('should prioritize GIT_MEM_MODEL over ANTHROPIC_MODEL', () => {
      process.env.GIT_MEM_MODEL = 'custom-model';
      process.env.ANTHROPIC_MODEL = 'anthropic-model';
      const result = resolveModel();
      assert.equal(result, 'custom-model');
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
