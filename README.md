# Re-read

> Turn the internet from a feed into a map.

An AI-native reading layer that turns a dense article into a navigable, **source-linked
structure of claims** — not a summary, not a glossary of terms, but the argument itself:
thesis, supporting claims, evidence, and the buried caveats and contradictions, each one
clickable back to the exact sentence that supports it.

A summary answers *"what does it say."*
Re-read answers *"how does it hang together — where does this claim come from, what holds it
up, what undercuts it."* It preserves all of an article's structure and hides the volume in
folds you can open.

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
| [`Brainstorm/feasibility-report.md`](Brainstorm/feasibility-report.md) | The long-horizon architecture (constrained decoding, RST parsing, multi-agent debate, PageRank, cross-document entity resolution, UI/UX). The destination, not the first build. |

## Status

Concept / brainstorm stage. The next concrete step is a paste-in prototype of the V1
split-pane, source-linked outline wired to a real model call.
