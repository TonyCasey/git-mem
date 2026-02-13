# Git Mem

## Store AI knowledge IN each commit.

### Extract from historical commits. 

## Why?

#### We should store information about the AI involvement in each commit.

- What agent?
- What model?
- Knowledge for future agents.

## How?

#### Using built-in git features.. automatically.

### Git Trailers
Metadata key value pairs that exist inside a commit message (visible)

- **AI-Agent:** Claude/Opus-4.5 
- **AI-Decision:** JWT over sessions — stateless API, scales horizontally
- **AI-Context:** [pattern/middleware, entity/auth-module]
- **AI-Confidence:** 0.95
- **AI-Memory:** milestone/auth-implementation

### Git Notes 

Metadata stored alongside commits in a separate refs/notes/mem. (hidden)

The commit SHA never changes. Non-invasive. (used in retro-fitting existing commits)


```aiignore
# Note example

{
      "id": "3bf31da6-86a6-43cc-a1db-2f99da187107",
      "content": "JWT over sessions — stateless API, scales horizontally" ,
      "type": "decision",
      "sha": "631671dbe0f7ef5e7bddec7849f232b3908ceb89",
      "confidence": "high",
      "source": "heuristic-extraction",
      "lifecycle": "project",
      "tags": [
        "extraction",
        "pattern:instead-of"
      ],
      "createdAt": "2026-02-12T23:35:46.153Z",
      "updatedAt": "2026-02-12T23:35:46.153Z"
    }
```

## Automatically?

Yes, the last thing we want is another command to remember.

If you use Claude Code cli, then git-mem uses the hooks behind the scenes to auto-popuplate the trailers & notes. There is nothing for you to do.

If you use other AI cli tools, then you can use the mcp option.

---

## Install

```bash
npm install -g git-mem
cd your-repo
git-mem init
```



For more detailed information, see the [Getting Started Guide](./docs/getting-started.md)
## License

MIT
