import { companyCore, businessBrief, bullBear, ledgerFor } from "../lib/research.js";
import { candour } from "../lib/discourse.js";
import { pickCalls } from "../lib/ledger.js";
import { memo } from "../lib/cache.js";
import { llmAvailable } from "../lib/llm.js";
import { json, fail, sym } from "../lib/http.js";
// ?symbol=X&part=business|bullbear
export default async (req) => {
  const q = new URL(req.url).searchParams;
  const s = sym(q.get("symbol"));
  if (!s) return json({ error: "symbol required" }, 400);
  if (!llmAvailable()) return json({ error: "LLM not configured on this deployment" }, 503);
  try {
    const core = await companyCore(s);
    const biz = await businessBrief(core.c);
    if (q.get("part") !== "bullbear") return json(biz);
    const ledger = await ledgerFor(s).catch(() => null);
    const calls = pickCalls(core.c, 4);
    const cand = await memo(`candour:v3:${core.c.symbol}:${calls[0]?.transcript || "none"}`, 7 * 864e5, () => candour(core.c, calls)).catch(() => null);
    return json(await bullBear(s, core.a, ledger, biz, cand));
  } catch (e) { return fail(e); }
};
export const config = { path: "/api/brief" };
