#!/usr/bin/env node
// Re-read logic adjudicator eval harness.
// Usage:
//   ANTHROPIC_API_KEY=sk-... node run-eval.mjs [--model claude-sonnet-4-6] [--limit N]
//   GEMINI_API_KEY=...      node run-eval.mjs --model gemini-3.1-flash-lite
//   node run-eval.mjs --dry        # validate dataset + self-test the scorer, no API calls
//
// Provider is auto-detected from the model name (gemini* -> Google, else Anthropic),
// or forced with --provider gemini|anthropic.
//
// Tests the CLASSIFICATION CORE of the logic contract (logic-contract.md steps 2-5):
// can the adjudicator separate supports / scope_mismatch / same_topic_no_relation /
// the attack targets on toy claim pairs. Span-licensing and document-grounded verification
// (steps 7-8) need a real-document dataset and are out of scope here.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const MODEL = argVal("--model") || "claude-sonnet-4-6";
const LIMIT = Number(argVal("--limit") || 0);
const PROVIDER = argVal("--provider") || (/^gemini/i.test(MODEL) ? "gemini" : "anthropic");

function argVal(flag) {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : null;
}

// ---- label helpers -------------------------------------------------------
const ATTACK = "attacks";
function label(relation, target) {
  return relation === ATTACK ? `attacks/${target ?? "?"}` : relation;
}
function goldLabel(c) {
  return label(c.expected_relation, c.expected_target);
}
function acceptableSet(c) {
  return new Set([goldLabel(c), ...(c.acceptable_alternatives || [])]);
}

// ---- dataset -------------------------------------------------------------
function loadCases() {
  const raw = readFileSync(join(__dirname, "cases.jsonl"), "utf8");
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  const cases = [];
  lines.forEach((line, idx) => {
    let c;
    try {
      c = JSON.parse(line);
    } catch (e) {
      throw new Error(`cases.jsonl line ${idx + 1}: invalid JSON — ${e.message}`);
    }
    for (const f of ["id", "claim_a", "claim_b", "expected_relation", "scope_alignment"]) {
      if (!(f in c)) throw new Error(`cases.jsonl line ${idx + 1} (${c.id || "?"}): missing field "${f}"`);
    }
    if (c.expected_relation === ATTACK && !c.expected_target) {
      throw new Error(`cases.jsonl ${c.id}: relation "attacks" requires expected_target`);
    }
    cases.push(c);
  });
  return cases;
}

// ---- model call ----------------------------------------------------------
function userMsg(c) {
  return `Claim A: "${c.claim_a}"\nClaim B: "${c.claim_b}"`;
}

async function adjudicate(systemPrompt, c) {
  return PROVIDER === "gemini"
    ? adjudicateGemini(systemPrompt, c)
    : adjudicateAnthropic(systemPrompt, c);
}

async function adjudicateAnthropic(systemPrompt, c) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: userMsg(c) }],
    }),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = (data.content || []).map((b) => b.text || "").join("");
  return parseJSON(text);
}

async function adjudicateGemini(systemPrompt, c) {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "x-goog-api-key": key, "content-type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userMsg(c) }] }],
      generationConfig: { maxOutputTokens: 1024, temperature: 0, responseMimeType: "application/json" },
    }),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const cand = (data.candidates || [])[0];
  const text = ((cand && cand.content && cand.content.parts) || []).map((p) => p.text || "").join("");
  if (!text) throw new Error(`empty response: ${JSON.stringify(data).slice(0, 300)}`);
  return parseJSON(text);
}

function parseJSON(text) {
  let t = text.trim().replace(/^```(json)?/i, "").replace(/```$/, "").trim();
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a >= 0 && b > a) t = t.slice(a, b + 1);
  return JSON.parse(t);
}

// ---- scorer --------------------------------------------------------------
function score(cases, preds) {
  const rows = cases.map((c, i) => {
    const p = preds[i] || {};
    const predLabel = label(p.relation, p.target);
    const acc = acceptableSet(c);
    const relOk = acc.has(predLabel);
    const goldIsAttack = c.expected_relation === ATTACK;
    const predIsAttack = p.relation === ATTACK;
    return { c, p, predLabel, relOk, goldIsAttack, predIsAttack };
  });

  const n = rows.length;
  const relAcc = rows.filter((r) => r.relOk).length / n;

  // false contradiction: predicted an attack where gold has no conflict
  const nonAttack = rows.filter((r) => !r.goldIsAttack);
  const falseContra = nonAttack.filter((r) => r.predIsAttack);
  const falseContraRate = nonAttack.length ? falseContra.length / nonAttack.length : 0;

  const recall = (rel) => {
    const gold = rows.filter((r) => r.c.expected_relation === rel);
    if (!gold.length) return null;
    return gold.filter((r) => r.relOk).length / gold.length;
  };
  const scopeRecall = recall("scope_mismatch");
  const strRecall = recall("same_topic_no_relation");

  // attack-target accuracy: among gold attacks the model also called attacks, is target right
  const goldAttacks = rows.filter((r) => r.goldIsAttack && r.predIsAttack);
  const targetAcc = goldAttacks.length
    ? goldAttacks.filter((r) => r.relOk).length / goldAttacks.length
    : null;

  // verified violations: status "verified" is forbidden (no source docs provided)
  const verifiedViolations = rows.filter((r) => (r.p.status || "") === "verified");

  return { rows, n, relAcc, falseContra, falseContraRate, scopeRecall, strRecall, targetAcc, verifiedViolations };
}

const THRESHOLDS = {
  falseContraRate: { v: 0.05, dir: "lte", label: "false contradiction rate", fmt: pct },
  scopeRecall: { v: 0.85, dir: "gte", label: "scope_mismatch recall", fmt: pct },
  strRecall: { v: 0.8, dir: "gte", label: "same_topic_no_relation recall", fmt: pct },
  targetAcc: { v: 0.75, dir: "gte", label: "attack-target accuracy", fmt: pct },
};

function pct(x) {
  return x == null ? "n/a" : `${(x * 100).toFixed(1)}%`;
}

function report(m) {
  console.log("\nPer-case:");
  for (const r of m.rows) {
    const mark = r.relOk ? "ok  " : "MISS";
    const tgt = r.predIsAttack ? `/${r.p.target ?? "?"}` : "";
    console.log(
      `  [${mark}] ${r.c.id.padEnd(12)} gold=${goldLabel(r.c).padEnd(26)} pred=${(r.p.relation ?? "?") + tgt}`
    );
  }

  console.log("\nMetrics vs thresholds:");
  let pass = true;
  const checks = [
    ["falseContraRate", m.falseContraRate],
    ["scopeRecall", m.scopeRecall],
    ["strRecall", m.strRecall],
    ["targetAcc", m.targetAcc],
  ];
  for (const [key, val] of checks) {
    const t = THRESHOLDS[key];
    let ok;
    if (val == null) ok = null;
    else ok = t.dir === "lte" ? val <= t.v : val >= t.v;
    if (ok === false) pass = false;
    const status = ok == null ? "  -" : ok ? "PASS" : "FAIL";
    const cmp = t.dir === "lte" ? "<=" : ">=";
    console.log(`  [${status}] ${t.label.padEnd(34)} ${t.fmt(val)} (target ${cmp} ${t.fmt(t.v)})`);
  }
  const vOk = m.verifiedViolations.length === 0;
  if (!vOk) pass = false;
  console.log(`  [${vOk ? "PASS" : "FAIL"}] unsupported "verified" edges        ${m.verifiedViolations.length} (target = 0)`);
  console.log(`  relation accuracy (informational): ${pct(m.relAcc)}`);

  if (m.falseContra.length) {
    console.log("\nFalse contradictions (the metric that matters most):");
    for (const r of m.falseContra) console.log(`  ${r.c.id}: predicted attacks/${r.p.target ?? "?"} — gold ${goldLabel(r.c)}`);
  }
  console.log(`\n${pass ? "OVERALL: PASS" : "OVERALL: FAIL"}\n`);
  return pass;
}

// ---- dry self-test -------------------------------------------------------
function dryRun(cases) {
  console.log(`Dataset OK: ${cases.length} cases parsed and validated.`);
  const dist = {};
  for (const c of cases) dist[goldLabel(c)] = (dist[goldLabel(c)] || 0) + 1;
  console.log("Label distribution:");
  for (const [k, v] of Object.entries(dist).sort()) console.log(`  ${k.padEnd(28)} ${v}`);

  console.log("\nScorer self-test A — perfect predictor (should be OVERALL: PASS):");
  const perfect = cases.map((c) => ({ relation: c.expected_relation, target: c.expected_target, status: "proposed" }));
  report(score(cases, perfect));

  console.log('Scorer self-test B — degenerate "always attacks/conclusion" predictor (should FAIL on false contradictions):');
  const bad = cases.map(() => ({ relation: "attacks", target: "conclusion", status: "proposed" }));
  report(score(cases, bad));
  console.log("Dry run complete — harness wiring verified. Provide ANTHROPIC_API_KEY to run for real.");
}

// ---- main ----------------------------------------------------------------
(async () => {
  const systemPrompt = readFileSync(join(__dirname, "prompt.md"), "utf8");
  let cases = loadCases();
  if (LIMIT > 0) cases = cases.slice(0, LIMIT);

  if (DRY) return dryRun(cases);

  const keyName = PROVIDER === "gemini" ? "GEMINI_API_KEY" : "ANTHROPIC_API_KEY";
  const haveKey = PROVIDER === "gemini"
    ? !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)
    : !!process.env.ANTHROPIC_API_KEY;
  if (!haveKey) {
    console.error(`${keyName} not set. Use --dry to validate the harness without API calls.`);
    process.exit(2);
  }

  console.log(`Running ${cases.length} cases against ${MODEL} (provider: ${PROVIDER}) ...`);
  const preds = [];
  for (const c of cases) {
    try {
      const p = await adjudicate(systemPrompt, c);
      preds.push(p);
      process.stdout.write(".");
    } catch (e) {
      console.error(`\n${c.id} error: ${e.message}`);
      preds.push({});
    }
  }
  console.log("");
  const pass = report(score(cases, preds));
  process.exit(pass ? 0 : 1);
})();
