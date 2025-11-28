# Contributing to CodeMap

## Prereqs
- Node.js 18+ (20+ recommended)
- npm
- Optional: provider creds for chat/tooling (OPENAI_API_KEY, ANTHROPIC_API_KEY, etc.)

## Setup
```bash
npm install
npm run build
npm test
```

## Commands
- Analyze: `npm run dev -- analyze <repo> [--json] [-o file]`
- Chat: `npm run dev -- interactive <repo>`
- Tests: `npm test`
- Build: `npm run build`
- MCP manifest: `node dist/mcp/server.js > codemap-mcp.json`
- MCP stdio server: `node dist/mcp/stdioServer.js` (test via `node scripts/mcp-test.js --repo <path>`)

## Code guidelines
- TypeScript strict mode is enforced; keep files in `src/`.
- Keep parsers resilient: prefer fallbacks over hard failures; log warnings not crashes.
- Add concise comments only where code isn’t self-explanatory.
- Maintain ASCII in source unless already using Unicode (CLI art is okay).

## Testing
- Parser suite: TS/JS/TSX, Haskell, PureScript fixtures.
- Analysis suite: graph build, PageRank, entry classification, pattern detection, CLI smoke.
- Always run `npm test` before PRs.

## Adding patterns or tools
- Keep pattern detectors pure and fast; include evidence with counts/examples.
- When adding tools, export them via the agent and keep input/output schemas documented.

## Releasing
- Ensure `npm run build` and `npm test` pass.
- Update README/CHANGELOG for user-facing changes.
