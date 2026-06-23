# Logic adjudicator eval harness

The first piece of real code in Re-read. It answers the one question that gates everything in
[`../Brainstorm/logic-contract.md`](../Brainstorm/logic-contract.md): **can a model reliably tell
the logical relations apart on toy claim pairs?** If it can't separate `supports` /
`scope_mismatch` / `same_topic_no_relation` / the attack targets here, the rest of the logic layer
is premature.

## What it tests (and what it doesn't)

Tests the **classification core** — logic-contract steps 2–5: scope/modality gating, relation
classification, and attack-target precision. It runs on **bare claim pairs with no source
document**, so:

- Span-licensing and document-grounded verification (steps 7–8) are **out of scope** — they need a
  real-document dataset.
- Because no source spans exist, the adjudicator must never return `status: "verified"`. The
  harness flags any `verified` output as a violation (tests the §12 "no licensing span → cannot
  verify" rule).

## Run it

```bash
# validate the dataset + self-test the scorer, no API calls, no key needed:
node run-eval.mjs --dry

# run for real (Node 18+; uses built-in fetch, zero dependencies):
ANTHROPIC_API_KEY=sk-ant-... node run-eval.mjs
ANTHROPIC_API_KEY=sk-ant-... node run-eval.mjs --model claude-opus-4-8   # establish the ceiling
ANTHROPIC_API_KEY=sk-ant-... node run-eval.mjs --limit 5                 # quick smoke test
```

Exit code is `0` on PASS, `1` on FAIL — so it drops straight into CI later.

## Pass/fail thresholds (from logic-contract §13)

| Metric | Target | Why |
|--------|--------|-----|
| **false contradiction rate** | **≤ 5%** | the one that matters most — a false "X contradicts Y" destroys trust |
| `scope_mismatch` recall | ≥ 85% | catching disguised non-conflicts is the whole point |
| `same_topic_no_relation` recall | ≥ 80% | the guard against similarity-as-insight |
| attack-target accuracy | ≥ 75% | "attacks the inference" vs "the premise" is the value |
| unsupported `verified` edges | 0 | a verified edge with no licensing span is a lie |

**A missed relation is acceptable; a false contradiction is not.** The dataset deliberately
includes "trap" pairs (`scope-*`, `mod-01`) that *sound* contradictory but are scope/modality
mismatches — those are where a naive classifier hangs itself.

## Files

| File | What |
|------|------|
| `cases.jsonl` | ~32 hand-labeled claim pairs across the full label set, with explanations and acceptable alternatives |
| `prompt.md` | the adjudicator system prompt — encodes the scope-gate-before-relation order |
| `run-eval.mjs` | runner + scorer (no deps); `--dry` self-tests the scorer with perfect and degenerate predictors |

## Extending

Add rows to `cases.jsonl`. Each needs: `claim_a`, `claim_b`, `expected_relation`,
`expected_target` (when relation is `attacks`), `scope_alignment`, `explanation`, and
`acceptable_alternatives` (labels that are also defensible — logic is often legitimately
ambiguous). Keep the trap density high; the safe labels are easy and the dangerous ones are the
point.
