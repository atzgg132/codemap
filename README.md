# CodeMap

**Agentic codebase onboarding, powered by NeuroLink + Tree-sitter + graph analysis.**

CodeMap scans any repo, builds a dependency graph, ranks critical files, detects patterns, and answers follow-ups via an interactive NeuroLink chat. It covers TypeScript/JavaScript plus Haskell/PureScript (beta).

Built for the NeuroLink Hackathon • November 2025

---

## Requirements
- Node.js 18+ (20+ recommended)
- npm (ships with Node)
- For chat/tool calling: at least one LLM provider key (see **Credentials**)

## Install
```bash
npm install
npm run build
```

## Credentials (for NeuroLink chat/tooling)
Set one (or more) of:
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `GOOGLE_API_KEY` or `VERTEXAI_API_KEY`
- `AZURE_OPENAI_API_KEY`
- `MISTRAL_API_KEY`

Optional:
- `REDIS_URL` if you enable Redis-backed memory in NeuroLink.

## Quickstart
Analyze a repo (non-interactive):
```bash
npm run dev -- analyze /path/to/repo
```
- `-o report.md` to save Markdown, `--json -o analysis.json` for JSON.

Interactive chat with tool-calling (colorful CLI):
```bash
npm run dev -- interactive /path/to/repo
```
Commands in chat: `/help`, `/rerun` (re-run initial analysis), `/exit`.

## What you get
- 📊 **Dependency Graph** with PageRank importance
- 🚪 **Entry Points & Roles** (entry, hub, aggregator, util, leaf)
- 🗂️ **Module Clusters**
- 🏗️ **Pattern Detection** (MVC, Layered, Feature-based, Monorepo, Barrel exports, DDD, Circular deps, Dead code, Tests present, Config heavy)
- 🔍 **Deep File Context** (imports/exports/definitions, cluster, role)

## Supported languages
- ✅ TypeScript / JavaScript (Tree-sitter, TSX aware, re-export + CommonJS handling)
- ✅ Haskell (beta: Tree-sitter with regex fallback; module-name resolution)
- ✅ PureScript (beta: regex + module-name resolution)

## Commands
- `npm run dev -- analyze <repo> [--json] [-o file]`
- `npm run dev -- interactive <repo> [-p "custom prompt"]`
- `npm test` (parser + analysis suites)
- `npm run build`
- MCP manifest: `node dist/mcp/server.js > codemap-mcp.json` (for NeuroLink `addExternalMCPServer`)
- MCP stdio server (experimental): `node dist/mcp/stdioServer.js`
  - Protocol: send line-delimited JSON:
    - `{"id":"1","method":"list_tools"}`
    - `{"id":"2","method":"call_tool","tool":"codemap_analyze_repo","params":{"repoPath":"/path","format":"markdown"}}`
    - `{"id":"3","method":"call_tool","tool":"codemap_file_context","params":{"filePath":"/path/to/file"}}`

## Tests & QA
- Parser coverage across TS/JS/Haskell/PureScript.
- Analysis suite covers graph build, PageRank, entry classification, pattern detection (including circular/dead code), and a CLI smoke test on fixtures.

## Troubleshooting
- Missing/invalid API key: set one of the provider env vars above.
- Network/proxy issues: check connectivity; set your proxy env vars if needed.
- Large Haskell files: parser auto-falls back to regex when Tree-sitter would choke.

## Architecture (high level)
- **Tools:** scanRepo, parseFile(s), buildGraph, rankImportance, findEntryPoints, detectClusters, detectPatterns, getFileContext.
- **Agent:** NeuroLink orchestrates tools; interactive chat routes tool calls automatically.
- **Parsers:** Tree-sitter (TS/TSX/JS/Haskell) + regex fallbacks; module-name resolution for Haskell/PureScript.
- **Graph:** custom builder with import resolution (.ts/.tsx/.js/.jsx/.mjs/.cjs/.purs/.hs/.lhs + module names).

## Roadmap ideas
- Pre-flight provider check in chat mode
- More pattern evidence (top hotspots, largest clusters)
- Additional language adapters and visualization exports
- Full MCP compatibility testing with NeuroLink repo
