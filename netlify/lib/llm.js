// Model router. Three tiers, chosen per task — the choice is logged with every result so the UI can
// show "what this cost" and "which model wrote this".
//   extract : bulk, structured extraction from long primary text (cheap, fast)
//   reason  : cross-quarter judgement (promise ledger verdicts, bull/bear) — the only place we pay up
// Numbers are NEVER produced by these models: they only locate/quote; arithmetic happens in code.
import Anthropic from "@anthropic-ai/sdk";

export const MODELS = {
  extract: process.env.FINN_MODEL_EXTRACT || "claude-haiku-5-5",
  reason: process.env.FINN_MODEL_REASON || "claude-sonnet-5-5",
};
// USD per 1M tokens (from the Netlify AI Gateway price list)
const PRICE = {
  "claude-haiku-5-5": [0.1, 0.5],
  "claude-sonnet-5-5": [2, 10],
  "claude-haiku-4-5": [1, 5],
};

let client;
const anthropic = () => (client ||= new Anthropic());

export const llmAvailable = () => !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_BASE_URL);

/**
 * Call a model and parse a JSON object out of the reply.
 * `system` is sent as a cacheable block (long instructions reused across calls).
 */
export async function llmJSON({ tier = "extract", system, user, maxTokens = 2000 }) {
  const model = MODELS[tier];
  const t0 = Date.now();
  // extraction: thinking off (Haiku 5.5 thinks adaptively by default, which silently eats the output
  // budget on a copy-and-structure task). judgement: adaptive thinking at medium effort, headroom for it.
  const thinkingCfg = tier === "extract"
    ? { thinking: { type: "disabled" }, output_config: { effort: "low" } }
    : { thinking: { type: "adaptive" }, output_config: { effort: "medium" } };
  const res = await anthropic().messages.create({
    model,
    max_tokens: tier === "extract" ? maxTokens : Math.max(maxTokens * 2, 12000),
    ...thinkingCfg,
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: user + "\n\nReply with the JSON object only, starting with {. No markdown fences, no commentary." }],
  });
  const text = res.content.filter((c) => c.type === "text").map((c) => c.text).join("");
  const u = res.usage || {};
  const [pi, po] = PRICE[model] || [0, 0];
  const usd = ((u.input_tokens || 0) * pi + (u.output_tokens || 0) * po + (u.cache_read_input_tokens || 0) * pi * 0.1) / 1e6;
  const meta = { model, tier, ms: Date.now() - t0, inTok: u.input_tokens, outTok: u.output_tokens, usd: +usd.toFixed(5) };
  const json = parseJSON(text);
  meta.stop = res.stop_reason;
  if (json?._salvaged) meta.salvaged = true;
  if (!json) { meta.rawHead = text.slice(0, 200); meta.rawTail = text.slice(-120); }
  return { json, meta };
}

function parseJSON(t) {
  const s = t.indexOf("{"), e = t.lastIndexOf("}");
  if (s < 0 || e < 0) return null;
  try { return JSON.parse(t.slice(s, e + 1)); } catch {}
  return salvage(t.slice(s));
}

/**
 * Output got cut off (max_tokens) or has a stray character: recover every COMPLETE object inside
 * each top-level array, plus complete top-level scalar fields. Better 7 verified claims than none.
 */
function salvage(t) {
  const out = {};
  const keyRe = /"([a-zA-Z_]+)"\s*:\s*/g;
  let m;
  // only scan depth-1 keys
  let depth = 0, inStr = false, esc = false;
  const depthAt = [];
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    depthAt[i] = depth;
    if (inStr) { if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === "{" || ch === "[") depth++;
    else if (ch === "}" || ch === "]") depth--;
  }
  while ((m = keyRe.exec(t))) {
    if (depthAt[m.index] !== 1) continue;
    const start = m.index + m[0].length;
    if (t[start] === "[") {
      const items = [];
      let d = 0, s0 = -1, str = false, e2 = false;
      for (let i = start + 1; i < t.length; i++) {
        const ch = t[i];
        if (str) { if (e2) e2 = false; else if (ch === "\\") e2 = true; else if (ch === '"') str = false; continue; }
        if (ch === '"') { str = true; continue; }
        if (ch === "{") { if (d === 0) s0 = i; d++; }
        else if (ch === "}") { d--; if (d === 0 && s0 >= 0) { try { items.push(JSON.parse(t.slice(s0, i + 1))); } catch {} s0 = -1; } }
        else if (ch === "]" && d === 0) break;
      }
      out[m[1]] = items;
    } else {
      const sm = t.slice(start).match(/^("(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?|true|false|null)/);
      if (sm) try { out[m[1]] = JSON.parse(sm[1]); } catch {}
    }
  }
  return Object.keys(out).length ? { ...out, _salvaged: true } : null;
}
