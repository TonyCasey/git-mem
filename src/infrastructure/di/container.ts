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
import type { IGitClient } from '../../domain/interfaces/IGitClient';

// Infrastructure
import { NotesService } from '../services/NotesService';
import { GitClient } from '../git/GitClient';
import { MemoryRepository } from '../repositories/MemoryRepository';
import { TrailerService } from '../services/TrailerService';
import { EventBus } from '../events/EventBus';
import { createLogger } from '../logging/factory';
import { createLLMClient } from '../llm/LLMClientFactory';
import { IntentExtractor } from '../llm/IntentExtractor';
import { AgentResolver } from '../services/AgentResolver';
import { HookConfigLoader } from '../services/HookConfigLoader';

// Application — core services
import { MemoryService } from '../../application/services/MemoryService';
import { ContextService } from '../../application/services/ContextService';
import { ExtractService } from '../../application/services/ExtractService';
import { GitTriageService } from '../../application/services/GitTriageService';
import { CommitAnalyzer } from '../../application/services/CommitAnalyzer';

// Application — hook services
import { MemoryContextLoader } from '../../application/services/MemoryContextLoader';
import { ContextFormatter } from '../../application/services/ContextFormatter';
import { SessionCaptureService } from '../../application/services/SessionCaptureService';
import { SessionStartHandler } from '../../application/handlers/SessionStartHandler';
import { SessionStopHandler } from '../../application/handlers/SessionStopHandler';
import { PromptSubmitHandler } from '../../application/handlers/PromptSubmitHandler';
import { PostCommitHandler } from '../../application/handlers/PostCommitHandler';
import { CommitMsgHandler } from '../../application/handlers/CommitMsgHandler';

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
    trailerService: asClass(TrailerService).singleton(),
    agentResolver: asClass(AgentResolver).singleton(),
    hookConfigLoader: asClass(HookConfigLoader).singleton(),

    eventBus: asFunction(() => {
      const bus = new EventBus(container.cradle.logger);

      // Register hook handlers on the event bus
      bus.on('session:start', new SessionStartHandler(
        container.cradle.memoryContextLoader,
        container.cradle.contextFormatter,
        container.cradle.logger,
      ));
      bus.on('session:stop', new SessionStopHandler(
        container.cradle.sessionCaptureService,
        container.cradle.logger,
      ));
      bus.on('prompt:submit', new PromptSubmitHandler(
        container.cradle.memoryContextLoader,
        container.cradle.contextFormatter,
        container.cradle.logger,
        container.cradle.hookConfigLoader,
        container.cradle.intentExtractor,
      ));
      bus.on('git:commit', new PostCommitHandler(
        container.cradle.notesService,
        container.cradle.logger,
      ));
      bus.on('git:commit-msg', new CommitMsgHandler(
        container.cradle.commitAnalyzer,
        container.cradle.gitClient,
        container.cradle.logger,
        container.cradle.agentResolver,
        container.cradle.hookConfigLoader,
        container.cradle.llmClient,
      ));

      return bus;
    }).singleton(),

    llmClient: asFunction(() => {
      // When enrich is explicitly false, do not create LLM client.
      // When enrich is true or not specified, attempt to create it.
      // This allows hooks to use LLM enrichment without explicit opt-in,
      // while still respecting explicit enrich:false from CLI commands.
      if (options?.enrich === false) {
        return null;
      }
      return createLLMClient(options?.llm) ?? null;
    }).singleton(),

    intentExtractor: asFunction(() => {
      // Intent extraction uses the LLM client as ILLMCaller.
      // If no LLM client is available, return null for graceful degradation.
      const client = container.cradle.llmClient;
      if (!client) {
        return null;
      }
      try {
        return new IntentExtractor({
          caller: client,
          logger: container.cradle.logger,
        });
      } catch {
        return null;
      }
    }).singleton(),

    // ── Application services ─────────────────────────────────────

    // GitTriageService constructor uses `git` not `gitClient`, so
    // we map it explicitly instead of relying on CLASSIC name matching.
    triageService: asFunction((gitClient: IGitClient) => {
      return new GitTriageService(gitClient);
    }).singleton(),

    // CLASSIC mode: constructor param names must match ICradle keys.
    // If a param is renamed, wrap in asFunction (like triageService above).
    memoryService: asClass(MemoryService).singleton(),
    contextService: asClass(ContextService).singleton(),
    extractService: asClass(ExtractService).singleton(),
    commitAnalyzer: asClass(CommitAnalyzer).singleton(),

    // ── Hook services ─────────────────────────────────────────────
    memoryContextLoader: asClass(MemoryContextLoader).singleton(),
    contextFormatter: asClass(ContextFormatter).singleton(),
    sessionCaptureService: asClass(SessionCaptureService).singleton(),
  });

  return container;
}
