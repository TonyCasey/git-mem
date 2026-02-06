/**
 * git-mem — Git-native memory layer for AI coding tools.
 *
 * @packageDocumentation
 */

// ── Domain Entities ──────────────────────────────────────────────────
export type { IMemoryEntity, ICreateMemoryOptions } from './domain/entities/IMemoryEntity';
export { MemoryType, MEMORY_TYPE_VALUES, isValidMemoryType } from './domain/entities/IMemoryEntity';

export type { ITrailer } from './domain/entities/ITrailer';
export { AI_TRAILER_KEYS, AI_TRAILER_PREFIX, isAiTrailer } from './domain/entities/ITrailer';

// ── Domain Types ─────────────────────────────────────────────────────
export type { ConfidenceLevel, SourceType } from './domain/types/IMemoryQuality';
export {
  CONFIDENCE_VALUES,
  CONFIDENCE_SCORES,
  SOURCE_VALUES,
  DEFAULT_CONFIDENCE,
  resolveConfidenceTag,
  parseConfidenceTag,
  isValidConfidence,
  confidenceToScore,
  scoreToConfidence,
  resolveSourceTag,
  parseSourceTag,
  isValidSource,
  defaultConfidenceForSource,
} from './domain/types/IMemoryQuality';

export type { MemoryLifecycle } from './domain/types/IMemoryLifecycle';
export {
  LIFECYCLE_VALUES,
  LIFECYCLE_DEFAULTS,
  resolveLifecycleTag,
  parseLifecycleTag,
  isValidLifecycle,
  computeExpiresAt,
} from './domain/types/IMemoryLifecycle';

export type { IMemoryRelationship, MemoryRelationType } from './domain/types/IMemoryRelationship';
export {
  MEMORY_RELATION_VALUES,
  RELATION_LABELS,
  INVERSE_RELATIONS,
  isValidRelationType,
} from './domain/types/IMemoryRelationship';

// ── Domain Errors ────────────────────────────────────────────────────
export {
  GitMemError,
  TrailerError,
  NotesError,
  MemoryError,
  GitClientError,
  LiberateError,
} from './domain/errors/GitMemError';
export { LLMError } from './domain/errors/LLMError';

// ── Domain Interfaces ────────────────────────────────────────────────
export type {
  IGitLogOptions,
  IGitDiffOptions,
  IGitLogDetailedOptions,
  IGitLogCommit,
  IGitCommitStatEntry,
  IGitTag,
  IGitClient,
} from './domain/interfaces/IGitClient';

export type { INoteEntry, INotesService } from './domain/interfaces/INotesService';
export { DEFAULT_NOTES_REF } from './domain/interfaces/INotesService';

export type {
  IMemoryQueryOptions,
  IMemoryQueryResult,
  IMemoryRepository,
} from './domain/interfaces/IMemoryRepository';

export type { ITrailerQueryOptions, ICommitTrailers, ITrailerService } from './domain/interfaces/ITrailerService';

export type {
  IGitCommitData,
  IGitCommitStats,
  ICommitInterestSignals,
  IScoredCommit,
  ITriageResult,
  IFileHotspot,
  ITagInfo,
  ITriageOptions,
  IGitTriageService,
} from './domain/interfaces/IGitTriageService';

export type {
  ILLMEnrichmentInput,
  ILLMExtractedFact,
  ILLMEnrichmentResult,
  ILLMClient,
} from './domain/interfaces/ILLMClient';

// ── Application Interfaces ───────────────────────────────────────────
export type { IMemoryService } from './application/interfaces/IMemoryService';

export type {
  IScoredMemory,
  IContextOptions,
  IContextResult,
  IContextService,
} from './application/interfaces/IContextService';

export type {
  ILiberateOptions,
  ILiberateAnnotation,
  IEnrichmentStats,
  ILiberateResult,
  ILiberateService,
} from './application/interfaces/ILiberateService';

// ── Application Services ─────────────────────────────────────────────
export { MemoryService } from './application/services/MemoryService';
export { ContextService } from './application/services/ContextService';
export { LiberateService } from './application/services/LiberateService';
export { GitTriageService } from './application/services/GitTriageService';

// ── Infrastructure ───────────────────────────────────────────────────
export { GitClient } from './infrastructure/git/GitClient';
export { MemoryRepository } from './infrastructure/repositories/MemoryRepository';
export { NotesService } from './infrastructure/services/NotesService';
export { TrailerService } from './infrastructure/services/TrailerService';
export type { HeuristicFactType, IPatternDefinition, IPatternMatch } from './infrastructure/services/patterns/HeuristicPatterns';
export {
  DECISION_PATTERNS,
  GOTCHA_PATTERNS,
  CONVENTION_PATTERNS,
  ALL_PATTERNS,
  extractPatternMatches,
  extractByFactType,
} from './infrastructure/services/patterns/HeuristicPatterns';

export type { IAnthropicLLMClientOptions } from './infrastructure/llm/AnthropicLLMClient';
export { AnthropicLLMClient } from './infrastructure/llm/AnthropicLLMClient';

export type { ILLMClientFactoryOptions } from './infrastructure/llm/LLMClientFactory';
export { createLLMClient } from './infrastructure/llm/LLMClientFactory';

// ── Domain Utilities ─────────────────────────────────────────────────
export { normalizeText, extractWords, jaccardSimilarity } from './domain/utils/deduplication';

// ── MCP Server ───────────────────────────────────────────────────────
export { createServer } from './mcp/server';
