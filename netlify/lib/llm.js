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
  const res = await anthropic().messages.create({
    model,
    max_tokens: maxTokens,
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: user }],
  });
  const text = res.content.map((c) => c.text || "").join("");
  const u = res.usage || {};
  const [pi, po] = PRICE[model] || [0, 0];
  const usd = ((u.input_tokens || 0) * pi + (u.output_tokens || 0) * po + (u.cache_read_input_tokens || 0) * pi * 0.1) / 1e6;
  const meta = { model, tier, ms: Date.now() - t0, inTok: u.input_tokens, outTok: u.output_tokens, usd: +usd.toFixed(5) };
  return { json: parseJSON(text), meta };
}

function parseJSON(t) {
  const s = t.indexOf("{"), e = t.lastIndexOf("}");
  if (s < 0 || e < 0) return null;
  try { return JSON.parse(t.slice(s, e + 1)); } catch { return null; }
}
