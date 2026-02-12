/**
 * IEventHandler
 *
 * Domain interface for event handlers that process hook events.
 * Each handler returns an IEventResult indicating success/failure
 * and optional output to include in the hook's stdout.
 */

import type { HookEvent } from '../events/HookEvents';
import type { IEventResult } from './IEventResult';

export interface IEventHandler<T extends HookEvent = HookEvent> {
  /** Process the event and return a result. */
  handle(event: T): Promise<IEventResult>;
}
