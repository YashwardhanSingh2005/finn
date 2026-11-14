import { backtest } from "../lib/backtest.js";
import { PORTFOLIO } from "../lib/portfolio.js";
import { json, fail } from "../lib/http.js";
export default async (req) => {
  const days = Math.min(365, Math.max(30, Number(new URL(req.url).searchParams.get("days") || 180)));
  const offset = Math.min(365, Math.max(0, Number(new URL(req.url).searchParams.get("offset") || 0)));
  try { return json(await backtest(PORTFOLIO, days, offset), 200, 3600); } catch (e) { return fail(e); }
};
export const config = { path: "/api/backtest" };
