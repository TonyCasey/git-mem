/**
 * hook command unit tests
 *
 * Tests the pure helper functions: EVENT_MAP, isEventEnabled, buildEvent.
 * The hookCommand entry point itself requires real stdin/container and is
 * not covered by these unit tests.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EVENT_MAP, isEventEnabled, buildEvent } from '../../../src/commands/hook';
import type { IHooksConfig } from '../../../src/domain/interfaces/IHookConfig';

// ── Fixture helpers ──────────────────────────────────────────────────

function createHooksConfig(overrides?: Partial<IHooksConfig>): IHooksConfig {
  return {
    enabled: true,
    sessionStart: { enabled: true, memoryLimit: 20 },
    sessionStop: { enabled: true, autoExtract: true, threshold: 3 },
    promptSubmit: { enabled: false, recordPrompts: false, surfaceContext: true },
    ...overrides,
  };
}

// ── EVENT_MAP ────────────────────────────────────────────────────────

describe('EVENT_MAP', () => {
  it('should map session-start to session:start', () => {
    assert.equal(EVENT_MAP['session-start'], 'session:start');
  });

  it('should map session-stop to session:stop', () => {
    assert.equal(EVENT_MAP['session-stop'], 'session:stop');
  });

  it('should map prompt-submit to prompt:submit', () => {
    assert.equal(EVENT_MAP['prompt-submit'], 'prompt:submit');
  });

  it('should return undefined for unknown event names', () => {
    assert.equal(EVENT_MAP['unknown-event'], undefined);
  });
});

// ── isEventEnabled ───────────────────────────────────────────────────

describe('isEventEnabled', () => {
  it('should return true for enabled session-start', () => {
    const config = createHooksConfig();
    assert.equal(isEventEnabled(config, 'session-start'), true);
  });

  it('should return true for enabled session-stop with autoExtract', () => {
    const config = createHooksConfig();
    assert.equal(isEventEnabled(config, 'session-stop'), true);
  });

  it('should return false when hooks globally disabled', () => {
    const config = createHooksConfig({ enabled: false });
    assert.equal(isEventEnabled(config, 'session-start'), false);
  });

  it('should return false when specific hook is disabled', () => {
    const config = createHooksConfig({
      sessionStart: { enabled: false, memoryLimit: 20 },
    });
    assert.equal(isEventEnabled(config, 'session-start'), false);
  });

  it('should return false for session-stop when autoExtract is false', () => {
    const config = createHooksConfig({
      sessionStop: { enabled: true, autoExtract: false, threshold: 3 },
    });
    assert.equal(isEventEnabled(config, 'session-stop'), false);
  });

  it('should return false for prompt-submit when disabled (default)', () => {
    const config = createHooksConfig();
    assert.equal(isEventEnabled(config, 'prompt-submit'), false);
  });

  it('should return true for prompt-submit when enabled', () => {
    const config = createHooksConfig({
      promptSubmit: { enabled: true, recordPrompts: false, surfaceContext: true },
    });
    assert.equal(isEventEnabled(config, 'prompt-submit'), true);
  });

  it('should return false for unknown event name', () => {
    const config = createHooksConfig();
    assert.equal(isEventEnabled(config, 'unknown'), false);
  });
});

// ── buildEvent ───────────────────────────────────────────────────────

describe('buildEvent', () => {
  it('should build session:start event with trigger', () => {
    const event = buildEvent('session:start', {
      session_id: 'sess-1',
      source: 'resume',
      cwd: '/tmp/repo',
    });

    assert.equal(event.type, 'session:start');
    assert.equal(event.sessionId, 'sess-1');
    assert.equal(event.cwd, '/tmp/repo');
    assert.equal('trigger' in event && event.trigger, 'resume');
  });

  it('should build session:start event with defaults', () => {
    const event = buildEvent('session:start', {});

    assert.equal(event.type, 'session:start');
    assert.equal(event.sessionId, 'unknown');
    assert.equal('trigger' in event && event.trigger, 'startup');
  });

  it('should build session:stop event', () => {
    const event = buildEvent('session:stop', {
      session_id: 'sess-2',
      cwd: '/tmp/repo',
    });

    assert.equal(event.type, 'session:stop');
    assert.equal(event.sessionId, 'sess-2');
  });

  it('should build prompt:submit event with prompt text', () => {
    const event = buildEvent('prompt:submit', {
      session_id: 'sess-3',
      prompt: 'Fix the bug',
      cwd: '/tmp/repo',
    });

    assert.equal(event.type, 'prompt:submit');
    assert.equal(event.sessionId, 'sess-3');
    assert.equal('prompt' in event && event.prompt, 'Fix the bug');
  });

  it('should default prompt to empty string when missing', () => {
    const event = buildEvent('prompt:submit', {});

    assert.equal(event.type, 'prompt:submit');
    assert.equal('prompt' in event && event.prompt, '');
  });
});
