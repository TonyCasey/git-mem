/**
 * EventBus unit tests
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../../../../src/infrastructure/events/EventBus';
import type { HookEvent } from '../../../../src/domain/events/HookEvents';
import type { IEventHandler } from '../../../../src/domain/interfaces/IEventHandler';
import type { IEventResult } from '../../../../src/domain/interfaces/IEventResult';

function createSessionStartEvent(overrides?: Partial<HookEvent>): HookEvent {
  return {
    type: 'session:start',
    sessionId: 'test-session',
    trigger: 'cli',
    cwd: '/tmp/test',
    ...overrides,
  } as HookEvent;
}

function createHandler(name: string, output?: string): IEventHandler<HookEvent> {
  return {
    constructor: { name } as Function,
    async handle(): Promise<IEventResult> {
      return { handler: name, success: true, output };
    },
  } as IEventHandler<HookEvent>;
}

function createFailingHandler(name: string, error: Error): IEventHandler<HookEvent> {
  return {
    constructor: { name } as Function,
    async handle(): Promise<IEventResult> {
      throw error;
    },
  } as IEventHandler<HookEvent>;
}

describe('EventBus', () => {
  describe('emit', () => {
    it('should return empty results when no handlers registered', async () => {
      const bus = new EventBus();
      const results = await bus.emit(createSessionStartEvent());

      assert.deepEqual(results, []);
    });

    it('should call registered handler and return result', async () => {
      const bus = new EventBus();
      bus.on('session:start', createHandler('TestHandler', 'hello'));

      const results = await bus.emit(createSessionStartEvent());

      assert.equal(results.length, 1);
      assert.equal(results[0].handler, 'TestHandler');
      assert.equal(results[0].success, true);
      assert.equal(results[0].output, 'hello');
    });

    it('should call multiple handlers in order', async () => {
      const bus = new EventBus();
      const order: string[] = [];

      bus.on('session:start', {
        constructor: { name: 'First' } as Function,
        async handle(): Promise<IEventResult> {
          order.push('first');
          return { handler: 'First', success: true };
        },
      } as IEventHandler<HookEvent>);

      bus.on('session:start', {
        constructor: { name: 'Second' } as Function,
        async handle(): Promise<IEventResult> {
          order.push('second');
          return { handler: 'Second', success: true };
        },
      } as IEventHandler<HookEvent>);

      const results = await bus.emit(createSessionStartEvent());

      assert.equal(results.length, 2);
      assert.deepEqual(order, ['first', 'second']);
    });

    it('should isolate errors — failing handler does not block others', async () => {
      const bus = new EventBus();

      bus.on('session:start', createHandler('Before', 'ok'));
      bus.on('session:start', createFailingHandler('Broken', new Error('boom')));
      bus.on('session:start', createHandler('After', 'still ok'));

      const results = await bus.emit(createSessionStartEvent());

      assert.equal(results.length, 3);

      assert.equal(results[0].success, true);
      assert.equal(results[0].handler, 'Before');

      assert.equal(results[1].success, false);
      assert.equal(results[1].handler, 'Broken');
      assert.ok(results[1].error instanceof Error);
      assert.equal(results[1].error!.message, 'boom');

      assert.equal(results[2].success, true);
      assert.equal(results[2].handler, 'After');
    });

    it('should wrap non-Error throws in Error object', async () => {
      const bus = new EventBus();
      bus.on('session:start', {
        constructor: { name: 'StringThrower' } as Function,
        async handle(): Promise<IEventResult> {
          throw 'string error';
        },
      } as IEventHandler<HookEvent>);

      const results = await bus.emit(createSessionStartEvent());

      assert.equal(results[0].success, false);
      assert.ok(results[0].error instanceof Error);
      assert.equal(results[0].error!.message, 'string error');
    });

    it('should not call handlers registered for different event types', async () => {
      const bus = new EventBus();
      bus.on('session:stop', createHandler('StopHandler'));

      const results = await bus.emit(createSessionStartEvent());

      assert.deepEqual(results, []);
    });
  });

  describe('on', () => {
    it('should allow registering multiple handlers for same event', async () => {
      const bus = new EventBus();
      bus.on('session:start', createHandler('A'));
      bus.on('session:start', createHandler('B'));
      bus.on('session:start', createHandler('C'));

      const results = await bus.emit(createSessionStartEvent());
      assert.equal(results.length, 3);
    });
  });

  describe('registeredEvents', () => {
    it('should return empty array when no handlers registered', () => {
      const bus = new EventBus();
      assert.deepEqual(bus.registeredEvents(), []);
    });

    it('should return list of event types with handlers', () => {
      const bus = new EventBus();
      bus.on('session:start', createHandler('A'));
      bus.on('session:stop', createHandler('B'));

      const events = bus.registeredEvents();
      assert.equal(events.length, 2);
      assert.ok(events.includes('session:start'));
      assert.ok(events.includes('session:stop'));
    });

    it('should not duplicate event types', () => {
      const bus = new EventBus();
      bus.on('session:start', createHandler('A'));
      bus.on('session:start', createHandler('B'));

      const events = bus.registeredEvents();
      assert.equal(events.length, 1);
      assert.equal(events[0], 'session:start');
    });
  });
});
