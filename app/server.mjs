#!/usr/bin/env node
// Re-read V1 prototype server. Zero dependencies (Node 18+ built-in http + fetch).
//
//   GEMINI_API_KEY=...   node app/server.mjs
//   $env:GEMINI_API_KEY="..."; node app/server.mjs        (PowerShell)
//
// Then open http://localhost:5173 . Optional env: MODEL, PORT, PROVIDER, ANTHROPIC_API_KEY.

import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 5173);
const MODEL = process.env.MODEL || "gemini-3.1-flash-lite";
const PROVIDER = process.env.PROVIDER || (/^gemini/i.test(MODEL) ? "gemini" : "anthropic");
const SYSTEM = readFileSync(join(__dirname, "extract-prompt.md"), "utf8");
const HTML = readFileSync(join(__dirname, "index.html"), "utf8");

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
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a >= 0 && b > a) t = t.slice(a, b + 1);
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

async function extract(text) {
  const raw = await callModel(text);
  const parsed = parseJSON(raw);
  const nodes = (parsed.nodes || []).map((n) => ({ ...n, ...ground(text, n.quote) }));
  return { nodes, edges: parsed.edges || [], model: MODEL };
}

// ---- http -----------------------------------------------------------------
function readBody(req) {
  return new Promise((resolve) => {
    let b = ""; req.on("data", (d) => (b += d)); req.on("end", () => resolve(b));
  });
}

createServer(async (req, res) => {
  if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    return res.end(HTML);
  }
  if (req.method === "POST" && req.url === "/api/extract") {
    try {
      const { text } = JSON.parse(await readBody(req));
      if (!text || !text.trim()) throw new Error("empty text");
      const out = await extract(text);
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify(out));
    } catch (e) {
      res.writeHead(500, { "content-type": "application/json" });
      return res.end(JSON.stringify({ error: e.message }));
    }
  }
  res.writeHead(404); res.end("not found");
}).listen(PORT, () => {
  const keyOk = PROVIDER === "gemini" ? !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) : !!process.env.ANTHROPIC_API_KEY;
  console.log(`Re-read prototype on http://localhost:${PORT}  (model: ${MODEL}, provider: ${PROVIDER})`);
  if (!keyOk) console.log(`WARNING: no API key set for provider "${PROVIDER}" — extraction will fail until you set one.`);
});
