# Logic Contract — Governance Rules for the Inference Layer

> The missing primitive isn't more architecture — it's **governance**: exact rules for when the
> system is *allowed* to say supports, depends-on, contradicts, undermines, or only-seems-related.
> A logic layer without this is vibes wearing a graph.
>
> **Scope note:** this is the contract for the logic/linking layer, which is **post-V1**. None of
> it touches the first code commit — V1 still ships with intra-document support + one tension chip
> and *no* cross-claim adjudication. This is what you design *toward*. See
> [linking-architecture.md](linking-architecture.md) (the layer this governs) and
> [v1-build-plan.md](v1-build-plan.md) (what ships first, unchanged by this doc).

**Governing rule:** the logic layer must *earn* every edge — with a warrant, a scope check, a
target type, source evidence, and an uncertainty state. No edge exists on similarity alone.

---

## 0. The two principles this inherits

- **Concepts find; logic decides.** Embeddings retrieve candidates; they never decide the
  relation.
- **Grounding ≠ support ≠ inference.** Re-read already separates "did we locate the source span"
  from "does the span back the claim." The logic layer adds more states on the same axis:
  *retrieved → related → inferred → verified → ratified* are all different things.

---

## 1. Claim vs. proposition — and the over-formalization trap

Each claim needs a normalized **proposition** underneath it for the logic layer to compare claims
that *sound* alike but are logically different:

- "AI helps junior engineers." / "AI helps senior engineers."
- "AI **may** help seniors." / "AI helps seniors."
- "AI **helped** seniors **in one benchmark**." / "AI helps seniors **only when** codebase context
  is available."

These are not interchangeable, and string/embedding similarity treats them as near-identical.

**But do not build a full logical form.** Parsing every claim into subject/predicate/object slots
is the old semantic-parsing dream that dies on real prose (compound, conditional, rhetorical
claims normalize into confident garbage that *looks* precise). **Normalize only the dimensions
that decide whether two claims may legally be compared** — and keep the claim text as ground
truth. You're extracting comparison qualifiers, not a formal logic statement.

```ts
type Proposition = {
  claim_id: string
  core: string                 // short canonical paraphrase, NOT a parse
  polarity: "positive" | "negative"
  modality: "is" | "may" | "likely" | "could" | "should" | "must" | "would"
  quantifier: "all" | "most" | "some" | "one" | "none" | "unclear"
  scope: {
    actor?: string
    population?: string
    geography?: string
    timeframe?: string
    domain?: string
    condition?: string[]
  }
}
```

---

## 2. Scope / modality / quantifier — the contradiction gate

**The single most important rule in this doc: most "contradictions" are scope mismatches.**

Before any `contradicts`/`attacks` edge may be asserted, the adjudicator must check alignment:

```ts
scope_alignment:    "same" | "overlapping" | "different" | "unclear"
modality_alignment: "same" | "weaker" | "stronger" | "mismatch" | "unclear"
quantifier_alignment: "same" | "narrower" | "broader" | "mismatch" | "unclear"
```

**Contradiction is only licensed when:** `polarity` is opposite **AND** `scope_alignment ∈ {same,
overlapping}` **AND** `modality` is compatible (not "may" vs "is") **AND** a warrant connects them.
Otherwise the verdict degrades — never to a confident conflict:

- different scope → `scope_mismatch`
- unclear scope → `needs_scope_check`
- "may" vs "will" → not the same claim; at most `tension`, usually `no_relation`

"X is true in the US" + "X is false in Europe" → `scope_mismatch`, **not** contradiction.

---

## 3. Relation × target — disentangled

The three defeaters (rebut/undermine/undercut) already *encode* their target, so listing them as
relations **and** carrying a `target` field is redundant and lets you encode contradictory states.
Collapse attack into one relation; let `target` carry the precision.

```ts
relation:
  | "supports"
  | "entails"
  | "assumes"
  | "attacks"
  | "same_topic_no_relation"
  | "scope_mismatch"
  | "insufficient_evidence"

target:                          // meaningful when relation = "attacks"
  | "conclusion"        // = rebut:      "the opposite is true"
  | "premise"           // = undermine:  "a premise is false"
  | "inference"         // = undercut:   "premise true, but doesn't imply conclusion"
  | "scope"             // "true only in a narrower case"
  | "definition"        // "you're using the key term differently"
  | "evidence_quality"  // "the cited evidence is weak/unreliable"
  | "value_weighting"   // "true, but not important enough to carry the conclusion"
```

The genuinely new value is the bottom four targets — `scope / definition / evidence_quality /
value_weighting` — which the classic three defeaters can't express, and which are where most
real-world disagreement actually lives. "These disagree" is low value; "this attacks the inference
between P2 and C1" is high value.

---

## 4. Definitions (what counts as each)

- **supports** — A raises the credibility of B; weaker than entailment; defeasible.
- **entails** — if A holds, B holds (within aligned scope). Rare in real prose; don't over-claim.
- **assumes** — B silently rests on unstated premise A. (The buried assumption a summary loses.)
- **attacks/conclusion (rebut)** — A asserts ¬B with its own chain.
- **attacks/premise (undermine)** — A denies a premise B rests on.
- **attacks/inference (undercut)** — A grants the premises but denies they yield B.
- **attacks/scope** — B is true only in a narrower case than stated.
- **attacks/definition** — A and B use a key term incompatibly (resolve before judging conflict).
- **attacks/evidence_quality** — A impugns the reliability of B's evidence, not B directly.
- **attacks/value_weighting** — A grants B's fact but denies its load-bearing importance.
- **same_topic_no_relation** — shared concept, no logical interaction. *A first-class verdict, not
  a failure.* ("AI models are expensive to train." + "AI improves developer productivity." — same
  topic, no support, no conflict.)
- **insufficient_evidence** — the text doesn't license any confident relation.

---

## 5. The warrant layer (Toulmin)

Distinguish the **claim**, the **evidence**, and the **warrant** that licenses evidence→claim.

> Claim: AI tools slow senior engineers.
> Evidence: seniors must review unfamiliar generated code.
> Warrant: reviewing unfamiliar code interrupts the codebase-wide mental model that makes seniors
> fast.

The warrant may be explicit, implicit, weak, or invented — and **the UI must render a
model-inferred warrant differently from an author-stated one.**

```ts
warrant_source:
  | "explicit_span"            // author stated it
  | "implicit_from_article"    // derivable from the text
  | "external_common_knowledge"
  | "model_inferred"           // flag visibly — lowest trust
```

---

## 6. Edge provenance — "why is this edge allowed to exist?"

Source claims are grounded by a span. **Logical edges need their own provenance.** Every edge must
answer why it may exist:

```ts
edge_provenance: {
  source_span_ids: string[]        // text that licenses the edge
  warrant: string
  warrant_source: WarrantSource
  required_assumptions: string[]   // what must also be true for the edge to hold
  contradicted_by?: string[]       // edges/claims that would defeat it
}
```

This is the AIS/attribution standard: a generated relation is trustworthy only if it's *supported
by identified sources*. Model-inferred edges with no licensing span are the riskiest output and
must be marked as such.

---

## 7. Confidence, status, and asymmetric burden

```ts
status:
  | "proposed"           // model emitted it, unverified
  | "verified"           // passed a fresh-context check
  | "user_confirmed"
  | "user_rejected"
  | "needs_scope_check"
  | "insufficient_evidence"
```

**Asymmetric burden of proof (hard rule).** The evidence bar rises with the damage a false edge
does:

```
bar(contradicts/attacks) > bar(supports) > bar(same_topic_no_relation)
```

A false "contradicts" makes the tool look alarmist and stupid; a missed link is just quietly
absent. So contradiction requires the full gate from §2 plus a warrant; anything short degrades to
`needs_scope_check` or `scope_mismatch`, never a confident conflict. When in doubt, under-claim.

---

## 8. Node separation (AIF-inspired)

Do **not** make everything an edge. Some relationships deserve to be nodes because they carry their
own evidence, assumptions, confidence, and user feedback — and because you can *attack an
inference* but you can't attack an edge.

| Node | Holds |
|------|-------|
| `ClaimNode` | a proposition + its source span |
| `ConceptNode` | canonical join key (from the concept layer) |
| `InferenceNode` | an application of reasoning: premises → conclusion, with its warrant |
| `ConflictNode` | an application of attack, with target + scope/modality alignment |
| `PreferenceNode` | "this consideration outweighs that" (value weighting) |
| `SourceSpan` | exact character range in a document |

An `InferenceNode` and a `ConflictNode` are themselves contestable objects — users and other
claims can attack *them*, which is impossible if they're mere edges.

---

## 9. Human correction as the moat

The logic layer must assume it will be wrong, and make correction frictionless:

- "not the same concept" / "merge these concepts" / "split this concept"
- "this doesn't support that" / "this is only weak support"
- "wrong scope" / "this attacks the premise, not the conclusion"
- "reject this inference" (model-inferred warrant was invented)

These corrections — the **personalized, corrected graph** — are the moat. Not generic embeddings,
not the initial extraction. The graph shaped by a user's judgment over time is what can't be cloned.

---

## 10. The logic eval set (build this FIRST)

Before building logic machinery, hand-label a tiny benchmark — otherwise "logic" feels good in
demos and drifts badly in the wild. ~50–100 pairs across these labels:

`supports · entails · assumes · rebuts_conclusion · undermines_premise · undercuts_inference ·
attacks_scope · attacks_definition · attacks_evidence_quality · attacks_value_weighting ·
same_topic_no_relation · scope_mismatch · insufficient_evidence`

```ts
type EvalCase = {
  claim_a: string
  claim_b: string
  expected_relation: Relation
  target?: Target
  scope_alignment: ScopeAlignment
  explanation: string
  acceptable_alternative_labels: string[]   // logic is often legitimately ambiguous
}
```

This directly targets the documented failure modes: NLI label artifacts (models "predict"
entailment without reading the premise), and single-agent sycophancy (a model rationalizing its own
output). The eval set + a fresh-context adjudicator are the defense.

---

## 11. Adjudication pipeline (execution order)

The contract above says *what* a valid relation must contain. This is *how* the adjudicator
produces one — and the order is load-bearing. The model must **check whether two claims can even
be legally compared before classifying how they relate.** Classifying relation before checking
scope is backwards and is the #1 source of false contradictions.

The order is a funnel of questions:
> Can these claims legally be compared? → If yes, how do they relate? → If a relation is claimed,
> what warrant licenses it? → If licensed, how strong is it?

1. **Candidate retrieval** — concept layer surfaces the shortlist (embeddings, not decisions).
2. **Proposition normalization** — extract comparison dims (scope/modality/quantifier/polarity).
3. **Scope / modality / quantifier alignment** — the gate. If different scope → stop, emit
   `scope_mismatch`. If unclear → `needs_scope_check`.
4. **Relation classification** — supports / entails / assumes / attacks / no_relation.
5. **Target classification** — only if `attacks`; assign conclusion/premise/inference/scope/
   definition/evidence_quality/value_weighting.
6. **Warrant extraction** — the proposition connecting the two; record `warrant_source`.
7. **Source-span licensing** — which spans permit this relation? If none → `insufficient_evidence`.
8. **Fresh-context verification** — a separate, clean-context call: "given these claims + spans, is
   this relation supported? yes/partial/no." No memory of having proposed it (anti-sycophancy).
9. **Burden-of-proof downgrade** — apply the table in §12. Under-claim mechanically.
10. **Final status assignment** — proposed / verified / needs_scope_check / insufficient_evidence.

---

## 12. Downgrade table (make under-claiming mechanical)

"Under-claim when unsure" must be code, not vibes. These are **forced** transitions applied after
classification:

| Condition | Forced downgrade |
|-----------|------------------|
| `scope_alignment = different` | → `scope_mismatch` |
| `scope_alignment = unclear` | → `status: needs_scope_check` |
| `source_span_ids` empty | → `insufficient_evidence` |
| `warrant_source = model_inferred` only | cannot become `verified`; cap `strength = weak`, `status = proposed` |
| `modality_alignment = mismatch` (e.g. "may" vs "is") | → `same_topic_no_relation` or `needs_scope_check` |
| `relation = attacks` with no warrant | **forbidden** — an attack with no warrant does not exist |

The asymmetry from §7 is enforced here: these rules can only ever *weaken* an edge, never
strengthen it. A contradiction has to survive the whole funnel intact to be shown as one.

---

## 13. Eval success thresholds

The §10 eval set needs pass/fail targets, or "logic" passes by feeling good in demos. Minimum
acceptable:

| Metric | Target | Why |
|--------|--------|-----|
| **false contradiction rate** | **< 5%** | the one that matters most — false "X contradicts Y" destroys trust |
| `scope_mismatch` recall | > 85% | catching the disguised non-conflicts is the whole point |
| `same_topic_no_relation` recall | > 80% | the guard against similarity-as-insight |
| attack-target accuracy | > 75% | "attacks the inference" vs "attacks the premise" is the value |
| `warrant_source` accuracy | > 80% | inferred-vs-stated drives UI trust rendering |
| unsupported `verified` edges | **0 tolerated** | a verified edge with no licensing span is a lie |

**A missed relation is acceptable; a false contradiction is not.** Optimize recall on the safe
labels, precision on the dangerous ones.

---

## 14. UI rendering rules (trust states → what the user sees)

The trust states are useless unless the product knows how to show them. The mapping:

| Internal state | Shown as |
|----------------|----------|
| verified attack | strong, visible conflict |
| proposed attack | "possible tension" (soft) |
| `needs_scope_check` | "may differ by scope" |
| `warrant_source = model_inferred` | "inferred by system" badge |
| `insufficient_evidence` | hidden by default / debug view only |

This is the same honest-degradation principle as V1's grounding states: the more uncertain the
edge, the more hedged its presentation — never the reverse.

---

## The canonical primitive — relation, not edge

The earlier draft of this doc ended with a `LogicEdge` type, which contradicts §8 ("don't make
everything an edge"). Corrected: the adjudicator emits a **`CandidateRelation`** (raw judgment);
accepted relations are *materialized* as nodes or audit edges depending on kind. The relation is
the primitive; its representation is a downstream decision.

```ts
type CandidateRelation = {            // raw adjudicator output (pre-materialization)
  id: string
  from: string[]                      // premise / attacker claim ids
  to: string                          // target claim id
  relation:
    | "supports" | "entails" | "assumes"
    | "attacks"
    | "same_topic_no_relation" | "scope_mismatch" | "insufficient_evidence"
  target?:                            // precision when relation = "attacks"
    | "conclusion" | "premise" | "inference"
    | "scope" | "definition" | "evidence_quality" | "value_weighting"
  warrant: string
  warrant_source: "explicit_span" | "implicit_from_article" | "external_common_knowledge" | "model_inferred"
  required_assumptions: string[]
  scope_alignment: "same" | "overlapping" | "different" | "unclear"
  modality_alignment: "same" | "weaker" | "stronger" | "mismatch" | "unclear"
  source_span_ids: string[]
  strength: "strong" | "medium" | "weak"
  confidence: number
  status: "proposed" | "verified" | "user_confirmed" | "user_rejected" | "needs_scope_check" | "insufficient_evidence"
}

// materialization (per §8 — relationships with their own evidence become nodes):
type InferenceNode = { id: string; from: string[]; to: string; warrant: string; /* + provenance, confidence, feedback */ }
type ConflictNode  = { id: string; attacker: string; target_claim: string; target: AttackTarget; /* + alignment, warrant */ }
type AuditEdge     = { from: string; to: string; relation: RelationKind }   // graph-traversal convenience only
```

`supports`/`entails`/`assumes` and a clean `attacks` become an `InferenceNode` or `ConflictNode`
(they carry evidence and can themselves be contested). `same_topic_no_relation` /
`scope_mismatch` / `insufficient_evidence` are recorded but **not** drawn as reasoning. That is the
difference between a cool argument graph and a real logic engine: every relation earns a warrant, a
scope check, a target, source evidence, and an uncertainty state — or it doesn't exist.
