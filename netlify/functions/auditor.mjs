import { companyCore } from "../lib/research.js";
import { auditorFindings } from "../lib/auditor.js";
import { memo } from "../lib/cache.js";
import { json, fail, sym } from "../lib/http.js";
// What the auditor said in the latest annual report (no model; cached per report).
export default async (req) => {
  const s = sym(new URL(req.url).searchParams.get("symbol"));
  if (!s) return json({ error: "symbol required" }, 400);
  try {
    const { c } = await companyCore(s);
    const ar = c.docs.annualReports[0];
    return json(await memo(`auditor:v3:${ar?.url || s}`, Infinity, () => auditorFindings(ar)));
  } catch (e) { return fail(e); }
};
export const config = { path: "/api/auditor" };
