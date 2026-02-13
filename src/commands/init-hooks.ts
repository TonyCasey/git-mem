/**
 * init-hooks command handler
 *
 * Generates Claude Code hook configuration files:
 * - .claude/settings.json (or ~/.claude/settings.json for user scope)
 * - .git-mem.json (hook-specific config)
 *
 * Preserves existing non-git-mem hooks in settings.json and
 * user customizations in .git-mem.json on re-runs.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { ILogger } from '../domain/interfaces/ILogger';

interface IInitHooksOptions {
  yes?: boolean;
  scope?: string;
  remove?: boolean;
}

// ── Git-mem event types managed by init-hooks ────────────────────────
const GIT_MEM_EVENT_TYPES = ['SessionStart', 'Stop', 'UserPromptSubmit'] as const;

// ── Fingerprint detection ────────────────────────────────────────────

interface IMatcherHook {
  type?: string;
  command?: string;
}

interface IMatcherGroup {
  matcher?: string;
  hooks?: IMatcherHook[];
}

/** Returns true if a matcher group belongs to git-mem. */
export function isGitMemEntry(matcherGroup: IMatcherGroup): boolean {
  if (!Array.isArray(matcherGroup.hooks)) return false;
  return matcherGroup.hooks.some(
    (h) => typeof h.command === 'string' && h.command.startsWith('git-mem hook '),
  );
}

// ── Settings.json merge helpers ──────────────────────────────────────

/**
 * Merge git-mem hooks into existing hooks, preserving other tools' entries.
 * For each git-mem event type: filters out old git-mem entries, appends the new one.
 * Unrelated event types (e.g. PreToolUse) pass through untouched.
 */
export function mergeHooksConfig(
  existingHooks: Record<string, unknown>,
  newHooks: Record<string, unknown>,
): Record<string, unknown> {
  const merged = { ...existingHooks };

  for (const eventType of Object.keys(newHooks)) {
    const existingArray = Array.isArray(merged[eventType])
      ? (merged[eventType] as IMatcherGroup[])
      : [];

    // Remove existing git-mem entries, keep everything else
    const filtered = existingArray.filter((mg) => !isGitMemEntry(mg));

    // Append the new git-mem entries
    const newArray = newHooks[eventType] as IMatcherGroup[];
    merged[eventType] = [...filtered, ...newArray];
  }

  return merged;
}

/**
 * Remove only git-mem entries from hooks, preserving other tools' entries.
 * Deletes event type keys that become empty after filtering.
 */
export function removeGitMemHooks(hooks: Record<string, unknown>): Record<string, unknown> {
  const cleaned = { ...hooks };

  for (const eventType of GIT_MEM_EVENT_TYPES) {
    const array = cleaned[eventType];
    if (!Array.isArray(array)) continue;

    const filtered = (array as IMatcherGroup[]).filter((mg) => !isGitMemEntry(mg));

    if (filtered.length === 0) {
      delete cleaned[eventType];
    } else {
      cleaned[eventType] = filtered;
    }
  }

  return cleaned;
}

// ── .git-mem.json deep merge ─────────────────────────────────────────

/**
 * Deep-merge git-mem config so user customizations win over defaults.
 * For sub-objects (sessionStart, sessionStop, promptSubmit): defaults first,
 * then existing values overlay — so user-set values like memoryLimit: 50 survive.
 */
export function deepMergeGitMemConfig(
  existing: Record<string, unknown>,
  defaults: Record<string, unknown>,
): Record<string, unknown> {
  const existingHooks = (existing.hooks ?? {}) as Record<string, unknown>;
  const defaultHooks = (defaults.hooks ?? {}) as Record<string, unknown>;

  // Backward compat: migrate autoLiberate → autoExtract in sessionStop
  const existingStop = existingHooks.sessionStop;
  if (typeof existingStop === 'object' && existingStop !== null && !Array.isArray(existingStop)) {
    const stop = existingStop as Record<string, unknown>;
    if (stop.autoExtract === undefined && stop.autoLiberate !== undefined) {
      stop.autoExtract = stop.autoLiberate;
      delete stop.autoLiberate;
    }
  }

  const mergedHooks: Record<string, unknown> = {};

  // Merge each default key
  for (const key of Object.keys(defaultHooks)) {
    const defaultVal = defaultHooks[key];
    const existingVal = existingHooks[key];

    if (
      typeof defaultVal === 'object' && defaultVal !== null && !Array.isArray(defaultVal) &&
      typeof existingVal === 'object' && existingVal !== null && !Array.isArray(existingVal)
    ) {
      // Deep merge sub-objects — existing values win
      mergedHooks[key] = { ...(defaultVal as Record<string, unknown>), ...(existingVal as Record<string, unknown>) };
    } else if (existingVal !== undefined) {
      mergedHooks[key] = existingVal;
    } else {
      mergedHooks[key] = defaultVal;
    }
  }

  // Preserve any extra keys the user added
  for (const key of Object.keys(existingHooks)) {
    if (!(key in mergedHooks)) {
      mergedHooks[key] = existingHooks[key];
    }
  }

  // Preserve non-hooks top-level keys from existing config
  const merged = { ...existing };
  merged.hooks = mergedHooks;

  return merged;
}

// ── Config builders ──────────────────────────────────────────────────

export function getSettingsPath(scope: string): string {
  if (scope === 'user') {
    return join(homedir(), '.claude', 'settings.json');
  }
  return join(process.cwd(), '.claude', 'settings.json');
}

export function readExistingSettings(path: string): Record<string, unknown> {
  if (!existsSync(path)) {
    return {};
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function buildHooksConfig(): Record<string, unknown> {
  return {
    SessionStart: [
      {
        matcher: '',
        hooks: [{ type: 'command', command: 'git-mem hook session-start' }],
      },
    ],
    Stop: [
      {
        matcher: '',
        hooks: [{ type: 'command', command: 'git-mem hook session-stop' }],
      },
    ],
    UserPromptSubmit: [
      {
        matcher: '',
        hooks: [{ type: 'command', command: 'git-mem hook prompt-submit' }],
      },
    ],
  };
}

export function buildGitMemConfig(): Record<string, unknown> {
  return {
    hooks: {
      enabled: true,
      sessionStart: {
        enabled: true,
        memoryLimit: 20,
      },
      sessionStop: {
        enabled: true,
        autoExtract: true,
        threshold: 3,
      },
      promptSubmit: {
        enabled: false,
        recordPrompts: false,
        surfaceContext: true,
      },
    },
  };
}

// ── Command entry point ──────────────────────────────────────────────

export async function initHooksCommand(options: IInitHooksOptions, logger?: ILogger): Promise<void> {
  const log = logger?.child({ command: 'init-hooks' });
  const scope = options.scope ?? 'project';
  const settingsPath = getSettingsPath(scope);
  const gitMemConfigPath = join(process.cwd(), '.git-mem.json');

  log?.info('Command invoked', { scope, remove: options.remove });

  // ── Remove mode ──────────────────────────────────────────────
  if (options.remove) {
    if (existsSync(settingsPath)) {
      const settings = readExistingSettings(settingsPath);
      if (settings.hooks) {
        settings.hooks = removeGitMemHooks(settings.hooks as Record<string, unknown>);
        if (Object.keys(settings.hooks as object).length === 0) {
          delete settings.hooks;
        }
        if (Object.keys(settings).length === 0) {
          unlinkSync(settingsPath);
          console.log(`Removed ${settingsPath}`);
        } else {
          writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
          console.log(`Removed git-mem hooks from ${settingsPath}`);
        }
      }
    }

    if (existsSync(gitMemConfigPath)) {
      unlinkSync(gitMemConfigPath);
      console.log('Removed .git-mem.json');
    }

    console.log('\nHooks removed.');
    return;
  }

  // ── Install mode ─────────────────────────────────────────────
  // Ensure .claude/ directory exists
  const settingsDir = join(settingsPath, '..');
  if (!existsSync(settingsDir)) {
    mkdirSync(settingsDir, { recursive: true });
  }

  // Merge hooks into existing settings (preserves other tools' hooks)
  const settings = readExistingSettings(settingsPath);
  const existingHooks = (settings.hooks ?? {}) as Record<string, unknown>;
  const newHooks = buildHooksConfig();

  settings.hooks = mergeHooksConfig(existingHooks, newHooks);

  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
  console.log(`Written ${settingsPath}`);

  // Deep-merge into existing .git-mem.json (preserves user customizations)
  const existingGitMemConfig = existsSync(gitMemConfigPath)
    ? (() => { try { return JSON.parse(readFileSync(gitMemConfigPath, 'utf8')) as Record<string, unknown>; } catch { return {}; } })()
    : {};
  const newGitMemConfig = buildGitMemConfig();
  const mergedGitMemConfig = deepMergeGitMemConfig(existingGitMemConfig, newGitMemConfig);
  writeFileSync(gitMemConfigPath, JSON.stringify(mergedGitMemConfig, null, 2) + '\n');
  console.log('Written .git-mem.json');

  console.log('\nHooks configured:');
  console.log('  SessionStart     — Load memories into Claude context on startup');
  console.log('  Stop             — Capture memories from session commits on exit');
  console.log('  UserPromptSubmit — Surface relevant memories per prompt (disabled by default)');

  console.log('\nNext steps:');
  console.log('  1. Start Claude Code in this repo: claude');
  console.log('  2. Memories will load automatically on session start');
  console.log('  3. Adjust settings in .git-mem.json');
}
