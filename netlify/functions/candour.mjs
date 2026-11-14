import { companyCore } from "../lib/research.js";
import { candour } from "../lib/discourse.js";
import { pickCalls } from "../lib/ledger.js";
import { memo } from "../lib/cache.js";
import { json, fail, sym } from "../lib/http.js";
// No model involved: lexicon + structure over the last four transcripts. Cached until a new call is filed.
export default async (req) => {
  const s = sym(new URL(req.url).searchParams.get("symbol"));
  if (!s) return json({ error: "symbol required" }, 400);
  try {
    const { c } = await companyCore(s);
    const calls = pickCalls(c, 4);
    return json(await memo(`candour:v1:${c.symbol}:${calls[0]?.transcript || "none"}`, 7 * 864e5, () => candour(c, calls)));
  } catch (e) { return fail(e); }
};
export const config = { path: "/api/candour" };
