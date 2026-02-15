# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **Documentation repositioning** — README and getting-started now lead with AI metadata tracking, memory as "level up"

## [0.4.0] - 2026-02-15

### Added

- **Intent extraction** — PromptSubmitHandler extracts keywords from prompts to surface relevant memories:
  - `IIntentExtractor` interface and `IntentExtractor` service
  - `loadWithQuery` method on `MemoryContextLoader` for targeted recall
  - Configurable via `promptSubmit.extractIntent` in config
- **Commit message bodies** — memory context now includes full commit message bodies, not just subjects
- **YAML configuration** — `.git-mem.yaml` replaces `.git-mem.json`:
  - Config now lives in `.git-mem/` directory
  - Cleaner, more readable format
  - Backwards compatible migration from JSON
- **LLM enrichment in hooks** — commit-msg hook can use LLM to enhance memory extraction:
  - Loads `.env` for `ANTHROPIC_API_KEY`
  - Configurable timeout (default 8s)
- **Smart commit analysis** — commit-msg hook automatically analyzes commits and adds AI trailers:
  - Detects memory type (decision, gotcha, convention, fact) from patterns
  - Infers tags from conventional commit scope and file paths
  - Adds AI-Agent, AI-Model, AI-Confidence, AI-Lifecycle, AI-Memory-Id trailers

### Fixed

- Edge cases in commit-msg hook (empty messages, missing env vars)
- Duplicate Agent/Model trailers prevention
- Hook chaining — all hooks now install by default

## [0.3.0] - 2026-02-12

### Added

- **Claude Code hooks integration** — three lifecycle hooks that give Claude persistent project memory:
  - `session-start` — loads stored memories into Claude's context at session start
  - `session-stop` — captures new memories from commits made during the session
  - `prompt-submit` — surfaces relevant memories per prompt (disabled by default)
- **`git-mem init-hooks`** command — one-command setup for Claude Code hooks
- **Unified `git-mem hook <event>` command** — single entry point for all hook events
- **DI container** (awilix) — centralized dependency injection
- **EventBus** — pub/sub event dispatch with error isolation
- **`.git-mem.json` configuration** — per-project hook settings

### Changed

- CLI commands now resolve services from DI container
- MCP tools now resolve services from DI container

## [0.2.1] - 2026-02-10

### Fixed

- MCP server ESM interop with `@modelcontextprotocol/sdk`

## [0.2.0] - 2026-02-09

### Added

- MCP server (`git-mem-mcp`) with 4 tools: remember, recall, context, extract
- `git-mem init-mcp` command for MCP server configuration
- `git-mem sync` command for syncing memories across remotes

## [0.1.0] - 2026-02-05

### Added

- Initial release
- `git-mem remember` — store memories as git notes
- `git-mem recall` — search and retrieve memories
- `git-mem context` — match staged changes against stored memories
- `git-mem extract` — scan git history, score commits, extract memories
- Clean architecture (Domain → Application → Infrastructure)
- Git notes storage on `refs/notes/mem`
- Heuristic pattern extraction from conventional commits
- Optional LLM enrichment via `--enrich` flag
