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
import { credibility } from "./credibility.js";

const EXTRACT_SYSTEM = `You read Indian listed-company earnings-call transcripts and extract FORWARD-LOOKING GUIDANCE given by management (not analysts).
Return JSON: {"call_quarter": "Q2FY27" (the quarter whose results are being discussed, Indian FY ends March), "claims":[...]}.
Each claim: {
 "metric": one of "revenue_growth" | "ebitda_margin" | "pat_growth" | "ebitda_growth" | "capex" | "debt" | "other",
 "scope": "consolidated" or the segment/business it refers to (e.g. "Wires & cables", "FMEG", "Exports"),
 "basis": "yoy" | "level" | "absolute",     // growth claims are yoy unless said otherwise
 "low": number|null, "high": number|null,  // numeric band in % (growth/margin) or ₹ crore (capex/debt). "double digit" => low 10. "mid-teens" => 14-16. "~20%" => 18-22. Only numbers management actually said or unambiguous phrases.
 "horizon": "FY27" | "Q3FY27" | "H2FY27" | "next quarter" | "next year" | "medium term" | text,
 "statement": short plain-English paraphrase (<= 18 words),
 "quote": VERBATIM sentence(s) from the transcript, copied exactly, 12-60 words,
 "page": page number from the [[p.N]] marker,
 "speaker": name/role if shown
}
Rules: Only guidance/targets/commitments about the company's own future (growth, margin, capex, debt, launches, capacity, order book, hiring). Skip past-performance descriptions, macro commentary and analyst questions. Max 12 claims, most material first. Keep "quote" to ONE or TWO sentences. Output compact JSON (no pretty-printing). If none, return an empty list. Output JSON only.`;

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
  const key = `claims:v6:${call.transcript}`;
  const hit = cache && (await cache.get(key));
  if (hit) return { ...hit, cached: true };
  const doc = await fetchPdfPages(call.transcript, { maxPages: 40 });
  const text = withPageMarkers(doc.pages).slice(0, 180000);
  const { json, meta } = await llmJSON({ tier: "extract", system: EXTRACT_SYSTEM, user: `Transcript (${call.period} call):\n\n${text}`, maxTokens: 6000 });
  const claims = (json?.claims || []).map((cl) => {
    const v = verifyQuote(cl.quote, doc.pages);
    return { ...cl, verified: v.ok, verifyScore: v.score, page: v.ok ? v.page : cl.page };
  });
  const out = { period: call.period, callQuarter: json?.call_quarter || null, transcript: call.transcript, nPages: doc.nPages, claims, dropped: claims.filter((x) => !x.verified).length, meta, pages: doc.pages };
  if (cache && json) await cache.set(key, out); // never cache a failed parse
  return out;
}

/**
 * Build the ledger.
 *  stage 1 (judge=false): extract claims from N calls (parallel, cheap), group the same promise across
 *          calls into THREADS (cheap), detect goalpost moves (code), verify computable ones (code).
 *  stage 2 (judge=true) : one strong-model pass over the open threads using the latest calls' text
 *          and our computed actuals; every evidence quote is verified against the transcript.
 */
export async function buildLedger(c, { n = 4, cache, judge = true } = {}) {
  const calls = pickCalls(c, n);
  const qi = quarterIndex(c);
  const extracted = await Promise.all(calls.map((call) => extractCall(call, { cache }).catch((e) => ({ period: call.period, error: e.message, claims: [] }))));
  const cost = [];
  const claims = [];
  extracted.forEach((ex, ci) => {
    if (ex.meta && !ex.cached) cost.push(ex.meta);
    const callFQ = ex.callQuarter ? resolveHorizon(ex.callQuarter)?.quarters[0] : callToFQ(ex.period);
    ex.callFQ = callFQ;
    ex.label = callFQ ? fqLabel(callFQ) : ex.period;
    for (const cl of ex.claims || []) if (cl.verified) claims.push({ ...cl, id: `c${claims.length}`, callIdx: ci, callQuarter: ex.label, transcript: ex.transcript });
  });

  // ---- threads: the same promise repeated across calls ----
  const threads = await threadClaims(claims, c.symbol, cache, cost);
  const consol = consolidatedNow(qi);
  for (const t of threads) {
    t.versions = t.ids.map((id) => claims.find((x) => x.id === id)).filter(Boolean).sort((a, b) => b.callIdx - a.callIdx); // oldest -> newest
    const first = t.versions[0], latest = t.versions[t.versions.length - 1];
    t.latest = latest; t.first = first;
    t.history = goalposts(t.versions);
    t.callsMentioned = [...new Set(t.versions.map((v) => v.callQuarter))];
    t.notRepeated = latest.callIdx > 0 && extracted[0]?.claims?.length > 0; // not repeated in the newest call
    // numeric verification in code where the statement is about consolidated numbers we hold
    const callFQ = extracted[latest.callIdx].callFQ;
    const hz = resolveHorizon(latest.horizon, callFQ);
    const isConsol = !latest.scope || /consolidat|company|overall|group|total/i.test(latest.scope);
    if (isConsol && ["revenue_growth", "pat_growth", "ebitda_growth", "ebitda_margin"].includes(latest.metric) && (latest.low != null || latest.high != null)) {
      if (hz) {
        const act = actualFor(latest, hz, qi);
        const nv = numericVerdict(latest, act);
        if (nv) Object.assign(t, { check: "computed", ...nv, calc: act.calc, coverage: `${act.reported}/${act.total} quarters reported` });
        else if (act.reported === 0) Object.assign(t, { check: "computed", verdict: "too early", calc: `${hz.label} not reported yet` });
      } else if (consol) {
        // open-ended ("medium term", "sustainable") band: is the trailing-4-quarter figure inside it now?
        const a = latest.metric === "ebitda_margin" ? consol.margin : latest.metric === "revenue_growth" ? consol.revYoY : latest.metric === "pat_growth" ? consol.patYoY : consol.ebitdaYoY;
        const nv = numericVerdict(latest, { actual: a, unit: "%", reported: 1, total: 1 });
        if (nv) Object.assign(t, { check: "computed", verdict: nv.verdict === "missed" ? "behind" : nv.verdict === "beat" ? "on track" : "on track", target: nv.target, actual: nv.actual, calc: `${latest.metric === "ebitda_margin" ? "EBITDA margin" : "YoY growth"} over the last 4 reported quarters (${consol.periods.join(", ")}), an open-ended target checked against today` });
      }
    }
  }

  if (judge) await judgeThreads(threads.filter((t) => !t.check), extracted, consol, c.symbol, cache, cost);

  const tally = {};
  for (const t of threads) tally[t.verdict || "pending"] = (tally[t.verdict || "pending"] || 0) + 1;
  const scored = threads.filter((t) => ["delivered", "beat", "missed", "partly", "on track", "behind"].includes(t.verdict));
  const credit = scored.length ? Math.round((scored.reduce((s, t) => s + ({ delivered: 1, beat: 1, "on track": 0.75, partly: 0.5, behind: 0.25, missed: 0 }[t.verdict] ?? 0), 0) / scored.length) * 100) : null;
  const moved = threads.filter((t) => t.history.some((h) => h.change !== "reiterated" && h.change !== "first said"));
  return {
    calls: extracted.map((e) => ({ period: e.period, callQuarter: e.label, url: e.transcript, nPages: e.nPages, claims: e.claims?.length || 0, dropped: e.dropped || 0, error: e.error })),
    threads: threads.map(({ versions, first, ...t }) => ({ ...t, latest: strip(t.latest), versions: versions.map(strip) })),
    tally, sayDo: credit, sayDoBasis: scored.length, goalpostMoves: moved.length,
    credibility: credibility(threads),
    judged: judge, consolidatedNow: consol, notRepeated: threads.filter((t) => t.notRepeated).length,
    cost,
  };
}
const strip = (v) => v && ({ callQuarter: v.callQuarter, statement: v.statement, quote: v.quote, page: v.page, low: v.low, high: v.high, horizon: v.horizon, metric: v.metric, scope: v.scope, speaker: v.speaker, transcript: v.transcript, verifyScore: v.verifyScore });

/** Trailing-4-quarter consolidated metrics, for checking open-ended guidance against today. */
function consolidatedNow(qi) {
  const keys = [...qi.keys()].sort((a, b) => { const [fa, qa] = a.split("-").map(Number), [fb, qb] = b.split("-").map(Number); return fa - fb || qa - qb; });
  const last4 = keys.slice(-4).map((k) => qi.get(k));
  const prev4 = keys.slice(-8, -4).map((k) => qi.get(k));
  if (last4.length < 4 || prev4.length < 4) return null;
  const S = (rows, k) => (rows.every((r) => r[k] != null) ? rows.reduce((s, r) => s + r[k], 0) : null);
  const g = (k) => { const a = S(last4, k), b = S(prev4, k); return a != null && b ? r1(((a - b) / Math.abs(b)) * 100) : null; };
  const op = S(last4, "op"), rv = S(last4, "rev");
  return { periods: last4.map((r) => r.period), margin: op != null && rv ? r1((op / rv) * 100) : null, revYoY: g("rev"), patYoY: g("pat"), ebitdaYoY: g("op"), lastQ: last4[3] };
}

/** Compare successive versions of a promise: did management move the goalposts? */
function goalposts(vs) {
  const out = [];
  vs.forEach((v, i) => {
    if (i === 0) { out.push({ call: v.callQuarter, change: "first said", band: band(v), horizon: v.horizon }); return; }
    const p = vs[i - 1];
    let change = "reiterated";
    const mid = (x) => (x.low != null && x.high != null ? (x.low + x.high) / 2 : x.low ?? x.high);
    const a = mid(p), b = mid(v);
    if (a != null && b != null && Math.abs(b - a) >= Math.max(0.5, Math.abs(a) * 0.04)) change = b > a ? "raised" : "lowered";
    else if (p.horizon && v.horizon && norm(p.horizon) !== norm(v.horizon) && /FY\s*'?\d{2}/i.test(p.horizon + v.horizon)) {
      const y = (h) => +(h.match(/FY\s*'?(\d{2,4})/i)?.[1] || 0) % 100;
      if (y(v.horizon) > y(p.horizon)) change = "pushed out";
      else if (y(v.horizon) && y(v.horizon) < y(p.horizon)) change = "pulled in";
    }
    out.push({ call: v.callQuarter, change, band: band(v), horizon: v.horizon });
  });
  return out;
}
const band = (v) => (v.low != null && v.high != null && v.low !== v.high ? `${v.low}–${v.high}` : v.low != null ? `≥${v.low}` : v.high != null ? `≤${v.high}` : null);
const norm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

const THREAD_SYSTEM = `You group management guidance statements from several earnings calls of ONE company into threads: a thread = the same underlying promise/target (same metric, same business scope), possibly restated with different numbers or dates across calls.
Input: lines "id | call | metric | scope | band | horizon | statement".
Return compact JSON {"threads":[{"title":"<= 9 words, e.g. 'Wires & cables EBITDA margin 11–13%'","ids":["c1","c7"]}]}. Every id must appear in exactly one thread. Singletons are fine. JSON only.`;

async function threadClaims(claims, symbol, cache, cost) {
  if (!claims.length) return [];
  const lines = claims.map((c) => `${c.id} | ${c.callQuarter} | ${c.metric} | ${c.scope || "company"} | ${band(c) || "-"} | ${c.horizon || "-"} | ${c.statement}`).join("\n");
  const key = `threads:v2:${symbol}:${hashStr(lines)}`;
  let j = cache && (await cache.get(key));
  if (!j) {
    const r = await llmJSON({ tier: "extract", system: THREAD_SYSTEM, user: lines, maxTokens: 2500 });
    cost.push(r.meta);
    j = r.json;
    if (cache && j?.threads) await cache.set(key, j);
  }
  const seen = new Set();
  const threads = [];
  for (const t of j?.threads || []) {
    const ids = (t.ids || []).filter((id) => claims.some((c) => c.id === id) && !seen.has(id));
    ids.forEach((id) => seen.add(id));
    if (ids.length) threads.push({ title: t.title, ids });
  }
  for (const c of claims) if (!seen.has(c.id)) threads.push({ title: c.statement, ids: [c.id] });
  return threads;
}

const JUDGE_ALL = `You audit whether an Indian company's management is delivering on its own guidance.
You get (1) THREADS: each is a promise with its latest wording, target band and horizon; (2) COMPUTED: consolidated numbers we calculated from reported results; (3) EXCERPTS from the latest earnings calls (with [p.N] page tags).
For EACH thread decide, using ONLY these inputs (no outside knowledge):
 status: "delivered" (target met) | "on track" (period not over, tracking to target) | "behind" (period not over, tracking below) | "missed" (period over, not met) | "too early" (nothing reported yet) | "no evidence" (inputs don't say)
 latest_actual: the most recent actual figure for that metric if stated (e.g. "W&C EBITDA margin 12.4% in Q2FY27"), else ""
 evidence_quote: VERBATIM 10-40 words from the excerpts supporting the status, else ""
 evidence_call: e.g. "Q2FY27"
 reason: <= 16 words
Direction matters: for growth, margins, revenue, share and order book HIGHER is better; for working-capital days, costs, debt and leverage LOWER is better. An actual that beats the target in the favourable direction is "delivered" (or "on track"), never "missed".
A target restated in later calls is still judged on the latest actual. If the period has not ended, use "on track"/"behind", not "delivered"/"missed".
Return compact JSON {"verdicts":[{"id":"t0","status":...,"latest_actual":...,"evidence_quote":...,"evidence_call":...,"reason":...}]}. JSON only.`;

async function judgeThreads(open, extracted, consol, symbol, cache, cost) {
  if (!open.length) return;
  const pick = open.slice(0, 16);
  pick.forEach((t, i) => (t.tid = `t${i}`));
  const recent = extracted.filter((e) => e.pages).slice(0, 2); // two newest calls
  const query = pick.map((t) => `${t.title} ${t.latest.statement}`).join(" ");
  const excerpts = recent.map((e) => `=== ${e.label} call ===\n${relevant(e.pages, query, 18)}`).join("\n\n");
  const threadsTxt = pick.map((t) => `${t.tid}: ${t.title} | latest (${t.latest.callQuarter}): "${t.latest.statement}" | band ${band(t.latest) || "-"} | horizon ${t.latest.horizon || "-"}`).join("\n");
  const computed = consol ? `Consolidated, last 4 reported quarters (${consol.periods.join(", ")}): EBITDA margin ${consol.margin}%, revenue YoY ${consol.revYoY}%, PAT YoY ${consol.patYoY}%. Latest quarter ${consol.lastQ.period}: revenue ₹${fmt(consol.lastQ.rev)} cr, PAT ₹${fmt(consol.lastQ.pat)} cr.` : "n/a";
  const key = `judgeall:v5:${symbol}:${hashStr(threadsTxt + recent.map((e) => e.transcript).join())}`;
  let j = cache && (await cache.get(key));
  if (!j) {
    const r = await llmJSON({ tier: "reason", system: JUDGE_ALL, user: `THREADS:\n${threadsTxt}\n\nCOMPUTED:\n${computed}\n\nEXCERPTS:\n${excerpts}`, maxTokens: 7000 });
    cost.push(r.meta);
    j = r.json;
    if (cache && j?.verdicts) await cache.set(key, j);
  }
  for (const v of j?.verdicts || []) {
    const t = pick.find((x) => x.tid === v.id);
    if (!t) continue;
    let evidence = null;
    if (v.evidence_quote) {
      const call = recent.find((e) => e.label === v.evidence_call) || recent[0];
      let ok = verifyQuote(v.evidence_quote, call.pages), src = call;
      if (!ok.ok) for (const e of recent) { const k = verifyQuote(v.evidence_quote, e.pages); if (k.ok) { ok = k; src = e; break; } }
      if (ok.ok) evidence = { quote: v.evidence_quote, call: src.label, page: ok.page, url: src.transcript };
    }
    // a judgement without verifiable evidence is downgraded: we don't show unsupported verdicts
    const status = evidence || ["too early", "no evidence"].includes(v.status) ? v.status : "no evidence";
    Object.assign(t, { check: "judgement", verdict: status, reason: v.reason, actualText: v.latest_actual || null, evidence });
  }
}

function hashStr(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }

/** Cheap retrieval: the 6 paragraphs that share the most words with the promise. */
function relevant(pages, query, k = 6) {
  const qs = new Set(query.toLowerCase().match(/[a-z]{4,}/g) || []);
  const paras = [];
  pages.forEach((p, i) => p.split(/\n{2,}|(?<=\.)\n/).forEach((t) => { if (t.length > 80) paras.push({ t, page: i + 1 }); }));
  return paras
    .map((p) => ({ ...p, s: (p.t.toLowerCase().match(/[a-z]{4,}/g) || []).filter((w) => qs.has(w)).length }))
    .sort((a, b) => b.s - a.s).slice(0, k)
    .map((p) => `[p.${p.page}] ${p.t.replace(/\s+/g, " ").slice(0, 900)}`).join("\n");
}
