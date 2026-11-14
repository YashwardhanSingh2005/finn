// PULL: research view. Layered so each layer is only as expensive as it must be:
//   L0 (free, instant)  : statements → snapshot, trajectory, balance sheet, cash quality, holders (code)
//   L1 (cheap model)    : business snapshot + explicit guidance, from management's own words in the
//                         latest call (with quotes + pages)
//   L2 (cheap model x4) : promise ledger extraction; code computes the verdicts
//   L3 (strong model)   : bull vs bear — may ONLY cite evidence IDs produced by L0–L2
import { fetchCompany, fetchPrices } from "./screener.js";
import { analyse } from "./fundamentals.js";
import { priceStats } from "./alerts.js";
import { fetchPdfPages, withPageMarkers, verifyQuote } from "./pdf.js";
import { llmJSON } from "./llm.js";
import { memo, cache } from "./cache.js";
import { buildLedger, pickCalls } from "./ledger.js";

export async function companyCore(symbol) {
  return memo(`core:v4:${symbol.toUpperCase()}`, 6 * 3600e3, async () => {
    const c = await fetchCompany(symbol);
    const prices = c.companyId ? await fetchPrices(c.companyId, 400).catch(() => []) : [];
    return { c, a: analyse(c), stats: priceStats(prices) };
  });
}

/** Revenue mix from the company's own investor-presentation breakup (as cited on its screener page). */
export function revenueMix(keyPoints) {
  if (!keyPoints) return null;
  const src = "company investor presentation / annual report (as cited on screener.in)";
  // format 1: "Revenue Breakup (Q2 FY27):[1] - BFSI: 32.8% - Consumer: 14.9% ..."
  const head = keyPoints.match(/(?:Revenue|Segment|Business)\s+(?:Break[- ]?up|Mix|Split)([^:]{0,40}):?/i);
  if (head) {
    const body = keyPoints.slice(head.index + head[0].length).split(/(?:Revenue|Segment|Business)\s+(?:Break[- ]?up|Mix|Split|Segments)/i)[0];
    const parts = [...body.matchAll(/-?\s*([A-Z][A-Za-z&,'()\/\- ]{1,48}?)\s*:\s*~?(\d{1,2}(?:\.\d+)?)\s*%/g)].map((x) => ({ name: x[1].trim(), share_pct: +x[2] }));
    const total = parts.reduce((t, p) => t + p.share_pct, 0);
    if (parts.length >= 2 && total >= 60 && total <= 110) return { label: (head[1].match(/\(([^)]*)\)/) || [])[1] || null, segments: parts.slice(0, 8), total: +total.toFixed(1), source: src };
  }
  // format 2: "a) Wires & Cables (87% in FY26 vs 84% in FY25): ... b) FMEG (9% in FY26 ...)"
  const parts2 = [...keyPoints.matchAll(/(?:^|\s)[a-z0-9]\)\s*([A-Z][A-Za-z&,'\/\- ]{1,48}?)\s*\(\s*~?(\d{1,2}(?:\.\d+)?)\s*%\s*(?:in\s+(FY\s?\d{2}))?/g)].map((x) => ({ name: x[1].trim(), share_pct: +x[2], fy: x[3] }));
  const total2 = parts2.reduce((t, p) => t + p.share_pct, 0);
  if (parts2.length >= 2 && total2 >= 60 && total2 <= 110) return { label: parts2[0].fy || null, segments: parts2.slice(0, 8).map(({ fy, ...x }) => x), total: +total2.toFixed(1), source: src };
  if (parts2.length === 1 && parts2[0].share_pct >= 60) return { label: parts2[0].fy || null, segments: [...parts2.map(({ fy, ...x }) => x), { name: "Others", share_pct: +(100 - parts2[0].share_pct).toFixed(1) }], total: 100, source: src };
  return null;
}

export function publicCompany({ c, a, stats }) {
  return {
    revenueMix: revenueMix(c.keyPoints),
    symbol: c.symbol, name: c.name, url: c.url, consolidated: c.consolidated, resolvedFrom: c.resolvedFrom || null,
    ratios: Object.fromEntries(Object.entries(c.ratios).map(([k, v]) => [k, v.text])),
    analysis: a,
    stats: stats && { ...stats, returnsByDate: undefined },
    docs: { annualReports: c.docs.annualReports.slice(0, 3), concalls: pickCalls(c, 4) },
    quarters: { periods: c.quarters.periods, rows: c.quarters.rows },
    fetchedAt: c.fetchedAt,
  };
}

const BUSINESS = `From the earnings-call transcript (management's prepared remarks) of an Indian listed company, return JSON:
{"what_it_does":"<= 35 words, plain English",
 "segments":[{"name","share_pct":number|null,"comment":"<= 14 words","quote":"verbatim 8-30 words","page":N}] (max 6; share only if stated),
 "guidance":[{"topic":"growth|margin|capex|other","statement":"<= 20 words","quote":"verbatim 10-45 words","page":N}] (explicit forward guidance only; max 6),
 "watch_items":[{"item":"<= 14 words: risk/issue management itself acknowledged","quote":"verbatim 8-35 words","page":N}] (max 4)}
Use ONLY the transcript. JSON only.`;

export async function businessBrief(c) {
  const call = pickCalls(c, 1)[0];
  if (!call) return { error: "No concall transcript linked for this company." };
  return memo(`biz:v5:${call.transcript}`, Infinity, async () => {
    const doc = await fetchPdfPages(call.transcript, { maxPages: 30 });
    const { json, meta } = await llmJSON({ tier: "extract", system: BUSINESS, user: withPageMarkers(doc.pages).slice(0, 120000), maxTokens: 4000 });
    let dropped = 0;
    const ver = (arr) => (arr || []).filter((x) => { const v = verifyQuote(x.quote, doc.pages); if (v.ok) x.page = v.page; else dropped++; return v.ok; });
    if (json) { json.segments = ver(json.segments); json.guidance = ver(json.guidance); json.watch_items = ver(json.watch_items); }
    return { call: call.period, url: call.transcript, data: json, dropped, meta, _noCache: !json };
  });
}

const BULLBEAR = `You are a buy-side analyst writing a tight bull and bear case for an Indian listed company.
You receive an EVIDENCE list; each item has an id. Every point you make MUST cite 1-3 evidence ids in "refs". Do not use any fact that is not in the evidence. No outside knowledge, no price targets.
Return JSON {"bull":[{"point":"<= 22 words","refs":["E3"]}] (3 points), "bear":[...] (3 points), "verdict_question":"<= 20 words: the single question that decides which case wins"}. JSON only.`;

/** Collect evidence items with stable ids from all earlier layers. */
export function evidenceList(a, ledger, biz, cand) {
  const ev = [];
  const add = (kind, text, src) => ev.push({ id: `E${ev.length + 1}`, kind, text, src });
  const r = a.results;
  if (r) add("numbers", `Latest quarter ${r.period}: ` + r.rows.map((x) => `${x.label} ₹${x.cur} cr (QoQ ${x.qoq ?? "–"}%, YoY ${x.yoy ?? "–"}%)`).join("; "), "reported results");
  for (const k of ["trajectory", "balance", "cash", "holders"]) for (const f of a[k]?.flags || []) add(k, `${f.title}: ${f.detail}`, `rule: ${f.rule}`);
  if (a.trajectory) add("trajectory", `${a.trajectory.years}y revenue CAGR ${a.trajectory.revCagr}%, PAT CAGR ${a.trajectory.patCagr}%`, "annual statements");
  if (ledger?.credibility) add("credibility", `Track record: ${ledger.credibility.kept} of ${ledger.credibility.scored} checkable promises kept → ${ledger.credibility.pNext}% chance the next is kept (80% range ${ledger.credibility.lo}–${ledger.credibility.hi}%)${ledger.credibility.style ? `; style: ${ledger.credibility.style}` : ""}`, "Beta posterior over ledger verdicts");
  for (const t of ledger?.threads || []) if (t.verdict && t.verdict !== "no evidence") add("ledger", `Promise "${t.title}" (said in ${t.callsMentioned.join(", ")}) → ${t.verdict}${t.actual ? ` (target ${t.target}, actual ${t.actual})` : t.actualText ? ` (${t.actualText})` : ""}${t.history.some((h) => ["raised", "lowered", "pushed out"].includes(h.change)) ? `; goalpost: ${t.history.map((h) => h.change).join(" → ")}` : ""}`, `transcript p.${t.latest.page}`);
  for (const g of biz?.data?.guidance || []) add("guidance", `Guidance: ${g.statement}`, `latest call p.${g.page}`);
  for (const w of biz?.data?.watch_items || []) add("mgmt-acknowledged", w.item, `latest call p.${w.page}`);
  const ok = (cand?.calls || []).filter((x) => x.parsed);
  if (ok.length) add("candour", `Non-answer rate to analyst questions by call (newest first): ${ok.map((x) => `${x.period} ${x.nonAnswerRate}%`).join(", ")}`, "transcript lexicon (Gow et al. 2021)");
  if (cand?.divergence && cand.divergence.verdict !== "aligned") add("candour", `Narrative vs numbers: ${cand.divergence.verdict}. ${cand.divergence.why}`, cand.divergence.rule);
  return ev;
}

export async function bullBear(symbol, a, ledger, biz, cand) {
  const ev = evidenceList(a, ledger, biz, cand);
  const key = `bb:v6:${symbol}:${hash(JSON.stringify(ev.map((e) => e.text)))}`;
  return memo(key, 7 * 864e5, async () => {
    const { json, meta } = await llmJSON({ tier: "reason", system: BULLBEAR, user: ev.map((e) => `${e.id} [${e.kind}] ${e.text}`).join("\n"), maxTokens: 900 });
    const ids = new Set(ev.map((e) => e.id));
    const keep = (arr) => (arr || []).map((p) => ({ ...p, refs: (p.refs || []).filter((r) => ids.has(r)) })).filter((p) => p.refs.length);
    return { bull: keep(json?.bull), bear: keep(json?.bear), question: json?.verdict_question, evidence: ev, meta, _noCache: !json };
  });
}

export async function ledgerFor(symbol, { judge = true } = {}) {
  const { c } = await companyCore(symbol);
  return memo(`ledger:v7:${judge ? "j" : "x"}:${c.symbol}:${pickCalls(c, 1)[0]?.transcript || "none"}`, 7 * 864e5, () => buildLedger(c, { n: 4, cache, judge }));
}

function hash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
