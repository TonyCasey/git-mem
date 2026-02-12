/**
 * User-prompt-submit hook entry point.
 *
 * Invoked by Claude Code when the user submits a prompt. Reads JSON
 * from stdin, emits a prompt:submit event, and outputs relevant
 * memories to stdout for Claude's context.
 *
 * stdout -> Claude's context (memories formatted as markdown)
 * stderr -> User's terminal (status summary)
 */

import { createContainer } from '../infrastructure/di';
import { readStdin } from './utils/stdin';
import { setupShutdown } from './utils/shutdown';
import { loadHookConfig } from './utils/config';

interface IPromptSubmitInput {
  session_id?: string;
  prompt?: string;
  cwd?: string;
  hook_event_name?: string;
}

const timer = setupShutdown(10_000);

async function main(): Promise<void> {
  const input = await readStdin<IPromptSubmitInput>();
  const config = loadHookConfig(input.cwd);

  if (!config.hooks.enabled || !config.hooks.promptSubmit.enabled) {
    clearTimeout(timer);
    return;
  }

  const container = createContainer({ scope: 'hook:user-prompt-submit' });
  const { eventBus } = container.cradle;

  const results = await eventBus.emit({
    type: 'prompt:submit',
    sessionId: input.session_id ?? 'unknown',
    prompt: input.prompt ?? '',
    cwd: input.cwd ?? process.cwd(),
  });

  // Successful handler output -> stdout (Claude context)
  const output = results
    .filter(r => r.success && r.output)
    .map(r => r.output)
    .join('\n');

  if (output) {
    console.log(output);
  }

  // Summary -> stderr (user terminal)
  const failed = results.filter(r => !r.success).length;
  if (failed > 0) {
    console.error(`git-mem: Prompt context loaded (${results.length - failed} ok, ${failed} failed).`);
  }

  clearTimeout(timer);
}

main().catch((err) => {
  console.error('git-mem: user-prompt-submit hook failed.', err);
  process.exit(0); // Exit cleanly — hooks must never disrupt Claude Code
});
