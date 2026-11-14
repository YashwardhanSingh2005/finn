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
  return memo(`core:v3:${symbol.toUpperCase()}`, 6 * 3600e3, async () => {
    const c = await fetchCompany(symbol);
    const prices = c.companyId ? await fetchPrices(c.companyId, 400).catch(() => []) : [];
    return { c, a: analyse(c), stats: priceStats(prices) };
  });
}

export function publicCompany({ c, a, stats }) {
  return {
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
  return memo(`biz:v3:${call.transcript}`, Infinity, async () => {
    const doc = await fetchPdfPages(call.transcript, { maxPages: 30 });
    const { json, meta } = await llmJSON({ tier: "extract", system: BUSINESS, user: withPageMarkers(doc.pages).slice(0, 120000), maxTokens: 1800 });
    let dropped = 0;
    const ver = (arr) => (arr || []).filter((x) => { const v = verifyQuote(x.quote, doc.pages); if (v.ok) x.page = v.page; else dropped++; return v.ok; });
    if (json) { json.segments = ver(json.segments); json.guidance = ver(json.guidance); json.watch_items = ver(json.watch_items); }
    return { call: call.period, url: call.transcript, data: json, dropped, meta };
  });
}

const BULLBEAR = `You are a buy-side analyst writing a tight bull and bear case for an Indian listed company.
You receive an EVIDENCE list; each item has an id. Every point you make MUST cite 1-3 evidence ids in "refs". Do not use any fact that is not in the evidence. No outside knowledge, no price targets.
Return JSON {"bull":[{"point":"<= 22 words","refs":["E3"]}] (3 points), "bear":[...] (3 points), "verdict_question":"<= 20 words: the single question that decides which case wins"}. JSON only.`;

/** Collect evidence items with stable ids from all earlier layers. */
export function evidenceList(a, ledger, biz) {
  const ev = [];
  const add = (kind, text, src) => ev.push({ id: `E${ev.length + 1}`, kind, text, src });
  const r = a.results;
  if (r) add("numbers", `Latest quarter ${r.period}: ` + r.rows.map((x) => `${x.label} ₹${x.cur} cr (QoQ ${x.qoq ?? "–"}%, YoY ${x.yoy ?? "–"}%)`).join("; "), "reported results");
  for (const k of ["trajectory", "balance", "cash", "holders"]) for (const f of a[k]?.flags || []) add(k, `${f.title}: ${f.detail}`, `rule: ${f.rule}`);
  if (a.trajectory) add("trajectory", `${a.trajectory.years}y revenue CAGR ${a.trajectory.revCagr}%, PAT CAGR ${a.trajectory.patCagr}%`, "annual statements");
  for (const t of ledger?.threads || []) if (t.verdict && t.verdict !== "no evidence") add("ledger", `Promise "${t.title}" (said in ${t.callsMentioned.join(", ")}) → ${t.verdict}${t.actual ? ` (target ${t.target}, actual ${t.actual})` : t.actualText ? ` (${t.actualText})` : ""}${t.history.some((h) => ["raised", "lowered", "pushed out"].includes(h.change)) ? `; goalpost: ${t.history.map((h) => h.change).join(" → ")}` : ""}`, `transcript p.${t.latest.page}`);
  for (const g of biz?.data?.guidance || []) add("guidance", `Guidance: ${g.statement}`, `latest call p.${g.page}`);
  for (const w of biz?.data?.watch_items || []) add("mgmt-acknowledged", w.item, `latest call p.${w.page}`);
  return ev;
}

export async function bullBear(symbol, a, ledger, biz) {
  const ev = evidenceList(a, ledger, biz);
  const key = `bb:v2:${symbol}:${hash(JSON.stringify(ev.map((e) => e.text)))}`;
  return memo(key, 7 * 864e5, async () => {
    const { json, meta } = await llmJSON({ tier: "reason", system: BULLBEAR, user: ev.map((e) => `${e.id} [${e.kind}] ${e.text}`).join("\n"), maxTokens: 900 });
    const ids = new Set(ev.map((e) => e.id));
    const keep = (arr) => (arr || []).map((p) => ({ ...p, refs: (p.refs || []).filter((r) => ids.has(r)) })).filter((p) => p.refs.length);
    return { bull: keep(json?.bull), bear: keep(json?.bear), question: json?.verdict_question, evidence: ev, meta };
  });
}

export async function ledgerFor(symbol, { judge = true } = {}) {
  const { c } = await companyCore(symbol);
  return memo(`ledger:v5:${judge ? "j" : "x"}:${c.symbol}:${pickCalls(c, 1)[0]?.transcript || "none"}`, 7 * 864e5, () => buildLedger(c, { n: 4, cache, judge }));
}

function hash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
