# Linking Architecture — How Re-read Actually Connects Things

> This is the heart of the system. Everything else (extraction, UI, provenance) is plumbing.
> The invention is the linking: following logical chains across what you've read and surfacing
> contradictions that neither source stated on its own.
>
> Companion docs: [argument-map-v1.md](argument-map-v1.md) (the first build),
> [feasibility-report.md](feasibility-report.md) (the long-horizon architecture).

---

## The core principle

**Concepts *find*; logic *decides*.**

Linking is not one problem. It's two layers with different jobs:

1. A cheap **concept layer** that answers *"what might this new claim touch?"* — retrieval.
2. An expensive **logic layer** that answers *"and how, exactly — does it support, depend on,
   or break it?"* — adjudication.

The system shifts from **association** ("these are about the same topic") to **inference**
("this claim, followed to its consequences, is incompatible with that one"). That shift is what
catches contradictions neither article states — the ones that only emerge when you trace what
each claim *implies* and watch the chains collide. This is the dialectical tradition (Aristotle's
*Topics*, Socratic cross-examination), not the summarizing one.

---

## Layer 1 — the concept layer (retrieval / the join key)

Two node types, kept strictly separate:

- **Claim nodes** — document-specific, immutable, welded to their exact source span (the
  provenance/trust layer). These never merge. They are the leaves.
- **Concept nodes** — canonical, abstract, stable. The **join keys**. Many claims from many
  articles hang off one concept.

Cross-document claims link **through a shared concept**, never directly claim-to-claim. The
concept is the hub the connection travels through, which makes every link explainable and
clickable.

### Attaching a claim to a concept (on ingest)

The key principle: **embeddings find candidates; they do not decide links.** Trying to make
cosine similarity *be* the linker with a magic threshold is the trap behind the whole
"merge threshold too loose / too strict" agony. The fix is retrieve-then-adjudicate:

1. Embed the new claim.
2. Vector-search existing **concept** nodes → top ~10 candidates (cheap, high-recall, fuzzy on
   purpose).
3. An LLM adjudicates: is this claim about an existing concept, a more *specific child* of one,
   or a genuinely new concept?
4. Attach accordingly — link to the concept, mint a child concept, or create a new one.

You never set a similarity threshold. You ask a judge "same, child, or different?" with the text
in front of it. The embedding's only job was to avoid comparing against all N concepts. Gate by
cost: similarity > ~0.95 → auto-attach; mid-range → adjudicate; below a floor → new concept.

### Stance (what makes "agrees / disagrees" possible at all)

Each `claim --ABOUT--> concept` edge carries a **stance**: does the claim *assert*, *deny*,
*qualify*, or stay *neutral* on the concept?

- same concept + opposite stance → candidate **contradiction**
- same concept + same stance → candidate **corroboration**

Stance + concept is the cheap trigger. It tells the system *where to look* for a logical
interaction — it does not itself decide the link. That's Layer 2's job.

---

## Layer 2 — the logic layer (inference / dialectic)

On the small candidate set Layer 1 surfaces, claims are treated as **propositions** (things that
can be true or false, that serve as premises or conclusions), and the edges become **inferential**.

### The edge types that matter

- `PREMISE_OF` / `ENTAILS` — A, therefore B. The forward chain.
- `ASSUMES` — B silently rests on an unstated premise A. (The buried assumption a summary loses.)
- The three ways one claim attacks another — the grammar of disagreement:

| Move | Greek shape | What it attacks |
|------|-------------|-----------------|
| **Rebut** | counter-thesis | the *conclusion* — "the opposite is true," with its own chain |
| **Undermine** | deny the premise | a *premise* the conclusion rests on |
| **Undercut** | deny the inference | the *link* — "those premises don't actually get you there" |

The system never just says "these disagree." It says *"this **undermines** premise 2 of that,"*
or *"this **rebuts** that but doesn't touch its premises."* That tells the user exactly where the
argument is load-bearing and where to push.

### Defeasible, not deductive (an honesty constraint)

Do **not** build a theorem prover. Real article-arguments are defeasible — "this *supports* that,
unless." Pretending essays have deductive certainty manufactures fake contradictions and kills
trust. (It's also the more authentically Greek move: the dialectical tradition reasoned about the
*probable and contestable*, not only the syllogism.) So:

- Edges carry **strength** (strongly / weakly supports, defeats), rendered honestly so a weak
  "supports" never masquerades as proof.
- A contradiction is "these can't comfortably both stand," not "P ∧ ¬P, QED."
- Chains stay **short** (1–2 hops); the user extends them deliberately.
- Every inference edge **must cite the source text** that licenses it — no ungrounded links.
- The system proposes the chain and the collision; **the human ratifies the break.**

---

## A contradiction playing out as a chain (worked example)

Maya is a VC doing diligence on AI dev-tool startups. She has X-rayed an essay that establishes:

- **P1:** "A senior's speed comes from holding the whole codebase in their head."
- **P2:** "AI suggestions force you to stop and read unfamiliar generated code."
- ∴ **C1:** *"For seniors, AI tools interrupt the very thing that makes them fast."* (P1 + P2 → C1)

Weeks later a founder's post asserts, flatly:

- **C2:** "Our tool makes senior engineers dramatically faster." ( = ¬C1 )

A dumb tool says: *"both about senior productivity, opposite stance — conflict."* True but
shallow. The logical version **walks it**:

> C2 **rebuts** C1. But C1 rests on P1 and P2 — and the founder contests **neither**. To accept
> C2, one of those premises must fail.

That hands Maya the exact attack surface: the founder's claim only survives if "seniors think in
whole-codebase models" (P1) or "AI forces context-switching" (P2) is false. A precise diligence
question instead of a vague unease.

Then the **reductio**, enforced on her own knowledge base. The moment she saves the founder's
claim, her graph entails *both C1 and ¬C1*:

> Your saved sources now imply both "AI slows seniors" and "AI speeds seniors." These can't both
> stand. The fork is P1/P2 vs. C2 — pick where the chain breaks.

She isn't told the answer. She's shown that her accumulated beliefs have become inconsistent and
*exactly which joint is under tension* — what a good Socratic interlocutor does to you.

The killer case is when this is **derived, not stated**: Source A never mentions the founder, the
founder never mentions A, and the contradiction lives a hop or two down each chain at C1/C2. No
human reading them weeks apart would catch it. The graph does, because it materializes each
claim's shallow entailment closure and checks for collisions at the endpoints.

---

## "Don't expound everything" — thread it, don't dump it

A hard UI constraint, not a nicety. The graph may hold thousands of propositions. **You never
show them.** The user *walks one chain at a time*, Socratically:

- Land on a claim. You see *only* that claim.
- Ask **"why?"** → reveal one hop down: its direct premises (including buried `ASSUMES` ones).
- Ask **"so what?"** → one hop up: what it entails.
- Keep pulling — tracing a single inferential thread with your finger, like reading a proof line
  by line. Never the whole board.

Contradictions are not decoration sitting in a hairball. They **announce themselves at the
collision point**: you're walking a chain, you reach a node whose implication clashes with another
chain you've saved, and *there* — inline, only then — the two chains surface side by side at the
exact proposition where they fork. (On ingest, a fresh collision can push a single alert: "this
breaks a chain you believed.") Either way the user sees **one contradiction and the two threads
feeding it**, never everything at once.

The discipline: **reveal along the line of reasoning the user is actually following, and nowhere
else.**

---

## The user experience over time

The abstract machinery shows up to the user as three plain experiences, each always backed by a
one-click jump to the original words:

1. **Understand this fast, and trust it.** (single-article X-ray + provenance — works on day one)
2. **This connects to what I know.** (corroboration through shared concepts — fires as the graph
   gains mass, ~article 20)
3. **This contradicts what I know — and here's the chain.** (the dialectic — the moment it earns
   its keep)

Texture to handle honestly:

- **Early on it feels sparse, correctly.** Single-article value carries the cold start while the
  graph fills. The linking is an earned reward, not a day-one promise. (Embed and store every
  claim silently from day one so the magic fires sooner.)
- **It will sometimes link wrongly or miss a link.** The map must let the user **fix it** — merge
  concepts, sever a bad link, mark "not the same," reject a fabricated inference. Those
  corrections retrain *their* graph toward *their* mental model, so it becomes a genuine second
  brain rather than a generic tool.
- **What she'd tell a colleague** is not "it summarizes articles." It's *"it remembers everything
  I read and tells me when a new thing agrees or disagrees with what I already know — and proves
  it."*

---

## Cost model

You cannot logic-check every pair among thousands of claims. The two layers divide labor:

- **Concept layer (cheap):** new claim → attach to concept → fetch the handful of claims on that
  concept and its parent/child concepts. Candidate set retrieved by embedding. Pennies.
- **Logic layer (expensive, tiny input):** LLM adjudicates *only* those candidates
  (entail / premise-of / rebut / undermine / undercut / independent) and checks whether the new
  claim's shallow implications collide. You pay for reasoning only on the ~5 things that could
  actually interact.

## Storage

Postgres does all of it early — no graph DB needed:

- `pgvector` for claim and concept embeddings (candidate retrieval).
- Relational tables for nodes and a typed `edges` table
  (`from_id, to_id, type, stance, strength, confidence, source_span`).
- Traversals at this scale are indexed joins. Graduate to a real graph DB only when traversal
  depth/perf actually hurts — a good problem you won't have for a long time.

## The hard parts, named

- **Multi-hop validity is where LLMs fabricate.** Mitigation: short chains, every link cites
  licensing source text, honest strength rendering, human ratifies the break.
- **Concept bloat / the starburst node.** A concept like "AI" accretes everything and links all to
  all. Needs a maintenance pass: detect overloaded concepts, LLM splits them, re-route `ABOUT`
  edges.
- **Adjudication is the cost center.** Similarity gating (auto-attach / adjudicate / new) keeps it
  affordable; without it the economics break.
- **Cold start.** Worthless until the graph has mass — so V1 must stand alone on single-article
  value.
- **Concept-identity judgment ("same vs. child vs. different") is where all the quality lives** —
  a prompt + eval loop tuned over a long time. This is the actual moat and the actual risk.

---

## One-line summary

**Concepts tell you what might be related; logic tells you how — and a contradiction isn't a flag,
it's two chains of reasoning that you watch collide at the exact premise where they're
incompatible.**
