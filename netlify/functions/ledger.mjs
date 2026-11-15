import { ledgerFor } from "../lib/research.js";
import { llmAvailable } from "../lib/llm.js";
import { json, fail, sym, fixture } from "../lib/http.js";
export default async (req) => {
  const s = sym(new URL(req.url).searchParams.get("symbol"));
  if (!s) return json({ error: "symbol required" }, 400);
  if (!llmAvailable()) { const fx = await fixture("ledger", s); return fx ? json(fx) : json({ error: "LLM not configured on this deployment" }, 503); }
  const judge = new URL(req.url).searchParams.get("judge") !== "0";
  try { return json(await ledgerFor(s, { judge })); }
  catch (e) {
    // model unreachable on a live deployment: a recording (labelled as one) beats an error
    const fx = e.modelDown ? await fixture("ledger", s) : null;
    return fx ? json({ ...fx, modelError: e.message }) : fail(e);
  }
};
export const config = { path: "/api/ledger" };
