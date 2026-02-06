# git-mem MCP Server

MCP (Model Context Protocol) server that exposes git-mem's memory capabilities to AI coding tools over stdio.

## Setup

### Prerequisites

- git-mem installed globally (`npm install -g git-mem`) or built locally (`npm run build`)
- An MCP-compatible AI tool (Claude Code, Cursor, OpenCode, etc.)

### Configuration

**Option 1: Auto-generate** (recommended)

```bash
git mem init-mcp
```

This creates `.mcp.json` in the current directory, auto-detecting whether git-mem is installed globally or locally.

**Option 2: Manual config**

If git-mem is installed globally, add to `.mcp.json`:

```json
{
  "mcpServers": {
    "git-mem": {
      "command": "git-mem-mcp"
    }
  }
}
```

If using a local build:

```json
{
  "mcpServers": {
    "git-mem": {
      "command": "node",
      "args": ["/absolute/path/to/git-mem/dist/mcp-server.js"]
    }
  }
}
```

### Verify

Restart your AI tool after adding the config. The tools should appear as `git_mem_remember`, `git_mem_recall`, `git_mem_context`, and `git_mem_retrofit`.

## Tools

### `git_mem_remember`

Store a memory (decision, gotcha, convention, fact) attached to a git commit.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `text` | string | yes | The memory content to store |
| `type` | enum | no | `decision`, `gotcha`, `convention`, `fact` (default: `fact`) |
| `commit` | string | no | SHA to attach to (default: HEAD) |
| `confidence` | enum | no | `verified`, `high`, `medium`, `low` (default: `high`) |
| `tags` | string | no | Comma-separated tags |
| `lifecycle` | enum | no | `permanent`, `project`, `session` (default: `project`) |

**Returns:** JSON with `status`, `id`, `content`, `type`, `sha`, `confidence`, `tags`.

### `git_mem_recall`

Search and retrieve memories stored in the repository.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | no | Search text to match against memory content and tags |
| `type` | enum | no | Filter by memory type |
| `limit` | number | no | Max results (default: 10) |
| `since` | string | no | Filter memories created after this date (ISO 8601) |
| `tag` | string | no | Filter by tag |

**Returns:** JSON with `total` and `memories` array (each with `id`, `content`, `type`, `sha`, `confidence`, `tags`, `createdAt`).

### `git_mem_context`

Get memories relevant to currently staged git changes. Useful before committing to surface related decisions, gotchas, and conventions.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `limit` | number | no | Max results (default: 10) |
| `threshold` | number | no | Min relevance score 0-1 (default: 0.1) |

**Requires:** Staged changes (`git add` first).

**Returns:** JSON with `files` (staged files analysed), `totalScanned`, `relevant` count, and `memories` array (each with `id`, `content`, `type`, `score`, `reason`, `tags`).

### `git_mem_retrofit`

Scan commit history, score commits for interest, and extract decisions/gotchas/conventions as memories.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `dry_run` | boolean | no | Preview without writing notes (default: false) |
| `since` | string | no | Start date for scanning (ISO 8601) |
| `max_commits` | number | no | Maximum commits to process |
| `threshold` | number | no | Interest score threshold (default: 3) |

**Returns:** JSON with `dryRun`, `commitsScanned`, `commitsAnnotated`, `factsExtracted`, `durationMs`, and `annotations` array.

## Architecture

```
src/mcp/
├── server.ts          # createServer() — factory that creates McpServer and registers all tools
├── tools/
│   ├── remember.ts    # registerRememberTool()
│   ├── recall.ts      # registerRecallTool()
│   ├── context.ts     # registerContextTool()
│   └── retrofit.ts    # registerRetrofitTool()
└── README.md          # this file
```

**Entry point:** `src/mcp-server.ts` — creates the server via `createServer()`, connects it to `StdioServerTransport`, and listens for JSON-RPC 2.0 messages over stdio.

**Server factory:** `src/mcp/server.ts` — `createServer()` instantiates `McpServer` from `@modelcontextprotocol/sdk` and calls each tool's `register*Tool(server)` function.

**Tool handlers:** Each tool file exports a `register*Tool(server: McpServer)` function that calls `server.tool(name, description, zodSchema, handler)`. Every handler bootstraps a fresh service chain per invocation (no shared state between calls):

```
remember/recall:  NotesService → MemoryRepository → MemoryService
context:          GitClient + NotesService → MemoryRepository → ContextService
retrofit:         GitClient → GitTriageService + NotesService → MemoryRepository → RetrofitService
```

**Transport:** `StdioServerTransport` from `@modelcontextprotocol/sdk/server/stdio.js` — JSON-RPC 2.0 over stdin/stdout. The AI tool spawns `git-mem-mcp` as a child process and communicates via stdio.

## Adding a New Tool

1. Create `src/mcp/tools/<name>.ts` with a `register<Name>Tool(server: McpServer)` function
2. Define the Zod schema for parameters and the async handler
3. Bootstrap services fresh inside the handler (no shared state)
4. Register it in `src/mcp/server.ts` by importing and calling the function in `createServer()`
5. Add tests in `tests/integration/mcp-*.test.ts`

## Testing

MCP-specific tests live in `tests/integration/`:

- `mcp-server.test.ts` — server creation and tool registration
- `mcp-tools.test.ts` — remember + recall tools end-to-end
- `mcp-context.test.ts` — context tool with staged changes
- `mcp-retrofit.test.ts` — retrofit tool with real git history
- `mcp-e2e.test.ts` — full MCP server lifecycle over stdio

Unit test for server creation: `tests/unit/mcp/server.test.ts`

Run MCP tests:

```bash
# All integration tests (includes MCP)
npm run test:integration

# Single MCP test file
node --import tsx --test tests/integration/mcp-tools.test.ts
```
