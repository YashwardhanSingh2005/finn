import { buildDigest } from "../lib/digest.js";
import { PORTFOLIO } from "../lib/portfolio.js";
import { DEFAULT_RULES } from "../lib/alerts.js";
import { json, fail, sym } from "../lib/http.js";
// GET /api/digest?hours=24 | from=ISO&to=ISO ; &symbols=A:5,B:3 (optional custom holdings) ; &prefs=<json> ; &rules=<json>
export default async (req) => {
  const q = new URL(req.url).searchParams;
  const to = q.get("to") ? new Date(q.get("to")) : new Date();
  const hours = Math.min(24 * 92, Math.max(1, Number(q.get("hours") || 24)));
  const from = q.get("from") ? new Date(q.get("from")) : new Date(to.getTime() - hours * 3600e3);
  const holdings = q.get("symbols")
    ? q.get("symbols").split(",").slice(0, 25).map((p) => { const [s, w] = p.split(":"); return { symbol: sym(s), weight: Number(w) || 5 }; }).filter((h) => h.symbol)
    : PORTFOLIO;
  let prefs = {}, rules = DEFAULT_RULES;
  try { if (q.get("prefs")) prefs = JSON.parse(q.get("prefs")); } catch {}
  try { if (q.get("rules")) rules = { ...DEFAULT_RULES, ...JSON.parse(q.get("rules")) }; } catch {}
  try { return json(await buildDigest({ from, to, holdings, prefs, rules })); } catch (e) { return fail(e); }
};
export const config = { path: "/api/digest" };
