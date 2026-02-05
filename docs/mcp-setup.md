# MCP Server Setup

git-mem exposes its tools via the [Model Context Protocol](https://modelcontextprotocol.io/) (MCP), making them available to AI coding tools like Claude Code, Cursor, and OpenCode.

## Quick Start

```bash
# In your project repo:
git mem init-mcp
```

This generates a `.mcp.json` file. If git-mem is globally installed, it uses the `git-mem-mcp` binary directly. Otherwise, it uses `node` with the path to `mcp-server.js`.

## Manual Configuration

### Global Install

If git-mem is installed globally (`npm install -g git-mem`):

```json
{
  "mcpServers": {
    "git-mem": {
      "command": "git-mem-mcp"
    }
  }
}
```

### Local / Development

If running from a local checkout:

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

## Available Tools

| Tool | Description |
|---|---|
| `git_mem_remember` | Store a memory (decision, gotcha, convention, fact) attached to a commit |
| `git_mem_recall` | Search and retrieve stored memories |
| `git_mem_context` | Get memories relevant to currently staged changes |
| `git_mem_retrofit` | Scan commit history and extract patterns as memories |

## Tool Details

### git_mem_remember

Store a memory attached to the current (or specified) commit.

**Parameters:**
- `text` (required) — The memory content
- `type` — `decision`, `gotcha`, `convention`, or `fact` (default: `fact`)
- `commit` — SHA to attach to (default: HEAD)
- `confidence` — `verified`, `high`, `medium`, or `low` (default: `high`)
- `tags` — Comma-separated tags
- `lifecycle` — `permanent`, `project`, or `session` (default: `project`)

### git_mem_recall

Search and retrieve memories.

**Parameters:**
- `query` — Search text to match against content and tags
- `type` — Filter by memory type
- `limit` — Max results (default: 10)
- `since` — Filter by date (ISO 8601)
- `tag` — Filter by tag

### git_mem_context

Get memories relevant to currently staged git changes. Best used before committing.

**Parameters:**
- `limit` — Max results (default: 10)
- `threshold` — Min relevance score 0–1 (default: 0.1)

### git_mem_retrofit

Scan commit history, score commits for interest, and extract patterns.

**Parameters:**
- `dry_run` — Preview without writing (default: false)
- `since` — Start date (ISO 8601)
- `max_commits` — Maximum commits to process
- `threshold` — Interest score threshold (default: 3)

## Verification

After setting up `.mcp.json`, start your AI coding tool in the repo. The git-mem tools should appear in the tool list. You can verify by asking the AI to:

1. Remember a decision: *"Remember that we chose PostgreSQL for the database"*
2. Recall memories: *"What do you remember about the database?"*
3. Check context: *"What memories are relevant to my staged changes?"*
