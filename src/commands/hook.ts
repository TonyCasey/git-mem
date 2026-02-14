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

import { createContainer } from '../infrastructure/di';
import { readStdin } from '../hooks/utils/stdin';
import { setupShutdown } from '../hooks/utils/shutdown';
import { loadHookConfig } from '../hooks/utils/config';
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
    case 'git:commit-msg':
      return {
        type: 'git:commit-msg',
        commitMsgPath: input.commit_msg_path ?? '',
        cwd: base.cwd,
      };
    default: {
      const exhaustiveCheck: never = eventType;
      throw new Error(`Unhandled HookEventType in buildEvent: ${exhaustiveCheck as string}`);
    }
  }
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
    const config = loadHookConfig(input.cwd);

    if (!isEventEnabled(config.hooks, eventName)) {
      clearTimeout(timer);
      return;
    }

    const container = createContainer({ scope: `hook:${eventName}` });
    const { eventBus } = container.cradle;

    const event = buildEvent(eventType, input);
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
