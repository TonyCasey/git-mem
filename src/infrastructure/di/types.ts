/**
 * DI Container Types
 *
 * ICradle — typed shape of the DI container. Every key corresponds
 * to a registered service resolved via `container.resolve()`.
 *
 * IContainerOptions — configuration passed to `createContainer()`
 * controlling logger, LLM enrichment, and scope labelling.
 *
 * All types reference interfaces, not concrete implementations.
 */

import type { ILogger } from '../../domain/interfaces/ILogger';
import type { INotesService } from '../../domain/interfaces/INotesService';
import type { IGitClient } from '../../domain/interfaces/IGitClient';
import type { IMemoryRepository } from '../../domain/interfaces/IMemoryRepository';
import type { IGitTriageService } from '../../domain/interfaces/IGitTriageService';
import type { ILLMClient } from '../../domain/interfaces/ILLMClient';
import type { IEventBus } from '../../domain/interfaces/IEventBus';
import type { IMemoryService } from '../../application/interfaces/IMemoryService';
import type { IContextService } from '../../application/interfaces/IContextService';
import type { ILiberateService } from '../../application/interfaces/ILiberateService';
import type { IMemoryContextLoader } from '../../domain/interfaces/IMemoryContextLoader';
import type { IContextFormatter } from '../../domain/interfaces/IContextFormatter';
import type { ISessionCaptureService } from '../../domain/interfaces/ISessionCaptureService';
import type { ITrailerService } from '../../domain/interfaces/ITrailerService';

export interface ICradle {
  // Infrastructure
  logger: ILogger;
  notesService: INotesService;
  gitClient: IGitClient;
  memoryRepository: IMemoryRepository;
  trailerService: ITrailerService;
  triageService: IGitTriageService;
  llmClient: ILLMClient | null;
  eventBus: IEventBus;

  // Application — core services
  memoryService: IMemoryService;
  contextService: IContextService;
  liberateService: ILiberateService;

  // Application — hook services
  memoryContextLoader: IMemoryContextLoader;
  contextFormatter: IContextFormatter;
  sessionCaptureService: ISessionCaptureService;
}

export interface IContainerOptions {
  /** Working directory for git operations. */
  cwd?: string;
  /** Existing logger instance to use (creates one if not provided). */
  logger?: ILogger;
  /** Enable LLM client for enrichment. */
  enrich?: boolean;
  /** Scope label for child logger (e.g., 'remember', 'mcp:recall'). */
  scope?: string;
}
