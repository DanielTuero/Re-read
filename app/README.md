# Re-read — V1 prototype

The paste-in split-pane app: drop in any text, get its argument map — thesis, supporting
claims, and the buried caveats — each claim clickable to its exact source span. Zero
dependencies (Node 18+ built-in http + fetch).

## Run

```bash
# bash:
GEMINI_API_KEY=... node app/server.mjs

# PowerShell:
$env:GEMINI_API_KEY="..."; node app/server.mjs
```

Then open http://localhost:5173 .

Optional env vars:
- `MODEL` — default `gemini-3.1-flash-lite`. Provider auto-detected (`gemini*` → Google, else
  Anthropic, which reads `ANTHROPIC_API_KEY`).
- `PORT` — default `5173`.

## What it does

1. **Extraction** — one model call turns the pasted text into a claim tree (thesis → supports,
   with `tension` nodes for caveats/contradictions), each carrying a verbatim `source_quote`.
2. **Grounding pass** — pure JS, no model: fuzzy-matches each quote back to character offsets in
   the original (exact → whitespace/case-normalized → first-10-words weak match → unpinned).
   Honest degradation: a quote it can't locate is shown as "source not located", never faked.

Click a claim on the right → its source highlights and scrolls into view on the left.

## What it deliberately skips (per Brainstorm/v1-build-plan.md)

- The fresh-context verification pass (`support` axis) — extraction + grounding only for now.
- Cross-article memory, the logic/contradiction layer, the typed-edge ontology.
- URL fetch / PDF parsing — paste only.

This is the trust-layer-for-one-article wedge, nothing more.
