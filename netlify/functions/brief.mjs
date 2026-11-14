import { companyCore, businessBrief, bullBear, ledgerFor } from "../lib/research.js";
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
    return json(await bullBear(s, core.a, ledger, biz));
  } catch (e) { return fail(e); }
};
export const config = { path: "/api/brief" };
