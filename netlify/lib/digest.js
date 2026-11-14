// PUSH: the windowed digest. For each holding: filings in the window (NSE+BSE, de-duplicated;
// screener mirror as fallback), classified by rules, scored with an itemised breakdown, and joined
// to that day's price reaction. Results filings get the QoQ/YoY cut attached immediately (pure code).
import { fetchCompany, fetchPrices } from "./screener.js";
import { nseAnnouncements, bseAnnouncements, dedupe } from "./exchanges.js";
import { classify, score, CATEGORIES } from "./classify.js";
import { resultsCut } from "./fundamentals.js";
import { priceStats, evaluate, DEFAULT_RULES } from "./alerts.js";
import { memo } from "./cache.js";

const MONTHS = "JanFebMarAprMayJunJulAugSepOctNovDec";
function screenerDate(t, now = new Date()) {
  const m = t?.match(/(\d{1,2}) ([A-Z][a-z]{2})(?: (\d{4}))?/);
  if (!m) return null;
  const mon = MONTHS.indexOf(m[2]) / 3;
  let y = m[3] ? +m[3] : now.getFullYear();
  if (!m[3] && mon > now.getMonth()) y -= 1;
  return new Date(Date.UTC(y, mon, +m[1], 6, 30)).toISOString(); // noon IST placeholder (date-level precision)
}

/** All the per-company context the scorer needs, cached ~30 min. */
export async function companyContext(symbol) {
  return memo(`ctx:v4:${symbol}`, 30 * 60e3, async () => {
    const c = await fetchCompany(symbol);
    const prices = c.companyId ? await fetchPrices(c.companyId, 400).catch(() => []) : [];
    const st = priceStats(prices);
    const ttm = c.annual?.rows?.["Sales"] || c.annual?.rows?.["Revenue"];
    // SEBI LODR Reg 30(4) quantitative materiality: lower of 2% turnover, 2% net worth, 5% of 3-yr avg |PAT|
    const nwRow = c.balance?.rows, bp = c.balance?.periods || [];
    const netWorth = nwRow ? (nwRow["Equity Capital"]?.at(-1) ?? 0) + (nwRow["Reserves"]?.at(-1) ?? 0) : null;
    const patA = (c.annual?.rows?.["Net Profit"] || []).slice(0, (c.annual?.periods || []).filter((p) => p !== "TTM").length).slice(-3);
    const avgPat = patA.length ? patA.reduce((s, v) => s + Math.abs(v ?? 0), 0) / patA.length : null;
    const turnover = ttm ? ttm[ttm.length - 1] : null;
    const cands = [turnover && 0.02 * turnover, netWorth && 0.02 * netWorth, avgPat && 0.05 * avgPat].filter((x) => x > 0);
    return {
      symbol: c.symbol, name: c.name, companyId: c.companyId, bseCode: c.bseCode,
      sebiThresholdCr: cands.length ? Math.round(Math.min(...cands)) : null,
      sebiBasis: { turnover2: turnover && Math.round(0.02 * turnover), netWorth2: netWorth && Math.round(0.02 * netWorth), pat5: avgPat && Math.round(0.05 * avgPat), asOf: bp.at(-1) },
      ttmSalesCr: ttm ? ttm[ttm.length - 1] : null,
      mcapCr: c.ratios?.["Market Cap"]?.value ?? null,
      stats: st,
      results: resultsCut(c),
      screenerAnnouncements: c.docs.announcements,
      concalls: c.docs.concalls.slice(0, 2),
    };
  });
}

async function filingsFor(ctx, from, to) {
  const errors = [];
  let items = [];
  const [n, b] = await Promise.allSettled([
    nseAnnouncements(ctx.symbol, from, to),
    ctx.bseCode ? bseAnnouncements(ctx.bseCode, ctx.symbol, from, to) : Promise.resolve([]),
  ]);
  if (n.status === "fulfilled") items.push(...n.value); else errors.push(`NSE: ${n.reason?.message}`);
  if (b.status === "fulfilled") items.push(...b.value); else errors.push(`BSE: ${b.reason?.message}`);
  let source = [n.status === "fulfilled" && "NSE", b.status === "fulfilled" && "BSE"].filter(Boolean).join("+");
  if (!source) {
    // exchanges unreachable from this host: fall back to screener's mirror (latest 5 filings)
    source = "screener mirror";
    items = ctx.screenerAnnouncements.map((a, i) => ({ source: "BSE via screener", id: `scr:${ctx.symbol}:${i}:${a.url}`, symbol: ctx.symbol, time: screenerDate(a.dateText), datePrecision: "day", subject: a.subject, summary: a.summary, url: a.url }));
  }
  items = dedupe(items).filter((x) => !x.time || (x.time >= from.toISOString() && x.time <= to.toISOString()));
  return { items, source, errors };
}

/**
 * Build the digest.
 * opts: { from, to, holdings:[{symbol, weight}], prefs, rules }
 */
export async function buildDigest({ from, to, holdings, prefs = {}, rules = DEFAULT_RULES }) {
  const per = await Promise.all(holdings.map(async (h) => {
    try {
      const ctx = await companyContext(h.symbol);
      const f = await memo(`fil:v3:${h.symbol}:${from.toISOString().slice(0, 13)}:${to.toISOString().slice(0, 13)}`, 15 * 60e3, () => filingsFor(ctx, from, to));
      return { h, ctx, f };
    } catch (e) {
      return { h, error: e.message };
    }
  }));

  const items = [], alerts = [], sources = {}, failures = [];
  for (const { h, ctx, f, error } of per) {
    if (error) { failures.push({ symbol: h.symbol, error }); continue; }
    sources[h.symbol] = f.source;
    if (f.errors?.length) failures.push({ symbol: h.symbol, error: f.errors.join('; '), partial: true });
    // price/volume alerts (EOD)
    for (const a of evaluate(ctx.stats, rules)) alerts.push({ ...a, symbol: h.symbol, name: ctx.name, date: ctx.stats.date, stats: pickStats(ctx.stats) });
    for (const x of f.items) {
      const cls = classify(x.subject, x.summary);
      const day = x.time ? reactionDay(x.time) : null;
      const move = day && ctx.stats?.returnsByDate?.[nextTradingKey(ctx.stats.returnsByDate, day)];
      const sc = score({ ...x, category: cls.category }, { weightPct: h.weight, ttmSalesCr: ctx.ttmSalesCr, sebiThresholdCr: ctx.sebiThresholdCr, dayMovePct: move ?? null, sigma: ctx.stats?.sigma, prefs });
      const item = {
        ...x, name: ctx.name, weight: h.weight,
        category: cls.category, categoryLabel: CATEGORIES[cls.category].label, icon: CATEGORIES[cls.category].icon, classifiedBy: cls.rule,
        ...sc, dayMove: move ?? null,
      };
      // Results: attach the first cut straight away — but only if the standardised data already has
      // the quarter this filing reports. Otherwise the card says so and offers to read the PDF itself.
      if (cls.category === "results" && sc.score >= 60 && ctx.results) {
        const pe = periodEnd(ctx.results.period), ft = x.time ? new Date(x.time) : null;
        const fresh = pe && ft && ft - pe > -5 * 864e5 && ft - pe < 80 * 864e5;
        if (fresh) item.resultsCut = ctx.results;
        else item.resultsPending = `Standardised data still shows ${ctx.results.period}; tap to read this quarter's numbers from the filing itself.`;
      }
      items.push(item);
    }
  }
  items.sort((a, b) => b.score - a.score || (b.time || "").localeCompare(a.time || ""));
  // One event, one card: a results day produces the outcome, the results, the press release and the
  // investor deck. Same company + same IST day + same category collapse into the highest-scored filing.
  const clustered = [], byKey = new Map();
  for (const it of items) {
    const day = it.time ? new Date(new Date(it.time).getTime() + 5.5 * 3600e3).toISOString().slice(0, 10) : it.id;
    const k = `${it.symbol}|${day}|${it.category}`;
    const lead = byKey.get(k);
    if (lead && it.category !== "unclassified") { (lead.related ||= []).push({ subject: it.subject, summary: it.summary, url: it.url, score: it.score }); continue; }
    byKey.set(k, it); clustered.push(it);
  }
  const collapsed = items.length - clustered.length;
  items.length = 0; items.push(...clustered);
  const tiers = { act: items.filter((x) => x.tier === "act"), read: items.filter((x) => x.tier === "read"), skim: items.filter((x) => x.tier === "skim") };
  return {
    window: { from: from.toISOString(), to: to.toISOString() },
    counts: { total: items.length, act: tiers.act.length, read: tiers.read.length, skim: tiers.skim.length, holdings: holdings.length, collapsed },
    items, alerts: alerts.sort((a, b) => (a.severity === "high" ? -1 : 1)), sources, failures,
    generatedAt: new Date().toISOString(),
  };
}

const pickStats = (s) => ({ close: s.close, ret1d: s.ret1d, sigma: s.sigma, z: s.z, volX: s.volX, vol: s.vol, avgVol: s.avgVol, spark: s.spark.slice(-30), date: s.date });
// filings after the 15:30 IST close are priced by the next session
function reactionDay(iso) {
  const ist = new Date(new Date(iso).getTime() + 5.5 * 3600e3);
  const afterClose = ist.getUTCHours() * 60 + ist.getUTCMinutes() > 15 * 60 + 30;
  if (afterClose) ist.setUTCDate(ist.getUTCDate() + 1);
  return ist.toISOString().slice(0, 10);
}
// a filing after market close moves the NEXT session's price
function nextTradingKey(map, day) {
  const keys = Object.keys(map).sort();
  return keys.find((k) => k >= day) || null;
}

function periodEnd(p) {
  const m = p?.match(/^(Mar|Jun|Sep|Dec) (\d{4})$/);
  if (!m) return null;
  const mon = { Mar: 2, Jun: 5, Sep: 8, Dec: 11 }[m[1]];
  return new Date(Date.UTC(+m[2], mon + 1, 0));
}
