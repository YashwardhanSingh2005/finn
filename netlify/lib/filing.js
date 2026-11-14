// Per-filing enrichment, on demand (only when the user opens a card that earned it) and cached by
// the filing URL forever. Cheap model only. Each output keeps a verbatim quote + page for audit.
import { fetchPdfPages, withPageMarkers, verifyQuote } from "./pdf.js";
import { llmJSON } from "./llm.js";
import { cache } from "./cache.js";

const MGMT = `You read an Indian stock-exchange filing about a management/board change.
Return JSON {"changes":[{"name","change":"appointed"|"resigned"|"retired"|"ceased"|"re-designated"|"re-appointed","role","effective":"date text or null","reason":"stated reason or null",
"profile":"<= 45 words: who they are, from the filing's own 'brief profile' section if present",
"previous":["up to 4 prior roles/employers named in the filing"],"education":"or null","quote":"verbatim 12-40 words from the filing supporting the change","page":N}],
"one_line":"<= 22 words: what changed and why an investor should care (e.g. successor named? abrupt exit?)"}.
Only use the filing text. JSON only.`;

const RESULTS = `You read an Indian listed company's quarterly results filing (SEBI format statement).
Find the CONSOLIDATED statement (if both exist; else standalone) and return JSON:
{"basis":"consolidated"|"standalone","unit":"as printed, e.g. ₹ crore / ₹ lakh / ₹ million","periods":["current quarter","previous quarter","same quarter last year"] (column headers as printed),
"revenue_from_operations":[cur,prev,yoy],"other_income":[...],"finance_costs":[...],"depreciation":[...],"profit_before_tax":[...],"profit_after_tax":[...],
"exceptional_items":[...] or null, "page":N, "quote":"verbatim header text of the statement table, 8-25 words"}
Numbers exactly as printed (no unit conversion; negatives as negative). JSON only.`;

const GENERIC = `You read one Indian stock-exchange filing. Return JSON {"one_line":"<= 22 words, factual: what happened, with the key number if any","so_what":"<= 18 words: why an investor might care, or 'Routine — no action.'","quote":"verbatim 10-35 words from the filing that supports one_line","page":N}. Only use the filing text. JSON only.`;

export async function enrichFiling({ url, category }) {
  const kind = category === "management_change" ? "mgmt" : category === "results" ? "results" : "generic";
  const key = `filing:v3:${kind}:${url}`;
  const hit = await cache.get(key);
  if (hit) return { ...hit, cached: true };

  const doc = await fetchPdfPages(url, { maxPages: kind === "results" ? 14 : 8 });
  const text = withPageMarkers(doc.pages).slice(0, kind === "results" ? 90000 : 40000);
  if (text.replace(/\[\[p\.\d+\]\]/g, "").trim().length < 200) {
    const out = { kind, error: "scanned PDF (no text layer) — open the original", url };
    await cache.set(key, out);
    return out;
  }
  const system = kind === "mgmt" ? MGMT : kind === "results" ? RESULTS : GENERIC;
  const { json, meta } = await llmJSON({ tier: "extract", system, user: text, maxTokens: kind === "results" ? 1200 : 900 });
  const out = { kind, url, nPages: doc.nPages, meta, data: json };

  if (kind === "mgmt" && json?.changes) {
    for (const ch of json.changes) {
      const v = verifyQuote(ch.quote, doc.pages);
      ch.verified = v.ok; if (v.ok) ch.page = v.page;
      ch.linkedin = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(ch.name || "")}`;
    }
  }
  if (kind === "generic" && json?.quote) {
    const v = verifyQuote(json.quote, doc.pages);
    json.verified = v.ok; if (v.ok) json.page = v.page;
  }
  if (kind === "results" && json) out.derived = deriveResults(json);
  await cache.set(key, out);
  return out;
}

/** EBITDA computed in code from the filing's own lines: PBT + finance costs + depreciation − other income. */
function deriveResults(j) {
  const g = (k, i) => (Array.isArray(j[k]) ? toNum(j[k][i]) : null);
  const cols = [0, 1, 2].map((i) => {
    const pbt = g("profit_before_tax", i), fc = g("finance_costs", i), dep = g("depreciation", i), oi = g("other_income", i), ex = g("exceptional_items", i);
    const ebitda = [pbt, fc, dep, oi].every((x) => x != null) ? pbt + fc + dep - oi - (ex ?? 0) : null;
    return { revenue: g("revenue_from_operations", i), ebitda, pbt, pat: g("profit_after_tax", i) };
  });
  const ch = (a, b) => (a == null || b == null || b === 0 ? null : Math.round(((a - b) / Math.abs(b)) * 1000) / 10);
  const rows = ["revenue", "ebitda", "pbt", "pat"].map((k) => ({ key: k, cur: cols[0][k], prev: cols[1][k], yearAgo: cols[2][k], qoq: ch(cols[0][k], cols[1][k]), yoy: ch(cols[0][k], cols[2][k]) }));
  return { rows, unit: j.unit, basis: j.basis, periods: j.periods, formula: "EBITDA = PBT + finance costs + depreciation − other income − exceptional items (all from the filing)" };
}
const toNum = (x) => (x == null ? null : typeof x === "number" ? x : Number(String(x).replace(/[,\s]/g, "").replace(/^\((.*)\)$/, "-$1")) || null);
