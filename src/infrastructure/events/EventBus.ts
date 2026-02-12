/**
 * EventBus
 *
 * Infrastructure implementation of IEventBus.
 * Provides pub/sub event dispatch with error isolation — a failing
 * handler is caught and reported without blocking other handlers.
 */

import type { HookEvent, HookEventType } from '../../domain/events/HookEvents';
import type { IEventBus } from '../../domain/interfaces/IEventBus';
import type { IEventHandler } from '../../domain/interfaces/IEventHandler';
import type { IEventResult } from '../../domain/interfaces/IEventResult';
import type { ILogger } from '../../domain/interfaces/ILogger';

export class EventBus implements IEventBus {
  private readonly handlers = new Map<string, IEventHandler<HookEvent>[]>();

  constructor(private readonly logger?: ILogger) {}

  on<T extends HookEvent>(eventType: T['type'], handler: IEventHandler<T>): void {
    const existing = this.handlers.get(eventType) ?? [];
    existing.push(handler as IEventHandler<HookEvent>);
    this.handlers.set(eventType, existing);
  }

  async emit<T extends HookEvent>(event: T): Promise<IEventResult[]> {
    const handlers = this.handlers.get(event.type) ?? [];
    const results: IEventResult[] = [];

    for (const handler of handlers) {
      try {
        const result = await handler.handle(event);
        results.push(result);
      } catch (error) {
        this.logger?.warn('Event handler failed', {
          event: event.type,
          handler: handler.constructor.name,
          error: error instanceof Error ? error.message : String(error),
        });

        results.push({
          handler: handler.constructor.name,
          success: false,
          error: error instanceof Error ? error : new Error(String(error)),
        });
      }
    }

    return results;
  }

  registeredEvents(): HookEventType[] {
    return [...this.handlers.keys()] as HookEventType[];
  }
}
