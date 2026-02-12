/**
 * Graceful shutdown utility for Claude Code hooks.
 *
 * Sets a hard timeout to guarantee the hook exits (hooks must never hang).
 * Registers signal handlers for clean exit on SIGINT/SIGTERM.
 * Returns the timer so the caller can clear it on successful completion.
 */

export function setupShutdown(timeoutMs: number): NodeJS.Timeout {
  const timer = setTimeout(() => process.exit(0), timeoutMs);

  // Unref so the timer alone doesn't keep the process alive
  timer.unref();

  const shutdown = (): void => {
    clearTimeout(timer);
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return timer;
}
