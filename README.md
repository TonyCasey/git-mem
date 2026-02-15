# git-mem

Track AI contributions in your git history.

## Why?

AI writes code now. Your commits should show when, which agent, and which model.

git-mem adds AI metadata to every commit automatically — no workflow changes, no extra steps.

## How?

Every commit gets AI trailers:

```text
feat: add user authentication

AI-Agent: claude-code
AI-Model: claude-sonnet-4-5-20250929
AI-Decision: JWT over sessions — stateless API, scales horizontally
AI-Context: [pattern/middleware, entity/auth-module]
```

That's it. Your git history now tracks AI contributions.

## Install

```bash
npm install -g git-mem
cd your-repo
git-mem init
```

30 seconds. Done.

## What else?

git-mem also extracts decisions, conventions, and gotchas from your commit history — and makes them available to your AI agent as persistent memory.

Your agent stops re-learning your codebase every session.

```bash
# Extract knowledge from recent commits
git-mem extract

# Query what git-mem knows
git-mem recall "authentication"
```

See the [Getting Started Guide](./docs/getting-started.md) for CLI and MCP setup.

## License

MIT
