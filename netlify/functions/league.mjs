// Portfolio candour league: each holding's latest earnings call, scored the same way. No model.
import { companyCore } from "../lib/research.js";
import { pickCalls } from "../lib/ledger.js";
import { fetchPdfPages } from "../lib/pdf.js";
import { analyseCall } from "../lib/discourse.js";
import { memo } from "../lib/cache.js";
import { PORTFOLIO } from "../lib/portfolio.js";
import { json, fail } from "../lib/http.js";

async function one(symbol) {
  const { c } = await companyCore(symbol);
  for (const call of pickCalls(c, 2)) {
    try {
      const r = await memo(`callstat:v1:${call.transcript}`, Infinity, async () => {
        const a = analyseCall((await fetchPdfPages(call.transcript, { maxPages: 45 })).pages);
        return { parsed: a.parsed, questions: a.questions, analysts: a.analysts, nonAnswerRate: a.nonAnswerRate, nonAnswers: a.nonAnswers.length, praiseRate: a.praiseRate, toneQA: a.qa.tone, uncQA: a.qa.uncPer1k, hard: a.pushback };
      });
      if (r.parsed) return { symbol: c.symbol, name: c.name, period: call.period, url: call.transcript, ...r };
    } catch {}
  }
  return { symbol, error: "no parseable transcript" };
}

// GET /api/league?symbol=X → one company's row (the client assembles the table progressively).
export default async (req) => {
  const s = (new URL(req.url).searchParams.get("symbol") || "").toUpperCase().replace(/[^A-Z0-9&_-]/g, "");
  if (!s) return json({ symbols: PORTFOLIO.map((h) => h.symbol) });
  try { return json(await one(s), 200, 3600); } catch (e) { return fail(e); }
};
export const config = { path: "/api/league" };
