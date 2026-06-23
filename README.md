# Re-read

> **A summary tells you what the article says. Re-read shows you what the article _depends on_.**

An AI-native reading layer that turns a dense article into a navigable, **source-linked
structure of claims** — not a summary, not a glossary of terms, but the argument itself:
thesis, supporting claims, evidence, and the buried caveats and contradictions, each one
clickable back to the exact sentence that supports it.

A summary gives you the conclusion. Re-read gives you the load-bearing structure under it —
where each claim comes from, what holds it up, what undercuts it — and hides the volume in
folds you can open. Turn the internet from a feed into a map.

## Why

Most reading tools either **compress** text (summaries throw the structure away) or **list
terms** (entity extraction gives you a cloud of nouns that means nothing). Re-read keeps the
*argument* — claims as nodes, typed relationships as edges — so dense articles become
inspectable and explorable instead of a linear scroll.

Built for people who read hard things and need to actually understand them: researchers,
analysts, investors, students, lawyers, consultants, policy and journalism people.

## The V1 wedge

Deliberately narrow: **paste an article → get a source-linked claim outline you can audit in
one click.**

- Split-pane UI: original article on the left, claim outline on the right.
- Click any claim → the exact source span highlights in the original. Provenance *is* the
  product — every claim is verifiable, so it never feels like another hallucinating summarizer.
- Two relationships only: **supports** (the collapsible hierarchy) and a single **tension**
  flag (caveat / contradiction / hedge — the stuff summaries hide).
- The cross-article "memory" moat (this contradicts something you read last week) is deferred —
  but claims are embedded and stored silently from day one so the moat compounds early.

## This repo

This is the thinking/brainstorm space for the product, not the codebase (yet).

| File | What it is |
|------|------------|
| [`Brainstorm/argument-map-v1.md`](Brainstorm/argument-map-v1.md) | The sharp V1 cut — what to build first, what to deliberately skip, the one risk to test. **Start here.** |
| [`Brainstorm/v1-build-plan.md`](Brainstorm/v1-build-plan.md) | The concrete first build — split-pane prototype, the two-pass backend, and the `Claim` schema. The bridge to actual code. |
| [`Brainstorm/linking-architecture.md`](Brainstorm/linking-architecture.md) | **The heart of the system** — how Re-read connects things: concept-layer retrieval + a logic/dialectic layer that follows inference chains and surfaces contradictions neither source stated. |
| [`Brainstorm/logic-contract.md`](Brainstorm/logic-contract.md) | The governance rules for the logic layer — when the system is *allowed* to say supports / depends-on / contradicts / undermines / only-seems-related. Proposition normalization, the scope/modality contradiction gate, warrants, and the eval set. |
| [`Brainstorm/feasibility-report.md`](Brainstorm/feasibility-report.md) | The long-horizon architecture (constrained decoding, RST parsing, multi-agent debate, PageRank, cross-document entity resolution, UI/UX). The destination, not the first build. |

## Code

| Path | What |
|------|------|
| [`eval/`](eval/) | The first real code — a zero-dependency harness that tests whether a model can tell the logic relations apart on hand-labeled claim pairs. `node eval/run-eval.mjs --dry` validates it with no API key. This is the gate: if the classifier can't separate `supports` / `scope_mismatch` / `same_topic_no_relation` / attack targets, the logic layer is premature. |

## Status

Brainstorm + first eval harness. Two open build fronts: (1) the V1 paste-in split-pane prototype
wired to a real model call; (2) running the logic eval against a live model to see if the
classification core clears the thresholds in [`eval/README.md`](eval/README.md).
