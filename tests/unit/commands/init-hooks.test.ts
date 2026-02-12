/**
 * init-hooks merge logic unit tests
 *
 * Tests for isGitMemEntry, mergeHooksConfig, removeGitMemHooks,
 * and deepMergeGitMemConfig — ensuring existing hooks and user
 * customizations are preserved during install, remove, and re-runs.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isGitMemEntry,
  mergeHooksConfig,
  removeGitMemHooks,
  deepMergeGitMemConfig,
} from '../../../src/commands/init-hooks';

// ── Fixtures ─────────────────────────────────────────────────────────

function gitMemMatcher(event: string) {
  return {
    matcher: '',
    hooks: [{ type: 'command', command: `git-mem hook ${event}` }],
  };
}

function otherToolMatcher(command: string) {
  return {
    matcher: '',
    hooks: [{ type: 'command', command }],
  };
}

// ── isGitMemEntry ────────────────────────────────────────────────────

describe('isGitMemEntry', () => {
  it('should return true for git-mem session-start entry', () => {
    assert.equal(isGitMemEntry(gitMemMatcher('session-start')), true);
  });

  it('should return true for git-mem session-stop entry', () => {
    assert.equal(isGitMemEntry(gitMemMatcher('session-stop')), true);
  });

  it('should return true for git-mem prompt-submit entry', () => {
    assert.equal(isGitMemEntry(gitMemMatcher('prompt-submit')), true);
  });

  it('should return false for a different tool command', () => {
    assert.equal(isGitMemEntry(otherToolMatcher('some-other-tool session-start')), false);
  });

  it('should return false when hooks array is missing', () => {
    assert.equal(isGitMemEntry({ matcher: '' }), false);
  });

  it('should return false for empty hooks array', () => {
    assert.equal(isGitMemEntry({ matcher: '', hooks: [] }), false);
  });

  it('should return false when command is not a string', () => {
    assert.equal(isGitMemEntry({ matcher: '', hooks: [{ type: 'command' }] }), false);
  });

  it('should return false for node-path command without git-mem hook prefix', () => {
    const entry = { matcher: '', hooks: [{ type: 'command', command: 'node /path/to/hooks/session-start.js' }] };
    assert.equal(isGitMemEntry(entry), false);
  });
});

// ── mergeHooksConfig ─────────────────────────────────────────────────

describe('mergeHooksConfig', () => {
  it('should add git-mem entries to empty hooks object', () => {
    const newHooks = {
      SessionStart: [gitMemMatcher('session-start')],
    };

    const result = mergeHooksConfig({}, newHooks);

    assert.equal((result.SessionStart as unknown[]).length, 1);
  });

  it('should preserve non-git-mem event types', () => {
    const existing = {
      PreToolUse: [otherToolMatcher('validate-bash')],
    };
    const newHooks = {
      SessionStart: [gitMemMatcher('session-start')],
    };

    const result = mergeHooksConfig(existing, newHooks);

    assert.equal((result.PreToolUse as unknown[]).length, 1);
    assert.equal((result.SessionStart as unknown[]).length, 1);
  });

  it('should preserve other tools entries within the same event type', () => {
    const existing = {
      SessionStart: [otherToolMatcher('other-tool session-start')],
    };
    const newHooks = {
      SessionStart: [gitMemMatcher('session-start')],
    };

    const result = mergeHooksConfig(existing, newHooks);
    const arr = result.SessionStart as Array<{ hooks: Array<{ command: string }> }>;

    assert.equal(arr.length, 2);
    assert.equal(arr[0].hooks[0].command, 'other-tool session-start');
    assert.equal(arr[1].hooks[0].command, 'git-mem hook session-start');
  });

  it('should replace existing git-mem entry on re-run (idempotent)', () => {
    const existing = {
      SessionStart: [gitMemMatcher('session-start')],
    };
    const newHooks = {
      SessionStart: [gitMemMatcher('session-start')],
    };

    const result = mergeHooksConfig(existing, newHooks);
    const arr = result.SessionStart as unknown[];

    assert.equal(arr.length, 1); // Not 2
  });

  it('should handle mixed scenario: other tool + git-mem in same array', () => {
    const existing = {
      SessionStart: [
        otherToolMatcher('other-tool session-start'),
        gitMemMatcher('session-start'),
      ],
    };
    const newHooks = {
      SessionStart: [gitMemMatcher('session-start')],
    };

    const result = mergeHooksConfig(existing, newHooks);
    const arr = result.SessionStart as Array<{ hooks: Array<{ command: string }> }>;

    assert.equal(arr.length, 2);
    assert.equal(arr[0].hooks[0].command, 'other-tool session-start');
    assert.equal(arr[1].hooks[0].command, 'git-mem hook session-start');
  });

  it('should handle non-array existing event type gracefully', () => {
    const existing = {
      SessionStart: 'not-an-array', // defensive
    };
    const newHooks = {
      SessionStart: [gitMemMatcher('session-start')],
    };

    const result = mergeHooksConfig(existing, newHooks);
    const arr = result.SessionStart as unknown[];

    assert.equal(arr.length, 1);
  });
});

// ── removeGitMemHooks ────────────────────────────────────────────────

describe('removeGitMemHooks', () => {
  it('should remove git-mem entries from SessionStart', () => {
    const hooks = {
      SessionStart: [gitMemMatcher('session-start')],
    };

    const result = removeGitMemHooks(hooks);

    assert.equal(result.SessionStart, undefined); // Array became empty → key removed
  });

  it('should remove git-mem entries from all three event types', () => {
    const hooks = {
      SessionStart: [gitMemMatcher('session-start')],
      SessionStop: [gitMemMatcher('session-stop')],
      UserPromptSubmit: [gitMemMatcher('prompt-submit')],
    };

    const result = removeGitMemHooks(hooks);

    assert.equal(result.SessionStart, undefined);
    assert.equal(result.SessionStop, undefined);
    assert.equal(result.UserPromptSubmit, undefined);
  });

  it('should preserve other tools entries in same event type', () => {
    const hooks = {
      SessionStart: [
        otherToolMatcher('other-tool session-start'),
        gitMemMatcher('session-start'),
      ],
    };

    const result = removeGitMemHooks(hooks);
    const arr = result.SessionStart as Array<{ hooks: Array<{ command: string }> }>;

    assert.equal(arr.length, 1);
    assert.equal(arr[0].hooks[0].command, 'other-tool session-start');
  });

  it('should preserve non-git-mem event types completely', () => {
    const hooks = {
      PreToolUse: [otherToolMatcher('validate-bash')],
      SessionStart: [gitMemMatcher('session-start')],
    };

    const result = removeGitMemHooks(hooks);

    assert.equal((result.PreToolUse as unknown[]).length, 1);
    assert.equal(result.SessionStart, undefined);
  });

  it('should be a no-op when event type has no git-mem entries', () => {
    const hooks = {
      SessionStart: [otherToolMatcher('other-tool')],
    };

    const result = removeGitMemHooks(hooks);
    const arr = result.SessionStart as unknown[];

    assert.equal(arr.length, 1);
  });

  it('should skip event types that are not arrays', () => {
    const hooks = {
      SessionStart: 'invalid' as unknown,
    } as Record<string, unknown>;

    const result = removeGitMemHooks(hooks);

    assert.equal(result.SessionStart, 'invalid');
  });
});

// ── deepMergeGitMemConfig ────────────────────────────────────────────

describe('deepMergeGitMemConfig', () => {
  const defaults = {
    hooks: {
      enabled: true,
      sessionStart: { enabled: true, memoryLimit: 20 },
      sessionStop: { enabled: true, autoLiberate: true, threshold: 3 },
      promptSubmit: { enabled: false, recordPrompts: false, surfaceContext: true },
    },
  };

  it('should return defaults when existing config is empty', () => {
    const result = deepMergeGitMemConfig({}, defaults);

    const hooks = result.hooks as Record<string, unknown>;
    assert.equal(hooks.enabled, true);
    assert.deepEqual(hooks.sessionStart, { enabled: true, memoryLimit: 20 });
  });

  it('should preserve user-customized memoryLimit', () => {
    const existing = {
      hooks: {
        sessionStart: { enabled: true, memoryLimit: 50 },
      },
    };

    const result = deepMergeGitMemConfig(existing, defaults);
    const hooks = result.hooks as Record<string, unknown>;
    const sessionStart = hooks.sessionStart as Record<string, unknown>;

    assert.equal(sessionStart.memoryLimit, 50); // User value wins
    assert.equal(sessionStart.enabled, true);
  });

  it('should preserve user-set enabled: false', () => {
    const existing = {
      hooks: {
        enabled: false,
      },
    };

    const result = deepMergeGitMemConfig(existing, defaults);
    const hooks = result.hooks as Record<string, unknown>;

    assert.equal(hooks.enabled, false); // User value wins
  });

  it('should add new default keys not present in existing config', () => {
    const existing = {
      hooks: {
        sessionStart: { enabled: true, memoryLimit: 50 },
        // sessionStop and promptSubmit missing
      },
    };

    const result = deepMergeGitMemConfig(existing, defaults);
    const hooks = result.hooks as Record<string, unknown>;

    assert.deepEqual(hooks.sessionStop, { enabled: true, autoLiberate: true, threshold: 3 });
    assert.deepEqual(hooks.promptSubmit, { enabled: false, recordPrompts: false, surfaceContext: true });
  });

  it('should preserve non-hooks top-level keys', () => {
    const existing = {
      version: '1.0',
      hooks: { enabled: true },
    };

    const result = deepMergeGitMemConfig(existing, defaults);

    assert.equal(result.version, '1.0');
  });

  it('should preserve extra user-added keys in hooks', () => {
    const existing = {
      hooks: {
        customFeature: { someFlag: true },
      },
    };

    const result = deepMergeGitMemConfig(existing, defaults);
    const hooks = result.hooks as Record<string, unknown>;

    assert.deepEqual(hooks.customFeature, { someFlag: true });
  });

  it('should preserve optional sessionStart properties like dateRange and tags', () => {
    const existing = {
      hooks: {
        sessionStart: {
          enabled: true,
          dateRange: '2024-01-01/2024-01-31',
          tags: ['work', 'project-x'],
        },
      },
    };

    const result = deepMergeGitMemConfig(existing, defaults);
    const hooks = result.hooks as Record<string, unknown>;
    const sessionStart = hooks.sessionStart as Record<string, unknown>;

    assert.equal(sessionStart.dateRange, '2024-01-01/2024-01-31');
    assert.deepEqual(sessionStart.tags, ['work', 'project-x']);
    assert.equal(sessionStart.memoryLimit, 20); // Default fills in
  });

  it('should deep-merge sub-objects keeping user values over defaults', () => {
    const existing = {
      hooks: {
        sessionStop: { enabled: false, autoLiberate: false },
      },
    };

    const result = deepMergeGitMemConfig(existing, defaults);
    const hooks = result.hooks as Record<string, unknown>;
    const sessionStop = hooks.sessionStop as Record<string, unknown>;

    assert.equal(sessionStop.enabled, false);       // User value
    assert.equal(sessionStop.autoLiberate, false);   // User value
    assert.equal(sessionStop.threshold, 3);          // Default fills in
  });
});
