# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is git-mem?

Git-native memory layer for AI coding tools. Stores decisions, context, and knowledge directly in git using commit trailers and git notes (`refs/notes/mem`). Ships as both a CLI (`git-mem` / `git mem`) and an MCP server (`git-mem-mcp`).

## Commands

```bash
npm run build            # tsc → dist/
npm run type-check       # tsc --noEmit
npm run lint             # eslint src/
npm run lint:fix         # eslint --fix
npm run pre-commit       # type-check + lint

npm test                 # all tests (unit + integration)
npm run test:unit        # unit tests only
npm run test:integration # integration tests only

# Run a single test file:
node --import tsx --test tests/unit/application/services/MemoryService.test.ts

# Rebuild and reinstall globally (for manual testing):
./scripts/reinstall-global.sh
```

## Architecture

Clean architecture with three layers. Dependencies point inward only: Infrastructure → Application → Domain.

**Domain** (`src/domain/`) — Zero dependencies. Entities (`IMemoryEntity`), interfaces (`IMemoryRepository`, `INotesService`, `ITrailerService`, `IGitClient`), types (quality, lifecycle), errors (`GitMemError` hierarchy), and pure utils (deduplication).

**Application** (`src/application/`) — Depends on domain only. Three services: `MemoryService` (remember/recall CRUD), `ExtractService` (scan git history, score commits, extract patterns), `ContextService` (match staged changes against stored memories).

**Infrastructure** (`src/infrastructure/`) — Implements domain interfaces. `GitClient` wraps git CLI. `NotesService` reads/writes `refs/notes/mem`. `TrailerService` queries commit trailers. `MemoryRepository` persists `IMemoryEntity[]` as JSON in git notes. `HeuristicPatterns` provides regex-based extraction rules.

**Entry points:**
- `src/cli.ts` — Commander.js CLI with 6 commands (remember, recall, context, extract, sync, init)
- `src/mcp-server.ts` — MCP server over stdio; `src/mcp/server.ts` creates the server and registers 4 tools
- `src/commands/` — CLI command handlers
- `src/mcp/tools/` — MCP tool handlers (remember, recall, context, extract)

**Bootstrapping pattern** — Awilix DI container (`src/infrastructure/di/`). `createContainer(options?)` wires all services; CLI commands and MCP tools resolve from `container.cradle`:

```typescript
const container = createContainer({ logger, scope: 'remember' });
const { memoryService } = container.cradle;
```

Uses `InjectionMode.CLASSIC` (matches constructor parameter names to registration names). `ICradle` in `types.ts` defines the typed container shape with all interface references.

## Testing

Uses **`node:test`** (native Node.js test runner) with **`tsx`** for TypeScript, not Jest. Tests import `describe`, `it`, `before`, `after` from `node:test` and assertions from `node:assert/strict`.

**Unit tests** (`tests/unit/`) — Mock dependencies manually (no framework). 57 tests.

**Integration tests** (`tests/integration/`) — Create real temporary git repos in `os.tmpdir()`, run actual git commands, clean up in `after()`. All services instantiated against real repos. 32 tests.

## Environment Variables

- `ANTHROPIC_API_KEY` — Required only for `git mem extract --enrich` (LLM enrichment). Without it, `--enrich` falls back to heuristic extraction with a warning. See `.env.example`.

## Key Technical Details

- **CommonJS** project (`"type": "commonjs"`) but `@modelcontextprotocol/sdk` is ESM — works via `esModuleInterop: true` and `.js` import extensions
- **Memory storage**: JSON `{memories: IMemoryEntity[]}` in git notes on `refs/notes/mem`
- **Git log parsing**: Uses ASCII separators `\x1e` (record) and `\x1f` (field) — null bytes don't work reliably
- **`cwd` parameter**: Must be threaded through all service calls when operating on a repo that isn't the current working directory
- **Commit triage**: Weighted scoring based on conventional prefixes, decision keywords, diff size, PR merges
- **TypeScript config**: Relaxed strict mode for development (`strict: false` in tsconfig.json)
- Interfaces prefixed with `I` (enforced by ESLint)
- No `any` in production code (ESLint error); relaxed to warn in test files

## Coding Rules

Rules are automatically loaded as context. See `.claude/rules/`:

### Shared Rules (All Languages)
- `clean-architecture.md` - Layer structure, dependency rules, SOLID principles
- `code-quality-rules.md` - TypeScript/ESLint configuration, error prevention
- `git-rules.md` - Commit workflow, PR creation, memory milestones
- `testing-principles.md` - Testing pyramid, mocking strategies

### TypeScript Rules
- `coding-standards.md` - Naming conventions, type safety, async patterns
- `testing.md` - Jest patterns, fixtures, mocking
- `typescript-config-guide.md` - tsconfig settings, strict mode guidance


## Git Workflow

- Branch per Linear issue, named with ticket number (e.g. `GIT-15`)
- PRs merge into `main`
- Clean up feature branches after merge
