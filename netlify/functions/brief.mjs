import { companyCore, businessBrief, bullBear, ledgerFor, evidenceList, ruleBullBear } from "../lib/research.js";
import { candour } from "../lib/discourse.js";
import { pickCalls } from "../lib/ledger.js";
import { memo } from "../lib/cache.js";
import { auditorFindings } from "../lib/auditor.js";
import { llmAvailable } from "../lib/llm.js";
import { json, fail, sym, fixture } from "../lib/http.js";
// ?symbol=X&part=business|bullbear
export default async (req) => {
  const q = new URL(req.url).searchParams;
  const s = sym(q.get("symbol"));
  if (!s) return json({ error: "symbol required" }, 400);
  const bb = q.get("part") === "bullbear", live = llmAvailable();
  const noModel = "LLM not configured on this deployment";
  const recorded = (kind, id) => fixture(kind, id).catch(() => null);
  try {
    if (!bb) {
      if (!live) { const fx = await recorded("brief", `${s}_business`); return fx ? json(fx) : json({ error: noModel }, 503); }
      return json(await businessBrief((await companyCore(s)).c));
    }
    // Bull vs bear: gather evidence from every layer. A model layer that can't run is replaced by its
    // recording if there is one, otherwise left out; the code-only layers always run.
    const core = await companyCore(s);
    const [biz, ledger] = await Promise.all([
      live ? businessBrief(core.c).catch(() => recorded("brief", `${s}_business`)) : recorded("brief", `${s}_business`),
      live ? ledgerFor(s).catch(() => recorded("ledger", s)) : recorded("ledger", s),
    ]);
    const calls = pickCalls(core.c, 4);
    const cand = await memo(`candour:v4:${core.c.symbol}:${calls[0]?.transcript || "none"}`, 7 * 864e5, () => candour(core.c, calls)).catch(() => null);
    const ar = core.c.docs.annualReports[0];
    const aud = await memo(`auditor:v3:${ar?.url || s}`, Infinity, () => auditorFindings(ar)).catch(() => null);
    let why = noModel;
    if (live) {
      try { return json(await bullBear(s, core.a, ledger, biz, cand, aud)); }
      catch (e) { if (!e.modelDown) throw e; why = e.message; }
    }
    // the model can't write the two cases: show the same evidence sorted by rule, and say so
    return json({ ...ruleBullBear(evidenceList(core.a, ledger, biz, cand, aud)), modelError: why });
  } catch (e) {
    const fx = e.modelDown && !bb ? await recorded("brief", `${s}_business`) : null;
    return fx ? json({ ...fx, modelError: e.message }) : fail(e);
  }
};
export const config = { path: "/api/brief" };
