# V1 Build Plan — The Paste-In Prototype

> The bridge between brainstorm and code. This is the thing to build first: a split-pane,
> source-linked claim outline wired to a real model call. Testable in days.
>
> Companion docs: [argument-map-v1.md](argument-map-v1.md) (why this scope),
> [linking-architecture.md](linking-architecture.md) (where it's heading).

**The sentence to keep obsessing over:**
*A summary tells you what the article says. Re-read shows you what the article depends on.*

That's not marketing — it's the data model in seven words. A summary gives you the conclusion;
Re-read gives you the load-bearing structure under it. "What it depends on" is exactly the
premise/support chain you walk when you trace an argument to where it breaks.

---

## The shape

### Left pane
- Paste an article.
- Render paragraphs with **stable character offsets** (this is what makes grounding possible — do
  it first, get it right).
- Highlight the source span when a claim is selected.

### Right pane
- **Thesis** at the top.
- 1–2 levels of supporting claims, nested and collapsible.
- One **tension chip** per claim for caveat / contradiction / hedge.
- Each claim shows its trust state (see the two-axis model below) — and a claim whose source
  couldn't be located renders as visibly second-class ("claimed, source not located"), never
  silently shown as if verified. **Honest degradation is the trust mechanic.**

### Backend (two model calls + a grounding pass)
1. **Extraction call** — one structured-output call returns claims, parent-child support links,
   the source quote for each, and the tension flag.
2. **Grounding pass** — fuzzy-match each source quote back to actual character ranges in the
   rendered text (normalized whitespace, token-overlap windowing). Low confidence → don't fake
   it, mark unpinned.
3. **Verification call** — a *fresh, narrow* call: "Here is a claim and a span. Does the span
   support it — yes / partially / no?" No memory of having generated the claim. Single-pass
   self-review is sycophantic; a clean-context verifier is dramatically more honest. This is the
   cheap version of the feasibility report's multi-agent debate, and it's what stops aggressive
   over-extraction from producing a confident graph of nonsense.
4. **Silent storage** — embed and store every claim from day one. Do **not** expose any
   cross-article feature yet. You're pre-loading the graph so the linking magic fires sooner once
   it has mass.

---

## Schema

Two corrections over the naive version, both forward-compatible with the linking architecture:

**1. `tension` is an edge, not a role.** Thesis/claim describe what a node *is*; tension describes
how it *attaches* to its parent. Keeping them separate means a caveat can itself be a sub-claim
with support under it — and `relation_to_parent` is the exact seam where the three defeaters
(rebut / undermine / undercut) slot in later, with no migration.

**2. Grounding and support are two independent axes.** Conflating them into one "confidence"
number is how trust dies.
- **grounding** = did we *locate* the source text? (the highlight works)
- **support** = does that located text actually *back* the claim? (the claim is honest)

The dangerous cell is **pinned + unsupported**: the highlight lands perfectly so the user trusts
it, but the model over-read the span. Confident-and-wrong beats visibly-uncertain at destroying
credibility — so a pinned-but-unsupported claim must look *more* flagged, not less.

```ts
type Claim = {
  id: string
  doc_id: string
  text: string
  role: "thesis" | "claim"                       // what it IS
  parent_id?: string
  relation_to_parent?: "supports" | "tension"    // how it ATTACHES
                                                 // v2: tension -> rebut | undermine | undercut
  source_quote: string
  source_start?: number                          // absent when not pinned
  source_end?: number
  grounding: "pinned" | "weak" | "unpinned"      // did we FIND the span?
  support: "supported" | "weak" | "unsupported"  // does the span BACK the claim?
}

type Doc = {
  id: string
  title?: string
  text: string                                   // rendered with stable offsets
  created_at: string
}
```

(Embeddings are stored alongside each claim — `pgvector` or equivalent — but are not part of the
UI contract in V1.)

---

## Deliberately deferred

| Deferred | Why |
|----------|-----|
| Cross-article links, contradiction surfacing | Needs graph mass; V1 must stand alone on single-article value. Store silently now. |
| The three defeaters (rebut/undermine/undercut) | V1 collapses them to one "tension" chip. Schema already leaves room. |
| PageRank / centrality | A single article's thesis is labeled directly by the model; centrality is for the aggregated graph. |
| Constrained decoding (FSM grammars), multi-agent debate | Frontier structured output + one fresh verifier call is enough for V1. |
| Node graph / canvas | Text-first split-pane only. A pretty graph tangles instantly; the outline scales. |
| Extension, URL fetch, PDFs | Paste-in is the cleanest test of the core question. |

---

## What V1 exists to answer

The unvalidated assumption is **human, not ML**: *does reading an article as a source-linked claim
tree genuinely make a person understand it faster / more completely than just reading it?*

Test it: ~10 people, 5 dense articles, measure comprehension + time vs. a control group reading
normally. If the X-ray readers aren't meaningfully faster or more accurate, no amount of
architecture saves the idea — and you learned it in a weekend.

## Known weak spot to expect

**Tension recall will be the weakest extraction.** Theses and support claims are easy; the buried
hedge in paragraph 30 is subtle, and the one chip you're most excited about (the differentiator —
"shows what a summary hides") is the one that'll need the most prompt iteration. Budget for it.
