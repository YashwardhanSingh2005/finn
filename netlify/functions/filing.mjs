import { enrichFiling } from "../lib/filing.js";
import { llmAvailable } from "../lib/llm.js";
import { json, fail } from "../lib/http.js";
const OK = /^https:\/\/(www\.bseindia\.com|nsearchives\.nseindia\.com|archives\.nseindia\.com)\//;
export default async (req) => {
  const q = new URL(req.url).searchParams;
  const url = q.get("url"), category = q.get("category") || "generic";
  if (!url || !OK.test(url)) return json({ error: "only NSE/BSE filing URLs are accepted" }, 400);
  if (!llmAvailable()) return json({ error: "LLM not configured on this deployment" }, 503);
  try { return json(await enrichFiling({ url, category })); } catch (e) { return fail(e); }
};
export const config = { path: "/api/filing" };
