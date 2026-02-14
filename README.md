# git-mem

Git-native memory layer for AI coding tools. Stores decisions, context, and knowledge directly in git using commit trailers and git notes.

Your git history is the perfect context for AI tools — it just needs to be freed.

## Install

```bash
npm install -g git-mem
```

## Quick Start

### Store a memory

```bash
git-mem remember "Use JWT for auth — decided in sprint 3" --type decision --tags auth,security
```

### Recall memories

```bash
git-mem recall --query "authentication"
```

### Scan git history for knowledge

```bash
git-mem liberate --since 2026-01-01
```

### Surface context for staged changes

```bash
git-mem context
```

## Claude Code Integration

git-mem integrates with [Claude Code](https://docs.anthropic.com/en/docs/claude-code) via lifecycle hooks to give Claude persistent project memory across sessions.

### Setup

```bash
git-mem init-hooks --yes
```

This creates two files:

- `.claude/settings.json` — registers three Claude Code hooks
- `.git-mem.json` — configures hook behavior

If `.claude/settings.json` already exists (e.g. with other tools' hooks), git-mem safely merges its entries without overwriting existing hooks.

### How It Works

```text
Claude Code starts session
  → git-mem hook session-start
  → Loads stored memories into Claude's context

User submits prompt (optional)
  → git-mem hook prompt-submit
  → Surfaces relevant memories for the prompt

Claude Code session ends
  → git-mem hook session-stop
  → Scans commits made during session, extracts new memories
```

### Hooks

| Hook | Event | What it does |
|------|-------|-------------|
| `session-start` | `SessionStart` | Loads stored memories as markdown context |
| `session-stop` | `SessionStop` | Captures memories from recent commits via `liberate` |
| `prompt-submit` | `UserPromptSubmit` | Surfaces relevant memories per prompt (disabled by default) |

### Configuration

Edit `.git-mem.json` to customize hook behavior:

```json
{
  "hooks": {
    "enabled": true,
    "sessionStart": {
      "enabled": true,
      "memoryLimit": 20
    },
    "sessionStop": {
      "enabled": true,
      "autoLiberate": true,
      "threshold": 3
    },
    "promptSubmit": {
      "enabled": false,
      "recordPrompts": false,
      "surfaceContext": true
    }
  }
}
```

| Option | Default | Description |
|--------|---------|-------------|
| `hooks.enabled` | `true` | Master switch for all hooks |
| `sessionStart.enabled` | `true` | Load memories on session start |
| `sessionStart.memoryLimit` | `20` | Max memories to load |
| `sessionStop.enabled` | `true` | Capture memories on session end |
| `sessionStop.autoLiberate` | `true` | Auto-scan commits for memories |
| `sessionStop.threshold` | `3` | Minimum commit triage score |
| `promptSubmit.enabled` | `false` | Surface context per prompt |
| `promptSubmit.surfaceContext` | `true` | Include memories in prompt context |

### Uninstall

```bash
git-mem init-hooks --remove
```

This removes git-mem entries from `.claude/settings.json` (preserving other tools' hooks) and deletes `.git-mem.json`.

## MCP Server

git-mem also ships as an MCP server for tools that support the Model Context Protocol:

```bash
git-mem init-mcp
```

This registers `git-mem-mcp` with 4 tools: `remember`, `recall`, `context`, `liberate`.

## Architecture

```text
┌─────────────────────────────────────────────┐
│  Entry Points                               │
│  ┌─────┐  ┌─────────┐  ┌────────────────┐  │
│  │ CLI │  │ MCP Srv │  │ Claude Hooks   │  │
│  └──┬──┘  └────┬────┘  └───────┬────────┘  │
│     │          │               │            │
│     └──────────┴───────┬───────┘            │
│                        │                    │
│              ┌─────────┴─────────┐          │
│              │   DI Container    │          │
│              │    (awilix)       │          │
│              └─────────┬─────────┘          │
│                        │                    │
│  ┌─────────────────────┴──────────────────┐ │
│  │          Application Layer             │ │
│  │  MemoryService  LiberateService        │ │
│  │  ContextService SessionCaptureService  │ │
│  │  SessionStartHandler PromptSubmitHandler│ │
│  └─────────────────────┬──────────────────┘ │
│                        │                    │
│  ┌─────────────────────┴──────────────────┐ │
│  │          Domain Layer                  │ │
│  │  IMemoryEntity  IMemoryRepository      │ │
│  │  IEventBus  HookEvents  IHookConfig    │ │
│  └────────────────────────────────────────┘ │
│                        │                    │
│  ┌─────────────────────┴──────────────────┐ │
│  │        Infrastructure Layer            │ │
│  │  GitClient  NotesService  EventBus     │ │
│  │  MemoryRepository  HeuristicPatterns   │ │
│  └────────────────────────────────────────┘ │
│                        │                    │
│              ┌─────────┴─────────┐          │
│              │    Git Notes      │          │
│              │ refs/notes/mem    │          │
│              └───────────────────┘          │
└─────────────────────────────────────────────┘
```

## License

MIT
