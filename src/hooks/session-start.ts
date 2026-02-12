/**
 * Session-start hook entry point.
 *
 * Invoked by Claude Code on session startup. Reads JSON from stdin,
 * emits a session:start event, and outputs loaded memories to stdout.
 *
 * stdout → Claude's context (memories formatted as markdown)
 * stderr → User's terminal (status summary)
 */

import { createContainer } from '../infrastructure/di';
import { readStdin } from './utils/stdin';
import { setupShutdown } from './utils/shutdown';

interface ISessionStartInput {
  session_id?: string;
  source?: string;
  cwd?: string;
  hook_event_name?: string;
}

const timer = setupShutdown(10_000);

async function main(): Promise<void> {
  const input = await readStdin<ISessionStartInput>();
  const container = createContainer({ scope: 'hook:session-start' });
  const { eventBus } = container.cradle;

  const results = await eventBus.emit({
    type: 'session:start',
    sessionId: input.session_id ?? 'unknown',
    trigger: input.source ?? 'startup',
    cwd: input.cwd ?? process.cwd(),
  });

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
  if (failed > 0) {
    console.error(`git-mem: Memory loaded (${results.length - failed} ok, ${failed} failed).`);
  } else if (output) {
    console.error(`git-mem: Memory loaded.`);
  }

  clearTimeout(timer);
}

main().catch(() => process.exit(0));
