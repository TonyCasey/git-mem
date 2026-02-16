# Getting Started

Requires Node.js >= 18 and git.

## Quick Start

```bash
npm install -g git-mem
cd your-repo
git-mem init
```

That's it. Every commit now includes AI metadata:

```text
feat: add user authentication

AI-Agent: claude-code
AI-Model: claude-sonnet-4-5-20250929
AI-Decision: JWT over sessions — stateless API, scales horizontally
AI-Context: [pattern/middleware, entity/auth-module]
```

---

## What `init` sets up

1. **Git hooks** — `prepare-commit-msg` and `commit-msg` add AI trailers to every commit
2. **Config** — `.git-mem/.git-mem.yaml` with settings
3. **MCP server** — `.mcp.json` for AI tool integration
4. **Gitignore** — keeps local config out of version control

Two bin commands are available after installation:
- `git-mem` (also works as `git mem` — git subcommand)
- `git-mem-mcp` (MCP server for AI tools)

---

## How It Works

git-mem stores knowledge in two ways:

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

Scans commit history, scores commits by interest, and extract decisions/gotchas/conventions as memories for AI context.

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
- `--enrich` — Enable LLM enrichment (requires an LLM provider API key)

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

### trailers

Inspect AI-* trailers on commits.

```bash
git mem trailers              # show trailers on HEAD
git mem trailers abc123       # show trailers on specific commit
git mem trailers --query AI-Decision  # search across history
git mem trailers --keys       # list all distinct AI-* trailer keys
```

Options:
- `--query <key>` — Search for trailer key across history (e.g. `AI-Decision`)
- `--since <date>` — Filter commits after date
- `--keys` — List all distinct AI-* trailer keys in the repo
- `-n, --limit <n>` — Max commits to search
- `--json` — Output as JSON

---

## Using Claude Code?

If you use Claude Code, git-mem can do more than just add trailers & notes — it can give Claude persistent memory across sessions.

`init` also sets up Claude Code hooks in `.claude/settings.json`:

| Hook | What it does |
|------|-------------|
| **SessionStart** | Loads stored memories into Claude's context on startup |
| **Stop** | Extracts knowledge from commits made during the session |
| **UserPromptSubmit** | Surfaces relevant memories per prompt (disabled by default) |
| **PostCommit** | Records AI agent and model metadata on each commit |
| **CommitMsg** | Analyzes commit message and adds AI-* trailers (with optional LLM enrichment) |

These hooks read the AI trailers from your commits and build a searchable memory layer that Claude can query.

Settings are in `.git-mem/.git-mem.yaml`:

```yaml
hooks:
  enabled: true
  sessionStart:
    enabled: true
    memoryLimit: 20
  sessionStop:
    enabled: true
    autoExtract: true
    threshold: 3
  promptSubmit:
    enabled: false
    surfaceContext: true
  commitMsg:
    enabled: true
    enrich: false          # set true + provide LLM API key for enriched extraction
    enrichTimeout: 8000
  postCommit:
    enabled: true
```


## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | For Anthropic LLM | Anthropic (Claude) API key |
| `OPENAI_API_KEY` | For OpenAI LLM | OpenAI API key (requires `npm install openai`) |
| `GOOGLE_API_KEY` / `GEMINI_API_KEY` | For Gemini LLM | Google Gemini API key (requires `npm install @google/generative-ai`) |
| `OLLAMA_HOST` | For Ollama | Ollama server URL (default: `http://localhost:11434`) |
| `GIT_MEM_LLM_PROVIDER` | No | Force provider: `anthropic`, `openai`, `gemini`, `ollama` |

Only one provider is needed. If `--enrich` is used without any LLM API key, git-mem falls back to heuristic extraction with a warning.

### LLM Configuration

You can also configure the LLM provider in `.git-mem/.git-mem.yaml`:

```yaml
llm:
  provider: openai       # auto-detected from env vars if omitted
  model: gpt-4o          # uses provider default if omitted
  intentModel: gpt-4o-mini
  baseUrl: http://localhost:11434  # for ollama
```
