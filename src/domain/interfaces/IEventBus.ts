/**
 * IEventBus
 *
 * Domain interface for the event bus used by Claude Code hooks.
 * Provides pub/sub with error isolation — a failing handler
 * does not prevent other handlers from executing.
 */

import type { HookEvent, HookEventType } from '../events/HookEvents';
import type { IEventHandler } from './IEventHandler';
import type { IEventResult } from './IEventResult';

export interface IEventBus {
  /** Register a handler for a specific event type. */
  on<T extends HookEvent>(eventType: T['type'], handler: IEventHandler<T>): void;

  /**
   * Emit an event and dispatch to all registered handlers.
   * Returns results from all handlers — failures are captured, not thrown.
   */
  emit<T extends HookEvent>(event: T): Promise<IEventResult[]>;

  /** Get registered event types. */
  registeredEvents(): HookEventType[];
}
