import { searchCompany } from "../lib/screener.js";
import { json, fail } from "../lib/http.js";
export default async (req) => {
  const q = new URL(req.url).searchParams.get("q") || "";
  if (q.length < 2) return json([]);
  try { return json((await searchCompany(q)).filter((x) => x.symbol), 200, 3600); } catch (e) { return fail(e); }
};
export const config = { path: "/api/search" };
