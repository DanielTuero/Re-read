# Argument Map — V1 Brainstorm

> An AI-native reading layer that turns a dense article into a navigable, source-linked
> structure of claims — not a summary, not a glossary of terms, but the argument itself.
> "Turn the internet from a feed into a map."

---

## The idea in one pass

**What it is:** a tool that takes a dense article and turns it into an *explorable structure
of ideas* instead of a wall of text. You read by navigating claims and following what
supports, qualifies, or contradicts them — rather than scrolling top to bottom.

**The critical distinction (what keeps it from being just another summary):**
- It's **not a summary** — a summary compresses and throws structure away.
- It's **not a glossary of terms** — a cloud of nouns and entities tells you nothing.
- It's the **argument structure**: nodes are the author's *claims*; edges are *typed
  relationships* between them (supports, contradicts, qualifies, pivots-from). Terms and
  entities still exist, but as tags hanging off claims, not as the structure itself.

One-liner: a summary answers *"what does it say."* The map answers *"how does it hang
together — where does this claim come from, what holds it up, what undercuts it."* You
preserve all the structure and hide the volume in folds you can open.

## How it works, mechanically — two layers

1. **Extraction (per article):** you don't read a graph *out* of the LLM (it doesn't have a
   readable one). You constrain its *output* into JSON — nodes + typed edges. To find the
   "main stuff," over-extract every claim, link them, then surface importance. The spine
   surfaces first; the rest folds underneath.
2. **Aggregation (across articles) — the real moat:** every concept becomes an embedding (a
   point in meaning-space). New ideas that land near existing ones get *merged*, so the
   system can say "you've seen this before," "this connects to last week's article," "this
   source contradicts one you saved." This memory layer is what compounds and is hard to copy.

## The honest risks
- The pattern has a name (GraphRAG) — plumbing is known, so the *concept* won't be the moat;
  execution will.
- Quality lives in two unglamorous tuning problems: the **merge threshold** (too loose →
  mush; too strict → duplicates, the magic never fires) and **concept granularity**
  (inconsistent node sizing makes the cross-article graph incoherent).
- For complex articles: capturing **long-range links** (a caveat in paragraph 30 modifying a
  claim in paragraph 3) and inferring **implicit rhetorical roles** (the thesis / counter /
  pivot the author never labels) — both the hard part and the differentiator.
- The graph gets noisy fast; managing density (progressive disclosure, focus mode) is core
  product work, not polish.

---

## V1 — the sharp cut

The full research vision (constrained decoding via FSM grammars, RST discourse parsing,
multi-agent dialectical debate, PageRank centrality, cross-document entity resolution,
hierarchical coreference) is the **5-year destination**, not the first build. For V1, cut
deeper than even "Article X-Ray":

### What you DON'T need for a single article
- **No PageRank.** Centrality math earns its keep on huge/aggregated graphs. For one article,
  a frontier model just tells you which claim is the thesis — more accurately than eigenvector
  centrality over a noisy 30-node extraction. (PageRank is a v3 tool for the cross-doc graph.)
- **No constrained decoding / FSM grammars.** Solves a 2023 problem. A current frontier model
  with structured outputs / tool-calling returns schema-valid JSON reliably enough; add one
  retry-on-invalid and you're done.
- **No multi-agent debate.** One strong model + a single "verify each claim against the
  source" pass catches most hallucinated edges. Debate is a quality optimization for later.

### The reframe: provenance IS the product, not the tree
The novel, defensible thing in V1 is not "AI extracts claims" (every summarizer does that).
It's that *every claim is a live, clickable thing that snaps you to the exact sentence in the
original that supports it, and visibly flags where the author hedged or contradicted himself.*
That's what a summary structurally cannot do, and what converts a skeptical lawyer/analyst
from "I don't trust AI" to "I can verify this in one click." Provenance isn't a trust feature
bolted on — it is the product. The claim-tree is just scaffolding that hangs off it.

**V1 in one line:** *"Paste an article → get a source-linked claim outline you can audit in
one click."*

### Minimum viable structure: two relationships, not six
1. **Hierarchy** (this claim supports / is a sub-point of that one) → the collapsible outline.
2. **Tension** (caveat / contradiction / hedge) → a single inline flag.

Collapse "qualifies vs contradicts vs pivots-from" into one "⚠ tension here" marker. The
emotional payoff is "it shows you what a summary hides" — and what summaries hide is the
hedge. You need exactly one bit that says "the author complicated this here." Fine-grained
edge ontology is v2.

### The one screen — split pane
- **Left:** original article text, untouched, scrollable.
- **Right:** the claim outline — thesis at top, supporting claims nested, each collapsible,
  tension claims flagged inline.
- **Interaction:** click a claim (right) → left scrolls to + highlights the exact source span.
  Hover a source span (left) → its claim lights up (right).

No node graph, no canvas, no force-directed anything. The "map" feeling comes from
collapse/expand + the left-right binding. (A pretty graph tangles instantly; the boring
outline scales.)

### The one hard engineering bit: span grounding
The tricky part of V1 isn't extraction — it's making "click claim → highlight exact source"
reliable. The model returns a claim + a quoted source snippet; you must match that snippet
back to a real character range. Models paraphrase, drop punctuation, quote across paragraph
breaks — naive string-matching fails ~20% of the time, and a failed highlight is exactly the
moment trust dies. Fuzzy-match (normalized whitespace, token-overlap windowing); if confidence
is low, **don't fake it** — show the claim marked "source not pinned." Honest degradation
beats a wrong highlight.

### Bank the moat from day one
Don't *surface* cross-article features in V1, but **silently embed and store every extracted
claim** from day one anyway. Cost is trivial, no UI needed. The day you have 50 users who've
each X-rayed 30 articles, you already have the corpus to switch on "this contradicts something
you read last week" — instead of starting the moat from zero.

### The real risk V1 must test (+ the metric)
The unvalidated assumption is **human, not ML**: *does reading an article as a source-linked
claim tree genuinely make a person understand it faster / more completely than just reading
it?* Instrument it: 10 people, 5 dense articles, measure comprehension + time vs. a control
group reading normally. If X-ray readers aren't meaningfully faster or more accurate, no
amount of RST parsing saves the idea — learned in a weekend instead of after building the
whole architecture.

---

## V1 spec, compressed

| | In V1 | Deferred |
|---|---|---|
| Input | paste text (one article) | extension, URL fetch, PDFs |
| Structure | thesis → supporting claims, 1–2 levels | full RST trees, pivots |
| Relationships | supports + one "tension" flag | typed edge ontology |
| Importance | model labels the thesis directly | PageRank / centrality |
| Reliability | structured output + 1 verify pass | constrained decoding, multi-agent debate |
| UI | split-pane: article ↔ source-linked outline | node graph, canvas |
| Trust | click-to-source on every claim | "reflexive lens" / confidence metadata |
| Memory | embed + store silently, no UI | cross-article contradiction surfacing |
| Goal | understand *one* article faster, verifiably | the knowledge graph of everything |

**Headline:** the winning V1 isn't even "Article X-Ray" — it's **"a trust layer for one
article"**: thesis, supporting claims, the buried caveats, and a one-click proof for every
single one. Everything in the full research report is real and correct as the long-term
picture; none of it should touch the first build except as the schema you quietly design toward.

---

## Target users
Researchers, analysts, investors, students, lawyers, consultants, policy/journalism people —
anyone who reads dense articles, essays, research papers, and financial/policy reports and
needs to *actually understand* them (not books yet — slower, more literary, more ambiguous).

## Open questions to sit with
- How aggressive is the centrality/spine cut in the first view? Too thin → useless; too dense
  → soup. This single threshold decides "insight" vs "soup" more than anything else.
- Where exactly does the merge threshold sit (v2)?
- How do you force consistent concept granularity across articles (v2)?

## Next step options
1. **Build the real paste-in prototype** — split-pane, source-linked outline, wired to a real
   model call. Highest-signal path; you can throw real articles at it.
2. **Pressure-test span grounding first** — the one piece that decides whether V1 feels
   trustworthy or janky.
