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

**Application** (`src/application/`) — Depends on domain only. Core services: `MemoryService` (remember/recall CRUD), `ExtractService` (scan git history, score commits, extract patterns), `ContextService` (match staged changes against stored memories). Hook services: `MemoryContextLoader` (loads memories with limits), `ContextFormatter` (formats memories as markdown), `SessionCaptureService` (24h rolling commit scan via ExtractService). Three event handlers: `SessionStartHandler`, `SessionStopHandler`, `PromptSubmitHandler`.

**Infrastructure** (`src/infrastructure/`) — Implements domain interfaces. `GitClient` wraps git CLI. `NotesService` reads/writes `refs/notes/mem`. `TrailerService` queries commit trailers. `MemoryRepository` persists `IMemoryEntity[]` as JSON in git notes. `HeuristicPatterns` provides regex-based extraction rules. `EventBus` provides pub/sub event dispatch with error isolation (failing handlers don't crash the hook).

**Entry points:**
- `src/cli.ts` — Commander.js CLI with 8 commands (remember, recall, context, extract, sync, init, trailers, hook)
- `src/mcp-server.ts` — MCP server over stdio; `src/mcp/server.ts` creates the server and registers 4 tools
- `src/commands/hook.ts` — Unified hook entry point: reads stdin JSON, loads config, emits typed event via EventBus
- `src/commands/init.ts` — Interactive setup: hooks, MCP config, .gitignore, initial extract
- `src/commands/` — CLI command handlers
- `src/mcp/tools/` — MCP tool handlers (remember, recall, context, extract)

**Bootstrapping pattern** — Awilix DI container (`src/infrastructure/di/`). `createContainer(options?)` wires all services; CLI commands, MCP tools, and hooks resolve from `container.cradle`:

```typescript
const container = createContainer({ logger, scope: 'remember' });
const { memoryService } = container.cradle;
```

Uses `InjectionMode.CLASSIC` (matches constructor parameter names to registration names). `ICradle` in `types.ts` defines the typed container shape with all interface references. The container also registers the `EventBus` with five hook handlers (`session:start`, `session:stop`, `prompt:submit`, `commit:msg`, `post:commit`) wired during creation.

**Hook event flow:** `git-mem hook <event>` → `readStdin()` → `loadHookConfig()` → `createContainer()` → `eventBus.emit(typedEvent)` → handlers return `IEventResult[]` → output to stdout (context), summary to stderr. Hooks have a 10s hard timeout and never throw — failures are caught and reported silently.

## Testing

Uses **`node:test`** (native Node.js test runner) with **`tsx`** for TypeScript, not Jest. Tests import `describe`, `it`, `before`, `after` from `node:test` and assertions from `node:assert/strict`.

**Unit tests** (`tests/unit/`) — Mock dependencies manually (no framework). 265 tests.

**Integration tests** (`tests/integration/`) — Create real temporary git repos in `os.tmpdir()`, run actual git commands, clean up in `after()`. Hook integration tests (`tests/integration/hooks/`) spawn `git-mem hook <event>` as child processes via `tsx` binary. 46 tests.

## Environment Variables

- `ANTHROPIC_API_KEY` — Anthropic (Claude) API key for LLM enrichment and intent extraction.
- `OPENAI_API_KEY` — OpenAI API key (requires `npm install openai`).
- `GOOGLE_API_KEY` / `GEMINI_API_KEY` — Google Gemini API key (requires `npm install @google/generative-ai`).
- `OLLAMA_HOST` — Ollama server URL (default: `http://localhost:11434`). No extra package needed.
- `GIT_MEM_LLM_PROVIDER` — Force a specific provider: `anthropic`, `openai`, `gemini`, or `ollama`. Auto-detected from API keys if omitted.

Only one provider is needed. Without any LLM key, `--enrich` falls back to heuristic extraction with a warning. See `.env.example`.

**LLM config in `.git-mem/.git-mem.yaml`:**

```yaml
llm:
  provider: openai       # auto-detected if omitted
  model: gpt-4o          # provider default if omitted
  intentModel: gpt-4o-mini
  baseUrl: http://localhost:11434  # for ollama
```

## Key Technical Details

- **CommonJS** project (`"type": "commonjs"`) but `@modelcontextprotocol/sdk` is ESM — works via `esModuleInterop: true` and `.js` import extensions
- **Memory storage**: JSON `{memories: IMemoryEntity[]}` in git notes on `refs/notes/mem`
- **Git log parsing**: Uses ASCII separators `\x1e` (record) and `\x1f` (field) — null bytes don't work reliably
- **`cwd` parameter**: Must be threaded through all service calls when operating on a repo that isn't the current working directory
- **Commit triage**: Weighted scoring based on conventional prefixes, decision keywords, diff size, PR merges
- **TypeScript config**: Relaxed strict mode for development (`strict: false` in tsconfig.json)
- **Hook config**: `.git-mem/.git-mem.yaml` loaded by `src/hooks/utils/config.ts`. Never throws — returns defaults on error
- **Hook stdin**: `src/hooks/utils/stdin.ts` reads JSON from stdin. Returns `{}` on TTY or parse error — hooks must never crash
- **EventBus error isolation**: Handler exceptions are caught and returned as failed `IEventResult[]` — one failing handler doesn't block others
- **Hook timeout**: 10s hard limit via `setupShutdown()` — hooks must never hang Claude Code
- Interfaces prefixed with `I` (enforced by ESLint)
- No `any` in production code (ESLint error); relaxed to warn in test files

## Coding Rules

Rules are automatically loaded as context. See `.claude/rules/`:

### Shared Rules (All Languages)
- `clean-architecture.md` - Layer structure, dependency rules, SOLID principles
- `code-quality-rules.md` - TypeScript/ESLint configuration, error prevention
- `git-rules.md` - Commit workflow, PR creation, memory milestones
- `testing-principles.md` - Testing pyramid, mocking strategies
- `memory-rules.md` - Handling session memory


### TypeScript Rules
- `coding-standards.md` - Naming conventions, type safety, async patterns
- `testing.md` - Jest patterns, fixtures, mocking
- `typescript-config-guide.md` - tsconfig settings, strict mode guidance


## Git Workflow

- Branch per ClickUp task, named with task ID (e.g. `GIT-123abc`)
- Use the SKILL .claude/skills/github/SKILL.md for interacting with GitHub
- PR workflow use the skill .claude/skills/pr/SKILL.md
  - Create the PR
  - Wait for 120 seconds to allow for review from coderabbit
  - Address comments directly inline to the comment
  - if a fix is applied, mark the comment as resolved
  - wait for another 120 seconds to allow for review from coderabbit
  - repeat the steps until all comments are resolved
- PRs merge into `main`
- Clean up feature branches after merge
