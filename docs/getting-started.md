# Getting Started

Requires Node.js >= 18 and git.

After install, two binaries are available:
- `git-mem` (also works as `git mem` — git subcommand)
- `git-mem-mcp` (MCP server for AI tools)

## Quick Start

```bash
npm install -g git-mem
cd your-repo
git-mem init
```

`init` walks you through setup:
1. Creates `.claude/settings.json` with Claude Code hooks
2. Creates `.git-mem.json` with hook configuration
3. Creates `.mcp.json` for the MCP server
4. Updates `.gitignore`
5. Extracts knowledge from recent commits (if `ANTHROPIC_API_KEY` is set)

---

## Using Claude?

All of the processes happen automatically through Claude's hook events.

| Hook | What it does |
|------|-------------|
| **SessionStart** | Loads stored memories into Claude's context on startup |
| **Stop** | Extracts knowledge from commits made during the session |
| **UserPromptSubmit** | Surfaces relevant memories per prompt (disabled by default) |

Settings are stored in `.git-mem.json`:

```json
{
  "hooks": {
    "enabled": true,
    "sessionStart": { "enabled": true, "memoryLimit": 20 },
    "sessionStop": { "enabled": true, "autoExtract": true, "threshold": 3 },
    "promptSubmit": { "enabled": false, "recordPrompts": false, "surfaceContext": true }
  }
}
```

---

## How It Works

git-mem stores knowledge in two ways:

### Git Notes (rich JSON)

Memories are stored as JSON in git notes on `refs/notes/mem`. Each commit can have a note containing an array of memory entities:

```text
refs/notes/mem
  └── <commit-sha> → { "memories": [{ id, content, type, confidence, tags, ... }] }
```

Notes are:
- **Version controlled** — visible in `git log --notes=refs/notes/mem`
- **Shareable** — push/pull with `git mem sync`
- **Non-invasive** — doesn't modify commits, branches, or working tree

### Git Trailers (lightweight metadata)

When you `remember` on HEAD, git-mem also writes AI-* trailers directly into the commit message:

```text
AI-Decision: JWT over sessions — stateless API, scales horizontally
AI-Confidence: high
AI-Memory-Id: 3bf31da6-86a6-43cc-a1db-2f99da187107
AI-Tags: auth, architecture
```

Trailers are:
- **Natively queryable** — `git log --grep-reflog` or `git log --trailer`
- **Visible** — show up in `git log`, GitHub, and code review tools
- **Only on new commits** — `extract` writes notes only (no history rewrite)

---

## Not using Claude?

### MCP Tools

The MCP server (`git-mem-mcp`) exposes git-mem to AI tools over stdio:

| Tool | Description |
|------|-------------|
| `git_mem_remember` | Store a memory attached to a commit |
| `git_mem_recall` | Search and retrieve stored memories |
| `git_mem_context` | Find memories relevant to staged changes |
| `git_mem_extract` | Scan commit history and extract patterns as memories |


---

## Prefer CLI Commands?

### init

```bash
git mem init
git mem init -y
```

Options:
- `-y, --yes` — Accept defaults without prompting
- `--hooks` — Install prepare-commit-msg git hook
- `--uninstall-hooks` — Remove the prepare-commit-msg git hook

### remember

Store a memory attached to the current commit.

```bash
git mem remember "JWT chosen over sessions for stateless API" \
  --type decision \
  --tags "auth, architecture" \
  --confidence high
```

Writes to git notes and adds AI-* trailers to HEAD.

Options:
- `-c, --commit <sha>` — Attach to specific commit (default: HEAD)
- `-t, --type <type>` — `decision`, `gotcha`, `convention`, `fact` (default: `fact`)
- `--confidence <level>` — `verified`, `high`, `medium`, `low` (default: `high`)
- `--lifecycle <tier>` — `permanent`, `project`, `session` (default: `project`)
- `--tags <tags>` — Comma-separated tags
- `--no-trailers` — Skip writing AI-* trailers to the commit message

### recall

Search stored memories.

```bash
git mem recall "authentication"
git mem recall --type decision --json
```

Options:
- `-n, --limit <n>` — Max results (default: 10)
- `-t, --type <type>` — Filter by type
- `--since <date>` — Filter by date
- `--json` — Output as JSON

### extract

Scan commit history, score commits by interest, and extract decisions/gotchas/conventions as memories.

```bash
git mem extract --since 2024-01-01 --dry-run
git mem extract --threshold 5 --commit-count 100
git mem extract --enrich --dry-run --commit-count 10
```

Options:
- `--since <date>` — Start date (default: 90 days ago)
- `--commit-count <n>` — Max commits to process
- `--dry-run` — Preview without writing
- `--threshold <n>` — Interest score threshold (default: 3)
- `--enrich` — Enable LLM enrichment (requires `ANTHROPIC_API_KEY`)

### context

Show memories relevant to staged changes.

```bash
git add .
git mem context
```

Options:
- `-n, --limit <n>` — Max results (default: 10)
- `--threshold <n>` — Min relevance score 0-1 (default: 0.1)
- `--json` — Output as JSON

### sync

Push/pull memory refs to/from origin.

```bash
git mem sync          # push + pull
git mem sync --push   # push only
git mem sync --pull   # pull only
```


## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Only for `--enrich` | Anthropic API key for LLM enrichment during extract. Get one at [console.anthropic.com](https://console.anthropic.com/). |

If `--enrich` is used without an API key, git-mem falls back to heuristic extraction only.
