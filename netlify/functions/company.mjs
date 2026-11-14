import { companyCore, publicCompany } from "../lib/research.js";
import { json, fail, sym } from "../lib/http.js";
export default async (req) => {
  const s = sym(new URL(req.url).searchParams.get("symbol"));
  if (!s) return json({ error: "symbol required" }, 400);
  try { return json(publicCompany(await companyCore(s)), 200, 600); } catch (e) { return fail(e); }
};
export const config = { path: "/api/company" };
