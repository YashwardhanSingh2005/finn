import { ledgerFor } from "../lib/research.js";
import { llmAvailable } from "../lib/llm.js";
import { json, fail, sym } from "../lib/http.js";
export default async (req) => {
  const s = sym(new URL(req.url).searchParams.get("symbol"));
  if (!s) return json({ error: "symbol required" }, 400);
  if (!llmAvailable()) return json({ error: "LLM not configured on this deployment" }, 503);
  try { return json(await ledgerFor(s)); } catch (e) { return fail(e); }
};
export const config = { path: "/api/ledger" };
