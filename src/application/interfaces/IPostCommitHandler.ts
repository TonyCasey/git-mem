/**
 * IPostCommitHandler
 *
 * Application interface for the post-commit hook handler.
 */

import type { IEventHandler } from '../../domain/interfaces/IEventHandler';
import type { IGitCommitEvent } from '../../domain/events/HookEvents';

export type IPostCommitHandler = IEventHandler<IGitCommitEvent>;
