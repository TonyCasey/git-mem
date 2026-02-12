/**
 * ISessionStopHandler
 *
 * Application interface for the session-stop hook handler.
 */

import type { IEventHandler } from '../../domain/interfaces/IEventHandler';
import type { ISessionStopEvent } from '../../domain/events/HookEvents';

export type ISessionStopHandler = IEventHandler<ISessionStopEvent>;
