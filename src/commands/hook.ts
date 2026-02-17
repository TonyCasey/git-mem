/**
 * hook command handler
 *
 * Unified entry point for Claude Code hook events.
 * Dispatches kebab-case event names to the internal EventBus.
 *
 * Usage:
 *   git-mem hook session-start   (reads JSON from stdin)
 *   git-mem hook session-stop
 *   git-mem hook prompt-submit
 */

import { join } from 'path';
import { config as loadEnv } from 'dotenv';
import { createContainer } from '../infrastructure/di';
import { readStdin } from '../hooks/utils/stdin';
import { setupShutdown } from '../hooks/utils/shutdown';
import { loadHookConfig } from '../hooks/utils/config';
import { resolveGitRoot } from '../infrastructure/git/resolveGitRoot';
import type { ILogger } from '../domain/interfaces/ILogger';
import type { IHooksConfig } from '../domain/interfaces/IHookConfig';
import type { HookEvent, HookEventType } from '../domain/events/HookEvents';

export interface IHookInput {
  session_id?: string;
  source?: string;
  prompt?: string;
  cwd?: string;
  hook_event_name?: string;
  sha?: string;
  /** Path to commit message file (for commit-msg hook). */
  commit_msg_path?: string;
}

/** Map CLI event names to internal event bus types. */
export const EVENT_MAP: Record<string, HookEventType> = {
  'session-start': 'session:start',
  'session-stop': 'session:stop',
  'prompt-submit': 'prompt:submit',
  'post-commit': 'git:commit',
  'commit-msg': 'git:commit-msg',
};

/** Map CLI event names to the config section that controls them. */
type ConfigKey = 'sessionStart' | 'sessionStop' | 'promptSubmit' | 'postCommit' | 'commitMsg';
const CONFIG_KEY_MAP: Record<string, ConfigKey> = {
  'session-start': 'sessionStart',
  'session-stop': 'sessionStop',
  'prompt-submit': 'promptSubmit',
  'post-commit': 'postCommit',
  'commit-msg': 'commitMsg',
};

/** Extra enabled check for session-stop (must also have autoExtract). */
export function isEventEnabled(hooksConfig: IHooksConfig, eventName: string): boolean {
  if (!hooksConfig.enabled) return false;

  const configKey = CONFIG_KEY_MAP[eventName];
  if (!configKey) return false;

  const section = hooksConfig[configKey];
  if (!section.enabled) return false;

  // session-stop additionally requires autoExtract
  if (configKey === 'sessionStop' && 'autoExtract' in section && !section.autoExtract) {
    return false;
  }

  return true;
}

/** Build the typed event object from stdin input + event type. */
export function buildEvent(eventType: HookEventType, input: IHookInput): HookEvent {
  const base = {
    sessionId: input.session_id ?? 'unknown',
    cwd: input.cwd ?? process.cwd(),
  };

  switch (eventType) {
    case 'session:start':
      return { type: 'session:start', ...base, trigger: input.source ?? 'startup' };
    case 'session:stop':
      return { type: 'session:stop', ...base };
    case 'prompt:submit':
      return { type: 'prompt:submit', ...base, prompt: input.prompt ?? '' };
    case 'git:commit':
      return { type: 'git:commit', sha: input.sha ?? 'HEAD', cwd: base.cwd };
    case 'git:commit-msg': {
      const commitMsgPath = input.commit_msg_path ?? '';
      if (!commitMsgPath) {
        throw new Error('commit_msg_path is required for git:commit-msg event');
      }
      return {
        type: 'git:commit-msg',
        commitMsgPath,
        cwd: base.cwd,
      };
    }
    default: {
      const exhaustiveCheck: never = eventType;
      throw new Error(`Unhandled HookEventType in buildEvent: ${exhaustiveCheck as string}`);
    }
  }
}

/**
 * Find git repository root from a working directory.
 * Returns cwd if git command fails (graceful fallback).
 */
function findGitRoot(cwd: string): string {
  return resolveGitRoot(cwd);
}

/**
 * Normalize hook cwd values across shell environments.
 * On Windows Git Bash/MSYS may pass "/c/path" which Node cannot use as cwd.
 */
export function normalizeHookCwd(cwd: string, platform: NodeJS.Platform = process.platform): string {
  if (platform !== 'win32') return cwd;

  const msysDrivePath = /^\/([a-zA-Z])(?:\/(.*))?$/;
  const match = cwd.match(msysDrivePath);
  if (!match) return cwd;

  const drive = match[1].toUpperCase();
  const rest = match[2] ?? '';
  return rest.length > 0 ? `${drive}:/${rest}` : `${drive}:/`;
}

/** Stderr labels per event for user-facing messages. */
const STDERR_LABELS: Record<HookEventType, { success: string; prefix: string }> = {
  'session:start': { success: 'Memory loaded.', prefix: 'Memory loaded' },
  'session:stop': { success: 'Session capture complete.', prefix: 'Session capture complete' },
  'prompt:submit': { success: 'Prompt context loaded.', prefix: 'Prompt context loaded' },
  'git:commit': { success: 'Session note written.', prefix: 'Session note' },
  'git:commit-msg': { success: 'AI trailers added.', prefix: 'AI trailers' },
};

export async function hookCommand(eventName: string, _logger?: ILogger): Promise<void> {
  const eventType = EVENT_MAP[eventName];
  if (!eventType) {
    // Unknown event — exit silently. Hooks must never disrupt Claude Code.
    return;
  }

  const timer = setupShutdown(10_000);

  try {
    const input = await readStdin<IHookInput>();
    const cwd = normalizeHookCwd(input.cwd ?? process.cwd());
    const normalizedInput: IHookInput = { ...input, cwd };
    const repoRoot = findGitRoot(cwd);

    // Load .env from repository root for API keys (e.g., ANTHROPIC_API_KEY)
    loadEnv({ path: join(repoRoot, '.env'), quiet: true });

    const config = loadHookConfig(repoRoot);

    if (!isEventEnabled(config.hooks, eventName)) {
      clearTimeout(timer);
      return;
    }

    const container = createContainer({ scope: `hook:${eventName}`, llm: config.llm, cwd });
    const { eventBus } = container.cradle;

    const event = buildEvent(eventType, normalizedInput);
    const results = await eventBus.emit(event);

    // Successful handler output → stdout (Claude context)
    const output = results
      .filter(r => r.success && r.output)
      .map(r => r.output)
      .join('\n');

    if (output) {
      console.log(output);
    }

    // Summary → stderr (user terminal)
    const failed = results.filter(r => !r.success).length;
    const labels = STDERR_LABELS[eventType];
    if (failed > 0) {
      console.error(`git-mem: ${labels.prefix} (${results.length - failed} ok, ${failed} failed).`);
    } else if (output) {
      console.error(`git-mem: ${labels.success}`);
    }

    clearTimeout(timer);
  } catch (err) {
    console.error('git-mem: hook failed.', err);
    clearTimeout(timer);
    process.exit(0); // Exit cleanly — hooks must never disrupt Claude Code
  }
}
