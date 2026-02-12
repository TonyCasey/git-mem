/**
 * init-hooks command handler
 *
 * Generates Claude Code hook configuration files:
 * - .claude/settings.json (or ~/.claude/settings.json for user scope)
 * - .git-mem.json (hook-specific config)
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

function resolveHookCommand(): string {
  // Use the built hook entry point relative to this module
  const hookPath = join(__dirname, '..', 'hooks', 'session-start.js');
  return `node ${hookPath}`;
}

function getSettingsPath(scope: string): string {
  if (scope === 'user') {
    return join(homedir(), '.claude', 'settings.json');
  }
  return join(process.cwd(), '.claude', 'settings.json');
}

function readExistingSettings(path: string): Record<string, unknown> {
  if (!existsSync(path)) {
    return {};
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function buildHooksConfig(): Record<string, unknown> {
  const command = resolveHookCommand();

  return {
    SessionStart: [
      {
        matcher: '',
        hooks: [{ type: 'command', command }],
      },
    ],
  };
}

function buildGitMemConfig(): Record<string, unknown> {
  return {
    hooks: {
      enabled: true,
      sessionStart: {
        enabled: true,
        memoryLimit: 20,
      },
    },
  };
}

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
        delete (settings.hooks as Record<string, unknown>).SessionStart;
        // If hooks object is now empty, remove it
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

  // Merge hooks into existing settings
  const settings = readExistingSettings(settingsPath);
  const existingHooks = (settings.hooks ?? {}) as Record<string, unknown>;
  const newHooks = buildHooksConfig();

  settings.hooks = { ...existingHooks, ...newHooks };

  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
  console.log(`Written ${settingsPath}`);

  // Merge into existing .git-mem.json (preserve user edits)
  const existingGitMemConfig = existsSync(gitMemConfigPath)
    ? (() => { try { return JSON.parse(readFileSync(gitMemConfigPath, 'utf8')) as Record<string, unknown>; } catch { return {}; } })()
    : {};
  const newGitMemConfig = buildGitMemConfig();
  const mergedGitMemConfig = { ...existingGitMemConfig, hooks: { ...((existingGitMemConfig.hooks ?? {}) as Record<string, unknown>), ...((newGitMemConfig.hooks ?? {}) as Record<string, unknown>) } };
  writeFileSync(gitMemConfigPath, JSON.stringify(mergedGitMemConfig, null, 2) + '\n');
  console.log('Written .git-mem.json');

  console.log('\nHooks configured:');
  console.log('  SessionStart — Load memories into Claude context on startup');

  console.log('\nNext steps:');
  console.log('  1. Start Claude Code in this repo: claude');
  console.log('  2. Memories will load automatically on session start');
  console.log('  3. Adjust settings in .git-mem.json');
}
