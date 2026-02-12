/**
 * DI Container
 *
 * Factory function that creates an awilix container with all
 * services registered and wired together. Replaces manual
 * instantiation previously duplicated across CLI commands,
 * MCP tools, and hook entry points.
 */

import {
  createContainer as createAwilixContainer,
  asClass,
  asFunction,
  InjectionMode,
} from 'awilix';
import type { AwilixContainer } from 'awilix';
import type { ICradle, IContainerOptions } from './types';

// Infrastructure
import { NotesService } from '../services/NotesService';
import { GitClient } from '../git/GitClient';
import { MemoryRepository } from '../repositories/MemoryRepository';
import { EventBus } from '../events/EventBus';
import { createLogger } from '../logging/factory';
import { createLLMClient } from '../llm/LLMClientFactory';

// Application
import { MemoryService } from '../../application/services/MemoryService';
import { ContextService } from '../../application/services/ContextService';
import { LiberateService } from '../../application/services/LiberateService';
import { GitTriageService } from '../../application/services/GitTriageService';

export function createContainer(options?: IContainerOptions): AwilixContainer<ICradle> {
  const container = createAwilixContainer<ICradle>({
    injectionMode: InjectionMode.CLASSIC,
  });

  container.register({
    // ── Infrastructure (singletons within container) ──────────────

    logger: asFunction(() => {
      const base = options?.logger ?? createLogger();
      return options?.scope ? base.child({ component: options.scope }) : base;
    }).singleton(),

    notesService: asClass(NotesService).singleton(),
    gitClient: asClass(GitClient).singleton(),
    memoryRepository: asClass(MemoryRepository).singleton(),

    eventBus: asFunction(({ logger }: ICradle) => {
      return new EventBus(logger);
    }).singleton(),

    llmClient: asFunction(() => {
      return options?.enrich ? (createLLMClient() ?? null) : null;
    }).singleton(),

    // ── Application services ─────────────────────────────────────

    // GitTriageService constructor uses `git` not `gitClient`, so
    // we map it explicitly instead of relying on CLASSIC name matching.
    triageService: asFunction(({ gitClient }: ICradle) => {
      return new GitTriageService(gitClient);
    }).singleton(),

    memoryService: asClass(MemoryService).singleton(),
    contextService: asClass(ContextService).singleton(),
    liberateService: asClass(LiberateService).singleton(),
  });

  return container;
}
