# git-mem

Your git history is the perfect context for AI.
It just needs to be extracted for agents....

## Why?

Your git history already contains the decisions, conventions, and gotchas that matter — git-mem extracts them and makes them available to Claude automatically.

## How?

When initialized in your repo, git-mem reviews your last (n) commits and extracts knowledge automatically.
Each commit is updated with background AI metadata, which Claude can use to improve its understanding of your codebase.

Every **new** commit is automatically populated with the folowing metadata..

- **AI-Agent:** Claude/Opus-4.5
- **AI-Decision:** JWT over sessions — stateless API, scales horizontally
- **AI-Context:** [pattern/middleware, entity/auth-module]
- **AI-Confidence:** 0.95
- **AI-Memory:** milestone/auth-implementation

Going forward, AI knowledge will be embedded in each commit for future references

---

## Install

```bash
npm install -g git-mem
cd your-repo
git-mem init
```

`init` sets up hooks, MCP config, .gitignore entries, and runs an initial extract from your history.

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
git-mem extract --since 2026-01-01
```

### Surface context for staged changes

```bash
git-mem context
```

## Claude Code Integration

git-mem integrates with [Claude Code](https://docs.anthropic.com/en/docs/claude-code) via lifecycle hooks to give Claude persistent project memory across sessions.

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
| `session-stop` | `SessionStop` | Captures memories from recent commits via `extract` |
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
      "autoExtract": true,
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
| `sessionStop.autoExtract` | `true` | Auto-scan commits for memories |
| `sessionStop.threshold` | `3` | Minimum commit triage score |
| `promptSubmit.enabled` | `false` | Surface context per prompt |
| `promptSubmit.surfaceContext` | `true` | Include memories in prompt context |

## MCP Server

git-mem also ships as an MCP server for tools that support the Model Context Protocol:

```bash
git-mem init  # includes MCP setup
```

This registers `git-mem-mcp` with 4 tools: `remember`, `recall`, `context`, `extract`.

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
│  │  MemoryService  ExtractService         │ │
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

See the [Getting Started Guide](./docs/getting-started.md) for full CLI and MCP setup docs.

## License

MIT
