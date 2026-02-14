# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2026-02-12

### Added

- **Claude Code hooks integration** — three lifecycle hooks that give Claude persistent project memory:
  - `session-start` — loads stored memories into Claude's context at session start
  - `session-stop` — captures new memories from commits made during the session
  - `prompt-submit` — surfaces relevant memories per prompt (disabled by default)
- **`git-mem init-hooks`** command — one-command setup for Claude Code hooks:
  - Creates `.claude/settings.json` with hook registrations
  - Creates `.git-mem.json` with default configuration
  - Safe merge preserves other tools' hooks in `settings.json`
  - `--remove` flag cleanly uninstalls git-mem hooks only
  - `--scope user` for `~/.claude/settings.json` (user-wide)
- **Unified `git-mem hook <event>` command** — single entry point for all hook events, reads JSON from stdin, routes to handlers via EventBus
- **DI container** (awilix) — replaces manual service instantiation across CLI, MCP, and hooks with centralized dependency injection
- **EventBus** — pub/sub event dispatch with error isolation; failing handlers don't block other handlers or crash the hook
- **`.git-mem.json` configuration** — per-project hook settings (enable/disable events, memory limits, auto-liberate threshold)
- **Hook handlers:**
  - `SessionStartHandler` — loads and formats memories as markdown context
  - `SessionStopHandler` — delegates to `SessionCaptureService` for 24h rolling commit scan
  - `PromptSubmitHandler` — loads relevant memories for prompt context
- **Hook services:**
  - `MemoryContextLoader` — loads memories with configurable limits
  - `ContextFormatter` — formats memories as structured markdown
  - `SessionCaptureService` — scans recent commits via `LiberateService`, extracts memories

### Changed

- CLI commands now resolve services from DI container instead of manual instantiation
- MCP tools now resolve services from DI container

## [0.2.1] - 2026-02-10

### Fixed

- MCP server ESM interop with `@modelcontextprotocol/sdk`

## [0.2.0] - 2026-02-09

### Added

- MCP server (`git-mem-mcp`) with 4 tools: remember, recall, context, liberate
- `git-mem init-mcp` command for MCP server configuration
- `git-mem sync` command for syncing memories across remotes

## [0.1.0] - 2026-02-05

### Added

- Initial release
- `git-mem remember` — store memories as git notes
- `git-mem recall` — search and retrieve memories
- `git-mem context` — match staged changes against stored memories
- `git-mem liberate` — scan git history, score commits, extract memories
- Clean architecture (Domain → Application → Infrastructure)
- Git notes storage on `refs/notes/mem`
- Heuristic pattern extraction from conventional commits
- Optional LLM enrichment via `--enrich` flag
