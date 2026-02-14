// Domain — Entities
export {
  IMemoryEntity,
  ICreateMemoryOptions,
  MemoryType,
  MEMORY_TYPE_VALUES,
  isValidMemoryType,
} from './domain/entities/IMemoryEntity';

export {
  ITrailer,
  AI_TRAILER_KEYS,
  AI_TRAILER_PREFIX,
  isAiTrailer,
} from './domain/entities/ITrailer';

// Domain — Types
export {
  ConfidenceLevel,
  CONFIDENCE_VALUES,
  CONFIDENCE_SCORES,
  SourceType,
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

export {
  MemoryLifecycle,
  LIFECYCLE_VALUES,
  LIFECYCLE_DEFAULTS,
  resolveLifecycleTag,
  parseLifecycleTag,
  isValidLifecycle,
  computeExpiresAt,
} from './domain/types/IMemoryLifecycle';

export {
  MemoryRelationType,
  MEMORY_RELATION_VALUES,
  IMemoryRelationship,
  RELATION_LABELS,
  INVERSE_RELATIONS,
  isValidRelationType,
} from './domain/types/IMemoryRelationship';

// Domain — Interfaces
export {
  IGitClient,
  IGitLogOptions,
  IGitDiffOptions,
  IGitLogDetailedOptions,
  IGitLogCommit,
  IGitCommitStatEntry,
  IGitTag,
} from './domain/interfaces/IGitClient';

export {
  INotesService,
  DEFAULT_NOTES_REF,
  INoteEntry,
} from './domain/interfaces/INotesService';

export {
  ITrailerService,
  ITrailerQueryOptions,
  ICommitTrailers,
} from './domain/interfaces/ITrailerService';

export {
  IMemoryRepository,
  IMemoryQueryOptions,
  IMemoryQueryResult,
} from './domain/interfaces/IMemoryRepository';

export {
  IGitTriageService,
  IGitCommitData,
  IGitCommitStats,
  ICommitInterestSignals,
  IScoredCommit,
  ITriageResult,
  IFileHotspot,
  ITagInfo,
  ITriageOptions,
} from './domain/interfaces/IGitTriageService';

export {
  ILLMClient,
  ILLMEnrichmentInput,
  ILLMExtractedFact,
  ILLMEnrichmentResult,
} from './domain/interfaces/ILLMClient';

// Domain — Errors
export {
  GitMemError,
  TrailerError,
  NotesError,
  MemoryError,
  GitClientError,
  ExtractError,
} from './domain/errors/GitMemError';

export { LLMError } from './domain/errors/LLMError';

// Domain — Utils
export {
  normalizeText,
  extractWords,
  jaccardSimilarity,
} from './domain/utils/deduplication';

// Application — Interfaces
export { IMemoryService } from './application/interfaces/IMemoryService';

export {
  IContextService,
  IScoredMemory,
  IContextOptions,
  IContextResult,
} from './application/interfaces/IContextService';

export {
  IExtractService,
  IExtractOptions,
  IExtractAnnotation,
  IEnrichmentStats,
  IExtractResult,
} from './application/interfaces/IExtractService';

// Application — Services
export { MemoryService } from './application/services/MemoryService';
export { ContextService } from './application/services/ContextService';
export { ExtractService } from './application/services/ExtractService';
export { GitTriageService } from './application/services/GitTriageService';

// Infrastructure — Git
export { GitClient } from './infrastructure/git/GitClient';

// Infrastructure — Services
export { NotesService } from './infrastructure/services/NotesService';
export { TrailerService } from './infrastructure/services/TrailerService';

// Infrastructure — Repository
export { MemoryRepository } from './infrastructure/repositories/MemoryRepository';

// Infrastructure — Patterns
export {
  HeuristicFactType,
  IPatternDefinition,
  DECISION_PATTERNS,
  GOTCHA_PATTERNS,
  CONVENTION_PATTERNS,
  ALL_PATTERNS,
  IPatternMatch,
  extractPatternMatches,
  extractByFactType,
} from './infrastructure/services/patterns/HeuristicPatterns';

// Infrastructure — LLM
export {
  AnthropicLLMClient,
  IAnthropicLLMClientOptions,
} from './infrastructure/llm/AnthropicLLMClient';

export {
  createLLMClient,
  ILLMClientFactoryOptions,
} from './infrastructure/llm/LLMClientFactory';

// MCP Server
export { createServer } from './mcp/server';
