/**
 * Session-stop hook entry point.
 *
 * Invoked by Claude Code when a session ends. Reads JSON from stdin,
 * emits a session:stop event, and captures memories from session commits.
 *
 * stdout -> Claude's context (capture summary)
 * stderr -> User's terminal (status summary)
 */

import { createContainer } from '../infrastructure/di';
import { readStdin } from './utils/stdin';
import { setupShutdown } from './utils/shutdown';
import { loadHookConfig } from './utils/config';

interface ISessionStopInput {
  session_id?: string;
  cwd?: string;
  hook_event_name?: string;
}

const timer = setupShutdown(10_000);

async function main(): Promise<void> {
  const input = await readStdin<ISessionStopInput>();
  const config = loadHookConfig(input.cwd);

  if (!config.hooks.enabled || !config.hooks.sessionStop.enabled) {
    clearTimeout(timer);
    return;
  }

  const container = createContainer({ scope: 'hook:session-stop' });
  const { eventBus } = container.cradle;

  const results = await eventBus.emit({
    type: 'session:stop',
    sessionId: input.session_id ?? 'unknown',
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
    console.error(`git-mem: Session capture complete (${results.length - failed} ok, ${failed} failed).`);
  } else if (output) {
    console.error(`git-mem: Session capture complete.`);
  }

  clearTimeout(timer);
}

main().catch((err) => {
  console.error('git-mem: session-stop hook failed.', err);
  process.exit(0); // Exit cleanly — hooks must never disrupt Claude Code
});
