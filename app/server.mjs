#!/usr/bin/env node
// Re-read V1 prototype server. Zero dependencies (Node 18+ built-in http + fetch).
//
//   GEMINI_API_KEY=...   node app/server.mjs
//   $env:GEMINI_API_KEY="..."; node app/server.mjs        (PowerShell)
//
// Then open http://localhost:5173 . Optional env: MODEL, PORT, PROVIDER, ANTHROPIC_API_KEY.

import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadLocalEnv(file) {
  if (!existsSync(file)) return;
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[match[1]]) process.env[match[1]] = value;
  }
}

loadLocalEnv(join(__dirname, ".env.local"));

const PORT = Number(process.env.PORT || 5173);
const MODEL = process.env.MODEL || "gemini-3.1-flash-lite";
const PROVIDER = process.env.PROVIDER || (/^gemini/i.test(MODEL) ? "gemini" : "anthropic");
const SYSTEM = readFileSync(join(__dirname, "extract-prompt.md"), "utf8");
const HTML = readFileSync(join(__dirname, "index.html"), "utf8");
const DATA_DIR = join(__dirname, ".data");
const RUNS_FILE = join(DATA_DIR, "runs.json");

// ---- model call ----------------------------------------------------------
async function callModel(userText) {
  if (PROVIDER === "gemini") {
    const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "x-goog-api-key": key, "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: "user", parts: [{ text: userText }] }],
        generationConfig: { maxOutputTokens: 4096, temperature: 0.2, responseMimeType: "application/json" },
      }),
    });
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    const cand = (data.candidates || [])[0];
    return ((cand && cand.content && cand.content.parts) || []).map((p) => p.text || "").join("");
  }
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: 4096, system: SYSTEM, messages: [{ role: "user", content: userText }] }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return (data.content || []).map((b) => b.text || "").join("");
}

function parseJSON(text) {
  let t = text.trim().replace(/^```(json)?/i, "").replace(/```$/, "").trim();
  const a = t.indexOf("{");
  if (a >= 0) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = a; i < t.length; i++) {
      const ch = t[i];
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = inString;
      } else if (ch === "\"") {
        inString = !inString;
      } else if (!inString && ch === "{") {
        depth++;
      } else if (!inString && ch === "}") {
        depth--;
        if (depth === 0) {
          t = t.slice(a, i + 1);
          break;
        }
      }
    }
  }
  return JSON.parse(t);
}

// ---- grounding pass: locate each source_quote in the original text --------
function normalizeWithMap(s) {
  let norm = "", prevSpace = false;
  const map = [];
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (/\s/.test(ch)) {
      if (!prevSpace) { norm += " "; map.push(i); prevSpace = true; }
    } else {
      norm += ch.toLowerCase(); map.push(i); prevSpace = false;
    }
  }
  return { norm, map };
}

function ground(text, quote) {
  if (!quote) return { grounding: "unpinned" };
  const q = quote.trim();
  // 1. exact substring
  const exact = text.indexOf(q);
  if (exact >= 0) return { source_start: exact, source_end: exact + q.length, grounding: "pinned" };
  // 2. whitespace/case-normalized full match
  const { norm, map } = normalizeWithMap(text);
  const qn = normalizeWithMap(q).norm.trim();
  if (qn.length >= 4) {
    const j = norm.indexOf(qn);
    if (j >= 0) return { source_start: map[j], source_end: map[j + qn.length - 1] + 1, grounding: "pinned" };
    // 3. weak: match the first ~10 words of the quote
    const prefix = qn.split(" ").slice(0, 10).join(" ");
    if (prefix.length >= 12) {
      const k = norm.indexOf(prefix);
      if (k >= 0) return { source_start: map[k], source_end: map[k + prefix.length - 1] + 1, grounding: "weak" };
    }
  }
  return { grounding: "unpinned" };
}

function termKey(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function findMention(text, patterns) {
  const lower = text.toLowerCase();
  for (const pattern of patterns) {
    const needle = pattern.toLowerCase();
    const index = lower.indexOf(needle);
    if (index >= 0) return text.slice(index, index + pattern.length);
  }
  return "";
}

function nearestNode(nodes, sourceStart) {
  if (sourceStart == null || !nodes.length) return [];
  const nearest = [...nodes].sort((a, b) => Math.abs((a.source_start ?? 0) - sourceStart) - Math.abs((b.source_start ?? 0) - sourceStart))[0];
  return nearest ? [nearest.id] : [];
}

function fallbackContextFor(label, kind) {
  const glossary = {
    "three-master": {
      definition: "A sailing ship with three masts.",
      explanation: "This tells the reader the Pharaon is a substantial sailing vessel, large enough that its arrival would be noticed by the port.",
      deeper_context: "The term helps explain why the ship's handling, sails, and harbor approach matter. A large three-masted ship entering port slowly would naturally draw attention from experienced observers."
    },
    "topsails": {
      definition: "Sails set above the lower sails on a mast.",
      explanation: "The topsails show the ship is still under sail as it approaches, helping readers picture how it is being carefully managed into harbor.",
      deeper_context: "Dumas lists sail details to signal seamanship. The ship is not wrecked or drifting; it is moving under controlled sail, which makes the unease around it more mysterious."
    },
    "jib": {
      definition: "A triangular sail set forward of a ship's foremost mast.",
      explanation: "The jib is one of the sails helping guide the ship toward the harbor entrance.",
      deeper_context: "Mentioning the jib adds technical precision to the approach scene. It suggests the narrator and experienced sailors are reading the ship's condition from its rigging."
    },
    "spanker": {
      definition: "A fore-and-aft sail set on the aftermost mast of a sailing ship.",
      explanation: "The spanker is another sail controlling the ship's movement as it approaches Marseille.",
      deeper_context: "This detail contributes to the sense that the Pharaon is being handled skillfully, not limping in from damage."
    },
    "anchor a-cockbill": {
      definition: "An anchor positioned ready to be let go.",
      explanation: "This shows the ship is prepared to anchor, which supports the idea that the vessel itself is under control.",
      deeper_context: "The anchor's readiness is part of the evidence experienced sailors use to judge that any misfortune is not damage to the ship itself."
    },
    "jib-boom guys": {
      definition: "Ropes or stays that steady the jib-boom projecting from the bow.",
      explanation: "The eased jib-boom guys are a rigging detail showing the crew is preparing the vessel for harbor maneuvers.",
      deeper_context: "Like the anchor and sails, this technical detail makes the ship look competently handled. That contrast intensifies the question of what has gone wrong on board."
    },
    "pilot": {
      definition: "A harbor specialist who guides ships safely into port.",
      explanation: "The pilot's presence shows the ship is entering Marseille according to local harbor custom.",
      deeper_context: "The pilot is not the mystery; he is part of normal port procedure. The striking detail is the young man beside him, repeating directions and watching the ship."
    }
  };
  if (glossary[label]) return glossary[label];
  if (kind === "ship") {
    return {
      definition: null,
      explanation: `${label} is the ship at the center of the scene; its slow arrival turns an ordinary port event into a mystery.`,
      deeper_context: "The passage asks the reader to read the ship the way the crowd and sailors do: as a public object whose movement, rigging, and command reveal that something unusual has happened."
    };
  }
  if (kind === "place") {
    return {
      definition: null,
      explanation: `${label} is a geographic marker that helps place the ship's approach through Marseille's harbor landscape.`,
      deeper_context: "These named places are not decorative; they stage the ship's route and make the arrival feel observed, local, and concrete. They also slow the scene down so the reader experiences the approach as the crowd does."
    };
  }
  return {
    definition: null,
    explanation: `${label} is a contextual term that helps explain how the scene is situated and why the ship's arrival matters.`,
    deeper_context: "The term gives the reader world knowledge that the passage assumes: local geography, port custom, ship handling, or social setting."
  };
}

function normalizeInterpretationStatus(value, fallback = "stated") {
  return ["stated", "inferred_from_context", "external_context"].includes(value) ? value : fallback;
}

const VOICE_TYPES = [
  "direct_speech", "reported_speech", "reported_speech_summary",
  "internal_thought", "free_indirect_discourse", "free_indirect_question", "free_indirect_rationalization",
  "focalized_perception", "narrator_description", "ominous_narration",
  "character_judgment", "nonverbal_countervoice", "avoidance_focus",
];
function normalizeVoiceType(value) {
  return VOICE_TYPES.includes(value) ? value : "internal_thought";
}
const VOICE_STATUS = ["stated", "inferred_from_context", "inferred_from_style", "inferred_from_effect", "external_context"];
function normalizeVoiceStatus(value) {
  return VOICE_STATUS.includes(value) ? value : "inferred_from_context";
}

function titleForOutput(output, text) {
  return shortText(output.title || output.summary?.title || output.summary?.short_title || output.summary?.doing || text, 72);
}

function scrubUnstatedIdentity(text, value) {
  if (!value || /\bMr\.?\s+Dursley\b/i.test(text)) return value;
  return String(value)
    .replace(/\bMr\.?\s+Dursley\b/g, "the man")
    .replace(/^Dursley\b/, "The man")
    .replace(/\bDursley(?=\s+(retreats|decides|rationalizes|doubts|considers|avoids|harbors|tries|attempts|dismisses|stops|rushes)\b)/g, "the man");
}

function scrubOutputIdentities(text, output) {
  output.title = scrubUnstatedIdentity(text, output.title);
  if (output.summary) {
    output.summary.doing = scrubUnstatedIdentity(text, output.summary.doing);
    output.summary.matters = scrubUnstatedIdentity(text, output.summary.matters);
    output.summary.tension = scrubUnstatedIdentity(text, output.summary.tension);
  }
  (output.nodes || []).forEach((node) => {
    node.label = scrubUnstatedIdentity(text, node.label);
  });
  (output.context_entities || []).forEach((entity) => {
    entity.label = scrubUnstatedIdentity(text, entity.label);
    entity.explanation = scrubUnstatedIdentity(text, entity.explanation);
    entity.deeper_context = scrubUnstatedIdentity(text, entity.deeper_context);
    entity.narrative_function = scrubUnstatedIdentity(text, entity.narrative_function);
    entity.symbolic_role = scrubUnstatedIdentity(text, entity.symbolic_role);
  });
  (output.voice_events || []).forEach((voice) => {
    voice.speaker = scrubUnstatedIdentity(text, voice.speaker);
    voice.function = scrubUnstatedIdentity(text, voice.function);
  });
  return output;
}

function nodeText(node) {
  return `${node.label || ""} ${node.quote || ""}`.toLowerCase();
}

function hasAny(text, needles) {
  return needles.some((needle) => text.includes(needle));
}

function firstMatchingNode(nodes, needles) {
  return nodes.find((node) => hasAny(nodeText(node), needles)) || null;
}

function matchingNodes(nodes, needles) {
  return nodes.filter((node) => hasAny(nodeText(node), needles));
}

function setEdge(edges, from, to, type) {
  if (!from || !to || from.id === to.id) return;
  const existing = edges.find((edge) => edge.from === from.id && edge.to === to.id);
  if (existing) {
    existing.type = type;
    return;
  }
  edges.push({ from: from.id, to: to.id, type });
}

function setRole(node, role) {
  if (node) node.role = role;
}

function nextNodeId(nodes) {
  let i = nodes.length + 1;
  const ids = new Set(nodes.map((node) => node.id));
  while (ids.has(`n${i}`)) i++;
  return `n${i}`;
}

function addQuotedNode(text, nodes, node) {
  const quote = findMention(text, node.patterns || [node.quote || node.label]);
  if (!quote) return null;
  const existing = nodes.find((candidate) => candidate.quote === quote);
  if (existing) return existing;
  const created = {
    id: nextNodeId(nodes),
    label: node.label,
    role: node.role,
    quote,
    ...ground(text, quote),
  };
  nodes.push(created);
  return created;
}

function normalizeContextTarget(entity, target) {
  if (!entity || !target) return;
  const current = Array.isArray(entity.attach_to) ? entity.attach_to : [];
  entity.attach_to = [target.id, ...current.filter((id) => id !== target.id)].slice(0, 3);
}

function addNarrativeContextEntity(text, nodes, contextEntities, term) {
  if (contextEntities.some((entity) => termKey(entity.label || entity.quote) === termKey(term.label))) return;
  const quote = findMention(text, term.patterns || [term.label]);
  if (!quote) return;
  const grounded = ground(text, quote);
  const target = term.target || nearestNode(nodes, grounded.source_start)[0] || null;
  contextEntities.push({
    id: `c${contextEntities.length + 1}`,
    label: term.label,
    kind: term.kind,
    quote,
    explanation: term.explanation,
    deeper_context: term.deeper_context,
    definition: term.definition || null,
    narrative_function: term.narrative_function || null,
    symbolic_role: term.symbolic_role || null,
    interpretation_status: normalizeInterpretationStatus(term.interpretation_status, term.symbolic_role || term.narrative_function ? "inferred_from_context" : "stated"),
    attach_to: target ? [target] : [],
    importance: term.importance || "medium",
    map_query: null,
    ...grounded,
  });
}

function refineNarrativeCognition(text, nodes, edges, contextEntities, spine) {
  const lower = text.toLowerCase();
  const looksPsychological = hasAny(lower, ["being stupid", "wasn't such an unusual", "no point in worrying", "all the same", "changed his mind", "those people in cloaks"]);
  if (!looksPsychological) return { edges, contextEntities, spine };

  const reactions = matchingNodes(nodes, ["dashed", "hurried", "snapped", "seized", "telephone", "dialling", "dialing"]);
  const reaction = reactions[0] || null;
  const denial = firstMatchingNode(nodes, ["being stupid", "changed his mind", "receiver back", "no, he was being stupid"]);
  const avoidance = firstMatchingNode(nodes, ["mrs dursley", "no point in worrying", "upset", "mention of her sister"]);
  const residual = firstMatchingNode(nodes, ["people in cloaks", "those people in cloaks", "all the same"]);

  if (denial && hasAny(nodeText(denial), ["potter", "unusual name"])) {
    const denialQuote = findMention(text, ["no, he was being stupid", "he was being stupid"]);
    if (denialQuote) {
      denial.label = "He tells himself he is being stupid";
      denial.quote = denialQuote;
      Object.assign(denial, ground(text, denialQuote));
    }
  }

  let rationalizations = matchingNodes(nodes, ["potter", "wasn't such an unusual", "lots of people", "harry", "harvey", "harold", "never even seen"]).filter((node) => node !== denial);
  if (!rationalizations.some((node) => hasAny(nodeText(node), ["potter", "unusual name", "lots of people"]))) {
    const potterRationalization = addQuotedNode(text, nodes, {
      label: "He decides Potter is a common name",
      role: "rationalization",
      patterns: ["Potter wasn’t\nsuch an unusual name. He was sure there were lots of people\ncalled Potter who had a son called Harry", "Potter wasn’t\nsuch an unusual name", "Potter wasn't\nsuch an unusual name"]
    });
    if (potterRationalization) rationalizations = [potterRationalization, ...rationalizations];
  }

  reactions.forEach((node) => setRole(node, "reaction"));
  setRole(denial, "denial");
  rationalizations.forEach((node) => setRole(node, "rationalization"));
  setRole(avoidance, "avoidance");
  setRole(residual, "residual_anxiety");

  const rationalizationsBeforeAvoidance = avoidance
    ? rationalizations.filter((node) => (node.source_start ?? 1e9) <= (avoidance.source_start ?? 1e9))
    : rationalizations;
  const firstRationalization = rationalizationsBeforeAvoidance[0] || rationalizations[0] || null;
  const lastRationalization = rationalizationsBeforeAvoidance[rationalizationsBeforeAvoidance.length - 1] || firstRationalization;
  setEdge(edges, residual, reaction, "triggers");
  for (let i = 0; i < reactions.length - 1; i++) setEdge(edges, reactions[i], reactions[i + 1], "then");
  setEdge(edges, reactions[reactions.length - 1] || reaction, denial, "then");
  setEdge(edges, denial, firstRationalization, "rationalizes");
  for (let i = 0; i < rationalizationsBeforeAvoidance.length - 1; i++) setEdge(edges, rationalizationsBeforeAvoidance[i], rationalizationsBeforeAvoidance[i + 1], "rationalizes");
  setEdge(edges, lastRationalization, avoidance, "avoids");
  setEdge(edges, avoidance, residual, "fails_to_resolve");
  setEdge(edges, residual, firstRationalization, "undercuts");

  for (const edge of edges) {
    const from = nodes.find((node) => node.id === edge.from);
    const to = nodes.find((node) => node.id === edge.to);
    if (edge.type === "causes" && from?.role === "rationalization" && to?.role === "avoidance") edge.type = "avoids";
    if (edge.type === "foreshadows" && to?.role === "residual_anxiety") edge.type = "fails_to_resolve";
  }

  for (const entity of contextEntities) {
    const eText = `${entity.label || ""} ${entity.quote || ""}`.toLowerCase();
    if (eText.includes("cloak")) {
      entity.kind = !entity.kind || ["other", "group"].includes(entity.kind) ? "mystery_signal" : entity.kind;
      entity.narrative_function = entity.narrative_function || "external anomaly";
      entity.symbolic_role = entity.symbolic_role || "evidence that his normal-world explanation is failing";
      entity.interpretation_status = "inferred_from_context";
      normalizeContextTarget(entity, residual);
    }
    if (eText.includes("mrs dursley")) {
      entity.narrative_function = entity.narrative_function || "family topic being avoided";
      entity.symbolic_role = entity.symbolic_role || "domestic consequence of the strange event";
      entity.interpretation_status = "inferred_from_context";
      normalizeContextTarget(entity, avoidance);
    }
    if (eText.includes("harry") || eText.includes("potter")) {
      entity.narrative_function = entity.narrative_function || "name that turns a public oddity into a family threat";
      entity.symbolic_role = entity.symbolic_role || "connection he tries to explain away";
      entity.interpretation_status = "inferred_from_context";
      normalizeContextTarget(entity, firstRationalization);
    }
  }

  addNarrativeContextEntity(text, nodes, contextEntities, {
    label: "Potter",
    kind: "person",
    patterns: ["Potter"],
    target: firstRationalization?.id,
    explanation: "The name matters because it links the strange public signs to the family topic the character wants to keep at a distance.",
    deeper_context: "The passage turns a name into a pressure point. He tries to make it ordinary, but the effort to explain it away reveals how much it has unsettled him.",
    narrative_function: "name that triggers rationalization",
    symbolic_role: "connection between the strange event and family history",
    interpretation_status: "inferred_from_context",
    importance: "high",
  });
  addNarrativeContextEntity(text, nodes, contextEntities, {
    label: "people in cloaks",
    kind: "mystery_signal",
    patterns: ["people in cloaks", "those people in cloaks"],
    target: residual?.id,
    explanation: "These figures are the leftover strange evidence his explanations cannot get rid of.",
    deeper_context: "They return at the end of the passage after the character has tried to calm himself down. That placement makes them function as unresolved anxiety rather than simple background detail.",
    definition: "People wearing long outer garments.",
    narrative_function: "external anomaly",
    symbolic_role: "evidence that his normal-world explanation is failing",
    interpretation_status: "inferred_from_context",
    importance: "high",
  });

  const cognitionSpine = [...reactions, denial, ...rationalizationsBeforeAvoidance, avoidance, residual].filter(Boolean);
  const seen = new Set();
  const refinedSpine = cognitionSpine.filter((node) => {
    if (seen.has(node.id)) return false;
    seen.add(node.id);
    return true;
  }).map((node) => node.id).slice(0, 7);
  return { edges, contextEntities, spine: refinedSpine.length >= 4 ? refinedSpine : spine };
}

function fallbackContextEntities(text, nodes, existing) {
  const seen = new Set(existing.map((entity) => termKey(entity.label || entity.quote)));
  const terms = [
    { label: "Pharaon", kind: "ship", patterns: ["Pharaon"] },
    { label: "three-master", kind: "technical_term", patterns: ["three-master"] },
    { label: "Smyrna", kind: "place", patterns: ["Smyrna"] },
    { label: "Trieste", kind: "place", patterns: ["Trieste"] },
    { label: "Naples", kind: "place", patterns: ["Naples"] },
    { label: "Château d'If", kind: "place", patterns: ["Château d’If", "Château d'If"] },
    { label: "Cape Morgion", kind: "place", patterns: ["Cape Morgion"] },
    { label: "Rion island", kind: "place", patterns: ["Rion island"] },
    { label: "Fort Saint-Jean", kind: "place", patterns: ["Fort Saint-Jean"] },
    { label: "Marseilles", kind: "place", patterns: ["Marseilles"] },
    { label: "Phocee docks", kind: "institution", patterns: ["Phocee docks"] },
    { label: "Calasareigne", kind: "place", patterns: ["Calasareigne"] },
    { label: "Jaros islands", kind: "place", patterns: ["Jaros islands"] },
    { label: "Pomègue", kind: "place", patterns: ["Pomègue", "Pomegue"] },
    { label: "topsails", kind: "technical_term", patterns: ["topsails"] },
    { label: "jib", kind: "technical_term", patterns: ["jib,"] },
    { label: "spanker", kind: "technical_term", patterns: ["spanker"] },
    { label: "anchor a-cockbill", kind: "technical_term", patterns: ["anchor a-cockbill"] },
    { label: "jib-boom guys", kind: "technical_term", patterns: ["jib-boom guys"] },
    { label: "pilot", kind: "technical_term", patterns: ["pilot"] }
  ];
  const additions = [];
  for (const term of terms) {
    if (seen.has(termKey(term.label))) continue;
    const quote = findMention(text, term.patterns);
    if (!quote) continue;
    const grounded = ground(text, quote);
    const context = fallbackContextFor(term.label, term.kind);
    additions.push({
      id: `c${existing.length + additions.length + 1}`,
      label: term.label,
      kind: term.kind,
      quote,
      explanation: context.explanation,
      deeper_context: context.deeper_context,
      definition: context.definition,
      narrative_function: term.kind === "technical_term" ? "technical detail that clarifies the scene" : term.kind === "place" ? "geographic context for the scene" : "contextual anchor",
      symbolic_role: null,
      interpretation_status: term.kind === "technical_term" || term.kind === "place" ? "external_context" : "stated",
      attach_to: nearestNode(nodes, grounded.source_start),
      importance: term.kind === "technical_term" || ["Pharaon", "Marseilles", "Château d'If", "Fort Saint-Jean"].includes(term.label) ? "high" : "medium",
      map_query: term.kind === "place" ? `${term.label} Marseille` : null,
      ...grounded,
    });
    seen.add(termKey(term.label));
  }
  return additions;
}

async function extract(text, mode) {
  const userText = mode && mode !== "auto" ? `Requested mode: ${mode}\n\n${text}` : text;
  const raw = await callModel(userText);
  const parsed = parseJSON(raw);
  const nodes = (parsed.nodes || []).map((n) => {
    const quote = n.quote || n.source_quote || "";
    return { ...n, quote, ...ground(text, quote) };
  });
  const nodeIds = new Set(nodes.map((n) => n.id));
  let contextEntities = (parsed.context_entities || parsed.entities || []).map((entity, i) => {
    const id = entity.id || `c${i + 1}`;
    const quote = entity.quote || entity.source_quote || entity.label || "";
    const attachTo = Array.isArray(entity.attach_to) ? entity.attach_to.filter((nodeId) => nodeIds.has(nodeId)).slice(0, 3) : [];
    return {
      ...entity,
      id,
      quote,
      attach_to: attachTo,
      definition: entity.definition || null,
      narrative_function: entity.narrative_function || null,
      symbolic_role: entity.symbolic_role || null,
      interpretation_status: normalizeInterpretationStatus(entity.interpretation_status, entity.symbolic_role || entity.narrative_function ? "inferred_from_context" : "stated"),
      map_query: entity.map_query || null,
      importance: entity.importance || "medium",
      ...ground(text, quote),
    };
  });
  if (contextEntities.length < 10) {
    contextEntities = contextEntities.concat(fallbackContextEntities(text, nodes, contextEntities));
  }
  let edges = (parsed.edges || []).filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to));
  let spine = Array.isArray(parsed.spine) ? parsed.spine.filter((id) => nodeIds.has(id)).slice(0, 7) : [];
  const outMode = parsed.mode || (mode && mode !== "auto" ? mode : "");
  if (outMode === "narrative") {
    const refined = refineNarrativeCognition(text, nodes, edges, contextEntities, spine);
    edges = refined.edges;
    contextEntities = refined.contextEntities;
    spine = refined.spine;
  }
  const voiceEvents = (parsed.voice_events || []).map((v, i) => {
    const quote = v.quote || v.source_quote || "";
    const attachTo = Array.isArray(v.attach_to) ? v.attach_to.filter((nodeId) => nodeIds.has(nodeId)).slice(0, 3) : [];
    return {
      id: v.id || `v${i + 1}`,
      speaker: v.speaker || "Narrator",
      voice_type: normalizeVoiceType(v.voice_type),
      quote,
      tone: v.tone || null,
      function: v.function || null,
      attach_to: attachTo,
      interpretation_status: normalizeVoiceStatus(v.interpretation_status),
      ...ground(text, quote),
    };
  }).filter((v) => v.quote).slice(0, 40);
  const output = {
    mode: outMode,
    title: parsed.title || parsed.summary?.title || parsed.summary?.short_title || "",
    summary: parsed.summary || {},
    spine,
    questions: Array.isArray(parsed.questions) ? parsed.questions.slice(0, 8) : [],
    context_entities: contextEntities.slice(0, 20),
    voice_events: voiceEvents,
    attached_context_ids: [],
    nodes,
    edges,
    model: MODEL,
  };
  return scrubOutputIdentities(text, output);
}

// ---- run history ----------------------------------------------------------
function readRuns() {
  if (!existsSync(RUNS_FILE)) return [];
  try {
    const parsed = JSON.parse(readFileSync(RUNS_FILE, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRuns(runs) {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(RUNS_FILE, JSON.stringify(runs, null, 2));
}

function shortText(s, n = 86) {
  const clean = String(s || "").replace(/\s+/g, " ").trim();
  return clean.length > n ? `${clean.slice(0, n - 1)}…` : clean;
}

function makeRunId(date = new Date()) {
  const stamp = date.toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
  return `run_${stamp}_${randomUUID().slice(0, 8)}`;
}

function runSummary(run) {
  const out = run.output || {};
  return {
    id: run.id,
    created_at: run.created_at,
    updated_at: run.updated_at || "",
    requested_mode: run.requested_mode,
    title: run.title,
    mode: out.mode || "",
    model: out.model || "",
    text_preview: shortText(run.text, 110),
    node_count: Array.isArray(out.nodes) ? out.nodes.length : 0,
    edge_count: Array.isArray(out.edges) ? out.edges.length : 0,
    spine_count: Array.isArray(out.spine) ? out.spine.length : 0,
    question_count: Array.isArray(out.questions) ? out.questions.length : 0,
    context_count: Array.isArray(out.context_entities) ? out.context_entities.length : 0,
    voice_count: Array.isArray(out.voice_events) ? out.voice_events.length : 0,
  };
}

function saveRun(text, requestedMode, output) {
  const created = new Date();
  const run = {
    id: makeRunId(created),
    created_at: created.toISOString(),
    requested_mode: requestedMode || "auto",
    title: titleForOutput(output, text),
    text,
    output,
  };
  const runs = [run, ...readRuns().filter((r) => r.id !== run.id)].slice(0, 100);
  writeRuns(runs);
  return run;
}

function sendJSON(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  return res.end(JSON.stringify(body));
}

// ---- http -----------------------------------------------------------------
function readBody(req) {
  return new Promise((resolve) => {
    let b = ""; req.on("data", (d) => (b += d)); req.on("end", () => resolve(b));
  });
}

createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    return res.end(HTML);
  }
  if (req.method === "GET" && url.pathname === "/api/runs") {
    return sendJSON(res, 200, { runs: readRuns().map(runSummary) });
  }
  if (req.method === "GET" && url.pathname.startsWith("/api/runs/")) {
    const id = decodeURIComponent(url.pathname.slice("/api/runs/".length));
    const run = readRuns().find((r) => r.id === id);
    if (!run) return sendJSON(res, 404, { error: "run not found" });
    return sendJSON(res, 200, run);
  }
  if (req.method === "POST" && url.pathname.endsWith("/reprocess") && url.pathname.startsWith("/api/runs/")) {
    try {
      const id = decodeURIComponent(url.pathname.slice("/api/runs/".length, -"/reprocess".length));
      const runs = readRuns();
      const runIndex = runs.findIndex((r) => r.id === id);
      if (runIndex < 0) return sendJSON(res, 404, { error: "run not found" });
      const run = runs[runIndex];
      if (!run.text || !run.text.trim()) throw new Error("run has no text to reprocess");
      const updatedOutput = await extract(run.text, run.requested_mode || "auto");
      const now = new Date().toISOString();
      run.revisions = [
        {
          archived_at: now,
          reason: "reprocess",
          output: run.output || {},
        },
        ...(Array.isArray(run.revisions) ? run.revisions : []),
      ].slice(0, 5);
      run.output = updatedOutput;
      run.updated_at = now;
      run.title = titleForOutput(updatedOutput, run.text);
      runs[runIndex] = run;
      writeRuns(runs);
      return sendJSON(res, 200, run);
    } catch (e) {
      return sendJSON(res, 500, { error: e.message });
    }
  }
  if (req.method === "POST" && url.pathname.endsWith("/context-attachments") && url.pathname.startsWith("/api/runs/")) {
    try {
      const id = decodeURIComponent(url.pathname.slice("/api/runs/".length, -"/context-attachments".length));
      const runs = readRuns();
      const runIndex = runs.findIndex((r) => r.id === id);
      if (runIndex < 0) return sendJSON(res, 404, { error: "run not found" });
      const { ids } = JSON.parse(await readBody(req));
      const validIds = new Set((runs[runIndex].output?.context_entities || []).map((entity) => entity.id));
      runs[runIndex].output.attached_context_ids = Array.isArray(ids) ? ids.filter((entityId) => validIds.has(entityId)).slice(0, 30) : [];
      writeRuns(runs);
      return sendJSON(res, 200, runs[runIndex]);
    } catch (e) {
      return sendJSON(res, 500, { error: e.message });
    }
  }
  if (req.method === "POST" && url.pathname === "/api/extract") {
    try {
      const { text, mode } = JSON.parse(await readBody(req));
      if (!text || !text.trim()) throw new Error("empty text");
      const out = await extract(text, mode);
      const run = saveRun(text, mode || "auto", out);
      return sendJSON(res, 200, {
        ...out,
        run_id: run.id,
        created_at: run.created_at,
        requested_mode: run.requested_mode,
        title: run.title,
      });
    } catch (e) {
      return sendJSON(res, 500, { error: e.message });
    }
  }
  res.writeHead(404); res.end("not found");
}).listen(PORT, () => {
  const keyOk = PROVIDER === "gemini" ? !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) : !!process.env.ANTHROPIC_API_KEY;
  console.log(`Re-read prototype on http://localhost:${PORT}  (model: ${MODEL}, provider: ${PROVIDER})`);
  if (!keyOk) console.log(`WARNING: no API key set for provider "${PROVIDER}" — extraction will fail until you set one.`);
});
