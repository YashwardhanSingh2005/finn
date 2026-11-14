// THE PROMISE LEDGER — "numbers vs narrative", made auditable.
//
// 1. For each of the last N earnings calls, a cheap model reads the transcript (with page markers)
//    and lists every forward-looking, checkable statement management made, with a verbatim quote.
// 2. Code verifies each quote actually exists in the transcript (fuzzy 4-gram match). Unverified
//    quotes are dropped and counted — the model cannot put words in management's mouth.
// 3. Code — not the model — computes what actually happened from the reported numbers, for the
//    period the promise referred to, and assigns a verdict with the arithmetic shown.
// 4. Only promises that can't be checked from the P&L (qualitative, or non-financial KPIs) go to a
//    stronger model, which may only cite later transcripts; those verdicts are labelled "judgement".
import { fetchPdfPages, withPageMarkers, verifyQuote } from "./pdf.js";
import { llmJSON } from "./llm.js";
import { periodToFQ, fqLabel, isFinancial } from "./fundamentals.js";

const EXTRACT_SYSTEM = `You read Indian listed-company earnings-call transcripts and extract FORWARD-LOOKING GUIDANCE given by management (not analysts).
Return JSON: {"call_quarter": "Q2FY27" (the quarter whose results are being discussed, Indian FY ends March), "claims":[...]}.
Each claim: {
 "metric": one of "revenue_growth" | "ebitda_margin" | "pat_growth" | "ebitda_growth" | "capex" | "debt" | "other",
 "basis": "yoy" | "level" | "absolute",     // growth claims are yoy unless said otherwise
 "low": number|null, "high": number|null,  // numeric band in % (growth/margin) or ₹ crore (capex/debt). "double digit" => low 10. "mid-teens" => 14-16. "~20%" => 18-22. Only numbers management actually said or unambiguous phrases.
 "horizon": "FY27" | "Q3FY27" | "H2FY27" | "next quarter" | "next year" | "medium term" | text,
 "statement": short plain-English paraphrase (<= 18 words),
 "quote": VERBATIM sentence(s) from the transcript, copied exactly, 12-60 words,
 "page": page number from the [[p.N]] marker,
 "speaker": name/role if shown
}
Rules: Only guidance/targets/commitments about the company's own future (growth, margin, capex, debt, launches, capacity, order book, hiring). Skip past-performance descriptions, macro commentary and analyst questions. Max 8 claims, most material first. If none, return an empty list. Output JSON only.`;

const JUDGE_SYSTEM = `You audit whether a company's management delivered on a past qualitative promise.
You get the promise (with quote) and EXCERPTS from LATER earnings-call transcripts of the same company. Use ONLY those excerpts — no outside knowledge.
Return JSON {"verdict": "delivered"|"partly"|"missed"|"too early"|"no evidence", "reason": "<= 30 words", "evidence_quote": "verbatim from the excerpts or empty", "evidence_call": "e.g. Q3FY27", "evidence_page": number|null}. JSON only.`;

const FQ_RE = /Q([1-4])\s*FY\s*'?(\d{2,4})/i;
const FY_RE = /FY\s*'?(\d{2,4})/i;
const H_RE = /H([12])\s*FY\s*'?(\d{2,4})/i;
const yr = (s) => (s.length === 2 ? 2000 + +s : +s);

/** Resolve a horizon string to the set of reported quarters it covers. */
export function resolveHorizon(h, callFQ) {
  if (!h) return null;
  let m;
  if ((m = h.match(FQ_RE))) return { kind: "quarter", quarters: [{ fy: yr(m[2]), q: +m[1] }], label: `Q${m[1]}FY${m[2].slice(-2)}` };
  if ((m = h.match(H_RE))) { const fy = yr(m[2]), qs = m[1] === "1" ? [1, 2] : [3, 4]; return { kind: "half", quarters: qs.map((q) => ({ fy, q })), label: `H${m[1]}FY${m[2].slice(-2)}` }; }
  if ((m = h.match(FY_RE))) { const fy = yr(m[1]); return { kind: "year", quarters: [1, 2, 3, 4].map((q) => ({ fy, q })), label: `FY${String(fy).slice(2)}` }; }
  if (callFQ && /next quarter|coming quarter/i.test(h)) { const n = callFQ.q === 4 ? { fy: callFQ.fy + 1, q: 1 } : { fy: callFQ.fy, q: callFQ.q + 1 }; return { kind: "quarter", quarters: [n], label: fqLabel(n) }; }
  if (callFQ && /(this|current|full) (fiscal |financial )?year|this year/i.test(h)) { const fy = callFQ.fy; return { kind: "year", quarters: [1, 2, 3, 4].map((q) => ({ fy, q })), label: `FY${String(fy).slice(2)}` }; }
  if (callFQ && /next (fiscal |financial )?year/i.test(h)) { const fy = callFQ.fy + 1; return { kind: "year", quarters: [1, 2, 3, 4].map((q) => ({ fy, q })), label: `FY${String(fy).slice(2)}` }; }
  return null;
}

/** Quarterly lookup keyed by "fy-q". */
function quarterIndex(c) {
  const q = c.quarters, idx = new Map();
  const fin = isFinancial(c);
  const rev = q.rows["Sales"] || q.rows["Revenue"];
  const op = fin ? null : q.rows["Operating Profit"];
  const pat = q.rows["Net Profit"];
  q.periods.forEach((p, i) => {
    const fq = periodToFQ(p);
    if (fq) idx.set(`${fq.fy}-${fq.q}`, { period: p, rev: rev?.[i], op: op?.[i], pat: pat?.[i] });
  });
  return idx;
}

const sumOf = (rows, k) => (rows.every((r) => r && r[k] != null) ? rows.reduce((s, r) => s + r[k], 0) : null);
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);

/** Compute the actual for a claim over a horizon. Returns {actual, unit, reported, total, calc}. */
export function actualFor(claim, hz, qi) {
  const cur = hz.quarters.map((x) => qi.get(`${x.fy}-${x.q}`));
  const prior = hz.quarters.map((x) => qi.get(`${x.fy - 1}-${x.q}`));
  const have = cur.map((r, i) => r && prior[i]).filter(Boolean).length;
  // use the reported subset (year-to-date) when the horizon isn't over yet
  const pairs = cur.map((r, i) => [r, prior[i]]).filter(([a, b]) => a && b);
  if (!pairs.length) return { reported: 0, total: hz.quarters.length };
  const A = pairs.map((p) => p[0]), B = pairs.map((p) => p[1]);
  const periods = A.map((r) => r.period);
  const g = (k) => { const a = sumOf(A, k), b = sumOf(B, k); return a != null && b ? { v: r1(((a - b) / Math.abs(b)) * 100), a, b } : null; };
  let res = null;
  switch (claim.metric) {
    case "revenue_growth": { const x = g("rev"); if (x) res = { actual: x.v, unit: "% YoY", calc: `Revenue ₹${fmt(x.a)} cr vs ₹${fmt(x.b)} cr a year earlier (${periods.join(", ")})` }; break; }
    case "pat_growth": { const x = g("pat"); if (x) res = { actual: x.v, unit: "% YoY", calc: `PAT ₹${fmt(x.a)} cr vs ₹${fmt(x.b)} cr (${periods.join(", ")})` }; break; }
    case "ebitda_growth": { const x = g("op"); if (x) res = { actual: x.v, unit: "% YoY", calc: `EBITDA ₹${fmt(x.a)} cr vs ₹${fmt(x.b)} cr (${periods.join(", ")})` }; break; }
    case "ebitda_margin": { const op = sumOf(A, "op"), rv = sumOf(A, "rev"); if (op != null && rv) res = { actual: r1((op / rv) * 100), unit: "% margin", calc: `EBITDA ₹${fmt(op)} cr ÷ revenue ₹${fmt(rv)} cr (${periods.join(", ")})` }; break; }
  }
  if (!res) return { reported: have, total: hz.quarters.length };
  return { ...res, reported: pairs.length, total: hz.quarters.length, periods };
}

const fmt = (v) => Math.round(v).toLocaleString("en-IN");

/** Verdict from numbers. Tolerance 0.5pt so "~10%" delivered at 9.8% isn't called a miss. */
export function numericVerdict(claim, act) {
  if (act.actual == null) return null;
  const lo = claim.low, hi = claim.high, a = act.actual, tol = 0.5;
  const partial = act.reported < act.total;
  let v;
  if (lo != null && hi != null && lo !== hi) v = a >= lo - tol && a <= hi + tol ? "delivered" : a > hi + tol ? "beat" : "missed";
  else if (lo != null) v = a >= lo - tol ? "delivered" : "missed";
  else if (hi != null) v = a <= hi + tol ? "delivered" : "missed";
  else return null;
  if (partial) v = v === "missed" ? "behind" : "on track";
  const target = lo != null && hi != null && lo !== hi ? `${lo}–${hi}` : lo != null ? `≥ ${lo}` : `≤ ${hi}`;
  return { verdict: v, target: `${target}${claim.metric === "ebitda_margin" ? "%" : "%"}`, actual: `${a}${act.unit.startsWith("%") ? "%" : ""}`, partial };
}

/** Pick the most recent N distinct calls that have transcripts. */
export function pickCalls(c, n = 4) {
  const seen = new Set(), out = [];
  for (const x of c.docs.concalls) {
    if (!x.transcript || seen.has(x.period)) continue;
    seen.add(x.period);
    out.push(x);
    if (out.length >= n) break;
  }
  return out;
}

/** Map a call month to the quarter being discussed: calls happen ~2-8 weeks after quarter end. */
export function callToFQ(period) {
  const m = period?.match(/([A-Z][a-z]{2}) (\d{4})/);
  if (!m) return null;
  const mi = "JanFebMarAprMayJunJulAugSepOctNovDec".indexOf(m[1]) / 3 + 1, y = +m[2];
  // quarter ending most recently before the call month
  const qe = mi <= 3 ? [12, y - 1] : mi <= 6 ? [3, y] : mi <= 9 ? [6, y] : [9, y];
  const name = { 3: "Mar", 6: "Jun", 9: "Sep", 12: "Dec" }[qe[0]];
  return periodToFQ(`${name} ${qe[1]}`);
}

export async function extractCall(call, { cache } = {}) {
  const key = `claims:v2:${call.transcript}`;
  const hit = cache && (await cache.get(key));
  if (hit) return { ...hit, cached: true };
  const doc = await fetchPdfPages(call.transcript, { maxPages: 40 });
  const text = withPageMarkers(doc.pages).slice(0, 180000);
  const { json, meta } = await llmJSON({ tier: "extract", system: EXTRACT_SYSTEM, user: `Transcript (${call.period} call):\n\n${text}`, maxTokens: 3000 });
  const claims = (json?.claims || []).map((cl) => {
    const v = verifyQuote(cl.quote, doc.pages);
    return { ...cl, verified: v.ok, verifyScore: v.score, page: v.ok ? v.page : cl.page };
  });
  const out = { period: call.period, callQuarter: json?.call_quarter || null, transcript: call.transcript, nPages: doc.nPages, claims, dropped: claims.filter((x) => !x.verified).length, meta, pages: doc.pages };
  if (cache) await cache.set(key, out);
  return out;
}

/** Build the full ledger for a company. */
export async function buildLedger(c, { n = 4, cache, judge = true } = {}) {
  const calls = pickCalls(c, n);
  const qi = quarterIndex(c);
  const extracted = await Promise.all(calls.map((call) => extractCall(call, { cache }).catch((e) => ({ period: call.period, error: e.message, claims: [] }))));
  const cost = [];
  const rows = [];
  for (const ex of extracted) {
    if (ex.meta && !ex.cached) cost.push(ex.meta);
    const callFQ = ex.callQuarter ? resolveHorizon(ex.callQuarter)?.quarters[0] : callToFQ(ex.period);
    for (const cl of ex.claims) {
      if (!cl.verified) continue;
      const hz = resolveHorizon(cl.horizon, callFQ);
      const row = { call: ex.period, callQuarter: callFQ ? fqLabel(callFQ) : ex.period, ...cl, pages: undefined, horizonResolved: hz?.label || null, transcript: ex.transcript };
      if (hz && ["revenue_growth", "pat_growth", "ebitda_growth", "ebitda_margin"].includes(cl.metric) && (cl.low != null || cl.high != null)) {
        const act = actualFor(cl, hz, qi);
        const nv = numericVerdict(cl, act);
        if (nv) Object.assign(row, { check: "computed", ...nv, calc: act.calc, coverage: `${act.reported}/${act.total} quarters reported` });
        else row.check = act.reported === 0 ? "pending" : "uncheckable";
        if (!nv && act.reported === 0) row.verdict = "too early";
      } else row.check = "qualitative";
      rows.push(row);
    }
  }
  // Qualitative promises: judge against LATER transcripts only (strong model, few calls, cached).
  if (judge) {
    const byPeriod = Object.fromEntries(extracted.map((e) => [e.period, e]));
    const order = extracted.map((e) => e.period); // newest first
    const quals = rows.filter((r) => r.check === "qualitative").slice(0, 6);
    await Promise.all(quals.map(async (r) => {
      const later = order.slice(0, order.indexOf(r.call)).map((p) => byPeriod[p]).filter((e) => e?.pages);
      if (!later.length) { r.verdict = "too early"; r.reason = "No later call yet to check against."; return; }
      const key = `judge:v2:${r.transcript}:${r.quote.slice(0, 60)}`;
      let j = cache && (await cache.get(key));
      if (!j) {
        const excerpts = later.map((e) => `=== ${e.callQuarter || e.period} call ===\n${relevant(e.pages, r.statement + " " + r.quote)}`).join("\n\n");
        const { json, meta } = await llmJSON({ tier: "reason", system: JUDGE_SYSTEM, user: `PROMISE (${r.callQuarter} call, p.${r.page}): "${r.quote}"\nParaphrase: ${r.statement}\n\nLATER CALL EXCERPTS:\n${excerpts}`, maxTokens: 400 });
        j = { ...json, meta };
        if (cache) await cache.set(key, j);
        cost.push(meta);
      }
      if (j?.evidence_quote) {
        const call = later.find((e) => (e.callQuarter || e.period) === j.evidence_call) || later[0];
        const v = verifyQuote(j.evidence_quote, call.pages);
        j.evidenceVerified = v.ok; if (v.ok) j.evidence_page = v.page;
        j.evidenceUrl = call.transcript;
      }
      Object.assign(r, { verdict: j?.verdict || "no evidence", reason: j?.reason, evidence: j?.evidence_quote && j.evidenceVerified ? { quote: j.evidence_quote, call: j.evidence_call, page: j.evidence_page, url: j.evidenceUrl } : null, check: "judgement" });
    }));
  }
  const tally = {};
  for (const r of rows) tally[r.verdict || "pending"] = (tally[r.verdict || "pending"] || 0) + 1;
  const scored = rows.filter((r) => ["delivered", "beat", "missed", "partly", "on track", "behind"].includes(r.verdict));
  const credit = scored.length ? Math.round((scored.reduce((s, r) => s + ({ delivered: 1, beat: 1, "on track": 0.75, partly: 0.5, behind: 0.25, missed: 0 }[r.verdict] ?? 0), 0) / scored.length) * 100) : null;
  return {
    calls: extracted.map((e) => ({ period: e.period, callQuarter: e.callQuarter, url: e.transcript, nPages: e.nPages, claims: e.claims?.length || 0, dropped: e.dropped || 0, error: e.error })),
    rows,
    tally,
    sayDo: credit,
    sayDoBasis: scored.length,
    cost,
  };
}

/** Cheap retrieval: the 6 paragraphs that share the most words with the promise. */
function relevant(pages, query) {
  const qs = new Set(query.toLowerCase().match(/[a-z]{4,}/g) || []);
  const paras = [];
  pages.forEach((p, i) => p.split(/\n{2,}|(?<=\.)\n/).forEach((t) => { if (t.length > 80) paras.push({ t, page: i + 1 }); }));
  return paras
    .map((p) => ({ ...p, s: (p.t.toLowerCase().match(/[a-z]{4,}/g) || []).filter((w) => qs.has(w)).length }))
    .sort((a, b) => b.s - a.s).slice(0, 6)
    .map((p) => `[p.${p.page}] ${p.t.replace(/\s+/g, " ").slice(0, 900)}`).join("\n");
}
