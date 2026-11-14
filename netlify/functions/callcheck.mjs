// Instant, model-free read of a just-filed earnings-call transcript: how many analyst questions were
// dodged, tone and uncertainty, compared with the company's previous call. Used by the Push digest.
import { fetchPdfPages } from "../lib/pdf.js";
import { analyseCall } from "../lib/discourse.js";
import { companyCore } from "../lib/research.js";
import { pickCalls } from "../lib/ledger.js";
import { memo } from "../lib/cache.js";
import { json, fail, sym } from "../lib/http.js";
const OK = /^https:\/\/(www\.bseindia\.com|(nsearchives|archives)\.nseindia\.(com|in))\//;
export default async (req) => {
  const q = new URL(req.url).searchParams;
  const url = q.get("url"), s = sym(q.get("symbol"));
  if (!url || !OK.test(url) || !s) return json({ error: "symbol and an NSE/BSE transcript url required" }, 400);
  try {
    return json(await memo(`callcheck:v2:${url}`, Infinity, async () => {
      const doc = await fetchPdfPages(url, { maxPages: 45 });
      const now = analyseCall(doc.pages);
      // previous call = the most recent transcript in the company's index that isn't this one
      let prev = null;
      try {
        const { c } = await companyCore(s);
        const calls = pickCalls(c, 3).filter((x) => x.transcript !== url);
        for (const pc of calls) {
          const p = analyseCall((await fetchPdfPages(pc.transcript, { maxPages: 45 })).pages);
          if (p.parsed) { prev = { period: pc.period, url: pc.transcript, ...p }; break; }
        }
      } catch {}
      const strip = (x) => x && { nonAnswerCount: x.nonAnswers.length, questions: x.questions, analysts: x.analysts, nonAnswerRate: x.nonAnswerRate, nonAnswers: x.nonAnswers.slice(0, 3), toneQA: x.qa.tone, tonePrep: x.prepared.tone, uncQA: x.qa.uncPer1k, period: x.period, url: x.url, parsed: x.parsed };
      return { url, now: strip(now), prev: strip(prev) };
    }));
  } catch (e) { return fail(e); }
};
export const config = { path: "/api/callcheck" };
