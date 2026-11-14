// Filing triage. Rule-first: exchange subjects are formulaic, so ~90% of filings classify with
// regexes at zero cost and with a reason the user can read. The LLM is only consulted for the
// leftovers (and only for items that could matter). Every decision returns {category, rule}.

export const CATEGORIES = {
  results: { label: "Results", base: 90, icon: "▦" },
  management_change: { label: "Management change", base: 80, icon: "◐" },
  "M&A": { label: "M&A", base: 85, icon: "⇄" },
  fund_raise: { label: "Fund raise", base: 75, icon: "₹" },
  litigation: { label: "Litigation / regulatory", base: 70, icon: "§" },
  credit_rating: { label: "Credit rating", base: 55, icon: "★" },
  pledging: { label: "Promoter pledge", base: 65, icon: "⚑" },
  insider_trading: { label: "Insider trade", base: 45, icon: "◇" },
  capex: { label: "Capex", base: 60, icon: "⌂" },
  press_release: { label: "Press release", base: 40, icon: "✎" },
  dividend: { label: "Dividend", base: 35, icon: "◉" },
  bonus_split: { label: "Bonus / split", base: 40, icon: "÷" },
  earnings_call: { label: "Earnings call", base: 25, icon: "☏" },
  investor_meetings: { label: "Investor meet", base: 10, icon: "◎" },
  agm_egm: { label: "AGM / EGM", base: 15, icon: "⌘" },
  postal_ballot: { label: "Postal ballot", base: 15, icon: "✉" },
  unclassified: { label: "Routine", base: 5, icon: "·" },
};

// Order matters: first match wins. Each rule is shown to the user verbatim ("why this category").
const RULES = [
  ["earnings_call", /transcript|audio recording|video recording|recording of|earnings call/i],
  ["investor_meetings", /analyst|institutional investor|investor meet|roadshow|investor conference|con\.? ?call|conference call/i],
  ["results", /financial results|\bresults\b|outcome of board meeting.*(result|financial)|integrated filing.*financ|board meeting.*(approve|consider).*(result|financial)|unaudited|audited financial/i],
  ["management_change", /appoint|resign|cessation|change in (director|management|key managerial|kmp|senior management)|managing director|chief (executive|financial|operating)|\bc[efo]o\b|\bkmp\b|re-?designat|retire/i],
  ["M&A", /acqui|amalgamat|merger|demerger|scheme of arrangement|joint venture|\bjv\b|stake sale|divest|wholly[- ]owned subsidiary|incorporation of (a )?subsidiary|slump sale|takeover/i],
  ["fund_raise", /\bqip\b|qualified institution|preferential|rights issue|buy-?back|commercial paper|debentures?|\bncds?\b|fund rais|raising of funds|allotment of (equity|securities|warrants)|warrants|bond issue/i],
  ["pledging", /pledge|encumbrance/i],
  ["insider_trading", /reg(ulation)?\.? ?7\(2\)|insider trading|sast|regulation 29|acquisition of shares by promoter|disclosure.*promoter/i],
  ["credit_rating", /credit rating|rating(s)? (assigned|upgrade|downgrade|reaffirm)|\bcrisil\b|\bicra\b|\bcare ratings\b|india ratings/i],
  ["litigation", /litigation|lawsuit|penalt|fine imposed|show cause|order (passed|received)|tribunal|nclt|nclat|insolvency|\bsebi order|tax demand|gst demand|income tax.*(order|demand)|search and seizure|regulatory action|arbitrat|court/i],
  ["dividend", /dividend/i],
  ["bonus_split", /bonus|sub-?division|stock split|split of/i],
  ["capex", /capex|capacity expansion|new plant|greenfield|brownfield|commission(ing|ed) of|expansion project|capital expenditure/i],
  ["agm_egm", /\bagm\b|\begm\b|annual general meeting|extra-?ordinary general meeting/i],
  ["postal_ballot", /postal ballot|e-?voting/i],
  ["press_release", /press release|order (win|received|bagged)|bags? order|wins? (order|contract)|letter of award|\bloa\b|launch|partnership|\bmou\b|clarification|media release|business update/i],
  ["unclassified", /newspaper|publication|esop|esos|employee stock|compliance certificate|regulation 74\(5\)|trading window|loss of share certificate|duplicate share|certificate under|esg|brsr|secretarial|scrutinizer|updates?$|intimation$|record date|book closure|investor complaints|related party/i],
];

export function classify(subject = "", summary = "") {
  const text = `${subject} || ${summary}`;
  for (const [cat, re] of RULES) {
    const m = text.match(re);
    if (m) return { category: cat, rule: `matched “${m[0]}”`, via: "rule" };
  }
  return { category: "unclassified", rule: "no rule matched — treated as routine", via: "default" };
}

// ---- materiality modifiers (the “why” behind the order) ----
const CR = /(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d+)?)\s*(crore|cr\.?|lakh|mn|million|bn|billion)/i;
const USD = /(?:us\$|usd|\$)\s*([\d,]+(?:\.\d+)?)\s*(mn|million|bn|billion|m\b)/i;

/** Pull a money amount out of a filing summary, in ₹ crore. */
export function amountCr(text = "") {
  let m = text.match(CR);
  if (m) {
    const v = +m[1].replace(/,/g, "");
    const u = m[2].toLowerCase();
    return u.startsWith("lakh") ? v / 100 : u.startsWith("mn") || u.startsWith("million") ? v / 10 : u.startsWith("bn") || u.startsWith("billion") ? v * 100 : v;
  }
  m = text.match(USD);
  if (m) {
    const v = +m[1].replace(/,/g, "");
    const u = m[2].toLowerCase();
    const usdMn = u.startsWith("b") ? v * 1000 : v;
    return usdMn * 8.8; // ≈ ₹88/$ → 1 $mn ≈ ₹8.8 cr
  }
  return null;
}

const SENIOR = /\b(ceo|cfo|coo|cto|managing director|\bmd\b|chief executive|chief financial|whole[- ]time director|chairman|chairperson)\b/i;
const NEG = /resign|cessation|downgrade|penalt|show cause|demand|default|fraud|search|seizure|insolvency|withdraw|negative|suspend/i;

/**
 * Priority score 0–100 with an itemised breakdown. This IS the explanation shown in the app.
 * ctx: { weightPct (portfolio weight), ttmSalesCr, dayMovePct, sigma, prefs: {muted:{cat:true}, boost:{cat:n}} }
 */
export function score(item, ctx = {}) {
  const cat = CATEGORIES[item.category] || CATEGORIES.unclassified;
  const parts = [{ k: "Category", v: cat.base, why: `${cat.label} filings start at ${cat.base}` }];
  const text = `${item.subject} ${item.summary || ""}`;

  if (item.category === "management_change") {
    if (SENIOR.test(text)) parts.push({ k: "Seniority", v: +10, why: `involves ${text.match(SENIOR)[0]}` });
    else parts.push({ k: "Seniority", v: -35, why: "not CXO/MD/board level" });
  }
  if (item.category === "credit_rating" && /downgrade|negative/i.test(text)) parts.push({ k: "Direction", v: +30, why: "downgrade / negative outlook" });
  if (item.category === "credit_rating" && /reaffirm/i.test(text)) parts.push({ k: "Direction", v: -30, why: "reaffirmation — no change" });
  if (item.category === "results" && /board meeting.*(intimation|consider)|prior intimation|to consider/i.test(text) && !/outcome/i.test(text))
    parts.push({ k: "Stage", v: -55, why: "date notice only, not the numbers" });
  if (item.category === "results" && /newspaper|publication|advertisement/i.test(text)) parts.push({ k: "Stage", v: -75, why: "newspaper ad of already-published results" });
  if (NEG.test(text) && !["management_change", "credit_rating"].includes(item.category)) parts.push({ k: "Tone", v: +10, why: `negative keyword “${text.match(NEG)[0]}”` });

  const amt = amountCr(text);
  if (amt != null && ctx.ttmSalesCr) {
    const share = (amt / ctx.ttmSalesCr) * 100;
    const v = share >= 10 ? 25 : share >= 3 ? 15 : share >= 1 ? 5 : -10;
    parts.push({ k: "Size", v, why: `₹${Math.round(amt).toLocaleString("en-IN")} cr ≈ ${share.toFixed(1)}% of TTM revenue` });
  }
  if (ctx.dayMovePct != null && ctx.sigma) {
    const z = Math.abs(ctx.dayMovePct) / ctx.sigma;
    if (z >= 2) parts.push({ k: "Market reaction", v: +15, why: `stock moved ${ctx.dayMovePct.toFixed(1)}% that day (${z.toFixed(1)}σ)` });
  }
  if (ctx.weightPct != null) {
    const v = ctx.weightPct >= 8 ? 8 : ctx.weightPct >= 4 ? 3 : 0;
    if (v) parts.push({ k: "Position size", v, why: `${ctx.weightPct.toFixed(1)}% of your portfolio` });
  }
  const pref = ctx.prefs || {};
  if (pref.muted?.[item.category]) parts.push({ k: "Your rule", v: -100, why: `you muted ${cat.label}` });
  if (pref.boost?.[item.category]) parts.push({ k: "Your rule", v: +pref.boost[item.category], why: `you boosted ${cat.label}` });

  const total = Math.max(0, Math.min(100, parts.reduce((s, p) => s + p.v, 0)));
  const tier = total >= 70 ? "act" : total >= 40 ? "read" : "skim";
  return { score: total, tier, parts };
}
