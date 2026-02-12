/**
 * ISessionStartHandler
 *
 * Application interface for the session-start hook handler.
 */

import type { IEventHandler } from '../../domain/interfaces/IEventHandler';
import type { ISessionStartEvent } from '../../domain/events/HookEvents';

export type ISessionStartHandler = IEventHandler<ISessionStartEvent>;
