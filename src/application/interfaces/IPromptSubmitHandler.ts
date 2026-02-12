/**
 * IPromptSubmitHandler
 *
 * Application interface for the user-prompt-submit hook handler.
 */

import type { IEventHandler } from '../../domain/interfaces/IEventHandler';
import type { IPromptSubmitEvent } from '../../domain/events/HookEvents';

export type IPromptSubmitHandler = IEventHandler<IPromptSubmitEvent>;
