// What the auditor said, read from the annual report itself. No model: the audit report is a
// regulated, formulaic document (SA 700/705/706, CARO 2020), so its signals are phrase-detectable.
//  - opinion type: unmodified / qualified / adverse / disclaimer (SA 705)
//  - Emphasis of Matter and Other Matter paragraphs (SA 706)
//  - Material uncertainty related to going concern (SA 570)
//  - Key Audit Matters (SA 701) — count and titles where recoverable
//  - CARO 2020 adverse remarks (unpaid statutory dues, defaults, fraud, cash losses)
// Each finding is a verbatim sentence with its page.
import { extractText, getDocumentProxy } from "unpdf";
import { cache } from "./cache.js";

const UA = "FINN-prototype/0.1 (+https://github.com/YashwardhanSingh2005/finn)";

async function arPages(url) {
  const key = `arpages:v2:${url}`;
  const hit = await cache.get(key);
  if (hit) return hit;
  const r = await fetch(url, { headers: { "user-agent": UA, accept: "application/pdf,*/*", "accept-language": "en-IN,en" } });
  if (!r.ok) throw new Error(`annual report ${r.status}`);
  const pdf = await getDocumentProxy(new Uint8Array(await r.arrayBuffer()));
  const { text } = await extractText(pdf, { mergePages: false });
  // keep only pages that matter (audit reports + annexures + notes keywords) to keep the cache small
  const keep = {};
  text.forEach((t, i) => { if (/auditor|audit matter|emphasis of matter|going concern|opinion|caro|companies \(auditor[’']?s[’']? report\) order|contingent liabilit|statutory dues|default in repayment/i.test(t)) keep[i + 1] = t.replace(/[ \t]+/g, " "); });
  const out = { nPages: pdf.numPages, pages: keep };
  await cache.set(key, out);
  return out;
}

const sentence = (t, i) => {
  const s = Math.max(t.lastIndexOf(". ", i), t.lastIndexOf("\n\n", i), 0);
  let e = t.indexOf(". ", i); if (e < 0 || e - i > 400) e = Math.min(t.length, i + 300);
  return t.slice(s ? s + 1 : 0, e + 1).replace(/\s+/g, " ").trim();
};

const CARO_FLAGS = [
  [/(?:have not been|were not|not been) (?:regularly )?deposited|delays? in (?:depositing|deposit of)|arrears of (?:outstanding )?statutory dues|outstanding for a period of more than six months/i, "Statutory dues not paid on time"],
  [/defaulted in (?:the )?repayment|default in (?:the )?repayment of (?:loans|borrowings|dues)/i, "Default on borrowings"],
  [/fraud (?:by|on) the company (?:has been|was) (?:noticed|reported)|(?:any|a) fraud .{0,40}has been noticed/i, "Fraud noticed"],
  [/incurred cash losses/i, "Cash losses"],
  [/wilful defaulter/i, "Declared wilful defaulter"],
  [/funds raised on short[- ]term basis have been (?:utilised|used) for long[- ]term/i, "Short-term funds used for long-term purposes"],
];

/** Scan one company's latest annual report. */
export async function auditorFindings(ar) {
  if (!ar?.url) return { error: "no annual report linked" };
  const { nPages, pages } = await arPages(ar.url);
  return { year: ar.year, url: ar.url, ...analyseAudit(pages, nPages) };
}

/** Pure analysis over {pageNumber: text} — unit-testable. */
export function analyseAudit(pages, nPages) {
  const reports = [];
  const pageNums = Object.keys(pages).map(Number).sort((a, b) => a - b);
  // auditor's report starts: a page that has the title and an Opinion heading nearby
  const starts = pageNums.filter((p) => /independent\s+auditor[’']?s[’']?\s+report\s*\n?\s*(?:to\s+the\s+members|to\s*,?\s*the\s+members|report\s+on\s+the\s+audit)/i.test(pages[p]) || (/independent\s+auditor[’']?s[’']?\s+report/i.test(pages[p]) && /report\s+on\s+the\s+audit\s+of\s+the\s+(?:standalone\s+|consolidated\s+)?(?:ind\s*as\s+)?financial\s+statements/i.test(pages[p]) && /\bopinion\b/i.test(pages[p])));
  const seen = new Set();
  for (const s of starts) {
    if ([...seen].some((x) => Math.abs(x - s) < 6)) continue;
    seen.add(s);
    const span = pageNums.filter((p) => p >= s && p < s + 9);
    const text = span.map((p) => pages[p]).join("\n");
    const at = (re) => { for (const p of span) { const m = pages[p].match(re); if (m) return { page: p, quote: sentence(pages[p], m.index) }; } return null; };
    // basis = the word right after "Report on the Audit of the …" (falls back to first mention)
    const head = pages[s].slice(0, 2500);
    const bm = head.match(/report on the audit of the\s+(standalone|consolidated)/i) || head.match(/\b(standalone|consolidated)\s+financial statements/i);
    const consolidated = bm ? /consolidated/i.test(bm[1]) : false;
    let opinion = "unmodified", opinionEv = at(/give a true and fair view|present fairly/i);
    const adv = at(/adverse opinion/i), disc = at(/disclaimer of opinion|do not express an opinion/i), qual = at(/qualified opinion/i);
    if (disc) { opinion = "disclaimer"; opinionEv = disc; } else if (adv) { opinion = "adverse"; opinionEv = adv; } else if (qual && /basis for qualified opinion/i.test(text)) { opinion = "qualified"; opinionEv = at(/basis for qualified opinion/i) || qual; }
    // for headed paragraphs, quote what FOLLOWS the heading (the heading sentence itself says nothing)
    const after = (re) => { for (const p of span) { const m = pages[p].match(re); if (m) { const t = pages[p].slice(m.index + m[0].length).replace(/\s+/g, " ").trim(); const e = t.search(/(?<=\.)\s+(?:Our opinion|Key Audit|Other Matter|Information Other|Responsibilit)/i); return { page: p, quote: (e > 40 ? t.slice(0, e) : t.slice(0, 320)).slice(0, 420) }; } } return null; };
    const eom = after(/emphasis of matters?\s*\n/i) || after(/emphasis of matters?/i), gc = after(/material uncertainty related to going concern\s*/i), om = after(/\bother matters?\s*\n/i);
    const kamCount = (text.match(/key audit matter/gi) || []).length;
    reports.push({ basis: consolidated ? "consolidated" : "standalone", startPage: s, opinion, opinionEv, emphasisOfMatter: eom, goingConcern: gc, otherMatter: om, kamMentions: kamCount });
  }
  // CARO 2020 (annexure to the standalone report)
  const caro = [];
  for (const p of pageNums) {
    if (!/caro|companies \(auditor[’']?s[’']? report\) order/i.test(pages[p])) continue;
    for (const [re, label] of CARO_FLAGS) {
      const m = pages[p].match(re);
      if (m && !/\bnot\s+(?:applicable|any)\b|there (?:are|were|is|was) no\b|no (?:such )?(?:default|fraud|cash losses)|has not (?:defaulted|incurred)|no undisputed|were no|not been noticed|nor have we been informed/i.test(sentence(pages[p], m.index))) caro.push({ label, page: p, quote: sentence(pages[p], m.index) });
    }
  }
  const dedup = Object.values(Object.fromEntries(caro.map((x) => [x.label, x])));
  const flags = [];
  for (const r of reports) {
    if (r.opinion !== "unmodified") flags.push({ level: "risk", title: `${r.opinion[0].toUpperCase() + r.opinion.slice(1)} audit opinion (${r.basis})`, ev: r.opinionEv });
    if (r.goingConcern) flags.push({ level: "risk", title: `Going-concern uncertainty (${r.basis})`, ev: r.goingConcern });
    if (r.emphasisOfMatter) flags.push({ level: "watch", title: `Emphasis of matter (${r.basis})`, ev: r.emphasisOfMatter });
  }
  for (const c of dedup) flags.push({ level: "watch", title: `CARO: ${c.label}`, ev: c });
  return { nPages, reports, flags, clean: reports.length > 0 && !flags.length };
}
