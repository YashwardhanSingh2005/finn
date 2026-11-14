// CANDOUR: how management talks, measured without a language model.
//
// Three published ideas, stitched together:
//  1. Non-answers (Gow, Larcker & Zakolyukina 2021, "Non-answers during conference calls", JAR):
//     detect replies where management declines or defers an analyst's question; such calls carry
//     information the market discounts. We use a phrase lexicon in the spirit of their refuse /
//     unable / defer categories, adapted to Indian concall English ("we don't give guidance", "will
//     take it offline", "not in a position to").
//  2. Finance-specific word lists (Loughran & McDonald 2011): uncertainty and tone measured with
//     finance-aware dictionaries (here, documented subsets), separately for prepared remarks and Q&A.
//  3. Narrative vs numbers: compare the *change* in management's tone across calls with the *change*
//     in reported growth over the same quarters. Tone rising while growth falls is the classic
//     "story running ahead of numbers" pattern the brief asks for.
// Everything is deterministic, free, and every example shown is a verbatim excerpt with its page.
import { fetchPdfPages } from "./pdf.js";

// ---- lexicons (documented, inspectable) -------------------------------------------------------
export const NON_ANSWER = [
  // refuse
  [/\bwe (?:do not|don't|dont) (?:give|provide|share|disclose|guide|comment)/i, "refuse"],
  [/\b(?:would|will) not (?:like to )?(?:comment|disclose|share|get into|go into|guide)/i, "refuse"],
  [/\b(?:won't|wouldn't) (?:be able to )?(?:comment|disclose|share|get into|go into|guide)/i, "refuse"],
  [/\bnot (?:going|in a position|able) to (?:comment|disclose|share|give|guide|quantify|talk|get into)/i, "refuse"],
  [/\b(?:can't|cannot|can not) (?:comment|disclose|share|quantify|give (?:a|any|you a) (?:number|guidance|breakup|split))/i, "refuse"],
  [/\bprefer not to\b/i, "refuse"],
  // v2 (added after the recall audit, see eval/README): first-person reluctance and soft inability
  [/\b(?:i|we) (?:don't|do not) want to (?:comment|say|get into|go into|guide|speculate|give)/i, "refuse"],
  [/\b(?:i|we) (?:really )?(?:don't|do not) know (?:anything|that|yet|at this (?:point|stage))/i, "unable"],
  [/\b(?:slightly|bit|little|very) difficult (?:at this (?:stage|point)|right now|as of now)\b/i, "unable"],
  [/\blet(?:'s| us) see how it (?:pans|plays|works) out\b/i, "unable"],
  [/\b(?:can't|cannot) (?:predict|say|tell) (?:at this|right now|as of now|today)/i, "unable"],
  // v3 (second recall audit)
  [/\brestrict myself\b/i, "refuse"],
  [/\b(?:too early|premature) to (?:talk|speak) about\b/i, "unable"],
  [/\bnothing concrete (?:as yet|yet|so far)\b/i, "unable"],
  [/\b(?:give|share|send) you the (?:exact|detailed|precise) (?:number|numbers|figure|figures|data)(?: soon| later| separately| offline)?/i, "defer"],
  [/\b(?:we )?(?:don't|do not) break (?:it )?(?:out|up)\b/i, "refuse"],
  [/\bno (?:specific )?guidance\b/i, "refuse"],
  [/\b(?:it is|it's|its) (?:a )?(?:company|confidential|competitive|sensitive) (?:information|data)/i, "refuse"],
  // unable / uncertain
  [/\b(?:too early|premature) to (?:say|comment|tell|quantify|give|guide)/i, "unable"],
  [/\b(?:difficult|hard|tough) to (?:say|comment|predict|quantify|put a number|give a number)/i, "unable"],
  [/\b(?:don't|do not) have (?:the|that|those|a) (?:number|numbers|data|figure|breakup|details)(?: handy| with me| right now)?/i, "unable"],
  [/\bno visibility\b/i, "unable"],
  // defer
  [/\b(?:take (?:it|this|that) offline|connect (?:with you )?offline|get back to you|come back to you|revert (?:to you|back))/i, "defer"],
  [/\b(?:we'll|we will) (?:talk about|discuss|share) (?:it|this|that) (?:later|in (?:the )?(?:coming|next) (?:quarters?|calls?))/i, "defer"],
];

// Uncertainty — subset of the Loughran–McDonald (2011) Uncertainty list (stems).
const UNCERTAIN = ["approximat", "uncertain", "may", "maybe", "might", "perhaps", "possibl", "probabl", "depend", "assum", "anticipat", "appear", "believ", "estimat", "expos", "fluctuat", "indefinite", "nearly", "pending", "predict", "preliminar", "risk", "roughly", "seem", "sometime", "somewhat", "suggest", "tentativ", "uncertaint", "unclear", "unknown", "unpredict", "unusual", "vari", "volatil", "doubt", "hope", "hopeful"];
// Tone — subsets of the Loughran–McDonald Positive / Negative lists (stems).
const POSITIVE = ["achiev", "attain", "benefit", "better", "best", "boost", "breakthrough", "delight", "efficien", "enhanc", "excellent", "exceptional", "favorab", "gain", "good", "great", "highest", "improv", "outperform", "positive", "profitab", "progress", "remarkab", "strong", "strength", "succeed", "success", "superior", "encourag", "optimis", "confiden", "record", "robust"];
const NEGATIVE = ["advers", "challeng", "concern", "declin", "decreas", "delay", "difficult", "disappoint", "downturn", "headwind", "impair", "loss", "losses", "negative", "problem", "slowdown", "slower", "sluggish", "subdued", "weak", "worse", "worst", "shortfall", "pressure", "stress", "volatil", "uncertain", "muted", "soft"];
// Conversational hedges (practitioner list; not LM).
const HEDGES = [/\bi think\b/gi, /\bsort of\b/gi, /\bkind of\b/gi, /\bmore or less\b/gi, /\bto some extent\b/gi, /\bhopefully\b/gi, /\bwe believe\b/gi, /\bwe feel\b/gi, /\bbroadly\b/gi];

const words = (t) => (t.toLowerCase().match(/[a-z][a-z']+/g) || []);
const stemHit = (w, stems) => stems.some((s) => (s.length <= 4 ? w === s || w === s + "s" : w.startsWith(s)));
function lex(text) {
  const ws = words(text), n = ws.length || 1;
  let unc = 0, pos = 0, neg = 0;
  for (const w of ws) { if (stemHit(w, UNCERTAIN)) unc++; if (stemHit(w, POSITIVE)) pos++; if (stemHit(w, NEGATIVE)) neg++; }
  const hedge = HEDGES.reduce((s, re) => s + (text.match(re) || []).length, 0);
  return { n: ws.length, uncPer1k: +(unc / n * 1000).toFixed(1), hedgePer1k: +(hedge / n * 1000).toFixed(1), pos, neg, tone: pos + neg ? +((pos - neg) / (pos + neg)).toFixed(3) : 0 };
}

// ---- transcript structure ---------------------------------------------------------------------
const HEADER = /^(?:.{0,80}(?:limited|ltd\.?|corporation)\s*\n)?(?:[A-Z][a-z]+ \d{1,2}, \d{4}\s*\n)?page \d+ of \d+\s*$/gim;
const TURN = /^([A-Z][A-Za-z.'’\- ]{1,48}?)\s*:\s+/gm;

function managementNames(pages) {
  const head = pages.slice(0, 3).join("\n");
  const m = head.match(/MANAGEMENT\s*:([\s\S]{0,1500}?)(?:\n\s*\n|MODERATOR|Moderator:|Page \d)/i);
  const block = m ? m[1] : "";
  const names = [...block.matchAll(/(?:MR|MS|MRS|DR|SHRI|SMT)\.?\s+([A-Z][A-Za-z.]+(?:\s+[A-Z][A-Za-z.]+){0,3})/gi)].map((x) => x[1].toLowerCase());
  return new Set(names.flatMap((n) => n.split(/\s+/).filter((p) => p.length > 2)));
}

export function parseTranscript(pages) {
  const mg = managementNames(pages);
  const turns = [];
  pages.forEach((p, pi) => {
    const t = p.replace(HEADER, "");
    const idx = [];
    let m;
    TURN.lastIndex = 0;
    while ((m = TURN.exec(t))) idx.push({ at: m.index, end: m.index + m[0].length, sp: m[1].trim() });
    if (!idx.length) { if (turns.length) turns[turns.length - 1].text += "\n" + t; return; }
    if (idx[0].at > 0 && turns.length) turns[turns.length - 1].text += "\n" + t.slice(0, idx[0].at);
    idx.forEach((x, i) => turns.push({ speaker: x.sp, text: t.slice(x.end, i + 1 < idx.length ? idx[i + 1].at : undefined), page: pi + 1 }));
  });
  // roles
  let qaStarted = false;
  const isMgmt = (sp) => sp.toLowerCase().split(/\s+/).some((w) => mg.has(w.replace(/[^a-z]/g, "")));
  for (const t of turns) {
    const sp = t.speaker.toLowerCase();
    if (/moderator|operator/.test(sp)) { t.role = "moderator"; if (/(?:first|next|following|last) question|question[- ]and[- ]answer session|begin (?:the |with the )?(?:question|q&a)|open (?:the )?(?:floor|line) for (?:questions|q&a)/i.test(t.text)) qaStarted = true; continue; }
    t.role = isMgmt(t.speaker) || !qaStarted ? "management" : "analyst";
    t.section = qaStarted ? "qa" : "prepared";
  }
  // speakers seen in prepared remarks are management even if the header parse missed them
  const prepSpeakers = new Set(turns.filter((t) => t.section === "prepared" && t.role === "management").map((t) => t.speaker));
  for (const t of turns) if (t.role === "analyst" && prepSpeakers.has(t.speaker)) t.role = "management";
  return { turns, mgmtNames: [...mg] };
}

/** Pair each analyst question with the management reply that follows it. */
// a pleasantry ("Thanks and all the best") is not a question; it shouldn't dilute the non-answer rate
const SUBSTANTIVE = (t) => /\?/.test(t) || (t.split(/\s+/).length >= 14 && !/^\s*(?:thank|thanks|wish|happy|congrat)[^.?]*[.!]?\s*$/i.test(t));

export function qaPairs(turns) {
  const pairs = [];
  for (let i = 0; i < turns.length; i++) {
    if (turns[i].role !== "analyst" || !SUBSTANTIVE(turns[i].text)) continue;
    const ans = [];
    for (let j = i + 1; j < turns.length && turns[j].role === "management"; j++) ans.push(turns[j]);
    if (ans.length) pairs.push({ q: turns[i], a: ans });
  }
  return pairs;
}

const clip = (s, n = 260) => { const t = s.replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n) + "…" : t; };
const sentenceAround = (text, idx) => {
  const s = Math.max(text.lastIndexOf(".", idx - 1), text.lastIndexOf("?", idx - 1), 0);
  let e = text.indexOf(".", idx); if (e < 0) e = text.length;
  return text.slice(s ? s + 1 : 0, e + 1).replace(/\s+/g, " ").trim();
};

export function analyseCall(pages) {
  const { turns } = parseTranscript(pages);
  const prepared = turns.filter((t) => t.section === "prepared" && t.role === "management").map((t) => t.text).join("\n");
  const answers = turns.filter((t) => t.section === "qa" && t.role === "management").map((t) => t.text).join("\n");
  const pairs = qaPairs(turns);
  const nonAnswers = [];
  for (const p of pairs) {
    const ansText = p.a.map((x) => x.text).join("\n");
    for (const [re, kind] of NON_ANSWER) {
      const m = ansText.match(re);
      if (m) {
        nonAnswers.push({ kind, phrase: m[0], analyst: p.q.speaker, question: clip(p.q.text, 220), answer: clip(sentenceAround(ansText, m.index), 240), responder: p.a[0].speaker, page: p.a[0].page });
        break;
      }
    }
  }
  return {
    turns: turns.length, questions: pairs.length,
    analysts: [...new Set(pairs.map((p) => p.q.speaker))].length,
    nonAnswers, nonAnswerRate: pairs.length ? +(nonAnswers.length / pairs.length * 100).toFixed(1) : null,
    prepared: lex(prepared), qa: lex(answers),
    parsed: pairs.length >= 3, // too few pairs => layout we couldn't parse; don't over-interpret
  };
}

/** Candour across the last N calls + narrative-vs-numbers divergence. */
export async function candour(c, calls, n = 4) {
  const out = [];
  for (const call of calls.slice(0, n)) {
    try {
      const doc = await fetchPdfPages(call.transcript, { maxPages: 45 });
      out.push({ period: call.period, url: call.transcript, ...analyseCall(doc.pages) });
    } catch (e) { out.push({ period: call.period, url: call.transcript, error: e.message }); }
  }
  const ok = out.filter((x) => x.parsed);
  // growth per call quarter from reported numbers: YoY revenue growth of the quarter discussed
  const q = c.quarters, rev = q.rows["Sales"] || q.rows["Revenue"];
  const growthFor = (period) => {
    const mi = "JanFebMarAprMayJunJulAugSepOctNovDec".indexOf(period.slice(0, 3)) / 3 + 1, y = +period.slice(4);
    const qe = mi <= 3 ? `Dec ${y - 1}` : mi <= 6 ? `Mar ${y}` : mi <= 9 ? `Jun ${y}` : `Sep ${y}`;
    const i = q.periods.indexOf(qe);
    return i >= 4 && rev?.[i] && rev?.[i - 4] ? { quarter: qe, yoy: +((rev[i] / rev[i - 4] - 1) * 100).toFixed(1) } : { quarter: qe, yoy: null };
  };
  ok.forEach((x) => (x.growth = growthFor(x.period)));
  let divergence = null;
  if (ok.length >= 2) {
    const newest = ok[0], oldest = ok[ok.length - 1];
    const dTone = +(newest.prepared.tone - oldest.prepared.tone).toFixed(3);
    const dGrowth = newest.growth.yoy != null && oldest.growth.yoy != null ? +(newest.growth.yoy - oldest.growth.yoy).toFixed(1) : null;
    const dNA = newest.nonAnswerRate != null && oldest.nonAnswerRate != null ? +(newest.nonAnswerRate - oldest.nonAnswerRate).toFixed(1) : null;
    let verdict = "aligned", why = "Tone and reported growth moved the same way.";
    if (dGrowth != null) {
      if (dTone >= 0.08 && dGrowth <= -5) { verdict = "story ahead of numbers"; why = `Prepared-remarks tone rose ${fmtSigned(dTone)} while YoY revenue growth fell ${Math.abs(dGrowth)} pts (${oldest.growth.quarter} → ${newest.growth.quarter}).`; }
      else if (dTone <= -0.08 && dGrowth >= 5) { verdict = "numbers ahead of story"; why = `Growth improved ${dGrowth} pts while tone cooled ${fmtSigned(dTone)} — conservative messaging (possible sandbagging).`; }
      else if (Math.abs(dTone) < 0.08 || Math.abs(dGrowth) < 5) { verdict = "aligned"; why = `Tone ${fmtSigned(dTone)}, growth ${dGrowth > 0 ? "+" : ""}${dGrowth} pts — no material divergence.`; }
    }
    divergence = { verdict, why, dTone, dGrowth, dNonAnswer: dNA, from: oldest.period, to: newest.period, rule: "divergence if |Δtone| ≥ 0.08 and |Δgrowth| ≥ 5 pts in opposite directions" };
  }
  return { calls: out, divergence, method: { nonAnswer: "phrase lexicon after Gow, Larcker & Zakolyukina (2021)", lexicon: "subsets of Loughran & McDonald (2011) uncertainty / positive / negative lists", tone: "(pos − neg) / (pos + neg), prepared remarks vs Q&A answers" } };
}
const fmtSigned = (x) => `${x > 0 ? "+" : ""}${x}`;
