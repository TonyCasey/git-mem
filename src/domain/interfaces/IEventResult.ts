/**
 * IEventResult
 *
 * Result returned by an event handler after processing a hook event.
 * Used by the event bus to collect outputs and report failures.
 */

export interface IEventResult {
  /** Name of the handler that produced this result. */
  readonly handler: string;
  /** Whether the handler completed successfully. */
  readonly success: boolean;
  /** Optional content for stdout (injected into Claude's context). */
  readonly output?: string;
  /** Error details if the handler failed. */
  readonly error?: Error;
}
