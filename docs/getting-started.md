# Getting Started


Requires Node.js >= 18 and git.

After install, two binaries are available:
- `git-mem` (also works as `git mem` — git subcommand)
- `git-mem-mcp` (MCP server for AI tools)

## CLI Usage

### Store a memory

```bash
git mem remember "JWT chosen over sessions for stateless API" \
  --type decision \
  --tags "auth, architecture" \
  --confidence high
```

Options:
- `-c, --commit <sha>` — Attach to specific commit (default: HEAD)
- `-t, --type <type>` — `decision`, `gotcha`, `convention`, `fact` (default: `fact`)
- `--confidence <level>` — `verified`, `high`, `medium`, `low` (default: `high`)
- `--lifecycle <tier>` — `permanent`, `project`, `session` (default: `project`)
- `--tags <tags>` — Comma-separated tags

### Search memories

```bash
git mem recall "authentication"
git mem recall --type decision --json
```

Options:
- `-n, --limit <n>` — Max results (default: 10)
- `-t, --type <type>` — Filter by type
- `--since <date>` — Filter by date
- `--json` — Output as JSON

### Show memories relevant to staged changes

```bash
git add .
git mem context
```

Extracts keywords from staged file paths and diff content, matches against stored memories, and returns scored results.

Options:
- `-n, --limit <n>` — Max results (default: 10)
- `--threshold <n>` — Min relevance score 0-1 (default: 0.1)
- `--json` — Output as JSON

### Extract knowledge from history

```bash
git mem extract --since 2024-01-01 --dry-run
git mem extract --threshold 5 --max 100
git mem extract --enrich --dry-run --max 10
```

Scores commits by interest (conventional prefixes, decision keywords, diff size, PR merges), then extracts decisions/gotchas/conventions using heuristic patterns. Optionally enrich with LLM analysis for deeper insights.

Options:
- `--since <date>` — Start date (default: 90 days ago)
- `--max <n>` — Max commits to process
- `--dry-run` — Preview without writing
- `--threshold <n>` — Interest score threshold (default: 3)
- `--enrich` — Enable LLM enrichment (requires `ANTHROPIC_API_KEY`, see [Environment Variables](#environment-variables))

### Sync memories with remote

```bash
git mem sync          # push + pull
git mem sync --push   # push only
git mem sync --pull   # pull only
```

Pushes/pulls `refs/notes/mem` to/from origin.

### Generate MCP config

```bash
git mem init-mcp
```

Creates a `.mcp.json` in the current directory. Auto-detects global vs local install.

Options:
- `--force` — Overwrite existing `.mcp.json`
- `--global` — Force use of globally installed binary

## MCP Server Setup

The MCP server exposes git-mem's capabilities to AI coding tools (Claude Code, Cursor, etc.) over stdio using the [Model Context Protocol](https://modelcontextprotocol.io).

### Quick setup

```bash
# If git-mem is installed globally:
git mem init-mcp
```

This generates `.mcp.json`:

```json
{
  "mcpServers": {
    "git-mem": {
      "command": "git-mem-mcp"
    }
  }
}
```

### Manual setup

Add to your `.mcp.json` (or the equivalent config for your AI tool):

```json
{
  "mcpServers": {
    "git-mem": {
      "command": "git-mem-mcp"
    }
  }
}
```

Or if using a local (non-global) install:

```json
{
  "mcpServers": {
    "git-mem": {
      "command": "node",
      "args": ["/path/to/git-mem/dist/mcp-server.js"]
    }
  }
}
```

### MCP Tools

| Tool | Description |
|------|-------------|
| `git_mem_remember` | Store a memory (decision, gotcha, convention, fact) attached to a commit |
| `git_mem_recall` | Search and retrieve stored memories |
| `git_mem_context` | Find memories relevant to currently staged changes |
| `git_mem_extract` | Scan commit history, score commits, and extract patterns as memories |

## How It Works

### Memory storage

Memories are stored as JSON in git notes on `refs/notes/mem`. Each commit can have a note containing an array of memory entities:

```text
refs/notes/mem
  └── <commit-sha> → { "memories": [ { id, content, type, confidence, tags, ... } ] }
```

This means memories are:
- **Version controlled** — stored in git, visible in `git log --notes=refs/notes/mem`
- **Shareable** — push/pull with `git mem sync`
- **Non-invasive** — doesn't modify commits, branches, or working tree

### How `remember` stores data

```text
┌──────────────────┐
│  git mem remember │
│  "Use JWT auth"   │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐     ┌─────────────────────────┐
│  MemoryService   │────▶│  MemoryRepository       │
│  (build entity)  │     │  (read existing notes,  │
└──────────────────┘     │   append, write back)   │
                         └────────┬────────────────┘
                                  │
                                  ▼
                         ┌─────────────────────────┐
                         │  NotesService            │
                         │  git notes --ref=        │
                         │    refs/notes/mem        │
                         │    add -f -m <json>      │
                         │    <commit-sha>          │
                         └─────────────────────────┘
                                  │
                                  ▼
                         ┌─────────────────────────┐
                         │  Git Object Store        │
                         │                          │
                         │  commit abc123           │
                         │    └── note (refs/notes/ │
                         │         mem): {memories: │
                         │         [{id, content,   │
                         │           type, ...}]}   │
                         └─────────────────────────┘
```

### How `extract` captures knowledge from history

```text
┌──────────────────────┐
│  git mem extract      │
└────────┬─────────────┘
         │
         ▼
┌──────────────────────┐     ┌─────────────────────────┐
│  ExtractService      │────▶│  GitTriageService        │
│                      │     │  (score each commit by   │
│                      │     │   conventional prefixes, │
│                      │     │   decision keywords,     │
│                      │     │   diff size, PR merges)  │
│                      │     └────────┬────────────────┘
│                      │              │
│                      │              ▼
│                      │     ┌─────────────────────────┐
│                      │────▶│  HeuristicPatterns       │
│                      │     │  (regex extraction of    │
│                      │     │   decisions, gotchas,    │
│                      │     │   conventions from       │
│                      │     │   commit messages)       │
│                      │     └────────┬────────────────┘
│                      │              │
│                      │              ▼
│                      │     ┌─────────────────────────┐
│                      │────▶│  MemoryRepository        │
│                      │     │  (write extracted facts  │
└──────────────────────┘     │   as notes on commits)   │
                             └─────────────────────────┘
```

### How AI tools use git-mem via MCP

```text
┌───────────────────┐
│  AI Coding Tool   │
│  (Claude Code,    │
│   Cursor, etc.)   │
└────────┬──────────┘
         │ JSON-RPC 2.0 over stdio
         │
         ▼
┌───────────────────┐
│  git-mem-mcp      │
│  (MCP Server)     │
│                   │
│  Tools:           │
│  ┌──────────────┐ │
│  │ remember     │ │
│  │ recall       │ │
│  │ context      │ │
│  │ extract      │ │
│  └──────────────┘ │
└────────┬──────────┘
         │ Spawns fresh service
         │ instances per call
         ▼
┌───────────────────┐
│  Application      │
│  Services         │
│  (MemoryService,  │
│   ContextService, │
│   ExtractService) │
└────────┬──────────┘
         │
         ▼
┌───────────────────┐
│  Git CLI          │
│  (git notes,      │
│   git log, etc.)  │
└────────┬──────────┘
         │
         ▼
┌───────────────────┐
│  .git/            │
│  refs/notes/mem   │
│  (memory data)    │
└───────────────────┘
```

## Environment Variables

| Variable            | Required | Description                                                                                                              |
|---------------------|----------|--------------------------------------------------------------------------------------------------------------------------|
| `ANTHROPIC_API_KEY` | Only for `--enrich` | Anthropic API key for LLM enrichment during extract. Get one at [console.anthropic.com](https://console.anthropic.com/). |

Copy `.env.example` to `.env` and fill in values:

```bash
cp .env.example .env
```

If `--enrich` is used without an API key, git-mem prints a warning and falls back to heuristic extraction only.

## Development

```bash
git clone https://github.com/TonyCasey/git-mem.git
cd git-mem
npm install
npm run build
```

```bash
npm test                 # all tests
npm run test:unit        # unit tests only
npm run test:integration # integration tests only

# Run a single test:
node --import tsx --test tests/unit/application/services/MemoryService.test.ts
```

```bash
# Rebuild and reinstall globally (for manual testing):
./scripts/reinstall-global.sh
```
