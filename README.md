# Git Mem

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

See the [Getting Started Guide](./docs/getting-started.md) for full CLI and MCP setup docs.

## License

MIT
# Test
